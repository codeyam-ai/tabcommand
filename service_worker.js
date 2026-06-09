// var _gaq = _gaq || [];
// _gaq.push(['_setAccount', 'G-XW94WZGGSB']);
// _gaq.push(['_trackPageview']);

// (function() {
//   var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
//   ga.src = 'https://ssl.google-analytics.com/ga.js';
//   var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
// })();

function central() {
  // let err = new Error();
  // console.log(((labels || {}).Test2 || {}).urlKeys, err.stack);
}


let defaultWindowId;
let listening = true;
let removing;

let groups = {};
function trackGroup(group) {
  groups[parseInt(group.id)] = group.title;
}

chrome.tabGroups.onCreated.addListener((group) => trackGroup(group))
chrome.tabGroups.onUpdated.addListener((group) => trackGroup(group))
chrome.tabGroups.query({}, (groups) => {
  central();
  for (let i=0; i<groups.length; ++i) {
    trackGroup(groups[i]);
  }
});

listenToProcesses();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  central();
  if (tab.title === "TabCommand") defaultWindowId = tab.windowId;
  let updates = await tabUpdates(tab);
  
  const checkRemoving = () => {
    if (removing === tabId) {
      removing = null;
      return true;
    }
  };

  const activeTabs = (await getLocalStorage('activeTabs')).activeTabs || [];

  if (changeInfo.url) {
    if (checkRemoving()) return true;

    const oldTabUrl = activeTabs.filter(
      tabUrl => tabUrl.tabKey === `tab-${tabId}`
    )[0];
    if (oldTabUrl) {
      closeUrl(oldTabUrl.urlKey);

      if (tab.groupId > -1) {
        chrome.tabs.ungroup(tab.id);
      }
    }
    updates = {
      ...updates,
      ...(await newUrl(tabId, changeInfo.url))
    };
  }

  if (changeInfo.groupId === -1) {
    const activeTabIndex = activeTabs.findIndex(
      tabUrl => tabUrl.tabKey === `tab-${tabId}`
    );
    const activeTab = activeTabs[activeTabIndex];

    if (activeTab) {
      const oldGroupId = activeTab.groupId
      if (oldGroupId && oldGroupId > -1) {
        const labelTitle = groups[oldGroupId];
        const label = labels[labelTitle];
        if (label) {
          if (checkRemoving()) return true;
          const urlKeyIndex = label.urlKeys.indexOf(`url-${tab.url}`);
          if (urlKeyIndex > -1) {
            label.urlKeys.splice(urlKeyIndex, 1)

            labels[labelTitle] = label
            activeTabs[activeTabIndex].groupId = -1;

            updates = {
              ...updates,
              labels: labels,
              activeTabs: activeTabs
            };
          }
        }
      }
    }
  }

  if (checkRemoving()) return true;

  update(updates);

  if (changeInfo.pinned || changeInfo.groupId) {
    updateActiveTabs();
  }
  
  if (listening) return;
  listenToProcesses();
});

chrome.tabs.onActivated.addListener((tabInfo) => {
  central();
  updateActiveTabs();
});

chrome.tabs.onCreated.addListener(async (tab) => {
  central();
  const updates = {
    ...(await tabUpdates(tab)),
    ...(await newUrl(tab.id, tab.url))
  }
  update(updates);

  if (listening) return;
  listenToProcesses();
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  central();
  // console.log("onReplaced", addedTabId, removedTabId);

  updateActiveTabs();

  if (listening) return;
  listenToProcesses();
});

chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
  central();
  updateActiveTabs();
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  central();
  removing = tabId;
  const activeTabs = (await getLocalStorage('activeTabs')).activeTabs || [];
  const oldTabUrl = activeTabs.filter(
    tabUrl => tabUrl.tabKey === `tab-${tabId}`
  )[0];
  if (oldTabUrl) {
    closeUrl(oldTabUrl.urlKey, updateActiveTabs);
  }
});

let waitingToUpdate = false;
updateActiveTabs();
async function updateActiveTabs() {
  central();
  if (waitingToUpdate) return;
  chrome.tabs.query({ windowType: chrome.tabs.WindowType.NORMAL }, async (tabs) => {
    if (!tabs) {
      waitingToUpdate = true;
      setTimeout(() => {
        waitingToUpdate = false;
        updateActiveTabs();
      }, 100);
      return;
    }

    getLocalStorage(['activeTabs', 'autoClosed'], (result) => {
      const activeTabs = result.activeTabs || [];
      const autoClosed = result.autoClosed || {};
      
      const newActiveTabs = tabs.sort(
        (a, b) => a.tabIndex - b.tabIndex
      );

      const updatedActiveTabs = newActiveTabs.filter(validTab).map(
        (tab) => {
          const existingTab = (activeTabs || []).filter(
            (activeTab) => activeTab.tabKey === `tab-${tab.id}`
          )[0];

          return {
            tabKey: `tab-${tab.id}`,
            urlKey: getUrlKey(tab.url),
            pinned: tab.pinned,
            groupId: tab.groupId,
            activeAt: (tab.active ? Date.now() : (existingTab ?? {}).activeAt),
            openedAt: (existingTab ?? { openedAt: Date.now() }).openedAt,
            tabCommandPinned: (existingTab ?? {}).tabCommandPinned,
            autoClosedAt: (autoClosed || {})[getUrlKey(tab.url)],
            active: tab.active
          }
        }
      );

      for (const activeTab of updatedActiveTabs) {
        if (activeTab.active && autoClosed[activeTab.urlKey]) {
          chrome.tabs.ungroup(parseInt(activeTab.tabKey.split('-')[1]));
          delete autoClosed[activeTab.urlKey];
        } else if (activeTab.groupId !== autoClosed.groupId && autoClosed[activeTab.urlKey]) {
          delete autoClosed[activeTab.urlKey];
        }
      }

      const updates = {
        activeTabs: updatedActiveTabs,
        autoClosed: autoClosed
      };

      update(updates);
    });
  });
}

function update(updates) {
  central();
  chrome.storage.local.set(updates);
}

async function newUrl(tabId, url) {
  central();
  updateActiveTabs();
  if (!tabId) return;
  if (!url) return;
  return new Promise((resolve, reject) => {
    const updates = {};
    const urlKey = getUrlKey(url);
    getLocalStorage(['allUrls', 'labels'], (result) => {
      const allUrls = result.allUrls || [];
      if (allUrls.indexOf(urlKey) === -1) {
        allUrls.unshift(urlKey);

        if (allUrls.length >= 250) {
          let allLabelUrlKeys = [];
          for (const label in result.labels) {
            allLabelUrlKeys += result.labels[label].urlKeys;
          }

          const removeUrlKeys = allUrls.slice(250);
          for (const removeUrlKey of removeUrlKeys) {
            if (allLabelUrlKeys.indexOf(removeUrlKey) === -1) {
              chrome.storage.local.remove(removeUrlKey);
            }
          }
        }

        updates.allUrls = allUrls.slice(0, 250);
      }
      resolve(updates)
    });
  });
}

function closeUrl(urlKey, callback) {
  central();
  getLocalStorage('allUrls', (result) => {
    const allUrls = result.allUrls || [];
    const oldIndex = allUrls.indexOf(urlKey);
    allUrls.splice(0, 0, allUrls.splice(oldIndex, 1)[0]);
    update({ allUrls: allUrls });
    if (callback) return callback();
  });
}

function listenToProcesses() {
  try {
    chrome.processes.onUpdatedWithMemory.addListener(processProcesses);
  } catch (e) {
    console.log("Unable to listen to processes", e);
  }
}

let samples = 0;
let processesIndex = { global: 0 };
async function processProcesses(processes) {
  samples += 1;
  processesIndex.global += 1;

  let updates = {
    processTotals: {
      cpu: 0,
      network: 0,
      privateMemory: 0,
      jsMemoryAllocated: 0,
      jsMemoryUsed: 0
    }
  }

  for (const pid in processes) {
    updates = updateTotals(processes[pid], updates);
    updates = await associateProcess(processes[pid], updates);
  }

  update(updates);

  if (samples > 10) {
    samples = 0;
    try {
      chrome.processes.onUpdatedWithMemory.removeListener(processProcesses);
    } catch (e) {
      console.log("Unable to remove processes listener", e);
    }
    
    listening = false;
    setTimeout(() => {
      if (!listening) {
        listenToProcesses();
      }
    }, 15000);
  }
}

function updateTotals(process, updates) {
  central();
  updates.processTotals.cpu += process.cpu || 0;
  updates.processTotals.network += process.network || 0;
  updates.processTotals.privateMemory += process.privateMemory || 0;
  updates.processTotals.jsMemoryAllocated += process.jsMemoryAllocated || 0;
  updates.processTotals.jsMemoryUsed += process.jsMemoryUsed || 0;
  return updates;
}

async function associateProcess(process, updates) {
  central();
  const tabIds = process.tasks.map(
    (task) => task.tabId
  ).filter(
    (tabId) => tabId !== undefined
  );

  // if (tabIds.length > 1) {
  //   console.log("MULTIPLE", tabIds);
  // }

  for (tabId of tabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      updates = {
        ...updates,
        ...(await tabUpdates(tab, process, updates))
      };
    } catch (e) {
      // console.log("Error on loading tab " + tabId, e.message);
    }
  }
  return updates;
}

async function tabUpdates(tab, process, updates) {
  central();
  return new Promise((resolve, reject) => {
    if (!validTab(tab)) {
      resolve({});
    }

    const urlKey = getUrlKey(tab.url);
    if (updates && updates[urlKey]) {
      resolve({ [urlKey]: urlUpdates(updates[urlKey], tab, process) });
    }

    getLocalStorage(urlKey, (result) => {
      const url = result[urlKey] || { url: tab.url };
      resolve({ [urlKey]: urlUpdates(url, tab, process) });
    });
  });
}

function urlUpdates(url, tab, process) {
  central();
  if (!url.processes || !url.processes.samples) {
    url.processes = {
      samples: 0,
      cpu: 0,
      network: 0,
      privateMemory: 0,
      jsMemoryAllocated: 0,
      jsMemoryUsed: 0
    }
  }

  if (tab.status !== "loading" && tab.title && tab.title.length > 0) url.title = tab.title;
  if (!url.title || !url.title.length) url.title = url.url;
  if (tab.favIconUrl) url.favicon = tab.favIconUrl;
  if (tab.groupId !== url.groupId) url.groupId = tab.groupId;

  if (process) {
    if (processesIndex[tab.url] !== processesIndex.global) {
      processesIndex[tab.url] = processesIndex.global;
      url.processes.samples += 1;

      if (url.processes.samples > 100) {
        url.processes.cpu = (url.processes.cpu / url.processes.samples)
        url.processes.network = (url.processes.network / url.processes.samples)
        url.processes.privateMemory = (url.processes.privateMemory / url.processes.samples)
        url.processes.jsMemoryAllocated = (url.processes.jsMemoryAllocated / url.processes.samples)
        url.processes.jsMemoryUsed = (url.processes.jsMemoryUsed / url.processes.samples)
        url.processes.samples = 1;
      }
    }

    url.processes.cpu += process.cpu || 0;
    url.processes.network += process.network || 0;
    url.processes.privateMemory += process.privateMemory || 0;
    url.processes.jsMemoryAllocated += process.jsMemoryAllocated || 0;
    url.processes.jsMemoryUsed += process.jsMemoryUsed || 0;
  }
  return url;
}

function getUrlKey(url) {
  central();
  return `url-${url.split('#')[0]}`;
}

function validTab(tab) {
  central();
  return tab.url &&
    tab.url.length &&
    tab.url.indexOf('chrome://') === -1 &&
    tab.url.indexOf('devtools://') === -1 &&
    tab.url.indexOf('chrome-extension://') === -1
}




let labels = {};
let activeTabs = [];
getLocalStorage(['labels', 'activeTabs'], (result) => {
  central();
  labels = result.labels || {};
  activeTabs = result.activeTabs || [];
  groupTabs(activeTabs, labels);
});

chrome.storage.onChanged.addListener(
  (changes, areaName) => {
    central();
    if (areaName !== 'local') return;
    if (!changes.labels && !changes.activeTabs) return;

    if (changes.labels) {
      labels = changes.labels.newValue;
    }

    if (changes.activeTabs) {
      activeTabs = changes.activeTabs.newValue;
      handleActiveTabsGroupChanges(changes.activeTabs);
    }

    groupTabs(activeTabs, labels);

    if (changes.labels) {
      const previous = changes.labels.oldValue;
      getLocalStorage('previousLabels', (result) => {
        const previousLabels = result.previousLabels || [];
        if (previousLabels.length >= 10) {
          previousLabels.pop();
        }
        previousLabels.unshift(previous);
        update({ previousLabels: previousLabels });
      });
    }
  }
);

function getTabGroup(id) {
  central();
  return new Promise(
    (resolve, reject) => {
      if (!id || id === -1) {
        resolve(null);
      } else {
        chrome.tabGroups.get(id, (group) => {
          central();
          resolve(group);
        });
      }
    }
  );
}

function getLocalStorage(query, callback) {
  return new Promise(
    (resolve, reject) =>
      chrome.storage.local.get(query, (result) => {
        central();
        if (callback) {
          callback(result);
          return;
        }
        resolve(result);
      })
  );
}

function parseTabId(tab) {
  central();
  return parseInt(tab.tabKey.split('-')[1]);
}

async function handleActiveTabsGroupChanges(changes) {
  central();
  const { newValue, oldValue } = changes;

  if (!oldValue) return;

  for (const oldTab of oldValue) {
    const newTab = newValue.filter(
      (tab) => tab.tabKey === oldTab.tabKey
    )[0];

    if (!newTab) continue;
    if (newTab.pinned) continue;

    if (oldTab.groupId !== newTab.groupId) {
      const oldGroup = await (
        getTabGroup(oldTab.groupId).catch(
          e => { }//console.log("Error getting group", oldTab.groupId, e.message)
        )
      );

      const newGroup = await (
        getTabGroup(newTab.groupId).catch(
          e => { }//console.log("Error getting group", newTab.groupId, e.message)
        )
      );

      if (!oldGroup || !newGroup || newGroup.title === "~~~ CLOSING ~~~") continue;

      const { labels } = await getLocalStorage('labels') || {};

      let changed = false;
      if (newGroup) {
        const label = labels[newGroup.title] || { urlKeys: [] };
        const index = label.urlKeys.indexOf(newTab.urlKey);
        if (index === -1) {
          labels[newGroup.title].urlKeys.push(newTab.urlKey);
          changed = true;
        }
      }

      if (oldGroup) {
        const index = labels[oldGroup.title].urlKeys.indexOf(newTab.urlKey);
        if (index > -1) {
          labels[oldGroup.title].urlKeys.splice(index, 1);
          changed = true;
        }
      }

      if (changed) update({ labels: labels });
    }
  }
}

async function groupTabs(activeTabs, labels) {
  central();
  const mapColors = (labelColor) => {
    const map = {
      '#5F6367': 'grey',
      '#1873E4': 'blue',
      '#DA2F25': 'red',
      '#E47415': 'yellow',
      '#1F8E43': 'green',
      '#D01882': 'pink',
      '#9334E2': 'purple',
      '#007B82': 'cyan'
    };
    for (const key of Object.keys(map)) map[map[key]] = key;
    return map[labelColor]
  }

  const groupLabeledTab = async (tabs, label) => {
    const unpinnedTabIds = [];
    for (const tab of tabs) {
      if (!tab.pinned) unpinnedTabIds.push(parseTabId(tab));
    }

    // const labelTitlePath = label.title.split('/');
    // const labelTitle = labelTitlePath[labelTitlePath.length - 1];
    const labelTitle = label.title;

    chrome.tabGroups.query({ title: labelTitle }, async (groups) => {
      central();
      if (!groups) return;
      
      if (groups.length === 0) {
        chrome.tabs.group({ tabIds: unpinnedTabIds }, (groupId) => {
          chrome.tabGroups.update(groupId, {
            title: labelTitle,
            color: mapColors(label.backgroundColor)
          });
        });
      } else {
        if (defaultWindowId && groups[0].windowId !== defaultWindowId) {
          const existingGroupTabs = activeTabs.filter(
            t => t.groupId === groups[0].id
          );

          const existingGroupTabIds = existingGroupTabs.map(
            t => parseInt(t.tabKey.split('-')[1])
          );

          await chrome.tabs.remove(existingGroupTabIds);

          for (const tab of existingGroupTabs) {
            await chrome.tabs.create({ url: tab.urlKey.split('-')[1] });
          }
        } else {
          chrome.tabs.group({ tabIds: unpinnedTabIds, groupId: groups[0].id });
        }
      }
    });
  };

  const labelTabIds = {};
  for (const activeTab of activeTabs) {
    if (activeTab.pinned) continue;
    if (activeTab.groupId && activeTab.groupId > -1) {
      const group = await (
        getTabGroup(activeTab.groupId).catch(
          e => { }//console.log("Error getting group", activeTab.groupId, e.message)
        )
      );

      if (!group || group.title === "~~~ CLOSING ~~~") continue;

      const label = labels[group.title];

      if (label && label.urlKeys.indexOf(activeTab.urlKey) > -1) continue;

      if (!label) {
        labels[group.title] = {
          title: group.title,
          urlKeys: [activeTab.urlKey],
          color: mapColors(group.color)
        }
      } else {
        labels[group.title].urlKeys.push(activeTab.urlKey);
      }
      update({ labels: labels });

      labelTabIds[group.title] ||= [];
      labelTabIds[group.title].push(activeTab);
    } else {
      let found = false;
      for (const labelTitle of Object.keys(labels)) {
        if (labels[labelTitle].urlKeys.indexOf(activeTab.urlKey) > -1) {
          found = true;
          labelTabIds[labelTitle] ||= [];
          labelTabIds[labelTitle].push(activeTab);
        }
      }

      if (!found && activeTab.groupId > -1) {
        chrome.tabs.ungroup(parseTabId(activeTab));
      }
    }
  }

  for (const labelTitle of Object.keys(labelTabIds)) {
    groupLabeledTab(labelTabIds[labelTitle], labels[labelTitle]);
  }
}