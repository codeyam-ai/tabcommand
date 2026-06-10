const {
  hasLoadingMarkers,
  shouldStopWaitingForImages,
} = require("./scenario-metrics");
const fs = require("fs");

// PROTOTYPE (improve35 capture diagnostics): append a per-phase timing line to
// a file so we can see WHERE a slow/timed-out capture spends its budget — even
// when the editor kills this script on timeout (stderr is lost then, but the
// file survives because each line is flushed synchronously). The cwd is the
// project dir (scenario_check.rs sets `.current_dir(project_dir)`), so this
// lands at `<project>/.codeyam/logs/capture-timing.log`. Diagnostics only —
// never throws, never affects the capture result.
function logCaptureTiming(phase, data) {
  try {
    const line = `[${new Date().toISOString()}] [capture-timing] phase=${phase} ${JSON.stringify(
      data,
    )}\n`;
    fs.appendFileSync(".codeyam/logs/capture-timing.log", line);
  } catch (_) {
    /* diagnostics must never break a capture */
  }
}

const net = require("net");

// Resolve a URL to the TCP {host, port} a pre-flight connect should target, or
// null when there is nothing to pre-check — an unparseable URL, or a non-http(s)
// target like `data:`/blank that the capture renders with no network origin.
// Pure (no socket) so the parse, protocol gate, and default-port rules are
// unit-tested without opening a connection.
function resolveTcpTarget(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 80),
  };
}

// Fast pre-flight (improve35): is anything accepting TCP on the app port? A
// refused connection (the editor's reverse proxy is down) fails in milliseconds;
// without this, the iframe's `waitForLoadState("load")` hangs the FULL 30s on a
// dead origin (the observed capture failure — capture-timing showed
// navigate-iframe elapsedMs=30004, status=null). A connection that ACCEPTS is
// good enough to proceed — a slow HTTP response *after* connect is a cold
// compile, handled by the normal load wait + the editor's retry. So we only bail
// on a hard refusal/timeout, never on slowness.
async function assertAppPortReachable(url, { timeoutMs = 2500 } = {}) {
  const target = resolveTcpTarget(url);
  if (!target) return; // non-http target (data:, blank) — nothing to pre-check
  const { host, port } = target;
  const started = Date.now();
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const finish = (err) => {
      socket.destroy();
      const elapsedMs = Date.now() - started;
      logCaptureTiming("app-port-reachable", {
        host,
        port,
        reachable: !err,
        elapsedMs,
        error: err ? err.message : null,
      });
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(timeoutMs, () =>
      finish(
        new Error(
          `app port unreachable: TCP connect to ${host}:${port} timed out after ${timeoutMs}ms — the editor's reverse proxy is not accepting connections (proxy down?)`,
        ),
      ),
    );
    socket.once("connect", () => finish());
    socket.once("error", (e) =>
      finish(
        new Error(
          `app port unreachable: ${host}:${port} ${e.code || e.message} — is the editor's reverse proxy up? (a capture cannot render a dead app port)`,
        ),
      ),
    );
  });
}

function escapeHtmlAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

// The harness background defaults to transparent so the iframe's own
// <body> background paints through — matching what users see in the Live
// Preview. Callers (via scenario-check.js) pass a concrete color when the
// UI has detected a background it wants the capture to paint behind the
// iframe, e.g. `var(--bg-deep)` from the editor shell.
function buildIframeHarness(url, { background = "transparent" } = {}) {
  const escapedUrl = escapeHtmlAttribute(url);
  const bg = String(background);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: ${bg};
      }

      iframe {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: ${bg};
      }
    </style>
  </head>
  <body>
    <iframe id="scenario-frame" title="Scenario Preview" src="${escapedUrl}"></iframe>
  </body>
</html>`;
}

async function collectContentState(target) {
  return target.evaluate(() => {
    const root = document.getElementById("root");
    const imgs = Array.from(document.images || []);
    const loadedImageCount = imgs.filter(
      (img) => img.complete && img.naturalWidth > 0,
    ).length;
    const mediaSelectors = ["svg", "canvas", "video"];
    let mediaBboxCount = 0;
    for (const selector of mediaSelectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          mediaBboxCount += 1;
        }
      }
    }
    return {
      bodyTextLength: document.body ? document.body.innerText.trim().length : 0,
      rootChildCount: root ? root.childElementCount : 0,
      rootTextLength: root ? (root.textContent || "").trim().length : 0,
      imageCount: imgs.length,
      loadedImageCount,
      mediaBboxCount,
    };
  });
}

async function collectImageStates(target) {
  return target.evaluate(() =>
    Array.from(document.images || []).map((img) => ({
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      src: img.currentSrc || img.src || "",
    })),
  );
}

async function waitForImagesSettled(
  target,
  { overallTimeoutMs = 5000, pollIntervalMs = 100 } = {},
) {
  const started = Date.now();
  let images = await collectImageStates(target);
  while (
    !shouldStopWaitingForImages(images, {
      elapsedMs: Date.now() - started,
      overallTimeoutMs,
    })
  ) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    images = await collectImageStates(target);
  }
  const elapsedMs = Date.now() - started;
  const allComplete = images.every((img) => img && img.complete === true);
  const incompleteSrcs = images
    .filter((img) => !img || img.complete !== true || !(img.naturalWidth > 0))
    .map((img) => (img && img.src) || "")
    .slice(0, 6);
  logCaptureTiming("images-settled", {
    elapsedMs,
    settled: allComplete,
    total: images.length,
    incompleteCount: incompleteSrcs.length,
    incompleteSrcs,
    overallTimeoutMs,
  });
  return { settled: allComplete, images, elapsedMs };
}

async function waitForAnimationsSettled(
  target,
  { timeoutMs = 2000, pollIntervalMs = 100 } = {},
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const runningCount = await target.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running").length,
    );
    if (runningCount === 0) {
      return { settled: true, elapsedMs: Date.now() - started };
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return { settled: false, elapsedMs: Date.now() - started };
}

// Track in-flight network requests on a Playwright page so a capture can wait
// for client-side data fetches to settle before screenshotting. The
// resource-timing API (`performance.getEntriesByType("resource")`) only records
// COMPLETED requests, so it cannot see a fetch that is still in flight — the
// exact window where a client-fetch page shows a loading skeleton. We count
// request starts against finishes/failures instead. Returns a live view:
// `inFlight()` is the current outstanding count and `lastActivityMs()` is the
// timestamp of the most recent request start OR completion (0 when the page has
// made no requests since the tracker attached). Attach BEFORE navigation so
// every request is counted. Stack-agnostic — it observes raw HTTP activity, not
// any framework's fetch wrapper.
function createNetworkTracker(page) {
  let inFlight = 0;
  let lastActivityMs = 0;
  const bump = () => {
    lastActivityMs = Date.now();
  };
  if (page && typeof page.on === "function") {
    page.on("request", () => {
      inFlight += 1;
      bump();
    });
    const settle = () => {
      inFlight = Math.max(0, inFlight - 1);
      bump();
    };
    page.on("requestfinished", settle);
    page.on("requestfailed", settle);
  }
  return {
    inFlight: () => inFlight,
    lastActivityMs: () => lastActivityMs,
  };
}

// Bounded network-quiet wait: after the DOM is stable a client-side data fetch
// can still be in flight — the loading skeleton is gone but the fetched rows
// haven't replaced it yet, so a screenshot here catches the in-between frame.
// Wait until no request has been outstanding for `quietWindowMs`, hard-capped at
// `overallTimeoutMs`. Two properties matter:
//   - A page that made NO requests (lastActivityMs stays 0) is already quiet and
//     returns on the first poll, so server-rendered captures incur no extra wait.
//   - A streaming / long-poll endpoint that never goes idle hits the cap and the
//     caller captures anyway — the wait can never hang the capture.
async function waitForNetworkQuiet(
  tracker,
  { quietWindowMs = 500, overallTimeoutMs = 5000, pollIntervalMs = 100 } = {},
) {
  const started = Date.now();
  while (Date.now() - started < overallTimeoutMs) {
    const idleForMs = Date.now() - tracker.lastActivityMs();
    if (tracker.inFlight() === 0 && idleForMs >= quietWindowMs) {
      const elapsedMs = Date.now() - started;
      logCaptureTiming("network-quiet", { outcome: "quiet", elapsedMs });
      return { quiet: true, elapsedMs };
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  const elapsedMs = Date.now() - started;
  logCaptureTiming("network-quiet", {
    outcome: "capped",
    elapsedMs,
    inFlight: tracker.inFlight(),
  });
  return { quiet: false, elapsedMs };
}

// `loadingMarkers` are the project's app-specific loading strings (from
// stack.json `capture.loadingMarkers`); they extend the codeyam-harness
// defaults so a stable-but-still-loading app screen counts as "not ready"
// and the loop keeps waiting instead of capturing the loading flash.
async function waitForStablePage(page, target, timeoutMs = 10000, loadingMarkers = []) {
  const started = Date.now();
  let lastHtml = "";
  let stableCount = 0;
  let lastHadLoadingMarkers = false;
  let lastHtmlChanged = false;

  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(500);

    const pageState = await target.evaluate(() => {
      const getById = document.getElementById;
      const root =
        typeof getById === "function" ? document.getElementById("root") : null;
      return {
        bodyText: document.body?.innerText ?? "",
        html: document.body?.innerHTML ?? "",
        // Whether the SPA mount point exists AND has painted anything. An
        // existing-but-empty `<div id="root">` is the pre-paint window of a
        // slow-first-paint scenario (e.g. a live-session app that spends a few
        // seconds connecting before the gate UI mounts). `rootExists` lets us
        // distinguish that from a mid-redirect/teardown `null` body, where
        // there is no root to wait on and a stable-empty page is legitimately
        // settled.
        rootExists: !!root,
        rootChildCount: root ? root.childElementCount : 0,
      };
    });

    lastHadLoadingMarkers = hasLoadingMarkers(pageState.bodyText, loadingMarkers);
    lastHtmlChanged = pageState.html !== lastHtml;

    // A mounted-but-unpainted root is "still loading", not "settled": the HTML
    // can sit byte-stable for a second or two while the SPA boots, which would
    // otherwise satisfy the stability check and capture a blank frame before
    // first paint. Treat an existing root with zero children AND no body text
    // as not-ready so the loop keeps polling until the app actually paints (or
    // the overall timeout fires, by which point real content is present). A
    // `null` body (rootExists=false) is unaffected — it stays trivially stable.
    const rootUnpainted =
      pageState.rootExists &&
      pageState.rootChildCount === 0 &&
      (pageState.bodyText ?? "").trim().length === 0;

    if (!lastHadLoadingMarkers && !lastHtmlChanged && !rootUnpainted) {
      stableCount += 1;
      if (stableCount >= 2) {
        const remaining = () => Math.max(0, timeoutMs - (Date.now() - started));
        await waitForAnimationsSettled(target, {
          timeoutMs: Math.min(2000, remaining()),
        });
        await waitForImagesSettled(target, { overallTimeoutMs: remaining() });
        logCaptureTiming("stable-page", {
          outcome: "stabilized",
          elapsedMs: Date.now() - started,
        });
        return { stabilized: true, hadLoadingMarkers: false };
      }
    } else {
      stableCount = 0;
    }

    lastHtml = pageState.html;
  }
  // Hit the cap without stabilizing — record WHY: a persistent loading marker
  // (app stuck) vs HTML still mutating each poll (HMR / animation / re-render).
  // The returned `hadLoadingMarkers` is the signal the capture advisory keys
  // off: a marker still on screen at the cap means the page never finished its
  // (likely client-side) load, so the screenshot caught its loading state.
  logCaptureTiming("stable-page", {
    outcome: "timed-out",
    elapsedMs: Date.now() - started,
    timeoutMs,
    lastHadLoadingMarkers,
    lastHtmlStillChanging: lastHtmlChanged,
  });
  return { stabilized: false, hadLoadingMarkers: lastHadLoadingMarkers };
}

// `preflight` is injectable so unit tests that drive a mock page can stay
// network-free; production callers use the default real reachability check.
async function loadScenarioInIframe(
  page,
  url,
  { background, preflight = assertAppPortReachable } = {},
) {
  await preflight(url);
  const navStarted = Date.now();
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.request().resourceType() === "document" &&
        response.url() === url,
      { timeout: 30000 },
    )
    .catch(() => null);

  await page.setContent(buildIframeHarness(url, { background }), {
    waitUntil: "domcontentloaded",
  });

  const frameHandle = await page.waitForSelector("#scenario-frame", {
    state: "attached",
    timeout: 30000,
  });
  const frame = await frameHandle.contentFrame();
  if (!frame) {
    throw new Error("Scenario iframe did not attach");
  }

  await frame.waitForLoadState("load", { timeout: 30000 });
  const response = await responsePromise;
  logCaptureTiming("navigate-iframe", {
    elapsedMs: Date.now() - navStarted,
    status: response ? response.status() : null,
    url,
  });
  return { frame, response };
}

// Load the scenario as a top-level navigation instead of embedding it in
// the iframe harness. A top-level document is a first-party context, so a
// `SameSite=Lax` session cookie is sent on the navigation — which is what
// auth-gated application routes need to render the authenticated page
// rather than redirecting to /login. The returned `frame` is the page's
// main frame so callers can treat it uniformly with the iframe path
// (`frame.url()`, `frame.evaluate(...)`, `waitForStablePage(page, frame)`).
async function loadScenarioTopLevel(
  page,
  url,
  { preflight = assertAppPortReachable } = {},
) {
  await preflight(url);
  const navStarted = Date.now();
  const response = await page.goto(url, {
    waitUntil: "load",
    timeout: 30000,
  });
  logCaptureTiming("navigate-toplevel", {
    elapsedMs: Date.now() - navStarted,
    status: response ? response.status() : null,
    url,
  });
  return { frame: page.mainFrame(), response };
}

// Collect up to 20 distinct visible labels of interactive elements on the
// page — buttons, links, role=button, form controls, <summary>, and anything
// with an onclick. Used to build an ACTIONABLE error when an interaction's
// target matches nothing: the agent reliably knows a label it rendered, so
// listing the real candidates turns a silent blank capture into a "did you
// mean one of these?" hint. Pure read (no clicks); falls back to value /
// aria-label / placeholder when an element has no text.
async function collectInteractiveLabels(frame) {
  return frame.evaluate(() => {
    const selector =
      "button, a[href], [role=button], input, select, textarea, summary, [onclick]";
    const nodes = Array.from(document.querySelectorAll(selector));
    const labels = nodes
      .map((node) => {
        const text =
          (node.innerText || node.textContent || "").trim() ||
          (typeof node.value === "string" ? node.value.trim() : "") ||
          (node.getAttribute && node.getAttribute("aria-label")) ||
          (node.getAttribute && node.getAttribute("placeholder")) ||
          "";
        return String(text).trim();
      })
      .filter((label) => label.length > 0);
    return Array.from(new Set(labels)).slice(0, 20);
  });
}

// Drive a single user-style interaction against the settled frame before the
// screenshot, so an interactive state (expanded accordion, open modal, filled
// field) can be captured without editing app source.
//
// The target is matched by visible `text` (preferred — the agent reliably
// knows the label it rendered) or a CSS `selector`. `action` is click / fill /
// press; `value` carries the text for `fill` or the key for `press` (e.g.
// `Enter`). On a no-match target this THROWS with the list of candidate
// interactive labels — the capture script's outer catch turns that into a
// failed capture with an actionable message, never a silent blank screenshot.
async function performInteraction(frame, interaction, { timeoutMs = 5000 } = {}) {
  const { action, selector, text, value } = interaction || {};

  let locator;
  let targetDesc;
  if (typeof text === "string" && text.length > 0) {
    locator = frame.getByText(text, { exact: false }).first();
    targetDesc = `text "${text}"`;
  } else if (typeof selector === "string" && selector.length > 0) {
    locator = frame.locator(selector).first();
    targetDesc = `selector "${selector}"`;
  } else {
    throw new Error(
      "preview-interact: interaction requires a `text` or `selector` target",
    );
  }

  const matchCount = await locator.count();
  if (matchCount === 0) {
    const candidates = await collectInteractiveLabels(frame);
    const candidateList =
      candidates.length > 0 ? candidates.join(", ") : "(none found on page)";
    throw new Error(
      `preview-interact: no element matched ${targetDesc}. ` +
        `Candidate interactive labels: ${candidateList}`,
    );
  }

  switch (action) {
    case "click":
      await locator.click({ timeout: timeoutMs });
      break;
    case "fill":
      await locator.fill(value ?? "", { timeout: timeoutMs });
      break;
    case "press":
      await locator.press(value || "Enter", { timeout: timeoutMs });
      break;
    case "hover":
      // Reveals hover-only affordances (an action bar, a tooltip) — one of the
      // most common ephemeral states a resting-render screenshot misses.
      await locator.hover({ timeout: timeoutMs });
      break;
    default:
      throw new Error(
        `preview-interact: unknown action "${action}" (expected click | fill | press | hover)`,
      );
  }
}

// Hold until a visible-text or selector predicate becomes true, bounded by a
// wall-clock timeout. Behavioral demos hinge on transient states (an overlay
// appears, then a new round renders); a flow step waits for that real signal
// instead of a fixed sleep — the same "hold to a real signal with a safety
// bound" rule the rest of the capture pipeline follows. THROWS on timeout
// naming the predicate and the bound, so the capture script's outer catch
// turns a never-appearing predicate into an actionable failure rather than an
// infinite hang. `text` is matched case-insensitively as a substring (the
// agent reliably knows the copy it rendered); `selector` is a CSS selector.
async function waitForPredicate(frame, predicate, { defaultTimeoutMs = 8000 } = {}) {
  const { text, selector, timeoutMs } = predicate || {};
  const bound =
    typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : defaultTimeoutMs;

  let locator;
  let desc;
  if (typeof text === "string" && text.length > 0) {
    locator = frame.getByText(text, { exact: false }).first();
    desc = `text "${text}"`;
  } else if (typeof selector === "string" && selector.length > 0) {
    locator = frame.locator(selector).first();
    desc = `selector "${selector}"`;
  } else {
    throw new Error("waitFor: predicate requires a `text` or `selector` target");
  }

  try {
    await locator.waitFor({ state: "visible", timeout: bound });
  } catch (_) {
    throw new Error(
      `waitFor: predicate ${desc} did not become visible within ${bound}ms`,
    );
  }
}

// Drive an ordered sequence of interactions against the settled frame, settling
// the page between each so a later step sees the DOM the earlier one produced.
// This is the persisted-scenario path (`scenario.interactions`): unlike the
// single fire-and-forget `preview-interact`, the whole sequence is replayed on
// every capture and recapture. Any step that matches nothing throws (with the
// candidate-labels hint from `performInteraction`), and the caller turns that
// into a failed capture — never a silent resting-state screenshot for a
// sequence that didn't fully run.
// `settle` is injectable so unit tests that drive a mock frame stay
// network-free and fast; production callers use the default real
// `waitForStablePage` re-settle between steps.
async function performInteractionSequence(
  page,
  frame,
  interactions,
  {
    timeoutMs = 5000,
    settleMs = 5000,
    loadingMarkers,
    settle = waitForStablePage,
  } = {},
) {
  for (let i = 0; i < interactions.length; i += 1) {
    try {
      await performInteraction(frame, interactions[i], { timeoutMs });
    } catch (err) {
      // Prefix the failing step's index so a miss in a multi-step sequence is
      // locatable, matching the model-side `interactions[i]` validator.
      throw new Error(`interactions[${i}]: ${err.message}`);
    }
    await settle(page, frame, settleMs, loadingMarkers);
  }
}

module.exports = {
  logCaptureTiming,
  resolveTcpTarget,
  assertAppPortReachable,
  escapeHtmlAttribute,
  buildIframeHarness,
  collectContentState,
  collectImageStates,
  waitForImagesSettled,
  waitForAnimationsSettled,
  createNetworkTracker,
  waitForNetworkQuiet,
  waitForStablePage,
  loadScenarioInIframe,
  loadScenarioTopLevel,
  collectInteractiveLabels,
  performInteraction,
  waitForPredicate,
  performInteractionSequence,
};
