(() => {
  const ACCOUNT_PATH_REGEX = /^\/vine\/account\/?$/;
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
  let currentSettings = null;
  let delegationAttached = false;
  let ui = RollingVineI18n.resolveUiStrings(location.hostname);

  window.addEventListener("error", (event) => {
    console.error(`${LOG_PREFIX} uncaught error`, event.message, event.filename, event.lineno);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error(`${LOG_PREFIX} unhandled rejection`, event.reason);
  });

  init();

  async function init() {
    currentSettings = await RollingVineStorage.getSettings();
    if (currentSettings.language && currentSettings.language !== "auto") {
      const hostMap = { en: "www.amazon.com", it: "www.amazon.it", es: "www.amazon.es", de: "www.amazon.de", fr: "www.amazon.fr", ja: "www.amazon.co.jp" };
      ui = RollingVineI18n.resolveUiStrings(hostMap[currentSettings.language] || location.hostname);
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.type) {
        return;
      }

      if (message.type === "rollingVine.triggerSync") {
        if (isAccountPage()) {
          triggerSyncFromPopup().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
          return true;
        }
        sendResponse({ ok: false });
        return;
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
      delegationAttached = false;
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

  async function triggerSyncFromPopup() {
    const syncBtn = rootEl && rootEl.querySelector(".rolling-vine-sync-btn");
    if (syncBtn && !syncBtn.disabled) {
      syncBtn.click();
      return;
    }
    await sendRuntimeMessage({
      type: "rollingVine.startSync",
      origin: location.origin,
      pageUrl: location.href
    });
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

  async function mountAccountUI() {
    if (rootEl && !rootEl.isConnected) {
      rootEl = null;
      delegationAttached = false;
    }

    if (rootEl && rootEl.isConnected) {
      ensureDelegation();
      return;
    }

    const existingRoot = document.querySelector(".rolling-vine-root");
    if (existingRoot) {
      rootEl = existingRoot;
      ensureDelegation();
      return;
    }

    const dashboard = document.getElementById("vvp-account-dashboard");
    if (!dashboard) {
      const fallback = findAccountAnchor();
      if (!fallback) return;
      rootEl = document.createElement("section");
      rootEl.className = "rolling-vine-root";
      rootEl.appendChild(buildAccountLayout());
      fallback.appendChild(rootEl);
    } else {
      const rows = dashboard.querySelectorAll(":scope > .a-row");
      const wrapperRow = document.createElement("div");
      wrapperRow.className = "a-row";
      rootEl = document.createElement("section");
      rootEl.className = "rolling-vine-root";
      rootEl.appendChild(buildAccountLayout());
      wrapperRow.appendChild(rootEl);

      if (currentSettings && currentSettings.placement === "above") {
        const refRow = rows.length >= 1 ? rows[0] : null;
        if (refRow) {
          refRow.after(wrapperRow);
        } else {
          dashboard.appendChild(wrapperRow);
        }
      } else {
        const refRow = rows.length >= 2 ? rows[1] : rows[rows.length - 1] || null;
        if (refRow) {
          refRow.after(wrapperRow);
        } else {
          dashboard.appendChild(wrapperRow);
        }
      }
    }

    wireDonationLinks();

    const syncImg = rootEl.querySelector(".rolling-vine-sync-icon");
    if (syncImg) {
      syncImg.src = chrome.runtime.getURL("/content/assets/sync.svg");
    }

    ensureDelegation();
    observeDarkModeChanges();
  }

  function ensureDelegation() {
    if (delegationAttached || !rootEl) {
      return;
    }

    rootEl.addEventListener("click", async (event) => {
      const settingsBtn = event.target.closest(".rolling-vine-settings-btn");
      if (settingsBtn) {
        sendRuntimeMessage({ type: "rollingVine.openOptions" }).catch(() => undefined);
        return;
      }

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

    delegationAttached = true;
  }

  function findAccountAnchor() {
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

    const titleWrap = document.createElement("div");
    titleWrap.className = "rolling-vine-title-wrap";

    const titleIcon = document.createElement("img");
    titleIcon.className = "rolling-vine-title-icon";
    titleIcon.alt = "Rolling Vine";
    titleIcon.src = chrome.runtime.getURL("/assets/icon48.png");

    const title = document.createElement("h3");
    title.className = "rolling-vine-title";
    title.textContent = "Rolling Vine";

    titleWrap.appendChild(titleIcon);
    titleWrap.appendChild(title);

    const settingsBtn = document.createElement("button");
    settingsBtn.className = "rolling-vine-settings-btn";
    settingsBtn.type = "button";
    settingsBtn.title = (ui.popup && ui.popup.settings) || "Settings";
    settingsBtn.setAttribute("aria-label", (ui.popup && ui.popup.settings) || "Settings");
    settingsBtn.innerHTML =
      '<svg class="rolling-vine-settings-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-1.42 3.42 2 2 0 01-1.42-.59l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-3.42-1.42 2 2 0 01.59-1.42l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 011.42-3.42 2 2 0 011.42.59l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001.08 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 013.42 1.42 2 2 0 01-.59 1.42l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1.08z"></path></svg>';

    const syncBtn = document.createElement("button");
    syncBtn.className = "rolling-vine-sync-btn";
    syncBtn.type = "button";

    const syncIcon = document.createElement("img");
    syncIcon.className = "rolling-vine-sync-icon";
    syncIcon.alt = ui.syncIconAlt;

    syncBtn.appendChild(syncIcon);
    syncBtn.appendChild(document.createTextNode(ui.syncButton));

    const lastSync = document.createElement("div");
    lastSync.className = "rolling-vine-last-sync";
    lastSync.appendChild(document.createTextNode(`${ui.lastSyncLabel} `));

    const syncValue = document.createElement("span");
    syncValue.setAttribute("data-sync-value", "");
    syncValue.textContent = ui.never;
    lastSync.appendChild(syncValue);

    const buttonsRow = document.createElement("div");
    buttonsRow.className = "rolling-vine-buttons-row";
    buttonsRow.appendChild(settingsBtn);
    buttonsRow.appendChild(syncBtn);

    const syncGroup = document.createElement("div");
    syncGroup.className = "rolling-vine-sync-group";
    syncGroup.appendChild(buttonsRow);
    syncGroup.appendChild(lastSync);

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "rolling-vine-actions";
    actionsWrap.appendChild(syncGroup);

    headerRow.appendChild(titleWrap);
    headerRow.appendChild(actionsWrap);

    const stage = document.createElement("div");
    stage.className = "rolling-vine-stage";
    stage.setAttribute("data-sync-stage", "");

    const separator = document.createElement("hr");
    separator.className = "rolling-vine-separator";

    const grid = document.createElement("div");
    grid.className = "rolling-vine-grid";
    const visiblePeriods = (currentSettings && currentSettings.visiblePeriods) || [90, 60, 30];
    for (const period of RollingVineCore.PERIODS) {
      if (visiblePeriods.includes(period)) {
        grid.appendChild(buildCard(period));
      }
    }

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
    fragment.appendChild(stage);
    fragment.appendChild(separator);
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
    card.appendChild(buildProgressBarRow());
    card.appendChild(buildStatusInfoRow());

    return card;
  }

  function buildRiskRow(period) {
    const row = document.createElement("div");
    row.className = "rolling-vine-row rolling-vine-risk-row";

    const risk = document.createElement("strong");
    risk.setAttribute("data-field", "riskLevel");
    risk.textContent = ui.firstScanNeeded;

    row.appendChild(risk);
    return row;
  }

  function buildProgressBarRow() {
    const bar = document.createElement("div");
    bar.className = "rolling-vine-progress-bar";
    bar.setAttribute("data-field", "progressBar");
    return bar;
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
      delegationAttached = false;
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
      delegationAttached = false;
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
      const visiblePeriods = (currentSettings && currentSettings.visiblePeriods) || [90, 60, 30];
      if (!visiblePeriods.includes(period)) continue;
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

      const progressBarEl = card.querySelector('[data-field="progressBar"]');
      if (progressBarEl) {
        hydrateProgressBar(progressBarEl, periodMetrics);
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

  function hydrateProgressBar(barEl, pm) {
    barEl.innerHTML = "";
    const orders = pm.orders || 0;
    const reviews = pm.reviews || 0;
    const hasApprovedData = "approvedReviews" in pm;
    const approved = hasApprovedData ? (pm.approvedReviews || 0) : reviews;
    const pending = Math.max(0, reviews - approved);
    const remaining = Math.max(0, orders - reviews);
    const total = approved + pending + remaining;

    if (total === 0) return;

    const segments = [
      { className: "rolling-vine-progress-segment--approved", value: approved, label: ui.progressBar.approved },
      { className: "rolling-vine-progress-segment--pending", value: pending, label: ui.progressBar.pending },
      { className: "rolling-vine-progress-segment--remaining", value: remaining, label: ui.progressBar.remaining }
    ];

    for (const seg of segments) {
      if (seg.value === 0) continue;
      const pct = (seg.value / total) * 100;
      const el = document.createElement("div");
      el.className = `rolling-vine-progress-segment ${seg.className}`;
      el.style.width = `${pct}%`;

      const tooltip = document.createElement("span");
      tooltip.className = "rolling-vine-progress-tooltip";
      tooltip.textContent = `${seg.label}: ${seg.value}`;
      el.appendChild(tooltip);

      el.addEventListener("mouseenter", () => {
        tooltip.style.removeProperty("left");
        tooltip.style.removeProperty("--tooltip-arrow-shift");
        requestAnimationFrame(() => {
          const rect = tooltip.getBoundingClientRect();
          const MARGIN = 6;
          if (rect.left < MARGIN) {
            const shift = Math.ceil(MARGIN - rect.left);
            tooltip.style.left = `calc(50% + ${shift}px)`;
            tooltip.style.setProperty("--tooltip-arrow-shift", `${shift}px`);
          } else if (rect.right > window.innerWidth - MARGIN) {
            const shift = Math.ceil(rect.right - (window.innerWidth - MARGIN));
            tooltip.style.left = `calc(50% - ${shift}px)`;
            tooltip.style.setProperty("--tooltip-arrow-shift", `-${shift}px`);
          }
        });
      });

      barEl.appendChild(el);
    }

    const threshold = document.createElement("div");
    threshold.className = "rolling-vine-progress-threshold";
    threshold.style.left = "60%";
    barEl.appendChild(threshold);
  }

  function getRiskLabel(period, status) {
    if (status === "at-risk") {
      return ui.riskByPeriod[period] || ui.riskByPeriod[90];
    }

    if (status === "ok") {
      return ui.neutralRiskLabel;
    }

    return ui.firstScanNeeded;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function detectForcedDarkMode() {
    if (document.documentElement.hasAttribute("data-darkreader-mode") ||
        document.documentElement.hasAttribute("data-darkreader-scheme") ||
        document.querySelector('meta[name="darkreader"]') ||
        document.querySelector('style.darkreader') ||
        document.querySelector('style[class*="darkreader"]')) {
      return true;
    }

    if (document.documentElement.classList.contains("totl-dark") ||
        document.body && document.body.classList.contains("totl-dark")) {
      return true;
    }

    const bg = window.getComputedStyle(document.body).backgroundColor;
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (luminance < 0.3) {
        return true;
      }
    }

    return false;
  }

  function applyDarkModeClass() {
    if (!rootEl) return;
    let isDark;
    if (currentSettings && currentSettings.theme === "dark") {
      isDark = true;
    } else if (currentSettings && currentSettings.theme === "light") {
      isDark = false;
    } else {
      isDark = detectForcedDarkMode();
    }
    rootEl.classList.toggle("rolling-vine-dark", isDark);
  }

  function observeDarkModeChanges() {
    applyDarkModeClass();

    const observer = new MutationObserver(() => {
      applyDarkModeClass();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-darkreader-mode", "data-darkreader-scheme", "class", "style"]
    });

    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style"]
      });
    }

    observer.observe(document.head, {
      childList: true,
      subtree: true
    });
  }
})();
