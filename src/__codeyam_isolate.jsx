import React from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { App } from './lib/pages';
import { components } from './__codeyam_components';

// CodeYam component-isolation entrypoint for this router-less stack.
//
// With `?isolate=<Name>` in the URL it renders just that component — looked up
// in the manifest (`./__codeyam_components`) and wrapped in #codeyam-capture so
// the screenshot pipeline frames it. With no `?isolate=` param it renders the
// normal <App /> (the full-page app), so mounting this in place of <App /> in
// index.jsx is a no-op for ordinary use and for the packaged extension.
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

const ISOLATION_PROPS = {
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
    },
  },
  SearchResults: {
    default: {
      labels: [{ id: 'Work', color: '#1873E4', labelTitle: 'Work' }],
      urls: [
        {
          id: 'url-https://news.ycombinator.com',
          url: 'https://news.ycombinator.com',
          title: 'Hacker News',
          favicon: '',
          notes: 'Tech news and discussion threads',
          match: { title: ['title'] },
          terms: ['hacker'],
        },
        {
          id: 'url-https://react.dev/learn',
          url: 'https://react.dev/learn',
          title: 'Quick Start – React',
          favicon: '',
          notes: '',
          match: { title: ['title'] },
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
            title: 'Hacker News',
            favicon: '',
            notes: 'Tech news and discussion threads',
            match: { title: ['news'] },
            terms: ['news'],
          },
          {
            id: 'url-https://react.dev/learn',
            url: 'https://react.dev/learn',
            title: 'Quick Start – React',
            favicon: '',
            notes: 'Official React tutorial and docs',
            match: { notes: ['React'] },
            terms: ['react'],
          },
          {
            id: 'url-https://developer.mozilla.org/en-US/docs/Web/API',
            url: 'https://developer.mozilla.org/en-US/docs/Web/API',
            title: 'Web APIs | MDN',
            favicon: '',
            notes: '',
            match: { title: ['API'] },
            terms: ['api'],
          },
          {
            id: 'url-https://www.notion.so/codeyam/Roadmap',
            url: 'https://www.notion.so/codeyam/Roadmap',
            title: 'Roadmap – Notion',
            favicon: '',
            notes: 'Quarterly planning doc',
            match: { title: ['Roadmap'] },
            terms: ['roadmap'],
          },
          {
            id: 'url-https://github.com/codeyam/tabcommand',
            url: 'https://github.com/codeyam/tabcommand',
            title: 'codeyam/tabcommand — GitHub',
            favicon: '',
            notes: '',
            match: { title: ['tabcommand'] },
            terms: ['tab'],
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
  LabelCollection: {
    default: {
      index: 0,
      draggable: false,
      title: 'Work',
      urlKeys: [
        'url-https://github.com/codeyam/tabcommand',
        'url-https://www.figma.com/file/tabcommand',
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
  if (!isolate) {
    return <App />;
  }
  const variant = params.get('variant');

  const Component = components[isolate];
  if (!Component) {
    return (
      <div id="codeyam-capture" style={{ padding: 16, fontFamily: 'system-ui' }}>
        No such component &quot;{isolate}&quot; — check src/__codeyam_components.js.
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
        background: '#fff',
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
