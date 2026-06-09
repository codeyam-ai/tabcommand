// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Shows an updating list of process statistics.
function init() {
  chrome.tabs.query({windowType: chrome.tabs.WindowType.NORMAL}, async (tabs) => {
    const tabCommandUrl = chrome.runtime.getURL("index.html");
    const existingTab = tabs.filter(
      (tab) => tab.url === tabCommandUrl
    )[0];

    if (existingTab) { 
      chrome.tabs.update(existingTab.id, {active: true}, () => {});
    } else {
      chrome.tabs.create({ url: tabCommandUrl, index: 0, pinned: true });
    }
    window.close();
  });
  // const tabs = {};

  // document.getElementById("home").onclick = function () {
  //   chrome.tabs.create({ url: chrome.runtime.getURL("../index.html") });
  // };

  // chrome.storage.onChanged.addListener(
  //   (changes, areaName) => {
  //     if (areaName !== 'local') return;
  //     loadActiveTabs();
  //   }
  // );

  // loadActiveTabs();
}

function loadActiveTabs() {
  chrome.storage.local.get('activeTabs', (result) => {
    const activeTabs = result.activeTabs || [];
    const urlKeys = activeTabs.map(tabUrl => tabUrl.urlKey);
    chrome.storage.local.get(urlKeys, (urlResult) => {
      const orderedUrls = activeTabs.map(
        (tabUrl) => {
          if (tabUrl.urlKey) {
            const url = urlResult[tabUrl.urlKey];
            if (!url) return null;
            url.tabId = tabUrl.tabKey.split('-')[1];
            return url;  
          }
          return null;
        }
      ).filter((url) => url);
      
      for (const url of orderedUrls) {
        let urlDiv = document.getElementById(`tab-${url.tabId}`);
        if (!urlDiv) {
          urlDiv = document.createElement("DIV");
          urlDiv.className = 'url active';
          urlDiv.id = `tab-${url.tabId}`;
          const activeDiv = document.getElementById('active');
          activeDiv.append(urlDiv);              
        }
        urlDiv.innerHTML = urlHTML(url);
      }
    });
  });        
}

function urlHTML(url) {
  let html =
    "<h4 title=\"" + url.title + "\">" + 
      "<image src=\"" + url.favicon + "\" /> " + 
      truncateString(url.title, 30) + 
    "</h4>";

  const { samples, network, cpu, privateMemory, jsMemoryAllocated, jsMemoryUsed } = url.processes;
  if (samples > 0) {
    const networkAvg = network / samples;
    const cpuAvg = cpu / samples;
    const privateMemoryAvg = privateMemory / samples;
    const jsMemoryAllocatedAvg = jsMemoryAllocated / samples;
    const jsMemoryUsedAvg = jsMemoryUsed / samples;
    
    html += 
      "<div class='stats'>" + 
        "CPU: " + Math.round(cpuAvg * 100) / 100 + 
        " NET: " + Math.round(networkAvg * 100) / 100 +
        " MEM: " + Math.round(privateMemoryAvg / 1064000 * 10) / 10 + "M" +  
        " JSALLOC: " + Math.round(jsMemoryAllocatedAvg / 1064000) / 10 + "M" +
        " JSUSED: " + Math.round(jsMemoryUsedAvg / 1064000) + "M" +
      "</div>";
  }

  return html;
}

function truncateString(str, num) {
  if (!str) return "";
  if (str.length <= num) {
    return str
  }
  return str.slice(0, num) + '...'
}

document.addEventListener('DOMContentLoaded', init);