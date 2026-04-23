(function () {
  const PERIODS = [90, 60, 30];
  const RISK_THRESHOLD = 60;
  const DONATION_LINKS = {
    kofi: "https://ko-fi.com/fedefluork",
    paypal: "https://paypal.me/FedeFluork"
  };

  function normalizeText(value) {
    return (value || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function daysAgoBucket(dateMs, nowMs) {
    const delta = nowMs - dateMs;
    if (delta < 0) {
      return null;
    }
    return Math.floor(delta / (24 * 60 * 60 * 1000));
  }

  function emptyMetrics() {
    return {
      periods: {
        90: { orders: 0, reviews: 0, rate: null, status: "ok" },
        60: { orders: 0, reviews: 0, rate: null, status: "ok" },
        30: { orders: 0, reviews: 0, rate: null, status: "ok" }
      },
      generatedAt: null
    };
  }

  function computeRate(reviews, orders) {
    if (!orders) {
      return null;
    }
    return Math.round((reviews / orders) * 1000) / 10;
  }

  function computeStatus(rate) {
    if (rate === null) {
      return "ok";
    }
    return rate < RISK_THRESHOLD ? "at-risk" : "ok";
  }

  function buildMetrics(orderDates, reviewDates, nowMs) {
    const metrics = emptyMetrics();

    for (const dateMs of orderDates) {
      const age = daysAgoBucket(dateMs, nowMs);
      if (age === null || age > 90) {
        continue;
      }
      if (age <= 90) {
        metrics.periods[90].orders += 1;
      }
      if (age <= 60) {
        metrics.periods[60].orders += 1;
      }
      if (age <= 30) {
        metrics.periods[30].orders += 1;
      }
    }

    for (const dateMs of reviewDates) {
      const age = daysAgoBucket(dateMs, nowMs);
      if (age === null || age > 90) {
        continue;
      }
      if (age <= 90) {
        metrics.periods[90].reviews += 1;
      }
      if (age <= 60) {
        metrics.periods[60].reviews += 1;
      }
      if (age <= 30) {
        metrics.periods[30].reviews += 1;
      }
    }

    for (const period of PERIODS) {
      const periodMetrics = metrics.periods[period];
      periodMetrics.rate = computeRate(periodMetrics.reviews, periodMetrics.orders);
      periodMetrics.status = computeStatus(periodMetrics.rate);
    }

    metrics.generatedAt = new Date(nowMs).toISOString();
    return metrics;
  }

  const api = {
    DONATION_LINKS,
    PERIODS,
    RISK_THRESHOLD,
    buildMetrics,
    computeRate,
    computeStatus,
    normalizeText,
    daysAgoBucket
  };

  globalThis.RollingVineCore = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
