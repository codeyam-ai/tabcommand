import './LoadProcesses.css';

import React, { useEffect, useState } from 'react';

import humanReadableNumber from '../../utils/humanReadableNumber';

// The Load page's raw per-process panel: one card per OS process showing its
// task titles plus CPU and private-memory readouts with inline bars. The data
// comes from chrome.processes.onUpdatedWithMemory — the live API in a packaged
// extension; in the codeyam preview the chrome shim emits any seeded `processes`
// snapshot so the panel can be demonstrated. With no data the panel is empty
// (and collapses via the `:empty` rule), so it never reserves a blank column.
const LoadProcesses = () => {
  const [processes, setProcesses] = useState({});

  useEffect(() => {
    const handleProcesses = (processes) => {
      const tempTabIdMap = {};
      Object.values(processes).forEach(
        (process) => {
          const taskCount = process.tasks.length;

          for (const task of process.tasks) {
            if (task.tabId) {
              if (!tempTabIdMap[task.tabId]) {
                tempTabIdMap[task.tabId] = {
                  processCount: 0,
                  taskCount: taskCount,
                  jsMemoryAllocated: 0,
                  jsMemoryUsed: 0,
                  privateMemory: 0,
                  cpu: 0,
                  full: {
                    jsMemoryAllocated: 0,
                    jsMemoryUsed: 0,
                    privateMemory: 0,
                    cpu: 0
                  }
                };
              }
              tempTabIdMap[task.tabId].processCount += 1;

              tempTabIdMap[task.tabId].full.jsMemoryAllocated += process.jsMemoryAllocated;
              tempTabIdMap[task.tabId].jsMemoryAllocated += (process.jsMemoryAllocated / taskCount);

              tempTabIdMap[task.tabId].full.jsMemoryUsed += process.jsMemoryUsed;
              tempTabIdMap[task.tabId].jsMemoryUsed += (process.jsMemoryUsed / taskCount);

              tempTabIdMap[task.tabId].full.privateMemory += process.privateMemory;
              tempTabIdMap[task.tabId].privateMemory += (process.privateMemory / taskCount);

              tempTabIdMap[task.tabId].full.cpu += process.cpu;
              tempTabIdMap[task.tabId].cpu += (process.cpu / taskCount);
            }
          }
        }
      );

      setProcesses(processes);
    };

    try {
      chrome.processes.onUpdatedWithMemory.addListener(handleProcesses);
    } catch (e) {
      console.log("Unable to listen to processes", e)
    }

    return () => {
      try {
        chrome.processes.onUpdatedWithMemory.removeListener(handleProcesses);
      } catch (e) {
        console.log("Unable to access processes", e)
      }
    }
  }, []);

  const processIds = Object.keys(processes);

  return (
    <div className='Load-raw'>
      {processIds.length > 0 && (
        <h3 className='Load-raw-heading'>Processes</h3>
      )}
      {processIds.map((processId) => {
        const process = processes[processId];
        const cpuPercent = Math.min(process.cpu || 0, 100);
        const memoryMb = parseInt(process.privateMemory / 1024 / 1024);
        const memoryWidth = Math.min(process.privateMemory / 1024 / 1024 / 10, 100);

        return (
          <div className='Load-raw-row' key={`process-${processId}`}>
            <div className='Load-raw-title'>
              <span className='Load-raw-pid'>{processId}</span>
              {(process.tasks || []).map(
                (task, index) => (
                  <span className='Load-raw-task' key={`task-${processId}-${index}`}>
                    {task.title}
                  </span>
                )
              )}
            </div>

            <div className='Load-raw-metric'>
              <div className='Load-raw-metric-head'>
                <span className='Load-raw-metric-label'>CPU</span>
                <span className='Load-raw-metric-value'>{humanReadableNumber(process.cpu)}%</span>
              </div>
              <div className='Load-raw-bar'>
                <div className='Load-raw-bar-fill Load-raw-bar-cpu' style={{ width: cpuPercent + '%' }}></div>
              </div>
            </div>

            <div className='Load-raw-metric'>
              <div className='Load-raw-metric-head'>
                <span className='Load-raw-metric-label'>Private Memory</span>
                <span className='Load-raw-metric-value'>{humanReadableNumber(memoryMb)}M</span>
              </div>
              <div className='Load-raw-bar'>
                <div className='Load-raw-bar-fill Load-raw-bar-memory' style={{ width: memoryWidth + '%' }}></div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default LoadProcesses;
