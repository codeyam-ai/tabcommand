const { createIssue } = require("./scenario-issues");

function getInitScript() {
  return `
    window.__codeyamUnhandledRejections = [];
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason);
      window.__codeyamUnhandledRejections.push(message);
    });

    // Stub WebSocket during capture to prevent terminal reconnection spam.
    window.WebSocket = class StubWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = 3;
      onopen = null;
      onclose = null;
      onerror = null;
      onmessage = null;
      send() {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return false; }
      constructor() {
        setTimeout(() => {
          if (this.onerror) this.onerror(new Event("error"));
          if (this.onclose) this.onclose(new CloseEvent("close"));
        }, 0);
      }
    };
  `;
}

function handleConsoleMessage(message) {
  if (message.type() !== "error") return null;
  const text = message.text();
  
  // Ignore known dev-server WebSocket/HMR errors from Vite proxy
  if (
    text.includes("WebSocket connection to") ||
    text.includes("Unsupported Media Type")
  ) {
    return null;
  }

  return createIssue("console", text);
}

function handlePageError(error) {
  return createIssue("pageerror", error.message || String(error));
}

function handleRequestFailed(request) {
  const errorText = request.failure()?.errorText || "Request failed";

  // Filter benign request cancellations. `net::ERR_ABORTED` is what Playwright
  // emits when a request is in-flight at the moment the page is closed (or the
  // iframe is destroyed). For scenarios whose pages fetch large payloads (the
  // editor's own EditorShell mounts a 2.2MB `/api/tests` fetch), the
  // browser.close() at the end of capture races the fetch and produces this
  // event AFTER the screenshot has already been taken — there is no real
  // failure to surface. Genuine network failures arrive under different
  // codes (net::ERR_CONNECTION_REFUSED, net::ERR_NAME_NOT_RESOLVED, etc.)
  // and continue to be reported.
  if (errorText.includes("net::ERR_ABORTED")) {
    return null;
  }

  return createIssue("requestfailed", errorText, { url: request.url() });
}

module.exports = {
  getInitScript,
  handleConsoleMessage,
  handlePageError,
  handleRequestFailed,
};
