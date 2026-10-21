/* Toman Price - popup logic (multi-currency) */
(() => {
  "use strict";

  // Currencies shown in the popup. `sample` is only used for the preview.
  const CURRENCIES = [
    { code: "AED", sample: 130000, defaultRate: 63500 },
    { code: "KWD", sample: 500, defaultRate: 760000 },
  ];
  const RATES_KEY = "dztRates";
  const LAST_FETCH_KEY = "dztLastFetch";
  // Navasan.net publishes its live Toman rates as JSON; the AED/KWD keys are
  // the lower-case currency codes.
  const NAVASAN_URL = "https://www.navasan.net/last_currencies.php";
  const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  const rates = {};
  CURRENCIES.forEach((c) => (rates[c.code] = c.defaultRate));

  const enabledInput = document.getElementById("enabled");
  const ratesEl = document.getElementById("rates");
  const previewsEl = document.getElementById("previews");
  const hintEl = document.getElementById("hint");
  const savedEl = document.getElementById("saved");
  const updateBtn = document.getElementById("update");
  const updateStatusEl = document.getElementById("update-status");
  const DEFAULT_HINT = hintEl.textContent;
  const inputs = {};

  let savedTimer = null;
  let lastFetchAt = null;
  let updating = false;

  function parseRate(raw) {
    const n = parseFloat(String(raw).replace(/[,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const fmt = (n) => nf.format(Math.round(n));

  function flashSaved() {
    savedEl.classList.add("show");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => savedEl.classList.remove("show"), 1200);
  }

  function updatePreview(code) {
    const out = previewsEl.querySelector('[data-preview="' + code + '"]');
    if (!out) return;
    const c = CURRENCIES.find((x) => x.code === code);
    const input = inputs[code];
    // Read the field directly so the preview updates as you type.
    const rate = input ? parseRate(input.value) : rates[code];
    out.textContent =
      rate != null ? fmt(c.sample * rate) + " Toman" : "\u2014";
  }

  function save() {
    const payload = {};
    CURRENCIES.forEach((c) => (payload[c.code] = rates[c.code]));
    chrome.storage.sync.set({ [RATES_KEY]: payload }, flashSaved);
  }

  function setHint(message, isError) {
    hintEl.textContent = message;
    hintEl.classList.toggle("error", !!isError);
  }

  /* ------------------------------------------------- live rates (Navasan) */

  function setUpdateStatus(message, isError) {
    updateStatusEl.textContent = message;
    updateStatusEl.classList.toggle("error", !!isError);
  }

  function formatRelative(ts) {
    if (!ts) return "not fetched yet";
    const minutes = Math.floor((Date.now() - ts) / 60000);
    if (minutes < 1) return "updated just now";
    if (minutes < 60) return "updated " + minutes + " min ago";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return "updated " + hours + " h ago";
    return "updated " + Math.floor(hours / 24) + " d ago";
  }

  function setUpdateLoading(loading) {
    updateBtn.classList.toggle("loading", loading);
    updateBtn.disabled = loading;
  }

  // Read "73,530" or 73530 out of Navasan's per-currency object.
  function navasanValue(data, code) {
    const entry = data && data[code.toLowerCase()];
    if (entry == null) return null;
    const raw = typeof entry === "object" ? entry.value : entry;
    const n = parseFloat(String(raw == null ? "" : raw).replace(/[,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  async function updateFromNavasan() {
    if (updating) return;
    updating = true;
    setUpdateLoading(true);
    setUpdateStatus("Fetching\u2026", false);
    setHint(DEFAULT_HINT, false);

    try {
      const res = await fetch(NAVASAN_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      let found = 0;
      for (const c of CURRENCIES) {
        const value = navasanValue(data, c.code);
        if (value == null) continue;
        rates[c.code] = value;
        if (inputs[c.code]) inputs[c.code].value = fmt(value);
        updatePreview(c.code);
        found++;
      }
      if (!found) throw new Error("no AED/KWD rates in response");

      lastFetchAt = Date.now();
      chrome.storage.sync.set({ [LAST_FETCH_KEY]: lastFetchAt });
      save();
      setUpdateStatus(formatRelative(lastFetchAt), false);
    } catch (err) {
      setUpdateStatus(
        "Update failed \u2014 " +
          (err && err.message ? err.message : "network error"),
        true
      );
      setHint(
        "Could not reach Navasan.net. You can still set the rate by hand.",
        true
      );
    } finally {
      updating = false;
      setUpdateLoading(false);
    }
  }

  updateBtn.addEventListener("click", updateFromNavasan);

  function buildRow(c) {
    const label = document.createElement("label");
    label.className = "field";
    label.innerHTML =
      '<span class="field-label">1 ' +
      c.code +
      " =</span>" +
      '<span class="input-row">' +
      '<input class="rate-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-code="' +
      c.code +
      '" />' +
      '<span class="affix">Toman</span>' +
      "</span>";
    ratesEl.appendChild(label);

    const input = label.querySelector("input");
    inputs[c.code] = input;
    input.value = fmt(rates[c.code]);

    let timer = null;
    input.addEventListener("input", () => {
      updatePreview(c.code);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const value = parseRate(input.value);
        if (value == null) {
          setHint("Enter a number greater than zero.", true);
          return;
        }
        setHint(DEFAULT_HINT, false);
        rates[c.code] = value;
        save();
      }, 400);
    });

    input.addEventListener("blur", () => {
      const value = parseRate(input.value);
      if (value != null) input.value = fmt(value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") input.blur();
    });

    const line = document.createElement("div");
    line.className = "preview-line";
    line.innerHTML =
      '<span class="preview-aed">' +
      c.code +
      " " +
      nf.format(c.sample) +
      "</span>" +
      '<span class="preview-arrow">&rarr;</span>' +
      '<span class="preview-toman" data-preview="' +
      c.code +
      '"></span>';
    previewsEl.appendChild(line);
    updatePreview(c.code);
  }

  enabledInput.addEventListener("change", () => {
    document.body.classList.toggle("disabled", !enabledInput.checked);
    chrome.storage.sync.set({ dztEnabled: enabledInput.checked }, flashSaved);
  });

  CURRENCIES.forEach(buildRow);

  /* ------------------------------------------------------------------- init */

  chrome.storage.sync.get(
    { dztEnabled: true, [RATES_KEY]: null, dztRate: null, [LAST_FETCH_KEY]: null },
    (stored) => {
      enabledInput.checked = stored.dztEnabled !== false;
      document.body.classList.toggle("disabled", !enabledInput.checked);

      const fetchedAt = parseFloat(stored[LAST_FETCH_KEY]);
      if (Number.isFinite(fetchedAt) && fetchedAt > 0) {
        lastFetchAt = fetchedAt;
        setUpdateStatus(formatRelative(lastFetchAt), false);
      }

      const saved = stored[RATES_KEY];
      if (saved && typeof saved === "object") {
        for (const c of CURRENCIES) {
          const v = parseRate(saved[c.code]);
          if (v != null) rates[c.code] = v;
        }
      }
      // Migrate the original single-rate setting into the AED slot.
      const legacy = parseRate(stored.dztRate);
      if (legacy != null && !(saved && saved.AED)) rates.AED = legacy;

      CURRENCIES.forEach((c) => {
        inputs[c.code].value = fmt(rates[c.code]);
        updatePreview(c.code);
      });

      const first = inputs[CURRENCIES[0].code];
      first.focus();
      first.select();
    }
  );
})();
