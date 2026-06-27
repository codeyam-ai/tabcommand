# Fleet-finalize playbook

The authoritative, version-controlled body of the `/codeyam-finalize`
skill: **drive a deferred, possibly fleet-shared branch all the way to
merge-ready, autonomously, checking in only for genuine judgment calls.**

This file is a normal source document, not agent-config — it lives
outside `.claude/`, so the skill's "Reflect & self-improve" step can
propose edits to it through the standard editor workflow instead of
fighting the self-modification guard. The skill (`SKILL.md`) is a thin,
stable pointer to this playbook; durable knowledge accrues *here*.

It encodes the battle-tested "pull, clean up Fast-Commit drift, finalize,
push, open/track the PR through CI and mergeability" sequence as APPROACH
steps 1–8, with the hard-won GOTCHAS inlined at the step where each one
bites. Read it top to bottom on first use; on later runs, recalled
memories supply the deltas.

---

## The one unrecoverable rule (read first)

**NEVER rebase, amend, or force-push a fleet-shared branch.** A concurrent
session may have committed under you at any moment. Integrate a moved
primary branch by **merging it in**, never by rebasing onto it. Every
other mistake in this playbook is recoverable; this one rewrites history
other people are building on and cannot be undone.

Because a sibling can commit between any two of your commands:

- Re-check `git branch --show-current` before *every* commit — a
  merged-PR auto-switch can have moved you off the branch you think
  you're on.
- Re-check `git rev-list --count origin/<branch>..HEAD` and
  `HEAD..origin/<branch>` before committing, so you see divergence the
  moment it appears and merge it in rather than discovering it at push.

## Safe defaults (so a bare `/codeyam-finalize` is complete and safe)

The skill must not depend on the user re-supplying per-run context. Bake
in the conservative choice for each axis; the user can override any of
them in their invocation prompt.

1. **Assume fleet-shared.** Always merge, never rebase/amend/force-push.
   On a genuinely private branch the only cost is a slightly less-clean
   merge commit — which is never *wrong*. So assume shared unless the
   user explicitly says the branch is private.
2. **Stop and ask before any bulk inherited-debt paydown.** Discharging a
   whole-repo `SOURCE_HAS_UNREGISTERED` wall (hundreds of entities, the
   workflow fan-out path) is a real judgment call with real token cost.
   Surface the count and ask — do not autonomously pay it down.
3. **Push and merge only on explicit confirmation.** Drive everything up
   to "merge-ready," then stop and report. Pushing and opening/merging
   the PR are outward, hard-to-reverse actions that need a human go.

Operating on the **current** branch is itself a safe default — ORIENT
reads `git branch --show-current`; the user need not name the branch.

---

## APPROACH

### 1. ORIENT — branch, debt, and the comprehensive preview

Establish where you are before changing anything.

```bash
git branch --show-current                 # confirm the branch (safe default: current)
git fetch origin                          # see siblings' work without integrating it yet
git rev-list --count origin/<branch>..HEAD   # commits you have that origin doesn't
git rev-list --count HEAD..origin/<branch>   # commits origin has that you don't (siblings)
codeyam-editor editor finalize-debt show --format json
```

`finalize-debt show` lists the deferred commits owed a full
`session-finalize`. **Zero deferred and no divergence** → the branch may
already be merge-ready; jump to step 7's `verify-full-finalize` check and
short-circuit if it passes ("nothing to finalize").

**Preview the comprehensive (whole-repo) finalize debt, not just the
diff-only gate.** The Fast-Commit gate you've been passing all session is
`DiffOnly` — it only sees the current diff. `session-finalize` runs the
*strict, whole-repo* audit, which can surface inherited debt (e.g. a
`SOURCE_HAS_UNREGISTERED` wall) that was invisible all session. Surface
that count *now* so the size of the run is known up front rather than
discovered at the finalize wall.

> GOTCHA — **audit-gate (diff) vs comprehensive Phase 2 (whole-repo).**
> Passing every Fast-Commit step does **not** mean `session-finalize`
> will pass. The per-step gate is diff-scoped; finalize is repo-scoped.
> Treat a green session as "diff is clean," never as "branch is
> finalize-ready."

### 2. Confirm no fail-fast — see the whole failure set at once

Before fixing anything, get the *complete* list of what's broken, not the
first failure. Run the audit in its report-everything mode:

```bash
codeyam-editor editor audit --format json
```

Read every `failures[]` entry and the `attribution[]` array together.
Group findings by invariant id and by the commit that introduced them.
Fixing blind, one-failure-at-a-time, wastes finalize cycles — each full
`session-finalize` is the expensive loop you're trying to run *once*.

> GOTCHA — **cross-platform CI failure classes.** Some real bugs only
> reproduce on CI, never locally (path separators, line endings,
> case-sensitive FS, a test that assumes a Unix tool, a headless build
> without GTK). "CI red, local green" means **you have not reproduced the
> failure yet**, NOT that the code is correct and the environment is to
> blame. Pull the failing-job log and read the actual error before you
> classify anything — see step 8a, the investigate-then-classify gate.
> Calling a red check "environmental" or "infra" without having read its
> log is the misread that nearly shipped cross-platform bugs.

### 3. Trust the stale-cache band — don't chase deterministic churn

Several "dirty" signals are deterministic retention churn, **not** edits
to revert:

- Deleted `.codeyam/plans/completed/*` files — the rolling completed-plan
  archive trims to a fixed cap. Every session prunes the *same* files;
  they reconcile to a no-op on merge. Do **not** `git checkout` them.
- `DEPENDENCY_GRAPH_STALE` / `PARTITION_NEEDS_REFRESH` staleness-sweep
  warnings — these are deferred work, discharged by `session-finalize`'s
  reconcile, not something to fix by hand mid-session.

> GOTCHA — **coverage-dir graph pollution.** Coverage output directories
> (`coverage/`, `ui/coverage/`, `coverage-seed/`, `*/lcov-report/`) can
> pollute the dependency graph with nodes for files that aren't real
> source. On a current binary this is handled
> (`fix-coverage-dirs-pollute-scenario-staleness-graph`). On an older
> binary the manual fallback is to `rm -rf` the coverage dirs before the
> staleness sweep so they stop seeding phantom nodes — but prefer
> upgrading the binary to repeating the `rm -rf` loop.

### 4. Mechanical fixes — the deterministic, no-judgment repairs

Apply the failures whose fix is unambiguous and scripted. These have a
`fixCommand` in the audit JSON or a named recovery:

- Registry drift → `codeyam-editor editor reconcile-registry --auto-apply`
- Import/graph staleness → `codeyam-editor editor analyze-imports`
- Post-merge drift after integrating origin →
  `codeyam-editor editor pre-commit-sync --recover` (runs
  `git pull --rebase --autostash` → `post-merge-drift-sweep` →
  `plan-cleanup-duplicates` in one shot — do **not** hand-stitch these,
  and do **not** `git add` a deleted queue-plan copy by hand).
- Duplicate plan slug on merge → the same `--recover` path handles it.

Re-run `codeyam-editor editor audit --format json` after the mechanical
pass so the remaining set is only the judgment calls.

### 5. Judgment fixes — the calls a human signed up for

What's left needs a decision, not a script:

- **Bulk inherited debt (`SOURCE_HAS_UNREGISTERED` and friends).** This
  is the safe-default stop point. Surface the count and the entities and
  **ask** before paying it down — discharging hundreds of entities is the
  expensive workflow-fan-out path and the user owns that token spend.
- Genuine test failures attributable to a deferred commit — fix the code,
  never the test expectation (the test states desired behavior).
- Ambiguous classifications (is this a test fixture? derive-generated?) —
  apply the project's glossary discipline; ask when truly unsure.

### 6. Scenarios + screenshots — refresh evidence, in the right order

If the branch carries UI changes, the finalize wants current scenario
evidence and screenshots.

> GOTCHA — **reconcile/evidence ordering.** Record test evidence on
> reconcile, then capture/refresh screenshots — not the reverse. On a
> current binary the reconcile records evidence for you
> (`improve-record-test-evidence-on-reconcile`); the old manual sequence
> double-refreshed (reconcile, then a second redundant refresh). Don't
> re-introduce the double-refresh.

> GOTCHA — **deleted-screenshot recovery.** If screenshots were pruned
> (retention, a clean checkout, a sibling's reconcile), recapture them
> rather than reverting the deletion — the capture is the source of
> truth, the file on disk is derived.

### 6b. Presentability pass — treat the branch as open-source

Placed *after* screenshots are refreshed (step 6) so the gallery embeds the
final PNGs, and *before* the finalize (step 7) so the suite validates the
cleanup. For a branch built entirely via Fast Commit the per-cycle finalize
bodies rendered fast (no polish), so this is where this repo finally polishes
before merge.

```bash
# Read-only: surface stale docs + non-essential debug logging. Never deletes.
codeyam-editor editor presentability-scan

# Refresh the README how-to + scenario-screenshot gallery (idempotent).
codeyam-editor editor readme-sync
```

Then **assertively** remove the clearly-dead docs and debug log lines the scan
surfaces — but **ask the user about anything uncertain** before deleting it.
The scan only ever *lists* candidates; the judgment (and the deletion) is
yours. The step-7 finalize re-runs the suite, so a debug line a test asserted
on fails there: revert that one removal and re-run.

> This step is the same sequence the embedded `finalize.txt` body prescribes
> for every project; the playbook just sequences it into this repo's
> deferred-drain flow. A client project with no playbook is still covered —
> `session-finalize` emits a self-contained presentability advisory naming
> these same two commands.

### 7. Commit → finalize → push (the merge-ready gate)

This is the one expensive loop; run it *once*, cleanly.

```bash
# Stop fast-intent so finalize stamps the real marker, not a deferred one.
codeyam-editor editor fast-commit-stop

# Integrate any sibling commits by MERGING (never rebasing) — see rule 0.
codeyam-editor editor pre-commit-sync          # claims the commit queue; --recover if it bails

# The full, whole-repo finalize. ~7 min. Stamps lastFullFinalizeSha.
codeyam-editor editor session-finalize 2>&1 | tee /tmp/codeyam-finalize.log
```

> GOTCHA — **the marker-stamp trap.** A `session-finalize` that *skips*
> the comprehensive Phase 2 can leave `lastFullFinalizeSha` unstamped
> even though it exited 0 — and then the merge-readiness gate
> (`verify-full-finalize`) still fails. On a current binary this is fixed
> (`fix-finalize-skip-phase-2-leaves-marker-unstamped`). Always confirm
> the marker actually advanced:
>
> ```bash
> codeyam-editor editor verify-full-finalize   # exit 0 == HEAD is covered
> ```
>
> If it exits 1 after a "successful" finalize, you hit the trap — re-run
> finalize forcing the comprehensive pass, don't merge on the green exit
> code alone.

> GOTCHA — **redirection matters when teeing.** Use `2>&1 | tee` to
> capture *both* streams; `2> file` alone drops stdout and `> file 2>&1`
> ordering can interleave wrong. The finalize prints its terminal status
> as a JSON line carrying `CODEYAM_CMD_COMPLETE` on both success and
> failure — wait on that token, read `status`, don't regex English.

> GOTCHA — **disk-space / infra crashes.** A finalize can die on a full
> disk or an OOM, not a code problem. If it crashes non-deterministically,
> check `df -h` and free space before assuming the branch is broken.

Only after `verify-full-finalize` exits 0 is the branch **merge-ready**.
**Stop here and report unless the user explicitly authorized the push**
(safe default 3). When authorized:

```bash
codeyam-editor editor push                     # the wrapper runs the deferred-finalize gate
```

For a fleet branch this push is routine — no `--allow-deferred --reason`
ceremony, because finalize cleared the deferral. If the pre-push gate
still complains of deferred commits, do **not** override with
`--allow-deferred`; it means finalize didn't cover the range — go back to
the marker-stamp trap above.

### 8. PR → CI → mergeability

With the branch pushed and merge-ready:

- Open or update the PR (`gh pr create` / `gh pr view`), **only on
  explicit user confirmation** (safe default 3).
- Track CI. Any red check is handled by step 8a below — there is no
  shortcut around it.
- Drive to `gh pr view --json mergeable` → `MERGEABLE` /
  `mergeStateStatus: CLEAN`. A `CONFLICTING` state means origin moved
  again — merge it in (never rebase) and re-run the finalize gate.
- Merging the PR is the final outward action — confirm with the user.

### 8a. Red CI is not done — investigate before you classify

**A red test is a red test. `verify-full-finalize` exiting 0 locally is
necessary but NEVER sufficient — local green does not clear red CI.** When
any CI check is red, root-cause it at the source *before* any
"known/flaky/infra/environmental" label is even considered. This gate
exists because a prior finalize reflexively classified four red checks as
"known infra / Windows flakes," cited a queued plan and a flakes memory,
and asked the user to stop-and-defer — when on real investigation **all
four were deterministic, reproducible-on-CI bugs**. The dismissal only
didn't ship cross-platform bugs because the user pushed back.

**The contract — investigate-then-classify, never classify-then-defer:**

For **every** red check, in this order:

1. **Pull the actual failing-job log.** Do not reason from the check name.
   ```bash
   gh pr checks <pr>                       # list checks + buckets
   gh run view --job <job-id> --log-failed # the specific failure
   ```
2. **Extract the specific assertion or build error** — the failing test
   name, the exact `assertion failed: ...` / compile error / panic, the
   line. Write it down.
3. **Only now classify**, against the flake bar below. A classification
   with no log evidence behind it is forbidden.

**FORBIDDEN:** presenting a stop / defer question whose justification is an
un-investigated "known infra" or "known flake" label. A queued plan or a
flakes memory is **not** evidence that *this* red check is that issue —
confirm the failure signature matches first.

**Default toward fixing, not stopping.** Red CI after a push is *inside*
the finalize's job, not an outward action — the autonomous default is
"root-cause and fix." Surface to the user only a genuine fork (e.g.
approach A vs B with real ripple), as a real decision, never as a defer.

**The flake bar — "flake" requires proof of non-determinism.** A check may
be labeled a flake ONLY when one of these holds:

- it **passed on a re-run with no code change**, OR
- it **exactly matches a documented flake by test name AND the failure
  signature matches**.

A check that fails on two consecutive runs with the same signature is **by
definition not a flake — it is a real bug. Fix it.** The `Windows CI
timing flakes` memory is the *only* sanctioned auto-rerun set; it is the
exception, not the rule, and it covers **only** timing races — it does
**not** cover build failures or assertion mismatches. Build/compile errors
and assertion mismatches are never flakes.

**Cross-platform pre-flight checklist.** Local green ≠ CI green (see the
`macos finalize green ≠ CI green` memory). Before declaring local-green
sufficient — and as the first hypotheses when reading a red log — check
these failure modes this fleet has actually hit:

- **GTK-less / headless-Linux workspace build** — a desktop crate (Tauri)
  can break `cargo build --workspace` in a GTK-less CI container though it
  builds fine on a dev laptop.
- **Windows connect-timeout vs. connection-refused** — a probe that
  asserts "refused" can get a *timeout* on Windows; the misclassification
  is a real bug, not infra.
- **Write-before-read socket reset** — a test's fake server that writes
  before draining the request can reset the connection on some platforms.
- **Phase-named error messages** — an assertion expecting a phase name in
  an error string fails where the message omits it; this is deterministic
  across Linux/Windows, not a flake.

---

## Cross-platform pitfalls

A green local finalize on **one** OS does not prove the branch is CI-green
when it carries platform-specific surface. `session-finalize` now scans the
covered range and, when it finds such surface, prints a **cross-platform
advisory** at the end of a green run: local-green ≠ CI-green, budget a
platform-fix round, and run the cheap local repros (`editor cross-check`,
`session-finalize --linux`). The advisory is informational — it never fails
the finalize. The categories it flags, and the concrete footguns behind each
(all observed in real CI-fix rounds):

- **`cfg`-conditional code** (`cfg(target_os …)`, `cfg(all(unix …))`,
  `cfg(windows)`). The other platform's branch never compiled on your host, so
  a `-D dead_code`/type error there fires only in CI. `editor cross-check`
  re-evaluates every `cfg` for a cross-target triple locally, in seconds.
- **The `desktop/` Tauri member.** It links GTK on Linux, so a change can
  break a headless `cargo build --workspace` in a GTK-less container even
  though it is clean on a GUI laptop. The cloud image must also *copy* the
  `desktop/` dir even when the build excludes it, or the image build breaks on
  a missing directory.
- **CI / container build files** (`.github/workflows/*.yml`, `Dockerfile*`).
  The build invocation itself changed; local build success says nothing about
  the CI or image build. `.github/workflows/cicd.yml` (`test-rust`,
  `cloud-image-smoke`) is the authority on which invocations CI actually runs.
- **Networking error classification** (`is_connect`, `is_timeout`,
  `is_down_server_error`, refused-vs-reset). Socket semantics diverge by OS: a
  connection to an unbound localhost port is *refused* (RST) on Unix but
  *times out* on Windows, and an HTTP response written without reading the
  request gets an RST on Windows. A classifier or assertion verified on macOS
  can misbehave on Windows/Linux.
- **Phase/error assertions bound to a platform-dependent message.** An
  assertion that matches the exact text of an OS-specific error (or assumes a
  particular error path fires) passes on the host that produces that text and
  fails elsewhere. Make errors name their phase explicitly rather than
  asserting on incidental wording.

See `[[macos-finalize-green-not-ci-green]]` for the originating regression.

---

## Reflect & self-improve (the last step every run)

After the branch reaches merge-ready (or the run stops at a judgment
call), run a **bounded, honest** reflection. The skill gets better every
time it runs — but it must never silently rewrite its own agent-config.

Enumerate the friction this run actually hit: every workaround you had to
invent, every GOTCHA that bit, every step whose guidance was stale or
missing, every CLI whose real behavior differed from this playbook.

Then route each genuinely-new, non-obvious lesson through one of two
channels — never a silent self-edit:

1. **Durable lesson → persistent memory** (ungated, auto-recalled).
   Write a memory file under the persistent `memory/` dir: one fact per
   file, check for an existing file to update rather than duplicate, add
   the one-line `MEMORY.md` pointer, and skip anything already captured by
   the repo, CLAUDE.md, this playbook, or an existing memory. Future runs
   recall these as background context with no prompt change.
2. **Structural gap → a proposed plan/diff the user approves.** When the
   lesson is bigger than a memory — this playbook is wrong, a step is
   missing, an instruction should change — draft a `.codeyam/plans/` plan
   (or a concrete diff) against **this file** (`docs/fleet-finalize-playbook.md`)
   and surface it for approval, exactly as `/review-session` produces
   editor-improvement plans. Because this playbook is a normal source file
   (not agent-config), the change flows through the standard editor
   workflow; the skill never edits its own `SKILL.md` unseen.

If the run was clean, say **"nothing new learned"** and write nothing.
Do not manufacture busywork edits.

---

## See also

- `/codeyam-audit` — the one-shot, report-and-stop finalize check. Runs
  `session-finalize` exactly once, reports deferred-commit attribution,
  and stops without applying fixes or looping. Reach for it for a quick
  "is this branch clean?" check; reach for `/codeyam-finalize` to *drive*
  a branch to merge-ready.
- `docs/fast-commit.md` — the deferred-tail mechanics this playbook
  finalizes.
- `docs/finalize-deferral.md` — `verify-no-deferred-finalize`, the
  deferred trailer, and the emergency-override audit trail.
