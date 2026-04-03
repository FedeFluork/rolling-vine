(function () {
  const PERIODS = [90, 60, 30];
  const RISK_THRESHOLD = 60;
  const DONATION_LINKS = {
    kofi: "https://ko-fi.com/fedefluork",
    paypal: "https://paypal.me/FedeFluork"
  };

  const MONTHS = {
    gennaio: 1,
    january: 1,
    jan: 1,
    febbraio: 2,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    marzo: 3,
    april: 4,
    apr: 4,
    aprile: 4,
    may: 5,
    maggio: 5,
    june: 6,
    jun: 6,
    giugno: 6,
    july: 7,
    jul: 7,
    luglio: 7,
    august: 8,
    aug: 8,
    agosto: 8,
    september: 9,
    sep: 9,
    settembre: 9,
    october: 10,
    oct: 10,
    ottobre: 10,
    november: 11,
    nov: 11,
    novembre: 11,
    december: 12,
    dec: 12,
    dicembre: 12,
    januar: 1,
    februar: 2,
    maerz: 3,
    marz: 3,
    mai: 5,
    juni: 6,
    juli: 7,
    oktober: 10,
    dezember: 12,
    janvier: 1,
    fevrier: 2,
    mars: 3,
    avril: 4,
    juin: 6,
    juillet: 7,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    decembre: 12,
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12
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

  function makeUtcDate(year, month, day) {
    if (!year || !month || !day) {
      return null;
    }
    if (year < 100) {
      year += 2000;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function parseNumericDate(text, localeHint) {
    const match = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
    if (!match) {
      return null;
    }
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);

    let day = first;
    let month = second;

    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      day = second;
      month = first;
    } else if (/en-us/i.test(localeHint || "")) {
      month = first;
      day = second;
    }

    return makeUtcDate(year, month, day);
  }

  function parseMonthWordDate(text) {
    const normalized = normalizeText(text);

    const dayFirst = normalized.match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{2,4})\b/);
    if (dayFirst && MONTHS[dayFirst[2]]) {
      return makeUtcDate(Number(dayFirst[3]), MONTHS[dayFirst[2]], Number(dayFirst[1]));
    }

    const monthFirst = normalized.match(/\b([a-z]+)\s+(\d{1,2}),?\s+(\d{2,4})\b/);
    if (monthFirst && MONTHS[monthFirst[1]]) {
      return makeUtcDate(Number(monthFirst[3]), MONTHS[monthFirst[1]], Number(monthFirst[2]));
    }

    return null;
  }

  function parseIsoDate(text) {
    const match = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (!match) {
      return null;
    }
    return makeUtcDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  function extractDateFromText(text, localeHint) {
    if (!text) {
      return null;
    }

    return (
      parseIsoDate(text) ||
      parseNumericDate(text, localeHint) ||
      parseMonthWordDate(text)
    );
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
    extractDateFromText,
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
