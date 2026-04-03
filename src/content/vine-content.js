(() => {
  const ACCOUNT_PATH = "/vine/account";
  const ORDERS_PATH = "/vine/orders";
  const REVIEWS_PATH = "/vine/vine-reviews";

  let rootEl = null;

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
      mountAccountUI().catch(() => undefined);
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") {
          return;
        }
        if (changes[RollingVineStorage.STORAGE_KEYS.metrics] || changes[RollingVineStorage.STORAGE_KEYS.syncState]) {
          hydrateAccountUI().catch(() => undefined);
        }
      });
    }
  }

  function isAccountPage() {
    return location.pathname === ACCOUNT_PATH;
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
    if (rootEl) {
      return;
    }

    const anchor = findAccountAnchor();
    if (!anchor) {
      return;
    }

    rootEl = document.createElement("section");
    rootEl.className = "rolling-vine-root";
    rootEl.innerHTML = buildAccountMarkup();
    anchor.appendChild(rootEl);

    const syncBtn = rootEl.querySelector(".rolling-vine-sync-btn");
    syncBtn.addEventListener("click", async () => {
      syncBtn.disabled = true;
      await chrome.runtime.sendMessage({ type: "rollingVine.startSync" });
      await hydrateAccountUI();
    });

    wireDonationLinks();

    const syncImg = syncBtn.querySelector(".rolling-vine-sync-icon");
    if (syncImg) {
      syncImg.src = chrome.runtime.getURL("/content/assets/sync.svg");
    }

    await hydrateAccountUI();
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

  function buildAccountMarkup() {
    return `
      <div class="rolling-vine-header-row">
        <h3 class="rolling-vine-title">Rolling Vine</h3>
        <button class="rolling-vine-sync-btn" type="button">
          <img alt="Sync icon" class="rolling-vine-sync-icon">
          Sync my Vine history
        </button>
      </div>
      <div class="rolling-vine-last-sync">Last sync: <span data-sync-value>Never</span></div>
      <div class="rolling-vine-stage" data-sync-stage></div>
      <div class="rolling-vine-grid">
        ${buildCard(90)}
        ${buildCard(60)}
        ${buildCard(30)}
      </div>
      <div class="rolling-vine-donation">
        <span class="rolling-vine-donation-label">Support this extension:</span>
        <a href="#" data-donation="kofi" class="rolling-vine-donate-btn rolling-vine-donate-kofi" aria-label="Donate with Ko-fi">
          <img alt="Ko-fi">
        </a>
        <a href="#" data-donation="paypal" class="rolling-vine-donate-btn rolling-vine-donate-paypal" aria-label="Donate with PayPal">
          <img alt="PayPal">
        </a>
      </div>
    `;
  }

  function buildCard(period) {
    return `
      <article class="rolling-vine-card" data-period="${period}">
        <h4>Last ${period} days</h4>
        <div class="rolling-vine-row"><span>Orders</span><strong data-field="orders">0</strong></div>
        <div class="rolling-vine-row"><span>Reviews</span><strong data-field="reviews">0</strong></div>
        <div class="rolling-vine-row"><span>Review rate</span><strong data-field="rate">N/A</strong></div>
        <div class="rolling-vine-row"><span>Status</span><strong data-field="status">OK</strong></div>
      </article>
    `;
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
