import { describe, it, expect } from 'vitest';
import scanScopeOptions from './scanScopeOptions';
import {
  SCOPE_OPEN_TABS,
  SCOPE_ALL_GROUPED,
  SCOPE_HISTORY,
  LABEL_PREFIX,
  HISTORY_LIMIT,
} from './pageContentTargets';

const LABELS = {
  Reading: { title: 'Reading', position: 1 },
  Work: { title: 'Work', position: 0 },
  Shopping: { title: 'Shopping', position: 2 },
};

describe('scanScopeOptions', () => {
  // Open tabs leads because it is the cheapest and most private scope — those
  // pages are already loaded, so scanning them fetches nothing.
  it('puts Open tabs first and Recent history last', () => {
    const options = scanScopeOptions(LABELS);
    expect(options[0].value).toBe(SCOPE_OPEN_TABS);
    expect(options[1].value).toBe(SCOPE_ALL_GROUPED);
    expect(options[options.length - 1].value).toBe(SCOPE_HISTORY);
  });

  // one entry per group, between the two fixed scopes and the history scope
  it('inserts one option per group, ordered by stored position', () => {
    const groups = scanScopeOptions(LABELS).filter((o) => o.value.startsWith(LABEL_PREFIX));
    expect(groups.map((o) => o.value)).toEqual([
      `${LABEL_PREFIX}Work`,
      `${LABEL_PREFIX}Reading`,
      `${LABEL_PREFIX}Shopping`,
    ]);
    expect(groups[0].label).toBe('Group: Work');
  });

  // the history label names its own cap, so the cost is legible before the pick
  it('names the history cap in the history option label', () => {
    const history = scanScopeOptions(LABELS).find((o) => o.value === SCOPE_HISTORY);
    expect(history.label).toContain(String(HISTORY_LIMIT));
  });

  // a fresh install has no groups; the two fixed scopes still stand
  it('returns only the fixed scopes when there are no groups', () => {
    expect(scanScopeOptions({}).map((o) => o.value))
      .toEqual([SCOPE_OPEN_TABS, SCOPE_ALL_GROUPED, SCOPE_HISTORY]);
    expect(scanScopeOptions(undefined)).toHaveLength(3);
  });

  // a malformed stored label must not become a blank, unpickable option
  it('drops label entries with no title', () => {
    const options = scanScopeOptions({ Broken: { position: 0 }, Work: { title: 'Work', position: 1 } });
    expect(options.filter((o) => o.value.startsWith(LABEL_PREFIX))).toHaveLength(1);
  });

  // groups saved before positions existed must still all appear
  it('keeps groups that carry no position', () => {
    const options = scanScopeOptions({ A: { title: 'A' }, B: { title: 'B' } });
    expect(options.filter((o) => o.value.startsWith(LABEL_PREFIX))).toHaveLength(2);
  });
});
