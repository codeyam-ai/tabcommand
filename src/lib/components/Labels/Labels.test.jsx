import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DragDropContext } from '@hello-pangea/dnd';
import { installChromeShim } from '../../utils/chromeShim';
import Labels from './Labels';

const seed = (key, value) => window.localStorage.setItem(key, JSON.stringify(value));

const renderLabels = () =>
  render(
    <DragDropContext onDragEnd={() => {}}>
      <Labels />
    </DragDropContext>
  );

describe('Labels', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  // every label in the map renders as a group card
  it('renders a group for each label', async () => {
    seed('labels', {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: [] },
      Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: [] }
    });
    installChromeShim();
    renderLabels();

    expect(await screen.findByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  // the uxSettings-selected label is pinned in the selected section, not the grid
  it('pins the selected label above the grid', async () => {
    seed('labels', {
      Work: { title: 'Work', backgroundColor: '#1873E4', position: 0, urlKeys: [] },
      Reading: { title: 'Reading', backgroundColor: '#1F8E43', position: 1, urlKeys: [] }
    });
    seed('uxSettings', { selectedLabel: 'Work' });
    installChromeShim();
    const { container } = renderLabels();

    await screen.findByText('Reading');

    const selected = container.querySelector('.LabelCollections-selected');
    expect(selected).toBeTruthy();
    expect(selected).toHaveTextContent('Work');
    // Work is pinned, so it is filtered out of the chunked grid rows
    const rows = container.querySelector('.LabelCollections-row');
    expect(rows).not.toHaveTextContent('Work');
  });

  // with no labels the empty-state guidance and the Add Group CTA are shown
  it('shows the empty-state CTA when there are no labels', async () => {
    installChromeShim();
    renderLabels();

    expect(await screen.findByText(/Click the "Add Group" icon above/i)).toBeInTheDocument();
    expect(screen.getByText('Add Group')).toBeInTheDocument();
  });
});
