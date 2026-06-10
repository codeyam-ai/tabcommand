#!/usr/bin/env node

// Render environment (colorScheme, deviceScaleFactor, userAgent, locale,
// timezoneId, reduceMotion, forcedColors) is read from config when present
// and passed to browser.newContext(). This is what makes screenshots match
// the Live Preview iframe's host browser — see docs/rendering.md.
//
// iframeBackground is forwarded to buildIframeHarness so the capture paints
// the user's editor-shell background (or whatever the UI detected) behind
// the iframe instead of a hardcoded white.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { chromium } = require("playwright");

// Substring Playwright has emitted across every 1.x release when the
// browser cache is empty. Match the substring (not the full string)
// because Playwright includes the offending path inline.
const PLAYWRIGHT_MISSING_BROWSER_PATTERN = "Executable doesn't exist";
const PLAYWRIGHT_INSTALL_COMMAND = "npx playwright install chromium";

// One-shot self-heal around `chromium.launch()`. If the first launch
// throws the "missing browser" error, run `npx playwright install
// chromium` synchronously (with `stdio: "inherit"` so the user sees
// progress) and retry the launch exactly once. If the install or the
// retry fails, rethrow the ORIGINAL Playwright error so the existing
// `Scenario check failed: <stderr>` path keeps showing the actionable
// message — looping would hide a real ops failure under a slow timeout.
async function launchChromiumWithSelfHeal({
  launch = () => chromium.launch(),
  install = () => execSync(PLAYWRIGHT_INSTALL_COMMAND, { stdio: "inherit" }),
  stderr = process.stderr,
} = {}) {
  try {
    return await launch();
  } catch (error) {
    const isMissingBrowser =
      error &&
      typeof error.message === "string" &&
      error.message.includes(PLAYWRIGHT_MISSING_BROWSER_PATTERN);
    if (!isMissingBrowser) throw error;
    stderr.write(
      "Playwright's Chromium browser is missing — installing it now (one-time ~150 MB download). Subsequent runs will be instant.\n",
    );
    try {
      install();
    } catch (_installError) {
      throw error;
    }
    try {
      return await launch();
    } catch (_retryError) {
      throw error;
    }
  }
}

const {
  findErrorPattern,
  buildErrorContextSnippet,
  hasRenderableContent,
  buildSettleAdvisory,
  describeBlankReason,
} = require("./scenario-metrics");

const {
  createIssue,
  pushIssue,
  buildResult,
} = require("./scenario-issues");

const {
  attachHttpMocks,
  isDeclaredErrorMock,
} = require("./scenario-mocks");

const {
  assertAppPortReachable,
  loadScenarioInIframe,
  loadScenarioTopLevel,
  waitForStablePage,
  createNetworkTracker,
  waitForNetworkQuiet,
  collectContentState,
  performInteraction,
  waitForPredicate,
  performInteractionSequence,
} = require("./scenario-playwright");

const {
  getInitScript,
  handleConsoleMessage,
  handlePageError,
  handleRequestFailed,
} = require("./scenario-handlers");

const {
  probeInteractivity,
} = require("./scenario-interactivity");

// Read project-specific loading markers from `.codeyam/stack.json`
// (`capture.loadingMarkers`). The capture script runs with cwd = project dir
// (scenario_check.rs sets `.current_dir(project_dir)`), so this relative path
// resolves to the project's own config. An app's loading copy ("Loading…",
// "Please wait") is app-specific, so it lives in stack.json rather than being
// hardcoded into the shared harness; the codeyam-harness defaults in
// scenario-metrics.js always apply on top. Never throws — a missing or
// malformed stack.json just yields no extra markers.
function readStackLoadingMarkers() {
  try {
    const raw = fs.readFileSync(path.join(".codeyam", "stack.json"), "utf8");
    const stack = JSON.parse(raw);
    const markers = stack && stack.capture && stack.capture.loadingMarkers;
    return Array.isArray(markers)
      ? markers.filter((m) => typeof m === "string" && m.length > 0)
      : [];
  } catch (_) {
    return [];
  }
}

// Cold-start retry pause. waitForStablePage settles as soon as the page is
// HTML-stable, which for a lazy/Suspense app is the empty `<div id="root">`
// shell — stable for the ~3s the dynamic chunk takes to load (longer when the
// scenario's mocks slow the boot). 500ms re-checked before the chunk resolved
// and reported a false blank; this pause must comfortably exceed that window
// while staying under the test runner's default per-case timeout.
const BLANK_RETRY_DELAY_MS = 3000;

// True when `url` targets a different origin than `appOrigin`. Used to decide
// whether the codeyam capture markers must be stripped before the request
// leaves (cross-origin) or may ride along (same-origin, the app's own dev
// server). A malformed URL counts as same-origin (false) so we never strip
// markers from a request we can't classify — the conservative default keeps
// same-origin behavior unchanged. `url` may be a string or a URL-like object.
function isCrossOriginRequest(url, appOrigin) {
  try {
    const href = typeof url === "string" ? url : url.href;
    return new URL(href).origin !== appOrigin;
  } catch (_) {
    return false;
  }
}

// Return a copy of `headers` with every name in `markerNames` removed.
// Names are matched case-insensitively against the (lowercased) header keys
// Playwright reports. Pure — never mutates its input — so unrelated headers
// (Accept, User-Agent, a scenario's own requestHeaders) survive untouched.
function stripMarkerHeaders(headers, markerNames) {
  const out = { ...headers };
  for (const name of markerNames) {
    delete out[name.toLowerCase()];
  }
  return out;
}

// Apply the scenario's merged `browserState` to a Playwright context and
// stamp the codeyam capture markers on every request the context makes.
//
// Cookies need a concrete URL to bind to (Playwright requires either
// `url` or `domain`+`path`); we derive domain/path from the requested
// capture URL when the scenario didn't pin them. Request headers go
// through `setExtraHTTPHeaders` so every navigation and resource
// request in the context carries them.
//
// Every capture-originated request carries `X-Codeyam-Capture: 1` (and
// `X-Codeyam-Scenario: <slug>` when a scenario is active) so a dev-server
// log can tell the headless capture apart from the operator's own browser
// hitting the same route — they are otherwise indistinguishable. These are
// defaults: a scenario's own `requestHeaders` are merged on top and win,
// so a user can override or clear them.
async function applyBrowserState(context, config) {
  const state = (config && config.browserState) || {};
  const cookies = state.cookies || {};
  const cookieEntries = Object.entries(cookies);
  if (cookieEntries.length > 0) {
    let host = "127.0.0.1";
    try {
      host = new URL(config.url).hostname || host;
    } catch (_) {
      /* fall back to localhost if config.url is malformed */
    }
    const playwrightCookies = cookieEntries.map(([name, raw]) => {
      const descriptor =
        raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      const value = typeof raw === "string" ? raw : descriptor.value || "";
      return {
        name,
        value,
        domain: descriptor.domain || host,
        path: descriptor.path || "/",
        sameSite: descriptor.sameSite || "Lax",
        httpOnly: descriptor.httpOnly === true,
        secure: descriptor.secure === true,
      };
    });
    await context.addCookies(playwrightCookies);
  }
  const codeyamHeaders = {
    "X-Codeyam-Capture": "1",
    ...(config && config.scenarioId
      ? { "X-Codeyam-Scenario": config.scenarioId }
      : {}),
  };
  // Scenario `requestHeaders` are merged last so a user value overrides
  // the codeyam default (e.g. setting `X-Codeyam-Capture: "0"` as an
  // escape hatch). `codeyamHeaders` always has at least the capture marker,
  // so this fires on every capture — including ones with no browserState.
  const headers = { ...codeyamHeaders, ...(state.requestHeaders || {}) };
  if (Object.keys(headers).length > 0) {
    await context.setExtraHTTPHeaders(headers);
  }

  // Strip the codeyam capture markers (and any scenario request headers) from
  // CROSS-ORIGIN requests. setExtraHTTPHeaders applies context-wide, so the
  // custom `X-Codeyam-*` headers ride along on third-party subresource
  // requests (Google Fonts, CDNs, external APIs) too — and a non-safelisted
  // request header forces a CORS preflight those hosts reject
  // (`Request header field x-codeyam-capture is not allowed`), which fails the
  // whole capture. The markers are only meaningful to the app's OWN dev server
  // (same-origin), so re-send cross-origin requests without them. Same-origin
  // requests are never matched here, so dev-module/HMR loading is untouched.
  let appOrigin = null;
  try {
    appOrigin = new URL(config.url).origin;
  } catch (_) {
    /* malformed capture URL — skip the cross-origin guard entirely */
  }
  if (appOrigin && typeof context.route === "function") {
    // Only the codeyam markers are stripped — a scenario's own requestHeaders
    // are the author's deliberate choice and left intact.
    const markerNames = Object.keys(codeyamHeaders);
    await context.route(
      (url) => isCrossOriginRequest(url, appOrigin),
      async (route) => {
        const reqHeaders = stripMarkerHeaders(route.request().headers(), markerNames);
        await route.continue({ headers: reqHeaders });
      },
    );
  }

  // Seed the scenario's `browserState.localStorage` / `.sessionStorage` into
  // the page before any app JS runs. Storage-gated UI (first-run banners,
  // dismissed-prompt flags, persisted view state) is otherwise
  // uncontrollable at capture time. Playwright serializes the function and
  // its arg into the page context, so the function body must not close over
  // outer variables. Only registered when the scenario actually carries
  // storage, preserving the pre-storage capture context for everyone else.
  const localStorageSeed = state.localStorage || {};
  const sessionStorageSeed = state.sessionStorage || {};
  if (
    Object.keys(localStorageSeed).length > 0 ||
    Object.keys(sessionStorageSeed).length > 0
  ) {
    await context.addInitScript(
      (storage) => {
        try {
          for (const [key, value] of Object.entries(storage.local)) {
            window.localStorage.setItem(key, value);
          }
          for (const [key, value] of Object.entries(storage.session)) {
            window.sessionStorage.setItem(key, value);
          }
        } catch (_) {
          // Storage unavailable (sandboxed/opaque origin) — the seed is
          // best-effort; never fail the capture over it.
        }
      },
      { local: localStorageSeed, session: sessionStorageSeed },
    );
  }
}

// Emit a `redirect-mismatch` issue when the final iframe URL's path
// differs from the requested path. This converts the silent
// screenshot-of-/login failure (auth lost in the capture context) into
// a typed, actionable diagnostic the agent can route to.
function pushRedirectMismatchIssue(issues, requestedUrl, frame, response, config) {
  let requestedPath;
  try {
    requestedPath = new URL(requestedUrl).pathname;
  } catch (_) {
    return;
  }
  const finalUrl = (frame && frame.url && frame.url()) || requestedUrl;
  let finalPath;
  try {
    finalPath = new URL(finalUrl).pathname;
  } catch (_) {
    return;
  }
  if (requestedPath === finalPath) return;
  const cookies =
    (config && config.browserState && config.browserState.cookies) || {};
  const hasCookies = Object.keys(cookies).length > 0;
  const hint = hasCookies
    ? " — scenario carries browserState.cookies; auth likely lost in the capture context (run `codeyam-editor editor scenario-explain <slug>` to verify)"
    : "";
  pushIssue(
    issues,
    createIssue(
      "redirect-mismatch",
      `Capture URL redirected from ${requestedPath} to ${finalPath}${hint}`,
      {
        url: finalUrl,
        status: response && response.status ? response.status() : null,
      },
    ),
  );
}

// Read-only page-state snapshot for `capture-state`: the full localStorage
// map, a bounded sample of visible text nodes (document order), and — when a
// selector is given — that element's text. Evaluated in-page against the
// settled frame so it reflects exactly what a real capture saw (the proxy
// already injected the scenario's seed into the served HTML). Every read is
// individually guarded so a sandboxed/cross-origin localStorage never throws
// the whole capture; the worst case is an empty section, not a failure.
async function dumpPageState(frame, selector) {
  return frame.evaluate((sel) => {
    const localStorage = {};
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key != null) localStorage[key] = window.localStorage.getItem(key);
      }
    } catch (_) {
      /* localStorage may be unavailable (sandboxed/opaque origin) */
    }

    const visibleText = [];
    try {
      // Reject text inside non-rendered tags (SCRIPT/STYLE/etc.) so an
      // injected proxy script or inline CSS never masquerades as on-screen
      // text — that noise is exactly what makes a state dump misleading.
      const SKIP_TAGS = new Set([
        "SCRIPT",
        "STYLE",
        "NOSCRIPT",
        "TEMPLATE",
        "HEAD",
        "TITLE",
      ]);
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const parent = node.parentElement;
            if (parent && SKIP_TAGS.has(parent.tagName)) {
              return NodeFilter.FILTER_REJECT;
            }
            return (node.textContent || "").trim()
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          },
        },
      );
      let node;
      while ((node = walker.nextNode()) && visibleText.length < 40) {
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        if (text) visibleText.push(text);
      }
    } catch (_) {
      /* no body / detached document */
    }

    let selectorText = null;
    if (sel) {
      try {
        const el = document.querySelector(sel);
        if (el) selectorText = (el.textContent || "").replace(/\s+/g, " ").trim();
      } catch (_) {
        /* invalid selector — leave selectorText null */
      }
    }

    return { localStorage, visibleText, selectorText };
  }, selector || null);
}

// Drive an ordered list of flow steps against ONE already-loaded browser
// session so a scripted multi-step demo (`editor preview-flow`) is captured as
// the real round-trip — click state and client transients persist across
// steps, which N independent fresh-load captures could never reproduce. Each
// step is one of:
//   - navigate: re-load a route (resolved relative to the initial url) using
//     the same loader strategy as the initial load, then re-settle. Returns
//     the new content frame so subsequent steps target the navigated page.
//   - click / fill / press: a `performInteraction` against the current frame,
//     then re-settle.
//   - waitFor: hold until a visible-text / selector predicate (bounded).
//   - capture: write a numbered filmstrip frame to the step's `outputPath`.
// A failing step THROWS with its 1-based index and action, so the outer catch
// in `runScenarioCheck` reports exactly which step broke (and, for waitFor,
// the predicate that never appeared) instead of a silent blank capture.
// Returns the frame the flow ended on, so the caller's final screenshot and
// result URL reflect the last navigated route.
async function runFlowSteps(page, initialFrame, steps, ctx) {
  const { url, loadingMarkers, navigation, iframeBackground, preflight } = ctx;
  let frame = initialFrame;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {};
    const n = i + 1;
    try {
      switch (step.action) {
        case "navigate": {
          const target = new URL(step.path, url).href;
          const loadResult =
            navigation === "topLevel"
              ? await loadScenarioTopLevel(page, target, { preflight })
              : await loadScenarioInIframe(page, target, {
                  background: iframeBackground,
                  preflight,
                });
          frame = loadResult.frame;
          await waitForStablePage(page, frame, 10000, loadingMarkers);
          break;
        }
        case "click":
        case "fill":
        case "press":
          await performInteraction(frame, step);
          await waitForStablePage(page, frame, 5000, loadingMarkers);
          break;
        case "waitFor":
          await waitForPredicate(frame, step);
          break;
        case "capture":
          if (step.outputPath) {
            fs.mkdirSync(path.dirname(step.outputPath), { recursive: true });
            await page.screenshot({ path: step.outputPath, fullPage: false });
          }
          break;
        default:
          throw new Error(
            `unknown step action "${step.action}" (expected navigate | click | fill | press | waitFor | capture)`,
          );
      }
    } catch (error) {
      throw new Error(
        `flow step ${n} (${step.action}) failed: ${error.message || String(error)}`,
      );
    }
  }

  return frame;
}

// `preflight` is injectable (defaulting to the real app-port reachability
// check) so unit tests that mock the browser can stay network-free.
async function runScenarioCheck(config, { preflight = assertAppPortReachable } = {}) {
  const { url, outputPath, width, height, httpMocks = {} } = config;
  const issues = [];
  const browser = await launchChromiumWithSelfHeal();
  const contextOptions = {
    viewport: { width: width || 1440, height: height || 900 },
  };
  if (config.colorScheme) contextOptions.colorScheme = config.colorScheme;
  if (config.deviceScaleFactor)
    contextOptions.deviceScaleFactor = config.deviceScaleFactor;
  if (config.userAgent) contextOptions.userAgent = config.userAgent;
  if (config.locale) contextOptions.locale = config.locale;
  if (config.timezoneId) contextOptions.timezoneId = config.timezoneId;
  if (config.reduceMotion) contextOptions.reducedMotion = config.reduceMotion;
  if (config.forcedColors) contextOptions.forcedColors = config.forcedColors;
  const context = await browser.newContext(contextOptions);

  // Apply the scenario's merged `browserState` (cookies + request
  // headers) to the capture context BEFORE the first navigation.
  // Belt-and-suspenders with the proxy's `Set-Cookie` injection: the
  // proxy handles upstream-bound forwards, this branch handles the
  // capture context's own request headers so an auth-gated route does
  // not redirect to `/login` when the proxy is bypassed.
  await applyBrowserState(context, config);

  // Context-level init script runs in ALL frames (including cross-origin iframes)
  await context.addInitScript(getInitScript());

  const page = await context.newPage();
  // Attach the network tracker BEFORE navigation so every request (the document
  // and every client-side data fetch) is counted. Used after DOM stability to
  // wait out an in-flight fetch that would otherwise be screenshotted as a
  // loading skeleton.
  const networkTracker = createNetworkTracker(page);
  await attachHttpMocks(page, httpMocks);

  page.on("pageerror", (error) => {
    pushIssue(issues, handlePageError(error));
  });

  page.on("console", (message) => {
    const issue = handleConsoleMessage(message);
    if (!issue) return;
    // Console errors produced by the scenario's OWN declared error mocks
    // (status >= 400) are the intended behavior of an error-state scenario,
    // not a capture problem — skip them so "History - Load Error"-style
    // scenarios can screenshot the failure UI they exist to demonstrate.
    const sourceUrl = message.location && message.location().url;
    if (sourceUrl && isDeclaredErrorMock(httpMocks, sourceUrl)) return;
    pushIssue(issues, issue);
  });

  page.on("requestfailed", (request) => {
    const issue = handleRequestFailed(request);
    if (issue) {
      pushIssue(issues, issue);
    }
  });

  let loaded = false;

  try {
    // Application/route captures navigate at the top level so the
    // first-party session cookie is sent (auth-gated routes render the
    // authenticated page instead of /login); component captures keep the
    // iframe harness for its background/sizing control. The backend signals
    // the choice via `config.navigation` ("topLevel"); absent (the default)
    // means the iframe harness, so existing callers are unchanged.
    const loadResult =
      config.navigation === "topLevel"
        ? await loadScenarioTopLevel(page, url, { preflight })
        : await loadScenarioInIframe(page, url, {
            background: config.iframeBackground,
            preflight,
          });
    // `frame` is `let` so a `navigate` flow step (below) can re-point it at the
    // freshly-loaded route's content frame; `response` is the initial load only.
    let frame = loadResult.frame;
    const response = loadResult.response;
    loaded = true;

    if (response && response.status() >= 400) {
      pushIssue(
        issues,
        createIssue("navigation", `Navigation returned HTTP ${response.status()}`, {
          url: response.url(),
          status: response.status(),
        }),
      );
    }

    pushRedirectMismatchIssue(issues, url, frame, response, config);

    // Project loading markers come from config when a caller injects them
    // (unit tests), otherwise from stack.json — so a stable-but-loading app
    // screen is not mistaken for settled content and captured mid-hydration.
    const loadingMarkers = Array.isArray(config.loadingMarkers)
      ? config.loadingMarkers
      : readStackLoadingMarkers();
    const stableOutcome = await waitForStablePage(
      page,
      frame,
      10000,
      loadingMarkers,
    );

    // DOM-stable does not mean done: a client-side data fetch can still be in
    // flight (the loading skeleton cleared but its replacement content hasn't
    // landed). Wait for the network to go quiet — bounded, so a streaming /
    // long-poll endpoint that never idles caps out and captures anyway rather
    // than hanging.
    const networkOutcome = await waitForNetworkQuiet(networkTracker);

    // If the page never settled (a loading marker outlasted the wait) or the
    // network never went quiet, the screenshot likely caught a client-fetched
    // page mid-load. Compute the non-blocking advisory now, while both settle
    // signals are in hand, and surface it on the capture-state report below.
    const settleAdvisory = buildSettleAdvisory(stableOutcome, networkOutcome);

    const rejectionMessages = await frame.evaluate(
      () => window.__codeyamUnhandledRejections || [],
    );
    for (const message of rejectionMessages) {
      pushIssue(
        issues,
        createIssue("unhandledrejection", message, {
          url: page.url() || url,
        }),
      );
    }

    // Cold-start retry: a single re-collect after BLANK_RETRY_DELAY_MS covers
    // the React.lazy / Suspense-fallback race where waitForStablePage settles
    // on the still-empty `<div id="root">` shell before the dynamic chunk
    // resolves. One retry is enough — the pause is sized to outlast the
    // chunk-load window; only a genuinely blank page falls through to the
    // blank issue below.
    let contentState = await collectContentState(frame);
    let hasContent = hasRenderableContent(contentState);
    if (!hasContent) {
      await new Promise((r) => setTimeout(r, BLANK_RETRY_DELAY_MS));
      contentState = await collectContentState(frame);
      hasContent = hasRenderableContent(contentState);
    }

    if (!hasContent) {
      pushIssue(
        issues,
        createIssue(
          "blank",
          `Page rendered no visible content (${describeBlankReason(contentState)})`,
          { url: page.url() || url },
        ),
      );
    }

    // Check for known error states in the rendered content
    const bodyText = await frame.evaluate(() => document.body?.innerText || "");
    const matchedPattern = findErrorPattern(bodyText);
    if (matchedPattern) {
      const contextSnippet = buildErrorContextSnippet(bodyText, matchedPattern);
      pushIssue(
        issues,
        createIssue(
          "error-state",
          `Page contains error content (matched "${matchedPattern}"): ${contextSnippet ?? bodyText.slice(0, 200)}`,
          {
            url: page.url() || url,
            matchedPattern,
            contextSnippet,
          },
        ),
      );
    }

    // Hydration / interactivity gate: a page can render content and log no
    // errors yet never have hydrated, leaving every control dead. Read-only
    // (it inspects framework-attachment markers, never clicks), so it is safe
    // to run before the screenshot. Stack-gated and fail-safe — see
    // scenario-interactivity.js — so backend / static / unknown-framework
    // captures are an automatic pass.
    const hydrationIssue = await probeInteractivity(frame, {
      url: page.url() || url,
    });
    if (hydrationIssue) {
      pushIssue(issues, hydrationIssue);
    }

    // Scripted multi-step flow (`editor preview-flow`): drive an ordered
    // sequence of steps in THIS one browser session — so a behavioral
    // round-trip (click → observe → click) is captured as the real flow, not N
    // independent fresh-load snapshots. Each `capture` step writes a numbered
    // filmstrip frame; the others advance the same page. Mutually exclusive
    // with the single `interaction` path below. `frame` is reassigned so a
    // `navigate` step's new content frame backs the rest of the flow and the
    // final result URL.
    if (Array.isArray(config.steps) && config.steps.length > 0) {
      frame = await runFlowSteps(page, frame, config.steps, {
        url,
        loadingMarkers,
        navigation: config.navigation,
        iframeBackground: config.iframeBackground,
        preflight,
      });
    } else if (config.interaction) {
      // Drive the requested interaction (if any) against the settled frame,
      // then re-settle, so `preview-interact` captures the RESULT of a click /
      // fill / press (expanded accordion, open modal) without editing app
      // source. A no-match target throws here and is caught below as a failed
      // capture with the candidate-labels hint — never a silent blank shot.
      await performInteraction(frame, config.interaction);
      await waitForStablePage(page, frame, 5000, loadingMarkers);
    }

    // Replay the scenario's PERSISTED interaction sequence (if any) in order,
    // settling between steps, so a declared interactive state — an expanded
    // section, a revealed hover bar, an open modal — is reproduced on every
    // capture and recapture, not just in a one-off `preview-interact`. A step
    // that matches nothing throws and is caught below as a failed capture, so a
    // sequence that didn't fully run never persists a resting-state screenshot.
    if (Array.isArray(config.interactions) && config.interactions.length > 0) {
      await performInteractionSequence(page, frame, config.interactions, {
        settleMs: 5000,
        loadingMarkers,
      });
    }

    if (outputPath && loaded) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      await page.screenshot({ path: outputPath, fullPage: false });
    }

    const result = buildResult({
      loaded,
      hasContent,
      issues,
      outputPath,
      url: frame.url() || url,
    });

    // `capture-state` mode: attach the read-only page-state snapshot so the
    // backend can report localStorage + rendered text. Off by default, so a
    // normal error-check capture is byte-for-byte unchanged.
    if (config.captureState) {
      result.state = await dumpPageState(frame, config.stateSelector);
      // A populated state that renders blank is exactly when an agent reaches
      // for capture-state, so bundle the client-fetch advisory with the dump it
      // explains. Only when the page didn't settle cleanly — the SSR /
      // props-driven happy path stays advisory-free.
      if (settleAdvisory) {
        result.state.advisories = [settleAdvisory];
      }
    }

    return result;
  } catch (error) {
    pushIssue(
      issues,
      createIssue("navigation", error.message || String(error), { url }),
    );

    return buildResult({
      loaded,
      hasContent: false,
      issues,
      outputPath,
      url,
    });
  } finally {
    await browser.close();
  }
}

/**
 * npm wrapper entry point for the scenario-check binary: parses the
 * JSON config from argv, drives Playwright to capture the configured
 * URL, and writes the resulting screenshot.
 */
async function main() {
  const config = JSON.parse(process.argv[2] || "{}");

  if (!config.url) {
    console.error(
      "Usage: node scenario-check.js '{\"url\":\"...\",\"outputPath\":\"...\",\"width\":1440,\"height\":900}'",
    );
    process.exit(1);
  }

  const result = await runScenarioCheck(config);
  console.log(JSON.stringify(result));
}

module.exports = {
  runScenarioCheck,
  runFlowSteps,
  dumpPageState,
  readStackLoadingMarkers,
  applyBrowserState,
  isCrossOriginRequest,
  stripMarkerHeaders,
  main,
  launchChromiumWithSelfHeal,
  PLAYWRIGHT_INSTALL_COMMAND,
  PLAYWRIGHT_MISSING_BROWSER_PATTERN,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}
