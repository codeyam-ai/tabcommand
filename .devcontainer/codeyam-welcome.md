# CodeYam Editor

You are inside your codespace. The CodeYam Editor runs here and opens in its own browser tab.

## Opening the editor

**Wait for the link in the terminal.** The first time, the codespace installs the editor, which takes a few minutes; the terminal panel at the bottom of this window shows its progress. Then it says "Waiting for the CodeYam Editor to start...", and when the editor is ready it shows:

```text
==================================================
  CodeYam Editor is ready. Open it here (Cmd/Ctrl+click):

  https://<your-codespace>-14199.app.github.dev
==================================================
```

**Cmd+click** that link (Ctrl+click on Windows or Linux).

You may also see a notification in the bottom-right corner offering to open port 14199 in the browser. That opens the editor too.

If your browser says it blocked a pop-up, choose to always allow pop-ups for this site. From then on the editor opens on its own.

If you closed the terminal: open the **Ports** panel (next to Terminal), find port **14199** labelled **CodeYam Editor**, and click the globe icon on that row.

## Staying awake

GitHub stops a codespace after it has been idle for a while, and it only counts activity in this VS Code window, not in the editor tab. So while an AI agent is working or the editor tab is open, the terminal prints a "keep-alive" line every few minutes to keep the codespace running. Those lines are expected.

**Keep this VS Code tab open in the background.** Closing it lets GitHub stop the codespace at its idle timeout even while the editor is in use. When nothing is working and the editor tab is closed, the lines stop and the codespace stops on its own.

## Signing in

The first time you start the AI that builds with you, the editor asks you to sign in to it. Follow the steps on that screen.

## If the editor does not come up

Its output is in a log file. In the terminal, run:

```bash
cat .codeyam/logs/codespaces-editor.log
```

To start it yourself, run this and leave it running, then reload the editor tab (or open port 14199 from the Ports panel):

```bash
codeyam-editor start --hosted --no-open --port 14199
```

## Who can reach the editor

Only you. The port is private, so GitHub asks anyone else to sign in first and then refuses them. If you make the port public in the Ports panel, the editor starts asking for its own token.
