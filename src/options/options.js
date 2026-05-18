(async function () {
  const settings = await RollingVineStorage.getSettings();
  const ui = resolveLocale(settings);

  const optionsEl = document.getElementById("rv-options");
  const form = document.getElementById("rv-form");
  const toast = document.getElementById("rv-toast");

  applyTheme(settings.theme);
  populateLabels(ui);
  populateForm(settings);

  form.addEventListener("change", saveSettings);

  document.getElementById("rv-reset-btn").addEventListener("click", async () => {
    if (!confirm(ui.options.resetConfirm)) return;
    await RollingVineStorage.clearAll();
    showToast(ui.options.saved);
    setTimeout(() => location.reload(), 600);
  });

  async function saveSettings() {
    const data = readForm();
    await RollingVineStorage.setSettings(data);

    if (data.theme !== settings.theme) {
      applyTheme(data.theme);
    }

    showToast(ui.options.saved);
  }

  function readForm() {
    const theme = form.querySelector('input[name="theme"]:checked').value;
    const placement = form.querySelector('input[name="placement"]:checked').value;
    const period60 = form.querySelector('input[name="period60"]').checked;
    const period30 = form.querySelector('input[name="period30"]').checked;
    const language = form.querySelector('select[name="language"]').value;

    const visiblePeriods = [90];
    if (period60) visiblePeriods.push(60);
    if (period30) visiblePeriods.push(30);

    return { theme, placement, visiblePeriods, language };
  }

  function populateForm(s) {
    form.querySelector(`input[name="theme"][value="${s.theme}"]`).checked = true;
    form.querySelector(`input[name="placement"][value="${s.placement}"]`).checked = true;
    form.querySelector('input[name="period60"]').checked = s.visiblePeriods.includes(60);
    form.querySelector('input[name="period30"]').checked = s.visiblePeriods.includes(30);
    form.querySelector('select[name="language"]').value = s.language;
  }

  function populateLabels(u) {
    document.getElementById("rv-title").textContent = u.options.title;
    document.getElementById("rv-notice").textContent = u.options.savedNotice;
    document.getElementById("rv-theme-label").textContent = u.options.themeLabel;
    document.getElementById("rv-theme-auto").textContent = u.options.themeAuto;
    document.getElementById("rv-theme-light").textContent = u.options.themeLight;
    document.getElementById("rv-theme-dark").textContent = u.options.themeDark;
    document.getElementById("rv-placement-label").textContent = u.options.placementLabel;
    document.getElementById("rv-placement-above").textContent = u.options.placementAbove;
    document.getElementById("rv-placement-below").textContent = u.options.placementBelow;
    document.getElementById("rv-visibility-label").textContent = u.options.visibilityLabel;
    document.getElementById("rv-days90").textContent = u.options.days90;
    document.getElementById("rv-days60").textContent = u.options.days60;
    document.getElementById("rv-days30").textContent = u.options.days30;
    document.getElementById("rv-language-label").textContent = u.options.languageLabel;
    document.getElementById("rv-lang-auto").textContent = u.options.languageAuto;
    document.getElementById("rv-reset-btn").textContent = u.options.resetButton;
    document.title = u.options.title;
  }

  function applyTheme(theme) {
    if (theme === "dark") {
      document.body.classList.add("rv-dark");
    } else if (theme === "light") {
      document.body.classList.remove("rv-dark");
    } else {
      document.body.classList.toggle("rv-dark", detectForcedDarkMode());
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
    const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
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

  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.hidden = true; }, 2500);
  }
})();
