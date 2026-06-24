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

const noop = () => {};

const ISOLATION_PROPS = {
  Url: {
    urlKey: 'url-https://news.ycombinator.com',
    showLoad: true,
    showActions: true,
    expanded: false,
  },
  SearchResults: {
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
  LoadUrl: {
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
  UrlField: {
    label: 'Title',
    name: 'title',
    value: 'Hacker News',
    onChange: noop,
    placeholder: 'Enter a title',
  },
  LabelCollection: {
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
  LabelForm: {
    label: { title: 'Work', backgroundColor: '#1873E4' },
    onCancel: noop,
  },
  LabelFormContainer: {
    expand: true,
  },
  UrlLabel: {
    title: 'Work',
    onRemove: noop,
  },
};

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
  const isolate = new URLSearchParams(window.location.search).get('isolate');
  if (!isolate) {
    return <App />;
  }

  const Component = components[isolate];
  if (!Component) {
    return (
      <div id="codeyam-capture" style={{ padding: 16, fontFamily: 'system-ui' }}>
        No such component &quot;{isolate}&quot; — check src/__codeyam_components.js.
      </div>
    );
  }

  const props = ISOLATION_PROPS[isolate] || {};

  return (
    <div id="codeyam-capture">
      <IsolationErrorBoundary name={isolate}>
        <DragDropContext onDragEnd={noop}>
          <Component {...props} />
        </DragDropContext>
      </IsolationErrorBoundary>
    </div>
  );
}
