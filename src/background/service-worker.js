if (typeof importScripts === "function") {
  importScripts("../shared/core.js", "../shared/storage.js");
}

const MAX_PAGES_PER_SECTION = 72; // Max for Gold tier: 8 orders per day * 90 days = 720, 10 orders per page -> 72 pages
const PAGE_SETTLE_MIN_MS = 700;
const PAGE_SETTLE_MAX_MS = 1400;
const PAGE_LOAD_TIMEOUT_MS = 25000;
const FETCH_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 900;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LOG_PREFIX = "[rolling-vine/bg]";
const DESKTOP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const SAFE_STOP_ERROR_CODES = {
  captcha: "captcha",
  sessionExpired: "session-expired",
  timeout: "timeout",
  unknown: "unknown"
};

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

  if (message.type === "rollingVine.openOptions") {
    chrome.runtime.openOptionsPage(() => {
      const err = chrome.runtime.lastError;
      if (err) {
        sendResponse({ ok: false, error: err.message });
        return;
      }
      sendResponse({ ok: true });
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
  const syncCache = await RollingVineStorage.getSyncCache();
  const lastOrdersTopTimestamp = Number(syncCache && syncCache.lastOrdersTopTimestamp) || null;
  const cachedOrdersScannedCount = Number(syncCache && syncCache.lastOrdersScannedCount) || 0;
  const cachedOrdersDateMsList = normalizeTimestampList(syncCache && syncCache.lastOrdersDateMsList)
    .filter((timestamp) => isWithinDaysBucket(timestamp, nowMs, 90));
  const hasOrdersBaseline =
    lastOrdersTopTimestamp &&
    cachedOrdersScannedCount > 0 &&
    cachedOrdersDateMsList.length > 0;

  await RollingVineStorage.setSyncState({
    status: "running",
    isRunning: true,
    stage: "orders",
    startedAt,
    lastError: null,
    lastErrorCode: null,
    progress: { section: "orders", page: 1 }
  });

  try {
    const ordersResult = await scanSection({
      origin,
      section: "orders",
      accountTabId,
      nowMs,
      ordersCheckpointTimestamp: hasOrdersBaseline ? lastOrdersTopTimestamp : null
    });

    let ordersDateMsForMetrics = normalizeTimestampList(ordersResult.dateMsList)
      .filter((timestamp) => isWithinDaysBucket(timestamp, nowMs, 90));

    if (ordersResult.stopReason === "matched-last-orders-timestamp" && hasOrdersBaseline) {
      const ordersDeltaDateMsList = ordersDateMsForMetrics
        .filter((timestamp) => timestamp > lastOrdersTopTimestamp);
      ordersDateMsForMetrics = cachedOrdersDateMsList
        .concat(ordersDeltaDateMsList)
        .filter((timestamp) => isWithinDaysBucket(timestamp, nowMs, 90));
    }

    const ordersTopTimestamp = ordersDateMsForMetrics.length > 0
      ? Math.max(...ordersDateMsForMetrics)
      : null;

    await RollingVineStorage.setSyncCache({
      lastOrdersTopTimestamp: ordersTopTimestamp,
      lastOrdersScannedCount: ordersDateMsForMetrics.length,
      lastOrdersDateMsList: ordersDateMsForMetrics,
      ordersCheckpointUpdatedAt: new Date().toISOString()
    });

    if (ordersResult.stopReason === "matched-last-orders-timestamp") {
      ordersResult.reusedOrdersBaselineCount = cachedOrdersScannedCount;
      ordersResult.ordersDeltaCount = ordersDateMsForMetrics
        .filter((timestamp) => !cachedOrdersDateMsList.includes(timestamp)).length;
    }

    await RollingVineStorage.setSyncState({
      status: "running",
      stage: "reviews",
      progress: { section: "reviews", page: 1 }
    });

    const reviewsResult = await scanSection({
      origin,
      section: "reviews",
      accountTabId,
      nowMs
    });

    const bucketedNowMs = startOfDayMs(nowMs) || nowMs;
    const metrics = RollingVineCore.buildMetrics(
      toStartOfDayTimestampList(ordersDateMsForMetrics),
      toStartOfDayTimestampList(reviewsResult.dateMsList),
      bucketedNowMs,
      toStartOfDayTimestampList(reviewsResult.approvedDateMsList)
    );

    metrics.syncMeta = {
      startedAt,
      finishedAt: new Date().toISOString(),
      ordersPages: ordersResult.pagesScanned,
      reviewsPages: reviewsResult.pagesScanned,
      ordersStopReason: ordersResult.stopReason,
      reviewsStopReason: reviewsResult.stopReason,
      ordersCountUsedForMetrics: ordersDateMsForMetrics.length
    };

    await RollingVineStorage.setMetrics(metrics);
    await RollingVineStorage.setSyncState({
      status: "idle",
      isRunning: false,
      stage: null,
      progress: null,
      lastSuccessAt: metrics.generatedAt,
      lastError: null,
      lastErrorCode: null
    });

    notifyAccount(accountTabId, { type: "rollingVine.syncFinished" });
  } catch (error) {
    console.error(`${LOG_PREFIX} runSync failed`, error && error.stack ? error.stack : error);
    const safeStopError = classifySafeStopError(error);
    await RollingVineStorage.setSyncState({
      status: "safe-stopped",
      isRunning: false,
      stage: null,
      progress: null,
      lastError: safeStopError.message,
      lastErrorCode: safeStopError.code
    });

    notifyAccount(accountTabId, {
      type: "rollingVine.syncFailed",
      error: safeStopError.message,
      errorCode: safeStopError.code
    });
  }
}

function classifySafeStopError(error) {
  const fallbackMessage = "Sync stopped safely due to an unexpected issue";
  const message =
    error && typeof error.message === "string" && error.message.trim()
      ? error.message.trim()
      : fallbackMessage;
  const normalized = RollingVineCore.normalizeText(message);

  if (normalized.includes("captcha")) {
    return { code: SAFE_STOP_ERROR_CODES.captcha, message };
  }

  if (
    normalized.includes("login required") ||
    normalized.includes("session expired") ||
    normalized.includes("sign in") ||
    normalized.includes("signin")
  ) {
    return { code: SAFE_STOP_ERROR_CODES.sessionExpired, message };
  }

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return { code: SAFE_STOP_ERROR_CODES.timeout, message };
  }

  return { code: SAFE_STOP_ERROR_CODES.unknown, message };
}

async function scanSection({ origin, section, accountTabId, nowMs, ordersCheckpointTimestamp = null }) {
  const dateMsList = [];
  const approvedDateMsList = [];
  const normalizedOrdersCheckpointTimestamp =
    section === "orders" ? Number(ordersCheckpointTimestamp) || null : null;
  let page = 1;
  let stopReason = "max-pages";

  while (page <= MAX_PAGES_PER_SECTION) {
    const url = buildSectionUrl(origin, section, page);

    await RollingVineStorage.setSyncState({
      progress: { section, page }
    });

    const html = await fetchPageWithRetries(url);
    await randomDelay(PAGE_SETTLE_MIN_MS, PAGE_SETTLE_MAX_MS);

    const safetyIssue = detectSafetyStop(html);
    if (safetyIssue) {
      throw new Error(`${section} sync stopped safely: ${safetyIssue}`);
    }

    const timestamps = extractTimestamps(html);

    if (timestamps.length === 0) {
      throw new Error(`${section} sync stopped safely: empty page or unexpected markup`);
    }

    for (const dateMs of timestamps) {
      dateMsList.push(dateMs);
    }

    if (section === "reviews") {
      const approvedTs = extractApprovedTimestamps(html);
      for (const dateMs of approvedTs) {
        approvedDateMsList.push(dateMs);
      }
    }

    if (
      section === "orders" &&
      normalizedOrdersCheckpointTimestamp &&
      timestamps.includes(normalizedOrdersCheckpointTimestamp)
    ) {
      stopReason = "matched-last-orders-timestamp";
      break;
    }

    const oldestMs = Math.min(...timestamps);
    const oldestDaysAgo = daysAgoBucket(oldestMs, nowMs);
    if (oldestDaysAgo !== null && oldestDaysAgo >= 90) {
      stopReason = "older-than-90-days";
      break;
    }

    if (!detectNextPage(html)) {
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
    dateMsList,
    approvedDateMsList,
    topTimestamp: dateMsList.length > 0 ? Math.max(...dateMsList) : null,
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

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_LOAD_TIMEOUT_MS);

  try {
    const acceptLanguage = navigator.language || navigator.languages?.join(",") || "en-US,en;q=0.9";
    const response = await fetch(url, {
      headers: {
        "User-Agent": DESKTOP_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": acceptLanguage,
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      credentials: "include",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      throw new Error("Page load timeout");
    }
    throw error;
  }
}

async function fetchPageWithRetries(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetchPage(url);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < FETCH_ATTEMPTS) {
        await randomDelay(FETCH_RETRY_DELAY_MS, FETCH_RETRY_DELAY_MS + 400);
      }
    }
  }

  throw lastError || new Error("Unable to fetch page");
}

function extractTimestamps(html) {
  const timestamps = [];
  const regex = /data-order-timestamp\s*=\s*"(\d+)"/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const dateMs = Number(match[1]);
    if (dateMs > 0) {
      timestamps.push(dateMs);
    }
  }

  return timestamps.sort((a, b) => b - a);
}

function extractApprovedTimestamps(html) {
  const timestamps = [];
  const segments = html.split(/data-order-timestamp\s*=\s*"/);

  for (let i = 1; i < segments.length; i++) {
    const closingQuote = segments[i].indexOf('"');
    if (closingQuote === -1) continue;
    const tsStr = segments[i].substring(0, closingQuote);
    const dateMs = Number(tsStr);
    if (dateMs <= 0) continue;
    if (/data-review-content/.test(segments[i])) {
      timestamps.push(dateMs);
    }
  }

  return timestamps.sort((a, b) => b - a);
}

function detectNextPage(html) {
  const paginationMatch = html.match(/class\s*=\s*"[^"]*a-pagination[^"]*"[\s\S]*?<\/ul>/i);
  if (!paginationMatch) {
    return false;
  }
  const paginationHtml = paginationMatch[0];
  const lastLiMatch = paginationHtml.match(/<li[^>]*class\s*=\s*"[^"]*a-last[^"]*"[^>]*>/i);
  if (!lastLiMatch) {
    return false;
  }
  return !(/a-disabled/.test(lastLiMatch[0]));
}

function detectSafetyStop(html) {
  if (/name\s*=\s*"captchacharacters"/i.test(html) ||
    /action\s*=\s*"[^"]*validateCaptcha/i.test(html)) {
    return "captcha detected";
  }

  if (/action\s*=\s*"[^"]*signin/i.test(html) ||
    /type\s*=\s*"password"/i.test(html)) {
    return "login required or session expired";
  }

  const lowerHtml = html.toLowerCase();
  if (lowerHtml.includes("enter the characters you see") || lowerHtml.includes("captcha")) {
    return "captcha text detected";
  }

  return null;
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

function normalizeTimestampList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => Number(item))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
}

function startOfDayMs(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function daysAgoBucket(dateMs, nowMs) {
  const normalizedDateMs = startOfDayMs(dateMs);
  const normalizedNowMs = startOfDayMs(nowMs);

  if (normalizedDateMs === null || normalizedNowMs === null) {
    return null;
  }

  const delta = normalizedNowMs - normalizedDateMs;
  if (delta < 0) {
    return null;
  }

  return Math.floor(delta / MS_PER_DAY);
}

function isWithinDaysBucket(dateMs, nowMs, days) {
  const age = daysAgoBucket(dateMs, nowMs);
  return age !== null && age < days;
}

function toStartOfDayTimestampList(value) {
  return normalizeTimestampList(value)
    .map((timestamp) => startOfDayMs(timestamp))
    .filter((timestamp) => timestamp !== null);
}

function mergeUniqueTimestamps(baseList, deltaList) {
  const mergedSet = new Set();
  for (const timestamp of normalizeTimestampList(baseList)) {
    mergedSet.add(timestamp);
  }
  for (const timestamp of normalizeTimestampList(deltaList)) {
    mergedSet.add(timestamp);
  }
  return Array.from(mergedSet);
}
