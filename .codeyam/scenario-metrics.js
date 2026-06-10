const LOADING_MARKERS = [
  "Loading scenario...",
  "Loading tests...",
  "Loading scenarios...",
  "disconnected",
];

// `extraMarkers` are project-supplied (from stack.json `capture.loadingMarkers`)
// because an app's own loading copy ("Loading…", "Please wait") is
// app-specific and must NOT be hardcoded into the shared harness — only the
// four codeyam-harness markers above are universal. Matching is
// case-insensitive so "Loading…" and "loading…" both count; without the
// project markers a stable app loading screen looks "ready" to
// waitForStablePage and gets captured mid-hydration.
function hasLoadingMarkers(text, extraMarkers = []) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const markers = LOADING_MARKERS.concat(
    Array.isArray(extraMarkers) ? extraMarkers : [],
  );
  return markers.some(
    (marker) => marker && lower.includes(String(marker).toLowerCase()),
  );
}

function hasRenderableContent(state) {
  if (!state) return false;
  if (
    state.rootChildCount > 0 ||
    state.rootTextLength > 0 ||
    state.bodyTextLength > 0
  ) {
    return true;
  }
  if ((state.loadedImageCount || 0) > 0) return true;
  if ((state.mediaBboxCount || 0) > 0) return true;
  return false;
}

function describeBlankReason(state) {
  if (!state) return "no content state collected";
  const parts = [];
  if (!(state.bodyTextLength > 0)) {
    parts.push("no text");
  }
  const imageCount = state.imageCount || 0;
  const loadedImageCount = state.loadedImageCount || 0;
  if (imageCount > 0 && loadedImageCount === 0) {
    parts.push(`${imageCount} unloaded image${imageCount === 1 ? "" : "s"}`);
  } else if (imageCount === 0) {
    parts.push("no images");
  }
  if (!((state.mediaBboxCount || 0) > 0)) {
    parts.push("no svg/canvas/video");
  }
  return parts.join(", ");
}

function shouldStopWaitingForImages(images, options = {}) {
  const { elapsedMs = 0, overallTimeoutMs = 5000 } = options;
  if (!Array.isArray(images) || images.length === 0) return true;
  if (elapsedMs >= overallTimeoutMs) return true;
  return images.every((img) => img && img.complete === true);
}

const ERROR_PATTERNS = [
  "not found in registry",
  "Component not found",
  "Scenario Error",
];

function hasErrorPatterns(text) {
  return ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}

function findErrorPattern(text) {
  if (!text) return null;
  for (const pattern of ERROR_PATTERNS) {
    if (text.includes(pattern)) return pattern;
  }
  return null;
}

const ERROR_CONTEXT_RADIUS = 60;

function buildErrorContextSnippet(text, pattern) {
  if (!text || !pattern) return null;
  const index = text.indexOf(pattern);
  if (index < 0) return null;
  const start = Math.max(0, index - ERROR_CONTEXT_RADIUS);
  const end = Math.min(text.length, index + pattern.length + ERROR_CONTEXT_RADIUS);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${slice}${suffix}`;
}

// Build the non-blocking "this page looks client-fetched" advisory from the two
// settle signals the capture already computes: `stableOutcome` from
// waitForStablePage (did the page settle, and was a loading marker still up at
// the cap?) and `networkOutcome` from waitForNetworkQuiet (did in-flight network
// go quiet, or did the bounded wait cap out?). Captures settle within a bounded
// window so a never-idle stream can't hang them — which means a slower
// client-side fetch lands AFTER the window and the screenshot catches the
// loading/initial state instead of the populated one. When either signal fires,
// name the cause and the two reliable fixes (server-render the data, or drive a
// props-driven isolated component scenario) so the agent reaches for those up
// front instead of rediscovering the constraint by trial and error. Returns the
// advisory string, or null when the page settled cleanly (the SSR / props-driven
// happy path — no advisory, so a healthy capture stays noise-free).
function buildSettleAdvisory(stableOutcome, networkOutcome) {
  const causes = [];
  if (
    stableOutcome &&
    stableOutcome.stabilized === false &&
    stableOutcome.hadLoadingMarkers === true
  ) {
    causes.push("a loading marker was still on the page");
  }
  if (networkOutcome && networkOutcome.quiet === false) {
    causes.push("network requests were still in flight");
  }
  if (causes.length === 0) return null;
  return (
    `When this page was captured, ${causes.join(" and ")} — it likely fetches ` +
    `its data on the client. Captures settle within a bounded window, so data ` +
    `that arrives via a client-side fetch after that window renders as the ` +
    `loading/initial state, not the populated state. To capture a populated ` +
    `state, server-render the data (SSR/RSC) or drive a props-driven isolated ` +
    `component scenario.`
  );
}

module.exports = {
  hasLoadingMarkers,
  hasRenderableContent,
  buildSettleAdvisory,
  describeBlankReason,
  shouldStopWaitingForImages,
  hasErrorPatterns,
  findErrorPattern,
  buildErrorContextSnippet,
  ERROR_PATTERNS,
  ERROR_CONTEXT_RADIUS,
};
