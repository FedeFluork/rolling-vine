(() => {
  const ACCOUNT_PATH_REGEX = /^\/vine\/account\/?$/;
  const ORDERS_PATH = "/vine/orders";
  const REVIEWS_PATH = "/vine/vine-reviews";
  const LOG_PREFIX = "[rolling-vine/content]";
  const HYDRATE_RETRY_DELAYS_MS = [0, 250, 800, 1600];
  const START_SYNC_ATTEMPTS = 3;
  const START_SYNC_RETRY_DELAY_MS = 500;
  const SAFE_STOP_ERROR_CODES = {
    captcha: "captcha",
    sessionExpired: "session-expired",
    timeout: "timeout",
    unknown: "unknown"
  };

  let rootEl = null;
  let lastKnownHref = location.href;
  const ui = RollingVineI18n.resolveUiStrings(location.hostname);

  window.addEventListener("error", (event) => {
    console.error(`${LOG_PREFIX} uncaught error`, event.message, event.filename, event.lineno);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error(`${LOG_PREFIX} unhandled rejection`, event.reason);
  });

  init();

  function init() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.type) {
        return;
      }

      if (message.type === "rollingVine.extractPage") {
        const result = extractPageData(message.section, message.nowMs);
        sendResponse(result);
        return true;
      }

      if (message.type === "rollingVine.syncProgress" || message.type === "rollingVine.syncFinished" || message.type === "rollingVine.syncFailed") {
        if (isAccountPage()) {
          hydrateAccountUI().catch(() => undefined);
        }
      }
    });

    if (isAccountPage()) {
      scheduleAccountHydration();
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") {
          return;
        }
        if (changes[RollingVineStorage.STORAGE_KEYS.metrics] || changes[RollingVineStorage.STORAGE_KEYS.syncState]) {
          scheduleAccountHydration();
        }
      });

      window.addEventListener("pageshow", () => {
        scheduleAccountHydration();
      });

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && isAccountPage()) {
          scheduleAccountHydration();
        }
      });

      window.addEventListener("popstate", handlePotentialNavigation);
      window.addEventListener("hashchange", handlePotentialNavigation);
      patchHistoryForNavigationEvents();
      window.addEventListener("rollingVine:navigation", handlePotentialNavigation);
    }
  }

  function handlePotentialNavigation() {
    if (location.href === lastKnownHref) {
      if (isAccountPage()) {
        scheduleAccountHydration();
      }
      return;
    }

    lastKnownHref = location.href;
    if (isAccountPage()) {
      scheduleAccountHydration();
    } else {
      rootEl = null;
    }
  }

  function patchHistoryForNavigationEvents() {
    const historyObj = window.history;
    if (!historyObj || historyObj.__rollingVinePatched) {
      return;
    }

    const rawPushState = historyObj.pushState;
    const rawReplaceState = historyObj.replaceState;

    historyObj.pushState = function patchedPushState(...args) {
      const result = rawPushState.apply(this, args);
      window.dispatchEvent(new Event("rollingVine:navigation"));
      return result;
    };

    historyObj.replaceState = function patchedReplaceState(...args) {
      const result = rawReplaceState.apply(this, args);
      window.dispatchEvent(new Event("rollingVine:navigation"));
      return result;
    };

    historyObj.__rollingVinePatched = true;
  }

  function scheduleAccountHydration() {
    if (!isAccountPage()) {
      return;
    }

    for (const delayMs of HYDRATE_RETRY_DELAYS_MS) {
      setTimeout(() => {
        if (isAccountPage()) {
          mountAndHydrateAccountUI();
        }
      }, delayMs);
    }
  }

  function mountAndHydrateAccountUI() {
    mountAccountUI()
      .then(() => hydrateAccountUI())
      .catch(() => undefined);
  }

  async function sendRuntimeMessage(message) {
    let lastError = null;

    for (let attempt = 1; attempt <= START_SYNC_ATTEMPTS; attempt += 1) {
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(message, (nextResponse) => {
            const err = chrome.runtime.lastError;
            if (err) {
              reject(new Error(err.message));
              return;
            }
            resolve(nextResponse);
          });
        });

        if (!response && attempt < START_SYNC_ATTEMPTS) {
          await delay(START_SYNC_RETRY_DELAY_MS * attempt);
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        if (attempt < START_SYNC_ATTEMPTS) {
          await delay(START_SYNC_RETRY_DELAY_MS * attempt);
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error("No response from background sync handler");
  }

  function isAccountPage() {
    return ACCOUNT_PATH_REGEX.test(location.pathname);
  }

  function isOrdersPage() {
    return location.pathname === ORDERS_PATH;
  }

  function isReviewsPage() {
    return location.pathname === REVIEWS_PATH && /review-type=completed/.test(location.search);
  }

  function inferSafeStopErrorCode(lastError) {
    const normalized = RollingVineCore.normalizeText(lastError || "");

    if (normalized.includes("captcha")) {
      return SAFE_STOP_ERROR_CODES.captcha;
    }
    if (
      normalized.includes("login required") ||
      normalized.includes("session expired") ||
      normalized.includes("sign in") ||
      normalized.includes("signin")
    ) {
      return SAFE_STOP_ERROR_CODES.sessionExpired;
    }
    if (normalized.includes("timeout") || normalized.includes("timed out")) {
      return SAFE_STOP_ERROR_CODES.timeout;
    }

    return SAFE_STOP_ERROR_CODES.unknown;
  }

  function getSafeStopMessage(syncState) {
    const code = syncState.lastErrorCode || inferSafeStopErrorCode(syncState.lastError);

    if (code === SAFE_STOP_ERROR_CODES.captcha) {
      return ui.safeStoppedCaptcha;
    }

    if (code === SAFE_STOP_ERROR_CODES.sessionExpired) {
      return ui.safeStoppedSession;
    }

    if (code === SAFE_STOP_ERROR_CODES.timeout) {
      return ui.safeStoppedTimeout;
    }

    if (syncState.lastError) {
      return ui.safeStoppedWithError(syncState.lastError);
    }

    return ui.safeStoppedDefault;
  }

  function detectSafetyStop() {
    const text = document.body ? document.body.textContent || "" : "";
    const normalized = RollingVineCore.normalizeText(text);

    if (document.querySelector('input[name="captchacharacters"], form[action*="validateCaptcha"]')) {
      return "captcha detected";
    }

    if (document.querySelector('form[action*="signin"], input[type="password"]')) {
      return "login required or session expired";
    }

    if (normalized.includes("enter the characters you see") || normalized.includes("captcha")) {
      return "captcha text detected";
    }

    return null;
  }

  function extractPageData(section, nowMs) {
    const safetyIssue = detectSafetyStop();
    if (safetyIssue) {
      return { ok: false, reason: safetyIssue };
    }

    if (section === "orders" && !isOrdersPage()) {
      return { ok: false, reason: "unexpected page while scanning orders" };
    }

    if (section === "reviews" && !isReviewsPage()) {
      return { ok: false, reason: "unexpected page while scanning completed reviews" };
    }

    const items = section === "orders" ? extractOrderItems() : extractReviewItems();

    if (items.length === 0) {
      return { ok: false, reason: "no parsable records found" };
    }

    const cutoffMs = Number(nowMs) - 90 * 24 * 60 * 60 * 1000;
    const oldestMs = Math.min(...items.map((item) => item.dateMs));

    return {
      ok: true,
      items,
      reachedOlderThan90: oldestMs < cutoffMs,
      hasNextPage: hasNextPage(),
      recordCount: items.length
    };
  }

  function extractOrderItems() {
    const items = [];
    const seen = new Set();

    const selectors = [
      'td.vvp-orders-table--text-col[data-order-timestamp]',
      'span[data-order-timestamp]'
    ];

    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const timestamp = node.getAttribute('data-order-timestamp');
        const dateMs = Number(timestamp);

        if (!dateMs || dateMs <= 0) continue;

        const text = (node.textContent || '').trim();
        const id = `${dateMs}:order`;

        if (seen.has(id)) continue;
        seen.add(id);

        items.push({ dateMs, snippet: text });
      }
    }

    return items.sort((a, b) => b.dateMs - a.dateMs);
  }

  function extractReviewItems() {
    const items = [];
    const seen = new Set();

    const selectors = [
      'td.vvp-reviews-table--text-col[data-order-timestamp]',
      'span[data-order-timestamp]'
    ];

    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const timestamp = node.getAttribute('data-order-timestamp');
        const dateMs = Number(timestamp);

        if (!dateMs || dateMs <= 0) continue;

        const text = (node.textContent || '').trim();
        const id = `${dateMs}:review`;

        if (seen.has(id)) continue;
        seen.add(id);

        items.push({ dateMs, snippet: text });
      }
    }

    return items.sort((a, b) => b.dateMs - a.dateMs);
  }

  function hasNextPage() {
    const nextLi = document.querySelector('ul.a-pagination li.a-last');
    if (!nextLi) {
      return false;
    }
    return !nextLi.classList.contains("a-disabled");
  }

  async function mountAccountUI() {
    if (rootEl && !rootEl.isConnected) {
      rootEl = null;
    }

    if (rootEl && rootEl.isConnected) {
      return;
    }

    const existingRoot = document.querySelector(".rolling-vine-root");
    if (existingRoot) {
      rootEl = existingRoot;
      return;
    }

    const anchor = findAccountAnchor();
    if (!anchor) {
      return;
    }

    rootEl = document.createElement("section");
    rootEl.className = "rolling-vine-root";
    rootEl.appendChild(buildAccountLayout());
    anchor.appendChild(rootEl);

    wireDonationLinks();

    const syncImg = rootEl.querySelector(".rolling-vine-sync-icon");
    if (syncImg) {
      syncImg.src = chrome.runtime.getURL("/content/assets/sync.svg");
    }

    if (!rootEl.__syncBtnDelegated) {
      rootEl.addEventListener("click", async (event) => {
        const syncBtn = event.target.closest(".rolling-vine-sync-btn");
        if (!syncBtn) {
          return;
        }

        syncBtn.disabled = true;
        syncBtn.classList.add("is-syncing");
        const syncStage = rootEl.querySelector("[data-sync-stage]");
        if (syncStage) {
          syncStage.textContent = ui.startingSync;
        }
        try {
          const response = await sendRuntimeMessage({
            type: "rollingVine.startSync",
            origin: location.origin,
            pageUrl: location.href
          });
          if (response && response.ok === false) {
            throw new Error(response.error || "Unknown sync start error");
          }
          if (response && response.state && response.state.isRunning && syncStage) {
            syncStage.textContent = ui.syncingOrders;
          }
        } catch (error) {
          const reason = error && error.message ? error.message : String(error);
          console.error(`${LOG_PREFIX} sync click failed`, error && error.stack ? error.stack : error);
          syncBtn.classList.remove("is-syncing");

          if (syncStage) {
            syncStage.textContent = `${ui.syncStartFailedPrefix}: ${reason}`;
          }
        } finally {
          setTimeout(() => {
            hydrateAccountUI().catch(() => undefined);
          }, 450);
        }
      });

      rootEl.__syncBtnDelegated = true;
    }

  }

  function findAccountAnchor() {
    const dashboardRow = document.querySelector("#vvp-account-dashboard > .a-row");
    if (dashboardRow) {
      return dashboardRow;
    }

    const selectors = [
      "#vvp-account-overview",
      "#vvp-account-page",
      ".vvp-body",
      "main",
      "#pageContent"
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) {
        return node;
      }
    }

    return document.body;
  }

  function buildAccountLayout() {
    const fragment = document.createDocumentFragment();

    const headerRow = document.createElement("div");
    headerRow.className = "rolling-vine-header-row";

    const title = document.createElement("h3");
    title.className = "rolling-vine-title";
    title.textContent = "Rolling Vine";

    const syncBtn = document.createElement("button");
    syncBtn.className = "rolling-vine-sync-btn";
    syncBtn.type = "button";

    const syncIcon = document.createElement("img");
    syncIcon.className = "rolling-vine-sync-icon";
    syncIcon.alt = ui.syncIconAlt;

    syncBtn.appendChild(syncIcon);
    syncBtn.appendChild(document.createTextNode(ui.syncButton));
    headerRow.appendChild(title);
    headerRow.appendChild(syncBtn);

    const lastSync = document.createElement("div");
    lastSync.className = "rolling-vine-last-sync";
    lastSync.appendChild(document.createTextNode(`${ui.lastSyncLabel} `));

    const syncValue = document.createElement("span");
    syncValue.setAttribute("data-sync-value", "");
    syncValue.textContent = ui.never;
    lastSync.appendChild(syncValue);

    const stage = document.createElement("div");
    stage.className = "rolling-vine-stage";
    stage.setAttribute("data-sync-stage", "");

    const grid = document.createElement("div");
    grid.className = "rolling-vine-grid";
    grid.appendChild(buildCard(90));
    grid.appendChild(buildCard(60));
    grid.appendChild(buildCard(30));

    const donation = document.createElement("div");
    donation.className = "rolling-vine-donation";

    const donationLabel = document.createElement("span");
    donationLabel.className = "rolling-vine-donation-label";
    donationLabel.textContent = ui.supportExtension;

    const kofiLink = document.createElement("a");
    kofiLink.href = "#";
    kofiLink.className = "rolling-vine-donate-btn rolling-vine-donate-kofi";
    kofiLink.setAttribute("data-donation", "kofi");
    kofiLink.setAttribute("aria-label", ui.donateWithKofi);
    const kofiImg = document.createElement("img");
    kofiImg.alt = "Ko-fi";
    kofiLink.appendChild(kofiImg);

    const paypalLink = document.createElement("a");
    paypalLink.href = "#";
    paypalLink.className = "rolling-vine-donate-btn rolling-vine-donate-paypal";
    paypalLink.setAttribute("data-donation", "paypal");
    paypalLink.setAttribute("aria-label", ui.donateWithPaypal);
    const paypalImg = document.createElement("img");
    paypalImg.alt = "PayPal";
    paypalLink.appendChild(paypalImg);

    const donationButtons = document.createElement("div");
    donationButtons.className = "rolling-vine-donation-buttons";
    donationButtons.appendChild(kofiLink);
    donationButtons.appendChild(paypalLink);

    donation.appendChild(donationLabel);
    donation.appendChild(donationButtons);

    fragment.appendChild(headerRow);
    fragment.appendChild(lastSync);
    fragment.appendChild(stage);
    fragment.appendChild(grid);
    fragment.appendChild(donation);

    return fragment;
  }

  function buildCard(period) {
    const card = document.createElement("article");
    card.className = "rolling-vine-card";
    card.setAttribute("data-period", String(period));

    const title = document.createElement("h4");
    title.textContent = ui.periodTitle(period);
    card.appendChild(title);

    card.appendChild(buildCardRow(ui.labels.orders, "orders", "0"));
    card.appendChild(buildCardRow(ui.labels.reviews, "reviews", "0"));
    card.appendChild(buildCardRow(ui.labels.rate, "rate", ui.rateNA));
    card.appendChild(buildRiskRow(period));
    card.appendChild(buildStatusInfoRow());

    return card;
  }

  function buildRiskRow(period) {
    const row = document.createElement("div");
    row.className = "rolling-vine-row rolling-vine-risk-row";

    const risk = document.createElement("strong");
    risk.setAttribute("data-field", "riskLevel");
    risk.textContent = getRiskLabel(period, "ok");

    row.appendChild(risk);
    return row;
  }

  function buildCardRow(labelText, fieldName, valueText) {
    const row = document.createElement("div");
    row.className = "rolling-vine-row";

    const label = document.createElement("span");
    label.textContent = labelText;

    const value = document.createElement("strong");
    value.setAttribute("data-field", fieldName);
    value.textContent = valueText;

    row.appendChild(label);
    row.appendChild(value);

    return row;
  }

  function buildStatusInfoRow() {
    const row = document.createElement("div");
    row.className = "rolling-vine-row rolling-vine-status-info-row";

    const value = document.createElement("strong");
    value.setAttribute("data-field", "statusInfo");
    value.textContent = "";

    row.appendChild(value);
    return row;
  }

  function wireDonationLinks() {
    for (const link of rootEl.querySelectorAll("[data-donation]")) {
      const key = link.getAttribute("data-donation");
      const url = RollingVineCore.DONATION_LINKS[key];
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const img = link.querySelector("img");
      if (img) {
        img.src = chrome.runtime.getURL(`/content/assets/${key}.svg`);
      }
    }
  }

  async function hydrateAccountUI() {
    if (rootEl && !rootEl.isConnected) {
      rootEl = null;
    }

    if (!rootEl) {
      const existingRoot = document.querySelector(".rolling-vine-root");
      if (existingRoot) {
        rootEl = existingRoot;
      }
    }

    if (!rootEl) {
      return;
    }

    const [metrics, syncState] = await Promise.all([
      RollingVineStorage.getMetrics(),
      RollingVineStorage.getSyncState()
    ]);

    const syncValue = rootEl.querySelector("[data-sync-value]");
    const syncStage = rootEl.querySelector("[data-sync-stage]");
    const syncBtn = rootEl.querySelector(".rolling-vine-sync-btn");

    if (!syncValue || !syncStage || !syncBtn) {
      rootEl = null;
      return;
    }

    syncValue.textContent = syncState.lastSuccessAt
      ? new Date(syncState.lastSuccessAt).toLocaleString()
      : ui.never;

    if (syncState.isRunning) {
      syncStage.textContent = syncState.stage === "orders" ? ui.syncingOrders : ui.syncingReviews;
      syncBtn.disabled = true;
      syncBtn.classList.add("is-syncing");
    } else if (syncState.status === "safe-stopped") {
      syncStage.textContent = getSafeStopMessage(syncState);
      syncBtn.disabled = false;
      syncBtn.classList.remove("is-syncing");
    } else {
      syncStage.textContent = "";
      syncBtn.disabled = false;
      syncBtn.classList.remove("is-syncing");
    }

    if (!metrics || !metrics.periods) {
      return;
    }

    for (const period of RollingVineCore.PERIODS) {
      const card = rootEl.querySelector(`.rolling-vine-card[data-period="${period}"]`);
      if (!card) {
        continue;
      }
      const periodMetrics = metrics.periods[period];
      if (!periodMetrics) {
        continue;
      }

      card.querySelector('[data-field="orders"]').textContent = String(periodMetrics.orders || 0);
      card.querySelector('[data-field="reviews"]').textContent = String(periodMetrics.reviews || 0);
      card.querySelector('[data-field="rate"]').textContent =
        periodMetrics.rate === null ? ui.rateNA : `${periodMetrics.rate.toFixed(1)}%`;

      const riskLevelField = card.querySelector('[data-field="riskLevel"]');
      if (riskLevelField) {
        riskLevelField.textContent = getRiskLabel(period, periodMetrics.status);
      }

      const statusInfoField = card.querySelector('[data-field="statusInfo"]');
      if (statusInfoField) {
        statusInfoField.textContent = computeStatusInfo(periodMetrics);
      }

      card.classList.toggle("is-risk", periodMetrics.status === "at-risk");
    }
  }

  function computeStatusInfo(periodMetrics) {
    const { status, reviews, orders } = periodMetrics;

    if (status === "ok") {
      if (orders === 0) {
        return "";
      }
      const maxOrders = Math.floor(reviews / 0.6);
      const ordersAllowed = Math.max(0, maxOrders - orders);
      return ui.moreOrdersAllowed(ordersAllowed);
    }

    if (status === "at-risk") {
      const reviewsNeeded = Math.max(0, Math.ceil(orders * 0.6) - reviews);
      return ui.moreReviewsNeeded(reviewsNeeded);
    }

    return "";
  }

  function getRiskLabel(period, status) {
    if (status === "at-risk") {
      return ui.riskByPeriod[period] || ui.riskByPeriod[90];
    }

    return ui.neutralRiskLabel;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
