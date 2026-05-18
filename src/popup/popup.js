(async function () {
  const settings = await RollingVineStorage.getSettings();
  const ui = resolveLocale(settings);

  const popupEl = document.getElementById("rv-popup");
  const cardsEl = document.getElementById("rv-cards");
  const noDataEl = document.getElementById("rv-no-data");
  const settingsBtn = document.getElementById("rv-settings-btn");

  applyTheme(settings.theme);
  settingsBtn.title = ui.popup.settings;

  settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  const metrics = await RollingVineStorage.getMetrics();

  if (!metrics || !metrics.periods) {
    noDataEl.textContent = ui.popup.noData;
    noDataEl.hidden = false;
  } else {
    renderCards(metrics, settings);
  }

  function renderCards(metricsData, currentSettings) {
    const periods = currentSettings.visiblePeriods || [90, 60, 30];
    cardsEl.innerHTML = "";

    for (const period of RollingVineCore.PERIODS) {
      if (!periods.includes(period)) continue;
      const pm = metricsData.periods[period];
      if (!pm) continue;

      const card = document.createElement("div");
      card.className = "rv-popup-card";
      card.setAttribute("data-period", String(period));

      const title = document.createElement("div");
      title.className = "rv-popup-card-title";
      title.textContent = ui.periodTitle(period);
      card.appendChild(title);

      card.appendChild(makeRow(ui.labels.orders, String(pm.orders || 0)));
      card.appendChild(makeRow(ui.labels.reviews, String(pm.reviews || 0)));
      card.appendChild(makeRow(ui.labels.rate, pm.rate === null ? ui.rateNA : `${pm.rate.toFixed(1)}%`));

      const riskDiv = document.createElement("div");
      riskDiv.className = "rv-popup-card-risk";
      riskDiv.textContent = getRiskLabel(period, pm.status);
      card.appendChild(riskDiv);

      const infoDiv = document.createElement("div");
      infoDiv.className = "rv-popup-card-status-info";
      infoDiv.textContent = computeStatusInfo(pm);
      card.appendChild(infoDiv);

      card.classList.toggle("is-risk", pm.status === "at-risk");
      cardsEl.appendChild(card);
    }
  }

  function makeRow(label, value) {
    const row = document.createElement("div");
    row.className = "rv-popup-card-row";
    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    const valueStrong = document.createElement("strong");
    valueStrong.textContent = value;
    row.appendChild(labelSpan);
    row.appendChild(valueStrong);
    return row;
  }

  function getRiskLabel(period, status) {
    if (status === "at-risk") return ui.riskByPeriod[period] || ui.riskByPeriod[90];
    if (status === "ok") return ui.neutralRiskLabel;
    return ui.firstScanNeeded;
  }

  function computeStatusInfo(pm) {
    if (pm.status === "ok") {
      if (pm.orders === 0) return "";
      const maxOrders = Math.floor(pm.reviews / 0.6);
      const ordersAllowed = Math.max(0, maxOrders - pm.orders);
      return ui.moreOrdersAllowed(ordersAllowed);
    }
    if (pm.status === "at-risk") {
      const reviewsNeeded = Math.max(0, Math.ceil(pm.orders * 0.6) - pm.reviews);
      return ui.moreReviewsNeeded(reviewsNeeded);
    }
    return "";
  }

  function applyTheme(theme) {
    if (theme === "dark") {
      popupEl.classList.add("rv-dark");
    } else if (theme === "light") {
      popupEl.classList.remove("rv-dark");
    } else {
      popupEl.classList.toggle("rv-dark", detectForcedDarkMode());
    }
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
        (document.body && document.body.classList.contains("totl-dark"))) {
      return true;
    }
    const bg = window.getComputedStyle(document.body).backgroundColor;
    const matchRgba = bg.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (matchRgba) {
      const alpha = parseFloat(matchRgba[4]);
      if (alpha === 0) return false;
      const r = parseInt(matchRgba[1], 10);
      const g = parseInt(matchRgba[2], 10);
      const b = parseInt(matchRgba[3], 10);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (luminance < 0.3) return true;
    }
    const matchRgb = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (matchRgb) {
      const r = parseInt(matchRgb[1], 10);
      const g = parseInt(matchRgb[2], 10);
      const b = parseInt(matchRgb[3], 10);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (luminance < 0.3) return true;
    }
    return false;
  }

  function resolveLocale(currentSettings) {
    if (currentSettings.language && currentSettings.language !== "auto") {
      return RollingVineI18n.resolveUiStrings(hostForLocale(currentSettings.language));
    }
    return RollingVineI18n.resolveUiStrings("www.amazon.com");
  }

  function hostForLocale(locale) {
    const map = { en: "www.amazon.com", it: "www.amazon.it", es: "www.amazon.es", de: "www.amazon.de", fr: "www.amazon.fr", ja: "www.amazon.co.jp" };
    return map[locale] || "www.amazon.com";
  }
})();
