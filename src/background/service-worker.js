if (typeof importScripts === "function") {
  importScripts("../shared/core.js", "../shared/storage.js");
}

const MAX_PAGES_PER_SECTION = 40;
const PAGE_SETTLE_MIN_MS = 700;
const PAGE_SETTLE_MAX_MS = 1400;
const PAGE_LOAD_TIMEOUT_MS = 25000;
const LOG_PREFIX = "[rolling-vine/bg]";

let runningJob = null;

console.log(`${LOG_PREFIX} service worker loaded`);

self.addEventListener("error", (event) => {
  console.error(`${LOG_PREFIX} uncaught error`, event.message, event.filename, event.lineno);
});

self.addEventListener("unhandledrejection", (event) => {
  console.error(`${LOG_PREFIX} unhandled rejection`, event.reason);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  if (message.type === "rollingVine.startSync") {
    console.log(`${LOG_PREFIX} startSync requested`, sender && sender.tab ? sender.tab.url : "no-tab");
    handleStartSync(sender, message)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => {
        console.error(`${LOG_PREFIX} startSync failed`, error && error.stack ? error.stack : error);
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }
});

async function handleStartSync(sender, message) {
  if (runningJob) {
    console.log(`${LOG_PREFIX} sync already running`);
    return RollingVineStorage.getSyncState();
  }

  const rawPageUrl =
    (message && typeof message.pageUrl === "string" && message.pageUrl) ||
    (sender && sender.tab && typeof sender.tab.url === "string" && sender.tab.url) ||
    (sender && typeof sender.url === "string" && sender.url) ||
    null;

  const senderUrl = rawPageUrl ? new URL(rawPageUrl) : null;
  if (!senderUrl) {
    throw new Error("Unable to identify account page URL.");
  }

  const origin =
    message && typeof message.origin === "string" && message.origin
      ? message.origin
      : senderUrl.origin;
  const accountTabId = sender && sender.tab && typeof sender.tab.id === "number" ? sender.tab.id : null;

  runningJob = runSync({ origin, accountTabId })
    .catch(() => undefined)
    .finally(() => {
      runningJob = null;
    });

  return {
    status: "running",
    isRunning: true,
    stage: "orders",
    lastError: null
  };
}

async function runSync({ origin, accountTabId }) {
  console.log(`${LOG_PREFIX} runSync started`, { origin, accountTabId });
  const startedAt = new Date().toISOString();
  const nowMs = Date.now();

  await RollingVineStorage.setSyncState({
    status: "running",
    isRunning: true,
    stage: "orders",
    startedAt,
    lastError: null,
    progress: { section: "orders", page: 1 }
  });

  let tempTabId = null;

  try {
    tempTabId = await createHiddenTab(`${origin}/vine/orders`);

    const ordersResult = await scanSection({
      tabId: tempTabId,
      origin,
      section: "orders",
      accountTabId,
      nowMs
    });

    await RollingVineStorage.setSyncState({
      status: "running",
      stage: "reviews",
      progress: { section: "reviews", page: 1 }
    });

    const reviewsResult = await scanSection({
      tabId: tempTabId,
      origin,
      section: "reviews",
      accountTabId,
      nowMs
    });

    const metrics = RollingVineCore.buildMetrics(
      ordersResult.dateMsList,
      reviewsResult.dateMsList,
      nowMs
    );

    metrics.syncMeta = {
      startedAt,
      finishedAt: new Date().toISOString(),
      ordersPages: ordersResult.pagesScanned,
      reviewsPages: reviewsResult.pagesScanned,
      ordersStopReason: ordersResult.stopReason,
      reviewsStopReason: reviewsResult.stopReason
    };

    await RollingVineStorage.setMetrics(metrics);
    await RollingVineStorage.setSyncState({
      status: "idle",
      isRunning: false,
      stage: null,
      progress: null,
      lastSuccessAt: metrics.generatedAt,
      lastError: null
    });

    notifyAccount(accountTabId, { type: "rollingVine.syncFinished" });
  } catch (error) {
    console.error(`${LOG_PREFIX} runSync failed`, error && error.stack ? error.stack : error);
    await RollingVineStorage.setSyncState({
      status: "safe-stopped",
      isRunning: false,
      stage: null,
      progress: null,
      lastError: error.message
    });

    notifyAccount(accountTabId, { type: "rollingVine.syncFailed", error: error.message });
  } finally {
    if (tempTabId !== null) {
      await closeTabSafe(tempTabId);
    }
  }
}

async function scanSection({ tabId, origin, section, accountTabId, nowMs }) {
  const dateMsSet = new Set();
  let page = 1;
  let stopReason = "max-pages";

  while (page <= MAX_PAGES_PER_SECTION) {
    const url = buildSectionUrl(origin, section, page);

    await RollingVineStorage.setSyncState({
      progress: { section, page }
    });

    await navigateTab(tabId, url);
    await waitForTabComplete(tabId, PAGE_LOAD_TIMEOUT_MS);
    await randomDelay(PAGE_SETTLE_MIN_MS, PAGE_SETTLE_MAX_MS);

    const response = await extractFromTab(tabId, section, nowMs);

    if (!response || !response.ok) {
      const reason = response && response.reason ? response.reason : "Unexpected extraction failure";
      throw new Error(`${section} sync stopped safely: ${reason}`);
    }

    if (!response.items || response.items.length === 0) {
      throw new Error(`${section} sync stopped safely: empty page or unexpected markup`);
    }

    for (const item of response.items) {
      if (item && item.dateMs) {
        dateMsSet.add(item.dateMs);
      }
    }

    if (response.reachedOlderThan90) {
      stopReason = "older-than-90-days";
      break;
    }

    if (!response.hasNextPage) {
      stopReason = "no-next-page";
      break;
    }

    page += 1;
    notifyAccount(accountTabId, {
      type: "rollingVine.syncProgress",
      section,
      page
    });
  }

  return {
    dateMsList: Array.from(dateMsSet),
    pagesScanned: page,
    stopReason
  };
}

function buildSectionUrl(origin, section, page) {
  if (section === "orders") {
    return page === 1 ? `${origin}/vine/orders` : `${origin}/vine/orders?page=${page}`;
  }

  if (section === "reviews") {
    return page === 1
      ? `${origin}/vine/vine-reviews?review-type=completed`
      : `${origin}/vine/vine-reviews?page=${page}&review-type=completed`;
  }

  throw new Error(`Unsupported section: ${section}`);
}

function createHiddenTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(tab.id);
    });
  });
}

function navigateTab(tabId, url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url, active: false }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve();
    });
  });
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Page load timeout"));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function extractFromTab(tabId, section, nowMs) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      {
        type: "rollingVine.extractPage",
        section,
        nowMs
      },
      (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(`Unable to communicate with page parser: ${err.message}`));
          return;
        }
        resolve(response);
      }
    );
  });
}

function closeTabSafe(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => resolve());
  });
}

function randomDelay(minMs, maxMs) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function notifyAccount(tabId, message) {
  if (typeof tabId !== "number") {
    return;
  }
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError;
  });
}
