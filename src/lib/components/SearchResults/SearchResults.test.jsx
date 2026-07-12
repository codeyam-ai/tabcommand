import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim } from '../../utils/chromeShim';
import KeyDown from '../../utils/KeyDown';
import SearchResults from './SearchResults';

const labelHit = { id: 'label-Reading', labelTitle: 'Reading', color: '#1F8E43' };

const urlHit = (over = {}) => ({
  id: 'url-https://react.dev/learn',
  urlTitle: 'Quick Start React',
  url: 'https://react.dev/learn',
  favicon: '',
  notes: '',
  match: { quick: ['urlTitle'] },
  terms: ['quick'],
  ...over,
});

describe('SearchResults', () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete globalThis.chrome;
    KeyDown.functions.length = 0;
    document.onkeydown = null;
  });

  afterEach(() => {
    window.localStorage.clear();
    KeyDown.functions.length = 0;
  });

  // with no labels and no urls the overlay shows a No Results state
  it('renders No Results when there are no matches', () => {
    render(<SearchResults labels={[]} urls={[]} />);
    expect(screen.getByText('No Results')).toBeInTheDocument();
  });

  // label hits render under the Groups section
  it('renders label hits under Groups', () => {
    render(<SearchResults labels={[labelHit]} urls={[]} />);
    expect(screen.getByText('Groups')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
  });

  // url hits render under the Grouped URLs section with their title
  it('renders url hits under Grouped URLs', () => {
    render(<SearchResults labels={[]} urls={[urlHit()]} />);
    expect(screen.getByText('Grouped URLs')).toBeInTheDocument();
    expect(screen.getByText('Quick Start React')).toBeInTheDocument();
  });

  // a match landing in notes renders the highlighted snippet
  it('renders a highlighted notes snippet when the match is in notes', () => {
    const url = urlHit({ notes: 'remember to read about hooks', match: { read: ['notes'] }, terms: ['read'] });
    const { container } = render(<SearchResults labels={[]} urls={[url]} />);
    const notes = container.querySelector('.SearchResults-result-notes');
    expect(notes).toBeTruthy();
    expect(notes.querySelector('span')).toHaveTextContent('read');
  });

  // archived (unlabeled) hits render under their own Archived URLs section, reusing the url row
  it('renders archived hits under Archived URLs', () => {
    const archivedHit = urlHit({ id: 'url-https://news.ycombinator.com', urlTitle: 'Hacker News', url: 'https://news.ycombinator.com' });
    render(<SearchResults labels={[]} urls={[]} archived={[archivedHit]} />);
    expect(screen.getByText('Archived URLs')).toBeInTheDocument();
    expect(screen.getByText('Hacker News')).toBeInTheDocument();
  });

  // with no archived hits the section is absent — the old "coming soon" affordance is gone
  it('omits the Archived URLs section when there are no archived hits', () => {
    render(<SearchResults labels={[labelHit]} urls={[urlHit()]} archived={[]} />);
    expect(screen.queryByText('Archived URLs')).toBeNull();
  });

  // keyboard navigation folds archived rows into the flat activation list
  it('reaches an archived row with successive ArrowDown presses', () => {
    const archivedHit = urlHit({ id: 'url-https://news.ycombinator.com', urlTitle: 'Hacker News', url: 'https://news.ycombinator.com' });
    const { container } = render(<SearchResults labels={[labelHit]} urls={[urlHit()]} archived={[archivedHit]} />);
    fireEvent.keyDown(document, { key: 'ArrowDown' }); // Groups -> Grouped URL
    fireEvent.keyDown(document, { key: 'ArrowDown' }); // Grouped URL -> Archived URL
    const selected = container.querySelector('.SearchResults-result-selected');
    expect(selected).toHaveTextContent('Hacker News');
  });

  // an empty Grouped URLs section must not leak a stray 0 (the && length bug)
  it('does not render a stray 0 when there are labels but no urls', () => {
    const { container } = render(<SearchResults labels={[labelHit]} urls={[]} />);
    expect(screen.queryByText('0')).toBeNull();
    expect(container.querySelector('#SearchResults').textContent).not.toMatch(/(^|\s)0(\s|$)/);
  });

  // the mirror case: an empty Groups section must not leak a stray 0 either
  it('does not render a stray 0 when there are urls but no labels', () => {
    const { container } = render(<SearchResults labels={[]} urls={[urlHit()]} />);
    expect(screen.queryByText('0')).toBeNull();
    expect(container.querySelector('#SearchResults').textContent).not.toMatch(/(^|\s)0(\s|$)/);
  });

  // ArrowDown moves the selection from the first item to the next
  it('moves the selection down on ArrowDown', () => {
    const { container } = render(<SearchResults labels={[labelHit]} urls={[urlHit()]} />);
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    const selected = container.querySelector('.SearchResults-result-selected');
    expect(selected).toHaveTextContent('Quick Start React');
  });

  // Enter on the selected label activates it: selects the label and routes Home
  it('activates a label on Enter', async () => {
    window.localStorage.setItem('uxSettings', JSON.stringify({}));
    installChromeShim();
    render(<SearchResults labels={[labelHit]} urls={[]} />);

    fireEvent.keyDown(document, { key: 'Enter' });
    await new Promise((r) => setTimeout(r, 0));

    const ux = JSON.parse(window.localStorage.getItem('uxSettings'));
    expect(ux.selectedLabel).toBe('Reading');
    expect(ux.page).toEqual({ name: 'Home' });
  });

  // the edit pencil routes to the URL detail page for that url
  it('navigates to the URL page from the edit affordance', async () => {
    window.localStorage.setItem('uxSettings', JSON.stringify({}));
    installChromeShim();
    const { container } = render(<SearchResults labels={[]} urls={[urlHit()]} />);

    fireEvent.click(container.querySelector('.SearchResults-result-url-edit'));
    await new Promise((r) => setTimeout(r, 0));

    const ux = JSON.parse(window.localStorage.getItem('uxSettings'));
    expect(ux.page).toEqual({ name: 'Url', urlKey: 'url-https://react.dev/learn' });
  });
});
