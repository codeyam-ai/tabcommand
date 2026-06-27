---
name: codeyam-finalize
autoApprove: false
description: |
  Drive a deferred, possibly fleet-shared branch all the way to
  merge-ready autonomously — ORIENT, clean up Fast-Commit drift, run the
  full session-finalize, and (on explicit confirmation) push and open the
  PR, tracking it through CI to a CLEAN/MERGEABLE state. Checks in only
  for genuine judgment calls. Use this to FINISH a branch; use
  `/codeyam-audit` for a one-shot "is this branch clean?" report.
---

# Drive a branch to merge-ready

This skill is a thin, stable entry point. Its full operating procedure —
APPROACH steps 1–8 and the inlined GOTCHAS — lives in the
version-controlled playbook so it can evolve through normal review
instead of silent self-edits:

**Read `docs/fleet-finalize-playbook.md` now and follow it.** Everything
below is the contract; the playbook is the procedure.

## Contract

- **Operate on the current branch** by default (the playbook's ORIENT
  step reads `git branch --show-current`). The user need not name it.
- **Assume fleet-shared.** NEVER rebase, amend, or force-push. Integrate a
  moved primary branch by MERGING it in. This is the one unrecoverable
  rule — it is rule 0 of the playbook for a reason.
- **Autonomous up to merge-ready, then stop.** Drive ORIENT → mechanical
  fixes → judgment fixes → finalize until `verify-full-finalize` exits 0.
  Three things require an explicit human go before you do them:
  1. **Bulk inherited-debt paydown** (a whole-repo `SOURCE_HAS_UNREGISTERED`
     wall) — surface the count and ask.
  2. **Pushing** the branch.
  3. **Opening / merging** the PR.
- **A green Fast-Commit session is NOT merge-ready.** The per-step gate is
  diff-scoped; `session-finalize` is whole-repo-scoped. Trust
  `verify-full-finalize`, not the session's green steps.
- **Red CI is never waved off.** A red check is root-caused from its
  failing-job log *before* any "flake/infra/environmental" label, and
  local green never clears it. "Flake" requires proof of non-determinism;
  two same-signature failures are a real bug. See the playbook's step 8a.

## Preflight

Confirm the project is initialized for codeyam-editor:

```bash
codeyam-editor editor config-show >/dev/null 2>&1 || {
  echo "Project is not initialized for codeyam-editor. Run /codeyam-onboard first."
  exit 1
}
```

If it fails, tell the user to run `/codeyam-onboard` and stop.

## Run

Work through `docs/fleet-finalize-playbook.md` top to bottom. Then run its
final **Reflect & self-improve** step: route durable lessons to a `memory/`
file and structural gaps to a proposed plan/diff against the playbook —
never a silent edit to this `SKILL.md`. If the run was clean, say "nothing
new learned" and write nothing.
