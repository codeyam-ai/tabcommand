---
title: "Fix undeclared tabId in associateProcess so per-tab process stats record"
mode: backend
createdAt: "2026-10-23T13:20:57Z"
source: proposed-plan
---

## Summary

`associateProcess` in `service_worker.js` iterates with `for (tabId of tabIds)`, assigning to an undeclared `tabId`. The worker ships as an ES module (crxjs sets `"type": "module"`), which is strict mode, so this throws `ReferenceError: tabId is not defined` as soon as a process has a tab task. `processProcesses` then rejects before `update(updates)`, so neither per-tab process stats nor `processTotals` are persisted from the processes path. The test harness evaluates the worker in a sloppy-mode `new Function`, which hides the bug.

## Key Decisions

- Declare the loop variable: `for (const tabId of tabIds)`.
- Add a regression test that runs `associateProcess` under strict semantics, for example by adding `'use strict'` to the harness wrapper or by extracting `associateProcess` into `src/lib/worker/` like the url-tracking split, so the test sees what production sees.

## Implementation

1. Change the loop header in `associateProcess` in `service_worker.js`.
2. Make the `service_worker.test.js` harness strict, or move `associateProcess` and `updateTotals` into a worker module with injected `getTab` / `tabUpdates`, and test it there.
3. Confirm `associateProcess › fetches each task tab and merges its url updates` fails under strict mode before the fix and passes after.