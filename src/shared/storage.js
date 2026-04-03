(function () {
  const STORAGE_KEYS = {
    syncState: "rollingVine.syncState",
    metrics: "rollingVine.metrics"
  };

  function callChrome(method, ...args) {
    return new Promise((resolve, reject) => {
      method(...args, (result) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(result);
      });
    });
  }

  function getStorage(keys) {
    return callChrome(chrome.storage.local.get.bind(chrome.storage.local), keys);
  }

  function setStorage(value) {
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
