import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import LoadProcesses from './LoadProcesses';

// LoadProcesses subscribes to the live chrome.processes.onUpdatedWithMemory API,
// which has no in-app shim equivalent. These tests stand up a minimal chrome
// stub that captures the listener so the test can emit process data directly.
describe('LoadProcesses', () => {
  let emit;

  beforeEach(() => {
    let handler = null;
    emit = (processes) => { if (handler) handler(processes); };
    globalThis.chrome = {
      processes: {
        onUpdatedWithMemory: {
          addListener: (fn) => { handler = fn; },
          removeListener: () => { handler = null; },
        },
      },
    };
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  // empty by design until the chrome.processes API reports data (preview state)
  it('renders no process rows until the API emits', () => {
    const { container } = render(<LoadProcesses />);
    expect(container.querySelector('.Load-raw').children.length).toBe(0);
  });

  // a reported process renders its task title and CPU readout
  it('renders a row per process when the API emits', () => {
    render(<LoadProcesses />);
    act(() => {
      emit({
        '101': {
          tasks: [{ title: 'Inbox - Gmail', tabId: 206 }],
          cpu: 48,
          privateMemory: 1073741824,
          jsMemoryUsed: 1,
          jsMemoryAllocated: 1,
        },
      });
    });
    expect(screen.getByText('Inbox - Gmail')).toBeInTheDocument();
    expect(screen.getByText('48%')).toBeInTheDocument();
  });

  // memory is shown in human-readable megabytes
  it('formats private memory in megabytes', () => {
    render(<LoadProcesses />);
    act(() => {
      emit({
        '202': {
          tasks: [{ title: 'Figma', tabId: 202 }],
          cpu: 10,
          privateMemory: 1073741824,
          jsMemoryUsed: 1,
          jsMemoryAllocated: 1,
        },
      });
    });
    // 1073741824 bytes / 1024 / 1024 = 1024 MiB -> "1,024M"
    expect(screen.getByText('1,024M')).toBeInTheDocument();
  });

  // the listener detaches cleanly on unmount
  it('removes its listener on unmount without throwing', () => {
    const { unmount } = render(<LoadProcesses />);
    expect(() => unmount()).not.toThrow();
  });
});
