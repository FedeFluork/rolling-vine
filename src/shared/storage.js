(function () {
  const STORAGE_KEYS = {
    syncState: "rollingVine.syncState",
    metrics: "rollingVine.metrics"
  };

  const hasBrowserStorage =
    typeof globalThis.browser !== "undefined" &&
    globalThis.browser &&
    globalThis.browser.storage &&
    globalThis.browser.storage.local;

  function callChrome(method, ...args) {
    return new Promise((resolve, reject) => {
      let settled = false;

      function finishWithError(error) {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      }

      function finishWithResult(result) {
        if (settled) {
          return;
        }
        settled = true;
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(result);
      }

      try {
        const maybePromise = method(...args, finishWithResult);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(finishWithResult).catch((error) => {
            finishWithError(error instanceof Error ? error : new Error(String(error)));
          });
        }
      } catch (error) {
        finishWithError(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  function getStorage(keys) {
    if (hasBrowserStorage) {
      return globalThis.browser.storage.local.get(keys);
    }
    return callChrome(chrome.storage.local.get.bind(chrome.storage.local), keys);
  }

  function setStorage(value) {
    if (hasBrowserStorage) {
      return globalThis.browser.storage.local.set(value);
    }
    return callChrome(chrome.storage.local.set.bind(chrome.storage.local), value);
  }

  async function getSyncState() {
    const data = await getStorage([STORAGE_KEYS.syncState]);
    return (
      data[STORAGE_KEYS.syncState] || {
        status: "idle",
        lastSuccessAt: null,
        lastError: null,
        stage: null,
        isRunning: false
      }
    );
  }

  async function setSyncState(nextState) {
    const current = await getSyncState();
    const merged = { ...current, ...nextState };
    await setStorage({ [STORAGE_KEYS.syncState]: merged });
    return merged;
  }

  async function getMetrics() {
    const data = await getStorage([STORAGE_KEYS.metrics]);
    return data[STORAGE_KEYS.metrics] || null;
  }

  async function setMetrics(metrics) {
    await setStorage({ [STORAGE_KEYS.metrics]: metrics });
    return metrics;
  }

  const api = {
    STORAGE_KEYS,
    getSyncState,
    setSyncState,
    getMetrics,
    setMetrics
  };

  globalThis.RollingVineStorage = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
