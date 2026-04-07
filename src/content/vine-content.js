(() => {
  const ACCOUNT_PATH_REGEX = /^\/vine\/account\/?$/;
  const ORDERS_PATH = "/vine/orders";
  const REVIEWS_PATH = "/vine/vine-reviews";
  const LOG_PREFIX = "[rolling-vine/content]";
  const HYDRATE_RETRY_DELAYS_MS = [0, 250, 800, 1600];

  let rootEl = null;
  let lastKnownHref = location.href;

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

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response);
      });
    });
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
      'span.vvp-order-date[data-order-timestamp]'
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
      'span.vvp-order-date[data-order-timestamp]'
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

    const syncBtn = rootEl.querySelector(".rolling-vine-sync-btn");
    syncBtn.addEventListener("click", async () => {
      syncBtn.disabled = true;
      syncBtn.classList.add("is-syncing");
      const syncStage = rootEl.querySelector("[data-sync-stage]");
      if (syncStage) {
        syncStage.textContent = "Starting sync...";
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
          syncStage.textContent = "Syncing orders...";
        }
      } catch (error) {
        const reason = error && error.message ? error.message : String(error);
        console.error(`${LOG_PREFIX} sync click failed`, error && error.stack ? error.stack : error);
        syncBtn.classList.remove("is-syncing");

        if (syncStage) {
          syncStage.textContent = `Sync failed to start: ${reason}`;
        }
      } finally {
        setTimeout(() => {
          hydrateAccountUI().catch(() => undefined);
        }, 450);
      }
    });

    wireDonationLinks();

    const syncImg = syncBtn.querySelector(".rolling-vine-sync-icon");
    if (syncImg) {
      syncImg.src = chrome.runtime.getURL("/content/assets/sync.svg");
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
    syncIcon.alt = "Sync icon";

    syncBtn.appendChild(syncIcon);
    syncBtn.appendChild(document.createTextNode("Sync my Vine history"));
    headerRow.appendChild(title);
    headerRow.appendChild(syncBtn);

    const lastSync = document.createElement("div");
    lastSync.className = "rolling-vine-last-sync";
    lastSync.appendChild(document.createTextNode("Last sync: "));

    const syncValue = document.createElement("span");
    syncValue.setAttribute("data-sync-value", "");
    syncValue.textContent = "Never";
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
    donationLabel.textContent = "Support this extension:";

    const kofiLink = document.createElement("a");
    kofiLink.href = "#";
    kofiLink.className = "rolling-vine-donate-btn rolling-vine-donate-kofi";
    kofiLink.setAttribute("data-donation", "kofi");
    kofiLink.setAttribute("aria-label", "Donate with Ko-fi");
    const kofiImg = document.createElement("img");
    kofiImg.alt = "Ko-fi";
    kofiLink.appendChild(kofiImg);

    const paypalLink = document.createElement("a");
    paypalLink.href = "#";
    paypalLink.className = "rolling-vine-donate-btn rolling-vine-donate-paypal";
    paypalLink.setAttribute("data-donation", "paypal");
    paypalLink.setAttribute("aria-label", "Donate with PayPal");
    const paypalImg = document.createElement("img");
    paypalImg.alt = "PayPal";
    paypalLink.appendChild(paypalImg);

    donation.appendChild(donationLabel);
    donation.appendChild(kofiLink);
    donation.appendChild(paypalLink);

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
    title.textContent = `Last ${period} days`;
    card.appendChild(title);

    card.appendChild(buildCardRow("Orders", "orders", "0"));
    card.appendChild(buildCardRow("Reviews", "reviews", "0"));
    card.appendChild(buildCardRow("Review rate", "rate", "N/A"));
    card.appendChild(buildCardRow("Status", "status", "OK"));

    return card;
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
      : "Never";

    if (syncState.isRunning) {
      syncStage.textContent = syncState.stage === "orders" ? "Syncing orders..." : "Syncing completed reviews...";
      syncBtn.disabled = true;
      syncBtn.classList.add("is-syncing");
    } else if (syncState.status === "safe-stopped" && syncState.lastError) {
      syncStage.textContent = `Sync stopped safely: ${syncState.lastError}`;
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
        periodMetrics.rate === null ? "N/A" : `${periodMetrics.rate.toFixed(1)}%`;
      card.querySelector('[data-field="status"]').textContent =
        periodMetrics.status === "at-risk" ? "At risk" : "OK";

      card.classList.toggle("is-risk", periodMetrics.status === "at-risk");
    }
  }
})();
