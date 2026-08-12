import React from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { App } from '/src/lib/pages';
import { components } from 'codeyam:components';

// CodeYam component-isolation entrypoint for this router-less stack.
//
// This harness lives under `.codeyam/harness/` (committed source, not a
// generated cache) and is exposed to the app entry as the `codeyam:isolate`
// virtual module by `codeyam/vite-plugin-codeyam.mjs`, so `src/` carries no
// `__codeyam_*` file. Because it is served from outside `src/`, it imports the
// app root with a root-relative specifier (`/src/lib/pages`) — Vite resolves
// that from the project root regardless of where the module physically lives,
// the same trick the `codeyam:components` manifest uses.
//
// With `?isolate=<Name>` in the URL it renders just that component — looked up
// in the manifest (the `codeyam:components` virtual module, backed by
// `.codeyam/generated/`) and wrapped in #codeyam-capture so the screenshot
// pipeline frames it. With no `?isolate=` param it renders the normal <App />
// (the full-page app), so mounting this in place of <App /> in index.jsx is a
// no-op for ordinary use and for the packaged extension.
//
// The in-app chrome shim is installed in index.jsx before this renders, so an
// isolated component reads the same localStorage-backed seed storage the full
// app does — per-scenario state comes from the seed adapter, not props.
//
// Two render aids let the leaf components mount in isolation the same way the
// full app mounts them:
//   • DragDropContext — several components use @hello-pangea/dnd `Droppable`/
//     `Draggable`, which need a drag-context ancestor (the App provides one).
//     A no-op onDragEnd is harmless for components that don't drag.
//   • ISOLATION_PROPS — prop-driven leaf components (the App passes them props;
//     they don't read storage). The manifest renders propless, so we supply a
//     representative prop set here, mirroring the shapes the App passes.
//
// Each component maps to `{ default, variants }`. The `default` prop set backs
// the bare `/?isolate=<Name>` URL (so existing single scenarios are unchanged);
// `/?isolate=<Name>&variant=<key>` selects an alternate prop set from `variants`
// so one component can be exercised across many states from cheap scenario JSON
// — empty, overflowing, alternate severities — without editing source per shot.
// `resolveIsolationProps` does the lookup and falls back to `default` for an
// unknown or absent variant.

const noop = () => {};

// Fixed reference "now" (and one day in ms) for the prop-driven Favorites
// components below, so their visit timestamps — and the decay score, relative
// last-visited, and usage sparkline those drive — render a stable, recent-looking
// snapshot in isolation instead of drifting with wall-clock time.
const FAV_NOW = 1782486000000;
const D = 86400000;

const ISOLATION_PROPS = {
  // The banner shown when the user's groups are NOT reaching chrome.storage.sync.
  // Both states are worth pinning because their COPY differs by remedy: an
  // over-quota set needs the user to export and prune, while an unavailable sync
  // area needs them to sign in. The component renders null for a healthy or
  // absent status, so there is deliberately no third variant here — that state is
  // covered visually by the Import / Export page scenarios, where the absence of
  // the banner is the observable thing.
  SyncWarning: {
    default: {
      status: { status: 'too-large', key: 'labels', bytes: 9147, at: 1786545000000 },
    },
    variants: {
      'sync-failed': {
        status: {
          status: 'sync-failed',
          key: 'labels',
          message: 'Please sign in to Chrome to use chrome.storage.sync',
          at: 1786545000000,
        },
      },
      // The Home placement. Supplying onOpenBackup switches the copy to point AT
      // the Import / Export page instead of saying "below" — where, on Home,
      // there is no snapshot — and adds the button to get there; onDismiss adds
      // the close affordance a banner needs when it sits above the user's groups
      // rather than on a page they chose to open.
      'on-home': {
        status: {
          status: 'sync-failed',
          key: 'labels',
          message: 'Please sign in to Chrome to use chrome.storage.sync',
          at: 1786545000000,
        },
        onOpenBackup: noop,
        onDismiss: noop,
      },
    },
  },

  // The mono field every snapshot is read from or pasted into. Read-only is the
  // common case; the Import box is the one that is not, and the two look
  // identical on purpose so the page reads as one surface.
  SnapshotBox: {
    default: {
      value: '[{"title":"Work","backgroundColor":"#1873E4","position":0,"urls":[{"url":"https://github.com/codeyam/tabcommand","title":"codeyam/tabcommand — GitHub","favicon":""}]}]',
      readOnly: true,
    },
    variants: {
      // What the user actually stares at before pasting anything.
      empty: { value: '', readOnly: false, onChange: noop, onKeyDown: noop },
    },
  },

  // A snapshot paired with its own Copy button. Copying is the recovery the sync
  // warnings send people to, so the confirmed state is worth pinning as well as
  // the resting one — but `copied` is internal, so only the resting state can be
  // seeded from props; the flipped state is covered by the interaction scenario.
  SnapshotField: {
    default: {
      value: '[{"title":"Reading","backgroundColor":"#8B5CF6","position":1,"urls":[{"url":"https://news.ycombinator.com","title":"Hacker News","favicon":""}]}]',
    },
  },

  // What happened to the snapshot the user just pasted. Both tones are worth
  // pinning because they are the whole point of the change: a failure that used
  // to go to a console nobody sees, and a repair that used to happen silently.
  ImportMessage: {
    default: {
      tone: 'error',
      children:
        'That snapshot could not be read: Expected property name or \'}\' in JSON at position 2 (line 1 column 3).',
    },
    variants: {
      repaired: {
        tone: 'notice',
        children:
          'Restored 2 groups. The snapshot was repaired before importing — it had line breaks inside titles.',
      },
      salvaged: {
        tone: 'notice',
        children:
          'Recovered 3 groups. 2 groups were too damaged to read and could not be restored.',
      },
    },
  },

  // The Import half of the recover/backup page. The resting state is the one a
  // user meets first; the error and repaired variants show where the message
  // lands — BETWEEN the box and the button, next to the text it refers to.
  ImportPanel: {
    default: {
      value: '',
      onChange: noop,
      onImport: noop,
      error: null,
      notice: null,
    },
    variants: {
      'unreadable-snapshot': {
        value: '{ my backup, but mangled ',
        onChange: noop,
        onImport: noop,
        error:
          'That snapshot could not be read: Expected property name or \'}\' in JSON at position 2 (line 1 column 3).',
        notice: null,
      },
      'repaired-snapshot': {
        value: '[{"title":"Work","urls":[{"url":"https://github.com/codeyam/tabcommand","title":"codeyam/tabcommand\n- GitHub","favicon":""}]}]',
        onChange: noop,
        onImport: noop,
        error: null,
        notice:
          'Restored 2 groups. The snapshot was repaired before importing — it had line breaks inside titles.',
      },
    },
  },

  // The backup half. The Previous stack is what makes the page a recovery tool
  // rather than a backup button, so the populated state is the default and the
  // no-history state is the variant.
  ExportPanel: {
    default: {
      current: '[{"title":"Work","backgroundColor":"#1873E4","position":0,"urls":[{"url":"https://github.com/codeyam/tabcommand","title":"codeyam/tabcommand — GitHub","favicon":""}]}]',
      previous: [
        '[{"title":"Work","backgroundColor":"#1873E4","position":0,"urls":[{"url":"https://github.com/codeyam/tabcommand","title":"codeyam/tabcommand — GitHub","favicon":""}]},{"title":"Reading","backgroundColor":"#8B5CF6","position":1,"urls":[{"url":"https://news.ycombinator.com","title":"Hacker News","favicon":""}]}]',
        '[{"title":"Work","backgroundColor":"#1873E4","position":0,"urls":[]}]',
      ],
    },
    variants: {
      // A fresh install has a current snapshot but nothing to fall back to.
      'no-history': {
        current: '[{"title":"Work","backgroundColor":"#1873E4","position":0,"urls":[]}]',
        previous: [],
      },
    },
  },
  // The sidebar wordmark introduced by the visual redesign: the 4-color mark plus
  // the Tab/Command text wordmark. Single visual state; click is a no-op here.
  AppBrand: {
    default: {
      onClick: noop,
    },
  },
  // The favicon-with-monogram-fallback. Default shows a real favicon; the
  // monogram variants show the deterministic colored tile that stands in when a
  // site has no favicon — the new fallback this redesign introduced.
  Favicon: {
    default: {
      favicon: 'https://www.google.com/s2/favicons?domain=github.com&sz=64',
      urlKey: 'url-https://github.com',
      title: 'GitHub',
    },
    variants: {
      monogram: {
        favicon: '',
        urlKey: 'url-https://news.ycombinator.com',
        title: 'Hacker News',
      },
      'monogram-figma': {
        favicon: '',
        urlKey: 'url-https://www.figma.com',
        title: 'Figma',
      },
    },
  },
  // The sidebar light/dark toggle. Light shows the moon glyph (click → dark);
  // dark shows the sun glyph (click → light).
  ThemeToggle: {
    default: {
      theme: 'light',
      onToggle: noop,
    },
    variants: {
      dark: {
        theme: 'dark',
        onToggle: noop,
      },
    },
  },
  Url: {
    default: {
      urlKey: 'url-https://news.ycombinator.com',
      showLoad: true,
      showActions: true,
      expanded: false,
    },
    variants: {
      // Same seeded url-* storage as the default; only the display props change.
      expanded: {
        urlKey: 'url-https://news.ycombinator.com',
        showLoad: true,
        showActions: true,
        expanded: true,
      },
      minimal: {
        urlKey: 'url-https://news.ycombinator.com',
        showLoad: false,
        showActions: false,
        expanded: false,
      },
      // A different seeded url whose stored `processes` has no samples, so the
      // Url renders without its load indicator — the resting tab row.
      idle: {
        urlKey: 'url-https://react.dev/learn',
        showLoad: true,
        showActions: true,
        expanded: false,
      },
      // The clone that follows the cursor while a tab is dragged: a solid chip
      // with the trailing ✕ / actions / load bar suppressed.
      dragging: {
        urlKey: 'url-https://news.ycombinator.com',
        showLoad: true,
        showActions: true,
        expanded: false,
        dragging: true,
      },
    },
  },
  SearchResults: {
    // Grouped URL hits carry `urlLabelTitle` + `urlLabelColor` (stamped onto
    // each document by buildUrlDocuments); SearchResults splits them into one
    // sub-section per group. The default spans two groups so the flagship view
    // shows the grouped headers directly.
    default: {
      labels: [{ id: 'Work', color: '#1873E4', labelTitle: 'Work' }],
      urls: [
        {
          id: 'url-https://news.ycombinator.com',
          url: 'https://news.ycombinator.com',
          urlTitle: 'Hacker News',
          urlLabelTitle: 'Work',
          urlLabelColor: '#1873E4',
          favicon: '',
          notes: 'Tech news and discussion threads',
          match: { urlTitle: ['title'] },
          terms: ['hacker'],
        },
        {
          id: 'url-https://react.dev/learn',
          url: 'https://react.dev/learn',
          urlTitle: 'Quick Start – React',
          urlLabelTitle: 'Reading',
          urlLabelColor: '#1F8E43',
          favicon: '',
          notes: '',
          match: { urlTitle: ['title'] },
          terms: ['react'],
        },
      ],
    },
    variants: {
      empty: { labels: [], urls: [] },
      'labels-only': {
        labels: [
          { id: 'Work', color: '#1873E4', labelTitle: 'Work' },
          { id: 'Reading', color: '#1F8E43', labelTitle: 'Reading' },
          { id: 'Shopping', color: '#E47415', labelTitle: 'Shopping' },
        ],
        urls: [],
      },
      many: {
        labels: [{ id: 'Work', color: '#1873E4', labelTitle: 'Work' }],
        urls: [
          {
            id: 'url-https://news.ycombinator.com',
            url: 'https://news.ycombinator.com',
            urlTitle: 'Hacker News',
            urlLabelTitle: 'Work',
            urlLabelColor: '#1873E4',
            favicon: '',
            notes: 'Tech news and discussion threads',
            match: { urlTitle: ['news'] },
            terms: ['news'],
          },
          {
            id: 'url-https://www.notion.so/codeyam/Roadmap',
            url: 'https://www.notion.so/codeyam/Roadmap',
            urlTitle: 'Roadmap – Notion',
            urlLabelTitle: 'Work',
            urlLabelColor: '#1873E4',
            favicon: '',
            notes: 'Quarterly planning doc',
            match: { urlTitle: ['Roadmap'] },
            terms: ['roadmap'],
          },
          {
            id: 'url-https://react.dev/learn',
            url: 'https://react.dev/learn',
            urlTitle: 'Quick Start – React',
            urlLabelTitle: 'Reading',
            urlLabelColor: '#1F8E43',
            favicon: '',
            notes: 'Official React tutorial and docs',
            match: { notes: ['React'] },
            terms: ['react'],
          },
          {
            id: 'url-https://developer.mozilla.org/en-US/docs/Web/API',
            url: 'https://developer.mozilla.org/en-US/docs/Web/API',
            urlTitle: 'Web APIs | MDN',
            urlLabelTitle: 'Reading',
            urlLabelColor: '#1F8E43',
            favicon: '',
            notes: '',
            match: { urlTitle: ['API'] },
            terms: ['api'],
          },
          {
            id: 'url-https://github.com/codeyam/tabcommand',
            url: 'https://github.com/codeyam/tabcommand',
            urlTitle: 'codeyam/tabcommand — GitHub',
            urlLabelTitle: 'Shopping',
            urlLabelColor: '#E47415',
            favicon: '',
            notes: '',
            match: { urlTitle: ['tabcommand'] },
            terms: ['tab'],
          },
        ],
      },
      // Grouped results spanning multiple groups — each rendered under its own
      // colored header, in first-appearance order (Work, then Reading).
      'grouped-multi': {
        labels: [],
        urls: [
          {
            id: 'url-https://news.ycombinator.com',
            url: 'https://news.ycombinator.com',
            urlTitle: 'Hacker News',
            urlLabelTitle: 'Work',
            urlLabelColor: '#1873E4',
            favicon: '',
            notes: 'Tech news and discussion threads',
            match: { urlTitle: ['news'] },
            terms: ['news'],
          },
          {
            id: 'url-https://www.notion.so/codeyam/Roadmap',
            url: 'https://www.notion.so/codeyam/Roadmap',
            urlTitle: 'Roadmap – Notion',
            urlLabelTitle: 'Work',
            urlLabelColor: '#1873E4',
            favicon: '',
            notes: '',
            match: { urlTitle: ['Roadmap'] },
            terms: ['roadmap'],
          },
          {
            id: 'url-https://react.dev/learn',
            url: 'https://react.dev/learn',
            urlTitle: 'Quick Start – React',
            urlLabelTitle: 'Reading',
            urlLabelColor: '#1F8E43',
            favicon: '',
            notes: 'Official React tutorial and docs',
            match: { urlTitle: ['react'] },
            terms: ['react'],
          },
        ],
      },
      // A single group — every grouped hit belongs to one label, so exactly one
      // colored header is rendered.
      'grouped-single': {
        labels: [],
        urls: [
          {
            id: 'url-https://news.ycombinator.com',
            url: 'https://news.ycombinator.com',
            urlTitle: 'Hacker News',
            urlLabelTitle: 'Work',
            urlLabelColor: '#1873E4',
            favicon: '',
            notes: 'Tech news and discussion threads',
            match: { urlTitle: ['news'] },
            terms: ['news'],
          },
          {
            id: 'url-https://www.notion.so/codeyam/Roadmap',
            url: 'https://www.notion.so/codeyam/Roadmap',
            urlTitle: 'Roadmap – Notion',
            urlLabelTitle: 'Work',
            urlLabelColor: '#1873E4',
            favicon: '',
            notes: '',
            match: { urlTitle: ['Roadmap'] },
            terms: ['roadmap'],
          },
        ],
      },
      // No grouped hits — the grouped area is hidden and only the Archived URLs
      // section renders, unchanged by this feature.
      'archived-only': {
        labels: [],
        urls: [],
        archived: [
          {
            id: 'url-https://news.ycombinator.com',
            url: 'https://news.ycombinator.com',
            urlTitle: 'Hacker News',
            favicon: '',
            notes: 'Show HN thread on searching your archived tabs',
            match: { archived: ['notes'] },
            terms: ['archived'],
          },
          {
            id: 'url-https://stackoverflow.com/questions/78912345/chrome-storage-local-quota',
            url: 'https://stackoverflow.com/questions/78912345/chrome-storage-local-quota',
            urlTitle: 'chrome.storage.local quota exceeded - Stack Overflow',
            favicon: '',
            notes: '',
            match: { storage: ['urlTitle'] },
            terms: ['storage'],
          },
        ],
      },
      // Groups + Archived together: grouped sub-sections (spanning two groups)
      // followed by the unchanged Archived URLs section, including a highlighted
      // notes match.
      mixed: {
        labels: [{ id: 'Work', color: '#1873E4', labelTitle: 'Work' }],
        urls: [
          {
            id: 'url-https://react.dev/learn',
            url: 'https://react.dev/learn',
            urlTitle: 'Quick Start – React',
            urlLabelTitle: 'Reading',
            urlLabelColor: '#1F8E43',
            favicon: '',
            notes: '',
            match: { react: ['urlTitle'] },
            terms: ['react'],
          },
          {
            id: 'url-https://github.com/codeyam/tabcommand',
            url: 'https://github.com/codeyam/tabcommand',
            urlTitle: 'codeyam/tabcommand — GitHub',
            urlLabelTitle: 'Work',
            urlLabelColor: '#1873E4',
            favicon: '',
            notes: '',
            match: { tabcommand: ['urlTitle'] },
            terms: ['tab'],
          },
        ],
        archived: [
          {
            id: 'url-https://news.ycombinator.com',
            url: 'https://news.ycombinator.com',
            urlTitle: 'Hacker News',
            favicon: '',
            notes: 'Show HN thread on searching your archived tabs',
            match: { archived: ['notes'] },
            terms: ['archived'],
          },
          {
            id: 'url-https://stackoverflow.com/questions/78912345/chrome-storage-local-quota',
            url: 'https://stackoverflow.com/questions/78912345/chrome-storage-local-quota',
            urlTitle: 'chrome.storage.local quota exceeded - Stack Overflow',
            favicon: '',
            notes: '',
            match: { storage: ['urlTitle'] },
            terms: ['storage'],
          },
        ],
      },
    },
  },
  LoadUrl: {
    default: {
      url: {
        urlKey: 'url-https://news.ycombinator.com',
        url: 'https://news.ycombinator.com',
        title: 'Hacker News',
        favicon: '',
        processes: {
          samples: 10,
          network: 153600,
          cpu: 26000,
          privateMemory: 1596000000,
          jsMemoryAllocated: 1276800000,
          jsMemoryUsed: 957600000,
        },
      },
    },
    variants: {
      low: {
        url: {
          urlKey: 'url-https://react.dev/learn',
          url: 'https://react.dev/learn',
          title: 'Quick Start – React',
          favicon: '',
          processes: {
            samples: 10,
            network: 20480,
            cpu: 3000,
            privateMemory: 280000000,
            jsMemoryAllocated: 224000000,
            jsMemoryUsed: 168000000,
          },
        },
      },
      // Severity tiers above the default's "medium": these drive the
      // high/excessive branches of summarizeProcessLoad so the colored bar is
      // exercised across the full level range (low → medium → high → excessive).
      high: {
        url: {
          urlKey: 'url-https://mail.google.com/mail/u/0',
          url: 'https://mail.google.com/mail/u/0',
          title: 'Inbox (1,284) - Gmail',
          favicon: '',
          processes: {
            samples: 10,
            network: 737280,
            cpu: 42000,
            privateMemory: 3192000000,
            jsMemoryAllocated: 2553600000,
            jsMemoryUsed: 1915200000,
          },
        },
      },
      excessive: {
        url: {
          urlKey: 'url-https://www.figma.com/file/tabcommand',
          url: 'https://www.figma.com/file/tabcommand',
          title: 'TabCommand UI – Figma',
          favicon: '',
          processes: {
            samples: 10,
            network: 1048576,
            cpu: 61000,
            privateMemory: 5320000000,
            jsMemoryAllocated: 4256000000,
            jsMemoryUsed: 3192000000,
          },
        },
      },
      // No samples → summarizeProcessLoad returns null, so the load bar is
      // omitted entirely: the title-only resting state of the card.
      idle: {
        url: {
          urlKey: 'url-https://www.notion.so/codeyam/Roadmap',
          url: 'https://www.notion.so/codeyam/Roadmap',
          title: 'Roadmap – Notion',
          favicon: '',
          processes: { samples: 0 },
        },
      },
    },
  },
  UrlField: {
    default: {
      label: 'Title',
      name: 'title',
      value: 'Hacker News',
      onChange: noop,
      placeholder: 'Enter a title',
    },
    variants: {
      empty: {
        label: 'Title',
        name: 'title',
        value: '',
        onChange: noop,
        placeholder: 'Enter a title',
      },
      'long-title': {
        label: 'Title',
        name: 'title',
        value:
          'A very long bookmark title that keeps scrolling well past the visible width of the field',
        onChange: noop,
        placeholder: 'Enter a title',
      },
      notes: {
        label: 'Notes',
        name: 'notes',
        value: 'Tech news and discussion threads worth checking daily.',
        onChange: noop,
        placeholder: 'Add notes',
        multiline: true,
      },
    },
  },
  // The sidebar's Droppable/Draggable subtree. It lives at module scope (not
  // inside Tabs' body) precisely so its type is stable across renders — a fresh
  // type remounts this tree, and remounting it mid-drag cancels the drag. These
  // scenarios pin what it renders so that regression is visible in isolation.
  DraggableTabUrls: {
    default: {
      name: 'Work',
      urls: [
        { urlKey: 'url-https://github.com/codeyam/tabcommand', tabKey: 'tab-201' },
        { urlKey: 'url-https://www.figma.com/file/tabcommand', tabKey: 'tab-202' },
      ],
    },
    variants: {
      // A `name` containing 'ungrouped' turns on the drag-hint affordance that
      // nudges the user to drag the row into a group.
      ungrouped: {
        name: 'ungrouped',
        urls: [
          { urlKey: 'url-https://github.com/codeyam/tabcommand', tabKey: 'tab-201' },
        ],
      },
      // Auto-closed rows carry no live tab: they show the close control instead
      // of the load bar.
      'auto-closed': {
        name: 'autoclosed-Work',
        autoClosed: true,
        urls: [{ urlKey: 'url-https://linear.app/codeyam/tabcommand' }],
      },
    },
  },
  LabelCollection: {
    default: {
      index: 0,
      draggable: false,
      title: 'Work',
      // Three open tabs (seeded into `activeTabs` by the work-group scenario)
      // plus one saved-only tab, so the card exercises both the OPEN section and
      // the plain saved section, with enough open rows to cover the many-active
      // case rather than just a pair.
      urlKeys: [
        'url-https://github.com/codeyam/tabcommand',
        'url-https://www.figma.com/file/tabcommand',
        'url-https://linear.app/codeyam/tabcommand',
        'url-https://www.notion.so/codeyam/tabcommand-spec',
      ],
      backgroundColor: '#1873E4',
      expanded: true,
    },
    variants: {
      // No urlKeys → renders the "Drag tabs…" empty state, so it needs no
      // seeded url-* storage (the nested Url cards that would read storage
      // are never mounted).
      empty: {
        index: 0,
        draggable: false,
        title: 'Inbox',
        urlKeys: [],
        backgroundColor: '#707071',
        expanded: true,
      },
      // The bug, before the fix: ONE App Store Connect page was filed into the
      // CodeYam group, but every time that tab navigated deeper into the site the
      // grouping sync appended the live URL as another permanent member. The rows
      // share a title, so the card's ambiguous-title path shows the disambiguating
      // URL subtitle — which is what makes the duplication legible at all.
      'phantom-members': {
        index: 0,
        draggable: false,
        title: 'CodeYam',
        urlKeys: [
          'url-https://appstoreconnect.apple.com/apps',
          'url-https://appstoreconnect.apple.com/apps/123/distribution',
          'url-https://appstoreconnect.apple.com/apps/123/testflight',
          'url-https://appstoreconnect.apple.com/apps/123/appstore/versions',
        ],
        backgroundColor: '#1873E4',
        expanded: true,
      },
      // The same group after the guard: the tab may wander anywhere inside the
      // site, and the group still holds exactly the one page the user filed.
      'guarded-single-member': {
        index: 0,
        draggable: false,
        title: 'CodeYam',
        urlKeys: ['url-https://appstoreconnect.apple.com/apps'],
        backgroundColor: '#1873E4',
        expanded: true,
      },
      // The counter-case to phantom-members, and the reason the append guard is
      // keyed per-tab on an exact urlKey rather than per-host: a group may
      // legitimately hold several pages of ONE site, each filed deliberately.
      // These rows look like the phantom ones — same host, same title, same
      // disambiguating URL subtitles — so nothing about their appearance could
      // tell them apart. Collapsing by title or host would silently delete real
      // members, which is why the guard suppresses only the tab whose OWN
      // recorded slot moved.
      'deliberate-same-site-members': {
        index: 0,
        draggable: false,
        title: 'CodeYam',
        urlKeys: [
          'url-https://appstoreconnect.apple.com/apps',
          'url-https://appstoreconnect.apple.com/apps/123/testflight',
        ],
        backgroundColor: '#1873E4',
        expanded: true,
      },
      // Overflow: the phantom bug left to run. Every navigation of the one filed
      // tab appended another member, so the card fills past the height it has to
      // render in and the list runs out of room. This is the boundary the 4-row
      // phantom-members case only hints at — and the reason the fix stops the
      // append at the source rather than trimming the display.
      'overflowing-members': {
        index: 0,
        draggable: false,
        title: 'CodeYam',
        urlKeys: [
          'url-https://appstoreconnect.apple.com/apps',
          'url-https://appstoreconnect.apple.com/apps/123/distribution',
          'url-https://appstoreconnect.apple.com/apps/123/testflight',
          'url-https://appstoreconnect.apple.com/apps/123/appstore/versions',
          'url-https://appstoreconnect.apple.com/apps/123/appstore/info',
          'url-https://appstoreconnect.apple.com/apps/123/pricing',
          'url-https://appstoreconnect.apple.com/apps/123/reviews',
          'url-https://appstoreconnect.apple.com/apps/123/analytics',
          'url-https://appstoreconnect.apple.com/apps/123/activity',
        ],
        backgroundColor: '#1873E4',
        expanded: true,
      },
    },
  },
  LabelSectionHeader: {
    // Typical case: the "Open" section header over a handful of open tabs.
    default: {
      label: 'Open',
      count: 2,
    },
    variants: {
      // Boundary: a single open tab — the count reads "1".
      single: {
        label: 'Open',
        count: 1,
      },
      // Boundary: a large group with many open tabs (two-digit count).
      many: {
        label: 'Open',
        count: 12,
      },
    },
  },
  LabelForm: {
    default: {
      label: { title: 'Work', backgroundColor: '#1873E4' },
      onCancel: noop,
    },
    variants: {
      // No `label` → the new-group form: empty name, no preselected color.
      'new-blank': {
        onCancel: noop,
      },
      reading: {
        label: { title: 'Reading', backgroundColor: '#1F8E43' },
        onCancel: noop,
      },
      shopping: {
        label: { title: 'Shopping', backgroundColor: '#E47415' },
        onCancel: noop,
      },
      social: {
        label: { title: 'Social', backgroundColor: '#D01882' },
        onCancel: noop,
      },
      // A `label` with a blank title: still edit mode, so the submit button
      // reads "Save". Pins that the button label is driven by the mode, not
      // by whether the input currently has text.
      'edit-empty-title': {
        label: { title: '', backgroundColor: '#1873E4' },
        onCancel: noop,
      },
      // The only fixture whose color IS in `Colors` — every other one uses a
      // hand-picked hex. Pins the checked-preset half of the color UI: a check
      // on the matching swatch and the custom row sitting unselected.
      'edit-preset': {
        label: { title: 'Design', backgroundColor: '#2f7de1' },
        onCancel: noop,
      },
    },
  },
  // The labeled custom-color row from the group form. `isCustom` drives the
  // selected styling, so the two states worth pinning are a non-preset color
  // active (selected) versus a preset or auto-derived color (unselected).
  LabelFormCustomColor: {
    default: {
      previewColor: '#1873E4',
      color: '#1873E4',
      isCustom: true,
      onSelect: noop,
    },
    variants: {
      // A preset color is active, so the custom row is not the selection —
      // neutral border, dot mirroring the chosen preset.
      preset: {
        previewColor: '#2f7de1',
        color: '#2f7de1',
        isCustom: false,
        onSelect: noop,
      },
      // Create mode before any pick: no `color` at all, so the dot shows the
      // length-derived fallback hue the parent computes.
      derived: {
        previewColor: '#1e9e57',
        isCustom: false,
        onSelect: noop,
      },
    },
  },
  LabelFormContainer: {
    default: {
      expand: true,
    },
    variants: {
      collapsed: { expand: false },
    },
  },
  // A group card's ⋮ menu. In the app it is portalled to document.body and
  // positioned in viewport coordinates; in isolation we hand it a small inset so
  // the fixed-position panel sits clear of the frame edge instead of hugging 0,0.
  // The `bottom-row-flipped` variant is the case the portal fix exists for: a card
  // low in the grid whose menu flips ABOVE its button rather than running off the
  // bottom of the viewport.
  LabelCollectionMenu: {
    default: {
      title: 'Work',
      backgroundColor: '#1873E4',
      coords: { top: 24, left: 24 },
      onCancel: noop,
      onDelete: noop,
    },
    variants: {
      'bottom-row-flipped': {
        title: 'Social',
        backgroundColor: '#D01882',
        coords: { top: 320, left: 380 },
        onCancel: noop,
        onDelete: noop,
      },
      // Edge data: a title far wider than the 205px menu, so the name field's
      // overflow behaviour is visible rather than assumed.
      'long-title': {
        title: 'Quarterly Planning and Roadmap Review',
        backgroundColor: '#1F8E43',
        coords: { top: 24, left: 24 },
        onCancel: noop,
        onDelete: noop,
      },
    },
  },
  // The action list at the foot of the group menu. Share is disabled pending the
  // feature; Delete is live.
  LabelCollectionMenuActions: {
    default: {
      onDelete: noop,
    },
  },
  UrlLabel: {
    default: {
      title: 'Work',
      onRemove: noop,
    },
    variants: {
      long: { title: 'Personal Reading List', onRemove: noop },
      reading: { title: 'Reading', onRemove: noop },
    },
  },
  // The local Lucide-style icon set. Default shows the search glyph; variants
  // exercise a few representative glyphs (the icon is chosen by the `name` prop).
  Icon: {
    default: {
      name: 'search',
      size: 28,
    },
    variants: {
      pin: { name: 'pin', size: 28 },
      history: { name: 'history', size: 28 },
      settings: { name: 'settings', size: 28 },
    },
  },
  // One History list row. Default is a grouped tab with a close timestamp;
  // variants show the no-favicon monogram fallback and a row with no timestamp.
  HistoryRow: {
    default: {
      row: {
        urlKey: 'url-https://news.ycombinator.com',
        title: 'Hacker News',
        favicon: 'https://www.google.com/s2/favicons?domain=news.ycombinator.com&sz=64',
        color: '#1e9e57',
        ts: 1782486000000,
      },
      onReopen: noop,
    },
    variants: {
      monogram: {
        row: {
          urlKey: 'url-https://www.figma.com',
          title: 'TabCommand UI – Figma',
          favicon: '',
          color: '#2f7de1',
          ts: 1782400000000,
        },
        onReopen: noop,
      },
      'no-time': {
        row: {
          urlKey: 'url-https://overreacted.io',
          title: 'overreacted — A blog by Dan Abramov',
          favicon: '',
          color: '#7c3aed',
          ts: null,
        },
        onReopen: noop,
      },
      // Supplying onDelete opts the row into the delete affordance — the ✕
      // beside Reopen that arms the inline confirm. Without it the row renders
      // exactly as the default does, which is what keeps every pre-existing
      // render site unchanged.
      deletable: {
        row: {
          urlKey: 'url-https://github.com/codeyam/tabcommand',
          title: 'codeyam/tabcommand — GitHub',
          favicon: 'https://www.google.com/s2/favicons?domain=github.com&sz=64',
          color: '#2f7de1',
          ts: 1782486000000,
        },
        onReopen: noop,
        onDelete: noop,
      },
    },
  },
  // The trailing action pair of a History row. Default is the resting state —
  // Reopen plus the ✕ that arms a delete; the variants show the armed
  // destructive confirm and the read-only row that was never given an onDelete.
  HistoryRowActions: {
    default: {
      confirming: false,
      onReopen: noop,
      onStartConfirm: noop,
      onConfirmDelete: noop,
      onCancel: noop,
      deleteLabel: 'Delete codeyam/tabcommand — GitHub from history',
    },
    variants: {
      // The second click is pending: Reopen and ✕ give way to a red Delete and
      // a Cancel, so the destructive step is deliberate and always escapable.
      confirming: {
        confirming: true,
        onReopen: noop,
        onStartConfirm: noop,
        onConfirmDelete: noop,
        onCancel: noop,
        deleteLabel: 'Delete codeyam/tabcommand — GitHub from history',
      },
      // No onStartConfirm — the delete affordance disappears entirely rather
      // than rendering a dead control.
      'reopen-only': {
        confirming: false,
        onReopen: noop,
        onStartConfirm: null,
        onConfirmDelete: noop,
        onCancel: noop,
      },
    },
  },
  // A day group on the History page: the bucket eyebrow plus its rows. Rows
  // arrive pre-sorted newest-first from useHistoryRows, so the default set
  // demonstrates that order. The `visited-not-closed` variant is the bug this
  // feature fixed — pages visited today that the sweep never auto-closed, which
  // used to have no timestamp at all and fell into "Earlier this week".
  HistorySection: {
    default: {
      bucket: 'Today',
      rows: [
        {
          urlKey: 'url-https://github.com/codeyam/tabcommand',
          title: 'codeyam/tabcommand — GitHub',
          favicon: 'https://www.google.com/s2/favicons?domain=github.com&sz=64',
          color: '#1873E4',
          ts: FAV_NOW,
        },
        {
          urlKey: 'url-https://www.notion.so/codeyam/Roadmap',
          title: 'Roadmap – Notion',
          favicon: '',
          color: '#1873E4',
          ts: FAV_NOW - 3600000,
        },
        {
          urlKey: 'url-https://overreacted.io',
          title: 'overreacted — A blog by Dan Abramov',
          favicon: '',
          color: '#1F8E43',
          ts: FAV_NOW - 4 * 3600000,
        },
      ],
      onReopen: noop,
    },
    variants: {
      // The reported bug, fixed: every row here was visited today but never
      // auto-closed, so each is dated from its url record instead of reading
      // as undated and sinking into "Earlier this week".
      'visited-not-closed': {
        bucket: 'Today',
        rows: [
          {
            urlKey: 'url-https://laughfactory.com',
            title: 'Laugh Factory',
            favicon: '',
            color: '#D01882',
            ts: FAV_NOW - 1800000,
          },
          {
            urlKey: 'url-https://www.etsy.com/favorites',
            title: 'Favorites – Etsy',
            favicon: '',
            color: '#E47415',
            ts: FAV_NOW - 5 * 3600000,
          },
        ],
        onReopen: noop,
      },
      // An older bucket whose rows carry no timestamp at all — legacy records
      // with no visits, no lastVisit and no autoClosed entry. The honest
      // fallback: they still appear, just undated.
      undated: {
        bucket: 'Earlier this week',
        rows: [
          {
            urlKey: 'url-https://news.ycombinator.com',
            title: 'Hacker News',
            favicon: '',
            color: '#7c3aed',
            ts: null,
          },
        ],
        onReopen: noop,
      },
    },
  },
  // The shared page chrome — back link, title, intro — hoisted out of History
  // and ViewAllFavorites, which each rendered this trio inline.
  PageHeader: {
    default: {
      title: 'History',
      intro: 'Nothing is ever lost — every tab you have closed or visited lives here.',
      onBack: noop,
    },
    variants: {
      favorites: {
        title: 'Favorites',
        intro: 'Ranked by how often and how recently you visit — recent visits count more.',
        onBack: noop,
      },
      // Some pages want the heading with no supporting line.
      'no-intro': {
        title: 'History',
        onBack: noop,
      },
    },
  },
  // The muted "nothing here yet" line a page shows in place of its list.
  EmptyState: {
    default: {
      message: 'No history yet.',
    },
    variants: {
      favorites: {
        message:
          'No favorites yet — the sites you return to will show up here as you browse.',
      },
    },
  },
  // The sidebar load-triage card. The load STATE (comfortable / running-hot)
  // comes from each scenario's seeded `processTotals` + `settings`; these props
  // drive only the shared review-mode toggle.
  Triage: {
    default: {
      reviewMode: false,
      onToggleReview: noop,
    },
    variants: {
      review: { reviewMode: true, onToggleReview: noop },
    },
  },
  // The sidebar settings popover. Propless — it reads/writes the `settings`
  // storage key; each scenario seeds that key to show a slider position.
  Settings: {
    default: {},
  },
  // The shared segmented button-group used inside the Settings popover. Default
  // is the full-width Theme control (Day / Night / System) with System active;
  // variants show a different active position and the inline numeric Group-
  // columns picker (the non-full shape with a different option count).
  SettingsSegment: {
    default: {
      ariaLabel: 'Theme',
      full: true,
      value: 'system',
      onChange: noop,
      options: [
        { value: 'light', label: 'Day' },
        { value: 'dark', label: 'Night' },
        { value: 'system', label: 'System' },
      ],
    },
    variants: {
      // Theme control with the first option (Day) active instead of System.
      'day-active': {
        ariaLabel: 'Theme',
        full: true,
        value: 'light',
        onChange: noop,
        options: [
          { value: 'light', label: 'Day' },
          { value: 'dark', label: 'Night' },
          { value: 'system', label: 'System' },
        ],
      },
      // The inline (non-full) Group-columns picker: numeric labels, 3 options.
      columns: {
        ariaLabel: 'Group columns',
        full: false,
        value: 3,
        onChange: noop,
        options: [
          { value: 2, label: 2 },
          { value: 3, label: 3 },
          { value: 4, label: 4 },
        ],
      },
    },
  },
  // One favorite row on the Favorites "View All" page: favicon + title, a stats
  // strip (visits-in-window, last-visited, decay score), and a usage sparkline.
  FavoriteRow: {
    // A healthy favorite: real favicon, many recent visits, high decayed score.
    default: {
      now: FAV_NOW,
      favorite: {
        urlKey: 'url-https://github.com/codeyam/tabcommand',
        url: 'https://github.com/codeyam/tabcommand',
        title: 'codeyam/tabcommand — GitHub',
        favicon:
          'https://www.google.com/s2/favicons?domain=github.com&sz=64',
        isOpen: false,
        isHidden: false,
        score: 6.2,
        visitCount: 16,
        lastVisit: FAV_NOW - Math.round(0.2 * D),
        // Varied per-day counts (2 today, 3 two days ago, …) so the daily bars
        // differ in height, and visits spread across ~7 weeks so the weekly view
        // is populated and varies too.
        recentVisits: [
          FAV_NOW - 47 * D,
          FAV_NOW - 40 * D,
          FAV_NOW - 33 * D,
          FAV_NOW - 25 * D,
          FAV_NOW - 22 * D,
          FAV_NOW - 15 * D,
          FAV_NOW - 12 * D,
          FAV_NOW - 9 * D,
          FAV_NOW - 6 * D,
          FAV_NOW - 4 * D,
          FAV_NOW - 2 * D,
          FAV_NOW - 2 * D,
          FAV_NOW - 2 * D,
          FAV_NOW - 1 * D,
          FAV_NOW - Math.round(0.5 * D),
          FAV_NOW - Math.round(0.2 * D),
        ],
      },
      onOpen: noop,
      onBringBack: noop,
    },
    variants: {
      // Currently open in a non-pinned tab → the accent "already open" tint.
      open: {
        now: FAV_NOW,
        favorite: {
          urlKey: 'url-https://news.ycombinator.com',
          url: 'https://news.ycombinator.com',
          title: 'Hacker News',
          favicon:
            'https://www.google.com/s2/favicons?domain=news.ycombinator.com&sz=64',
          isOpen: true,
          isHidden: false,
          score: 4.13,
          visitCount: 5,
          lastVisit: FAV_NOW - Math.round(0.2 * D),
          recentVisits: [
            FAV_NOW - 5 * D,
            FAV_NOW - 3 * D,
            FAV_NOW - 2 * D,
            FAV_NOW - 1 * D,
            FAV_NOW - Math.round(0.2 * D),
          ],
        },
        onOpen: noop,
        onBringBack: noop,
      },
      // A removed favorite → dimmed row with a "Bring back" action.
      hidden: {
        now: FAV_NOW,
        favorite: {
          urlKey: 'url-https://www.etsy.com/favorites',
          url: 'https://www.etsy.com/favorites',
          title: 'Favorites — Etsy',
          favicon:
            'https://www.google.com/s2/favicons?domain=etsy.com&sz=64',
          isOpen: false,
          isHidden: true,
          score: 2.4,
          visitCount: 3,
          lastVisit: FAV_NOW - 1 * D,
          recentVisits: [FAV_NOW - 4 * D, FAV_NOW - 2 * D, FAV_NOW - 1 * D],
        },
        onOpen: noop,
        onBringBack: noop,
      },
      // Edge: no favicon (monogram fallback) + a long title, a lower-but-
      // qualifying score, and a single-visit "1 visit" pluralization case.
      monogram: {
        now: FAV_NOW,
        favorite: {
          urlKey: 'url-https://overreacted.io/a-complete-guide-to-useeffect',
          url: 'https://overreacted.io/a-complete-guide-to-useeffect',
          title:
            'A Complete Guide to useEffect — overreacted, a very long article title that overflows the row',
          favicon: '',
          isOpen: false,
          isHidden: false,
          score: 0.74,
          visitCount: 1,
          lastVisit: FAV_NOW - 3 * D,
          recentVisits: [FAV_NOW - 3 * D],
        },
        onOpen: noop,
        onBringBack: noop,
      },
    },
  },
  // The "Reset favorites tracking" control on the Favorites View All page. The
  // default state is the single quiet utility button; the confirm state (the
  // destructive "Yes, reset everything" / "Cancel" pair) is internal component
  // state revealed by clicking the button, so the confirming scenario drives
  // that click at capture time rather than being prop-selectable. onReset is a
  // no-op here.
  FavoritesResetControl: {
    default: {
      onReset: noop,
    },
  },
  // The two inline usage-over-time bar charts on a FavoriteRow: last 7 days and
  // last 7 weeks, side by side.
  UsageSparkline: {
    // Varied daily counts and visits spread across ~7 weeks → both charts show a
    // mix of bar heights rather than a flat row of maxed-out bars.
    default: {
      now: FAV_NOW,
      visits: [
        FAV_NOW - 47 * D,
        FAV_NOW - 40 * D,
        FAV_NOW - 33 * D,
        FAV_NOW - 25 * D,
        FAV_NOW - 22 * D,
        FAV_NOW - 15 * D,
        FAV_NOW - 12 * D,
        FAV_NOW - 9 * D,
        FAV_NOW - 6 * D,
        FAV_NOW - 4 * D,
        FAV_NOW - 2 * D,
        FAV_NOW - 2 * D,
        FAV_NOW - 2 * D,
        FAV_NOW - 1 * D,
        FAV_NOW - Math.round(0.5 * D),
        FAV_NOW - Math.round(0.2 * D),
      ],
    },
    variants: {
      // Heavy, clustered recent usage → tall daily bars and a spiking weekly view.
      dense: {
        now: FAV_NOW,
        visits: [
          FAV_NOW - 20 * D,
          FAV_NOW - 13 * D,
          FAV_NOW - 12 * D,
          FAV_NOW - 6 * D,
          FAV_NOW - 5 * D,
          FAV_NOW - 4 * D,
          FAV_NOW - 3 * D,
          FAV_NOW - 3 * D,
          FAV_NOW - 2 * D,
          FAV_NOW - 2 * D,
          FAV_NOW - 2 * D,
          FAV_NOW - 1 * D,
          FAV_NOW - 1 * D,
          FAV_NOW - Math.round(0.3 * D),
        ],
      },
      // A few sparse visits → one or two short bars, the rest empty.
      sparse: {
        now: FAV_NOW,
        visits: [FAV_NOW - 2 * D, FAV_NOW - 30 * D],
      },
    },
  },
};

// Resolve the prop set for an isolated component. `variant` picks an alternate
// state from `variants`; an absent or unknown variant falls back to `default`.
// Entries with no `default`/`variants` shape are treated as the prop set itself.
function resolveIsolationProps(name, variant) {
  const entry = ISOLATION_PROPS[name];
  if (!entry) return {};
  if (entry.variants && variant && entry.variants[variant]) {
    return entry.variants[variant];
  }
  return entry.default || entry;
}

class IsolationErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui', color: '#b00020' }}>
          Isolation render error in &quot;{this.props.name}&quot;:{' '}
          {String(this.state.error.message || this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CodeyamIsolate() {
  const params = new URLSearchParams(window.location.search);
  const isolate = params.get('isolate');
  const variant = params.get('variant');
  const theme = params.get('theme');

  // When a scenario requests an explicit theme (`?theme=light|dark`), mirror it
  // to the document's `data-theme` attribute so the CSS token layer themes the
  // isolated component exactly as the full app does. The App's useTheme owns
  // this normally, but an isolated leaf never mounts useTheme, so without this
  // an isolated component always renders the default (dark) tokens. An absent
  // or unrecognized param leaves the attribute untouched — existing scenarios
  // are unchanged.
  React.useEffect(() => {
    if (theme !== 'light' && theme !== 'dark') return undefined;
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    root.setAttribute('data-theme', theme);
    return () => {
      if (prev === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', prev);
    };
  }, [theme]);

  if (!isolate) {
    return <App />;
  }

  const Component = components[isolate];
  if (!Component) {
    return (
      <div id="codeyam-capture" style={{ padding: 16, fontFamily: 'system-ui' }}>
        No such component &quot;{isolate}&quot; — register it with `codeyam-editor editor isolate {isolate}`.
      </div>
    );
  }

  const props = resolveIsolationProps(isolate, variant);

  // The editor captures the full viewport (it does NOT crop to #codeyam-capture),
  // so a leaf component left at its natural position renders in a corner of an
  // otherwise-blank frame. Center it in the viewport instead, so each component
  // scenario reads as a deliberate, centered shot.
  return (
    <div
      id="codeyam-capture"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
        // Match the active theme's surface when one is requested, so a themed
        // capture reads as a real app surface; default to white otherwise.
        background:
          theme === 'light' || theme === 'dark' ? 'var(--app-bg)' : '#fff',
      }}
    >
      <IsolationErrorBoundary name={isolate}>
        <DragDropContext onDragEnd={noop}>
          <Component {...props} />
        </DragDropContext>
      </IsolationErrorBoundary>
    </div>
  );
}
