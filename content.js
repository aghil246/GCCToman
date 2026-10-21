/*
 * Toman Price for Dubizzle & OpenSooq
 * Adds "N Toman" next to/under every supported foreign price, where
 * N = amount x (your rate for that currency).
 *
 * Supported currencies and their default Toman rates are listed in CURRENCIES.
 */
(() => {
  "use strict";

  if (window.__dztInjected) return;
  window.__dztInjected = true;

  const CLASS = "dzt-toman-price";
  const DETAIL_CLASS = "dzt-toman-price--detail";

  // Listing-card roots.
  //  - Dubizzle: an anchor with a test id ("view-listing", or "listing-1", ...)
  //  - OpenSooq: a link carrying the `postListItemData` class
  // A price inside any other anchor is also treated as a card price.
  const CARD_SELECTOR = [
    'a[data-testid="view-listing"]',
    'a[data-testid^="listing-"]',
    "a.postListItemData",
    ".postListItemData",
  ].join(", ");

  // Dubizzle product page exposes a stable price hook.
  const DUBIZZLE_DETAIL_SELECTOR = '[data-testid="listing-price"]';

  // Currencies converted to Toman.
  //  - `symbols` are always recognised.
  //  - `localWords` are full Arabic words that are ambiguous across countries
  //    (Kuwaiti/Iraqi/Jordanian "دينار"), so they only count on the site that
  //    actually uses that currency.
  const CURRENCIES = [
    { code: "AED", defaultRate: 63500, symbols: ["AED", "د.إ"], localWords: ["درهم"] },
    { code: "KWD", defaultRate: 760000, symbols: ["KWD", "KD", "د.ك"], localWords: ["دينار"] },
    {
      code: "OMR",
      // Starting point only; set the current market rate in the popup.
      defaultRate: 700000,
      symbols: ["OMR", "ر.ع."],
      localWords: ["ريال", "ريال عماني"],
    },
  ];

  // Country subdomain -> currency used on that OpenSooq site.
  const COUNTRY_CURRENCY = { ae: "AED", kw: "KWD", om: "OMR" };

  function detectCountry() {
    const host = location.hostname.toLowerCase();
    // Dubizzle: the .com site is the UAE one.
    if (/(^|\.)dubizzle\.com$/.test(host)) return "ae";
    // 4Sale (q84sale.com) is a Kuwait-only marketplace.
    if (/(^|\.)q84sale\.com$/.test(host)) return "kw";
    // OpenSooq uses the country as a subdomain (ae., kw., sa., ...).
    const m = host.match(/^([a-z]{2})\.opensooq\.com$/);
    return m ? m[1] : null;
  }

  const siteCurrency = COUNTRY_CURRENCY[detectCountry()] || null;
  const activeAliases = (c) =>
    c.code === siteCurrency ? c.symbols.concat(c.localWords) : c.symbols;

  const RATES_KEY = "dztRates";
  const SKIP_TAGS = /^(SCRIPT|STYLE|TITLE|NOSCRIPT|OPTION|INPUT|TEXTAREA|SELECT)$/;

  const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  /* ------------------------------------------------------- currency patterns */

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const allAliases = CURRENCIES.flatMap(activeAliases);
  const CURRENCY_HINT_RE = new RegExp(allAliases.map(escapeRe).join("|"), "i");
  const CURRENCY_WORD_RE = new RegExp(
    "^(" + allAliases.map(escapeRe).join("|") + ")$",
    "i"
  );
  const MATCHERS = CURRENCIES.map((c) => {
    const alts = activeAliases(c).map(escapeRe).join("|");
    return {
      code: c.code,
      prefix: new RegExp("^(" + alts + ")\\s*([0-9][0-9.,]*)$", "i"),
      suffix: new RegExp("^([0-9][0-9.,]*)\\s*(" + alts + ")$", "i"),
      // A "K" between the number and the code means thousands:
      // "26.50 K KWD" -> 26.5 x 1000 = 26,500 KWD
      thousands: new RegExp("^([0-9][0-9.,]*)\\s*[Kk]\\s*(" + alts + ")$", "i"),
    };
  });

  /* ---------------------------------------------------------------- state */

  const defaultRates = () => {
    const out = {};
    CURRENCIES.forEach((c) => (out[c.code] = c.defaultRate));
    return out;
  };

  let enabled = true;
  let rates = defaultRates();

  /* ---------------------------------------------------------------- parsing */

  function parseAmount(raw) {
    // "1,250.500" -> 1250.5
    const n = parseFloat(String(raw).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  // Normalise price text: strip non-breaking spaces and invisible bidi control
  // marks, and convert Arabic-Indic / Extended Arabic-Indic digits and
  // separators to ASCII so the same patterns work on Arabic pages.
  function normalizeText(raw) {
    return String(raw == null ? "" : raw)
      .replace(/[\u00a0\u200e\u200f\u061c\u202a-\u202e]/g, "")
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\u066c\u060c]/g, ",")
      .replace(/\u066b/g, ".")
      .trim();
  }

  /* Understand both "AED 130,000" and "130,000 AED" / "130,000AED" / "500 KWD"
     / "1,350 دينار". Returns { amount, code } or null. */
  function parsePrice(text) {
    const t = normalizeText(text);
    if (!t) return null;

    for (const m of MATCHERS) {
      // "26.50 K KWD" -> 26.5 x 1000, checked first so the plain form can't
      // swallow the "K" as part of the number.
      const thousands = t.match(m.thousands);
      if (thousands) {
        const amount = parseAmount(thousands[1]);
        if (amount != null) return { amount: amount * 1000, code: m.code };
      }

      let match = t.match(m.prefix);
      let group = 2;
      if (!match) {
        match = t.match(m.suffix);
        group = 1;
      }
      if (match) {
        const amount = parseAmount(match[group]);
        if (amount != null) return { amount, code: m.code };
      }
    }
    return null;
  }

  // Read the price text of an element, ignoring an injected Toman line that may
  // live inside it (so rate changes recompute from the real amount).
  function readPriceText(el) {
    if (!el.querySelector("." + CLASS)) return el.textContent;
    const clone = el.cloneNode(true);
    clone.querySelectorAll("." + CLASS).forEach((n) => n.remove());
    return clone.textContent;
  }

  function buildLabels(parsed) {
    const rate = rates[parsed.code];
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const value = Math.round(parsed.amount * rate);
    return {
      text: nf.format(value) + " Toman",
      title:
        parsed.code +
        " " +
        nf.format(parsed.amount) +
        " x " +
        nf.format(rate) +
        " = " +
        nf.format(value) +
        " Toman",
    };
  }

  function isUsable(el) {
    // Visibility is deliberately not required: some prices (e.g. OpenSooq's
    // sticky product header) exist hidden and are revealed by a CSS change that
    // fires no DOM mutation. The strict price pattern keeps this safe.
    return !!el && !SKIP_TAGS.test(el.tagName);
  }

  // Largest font size of an element or any descendant (the number inside a
  // product price is often nested and larger than the wrapper).
  function maxFontSize(el) {
    let max = parseFloat(getComputedStyle(el).fontSize) || 0;
    el.querySelectorAll("*").forEach((child) => {
      const size = parseFloat(getComputedStyle(child).fontSize) || 0;
      if (size > max) max = size;
    });
    return max;
  }

  /* ------------------------------------------------------------- collecting */

  function collectFromTextNodes(scope, out) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const v = node.nodeValue;
        if (!v || !CURRENCY_HINT_RE.test(v)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue;
      const el = node.parentElement;
      if (!el) continue;

      if (CURRENCY_WORD_RE.test(normalizeText(value))) {
        // The currency sits on its own ("<span>9,990</span>AED"), so climb a
        // couple of levels to the smallest element that forms a whole price.
        let cur = el;
        for (let i = 0; i < 3 && cur; i++) {
          if (parsePrice(readPriceText(cur))) {
            out.add(cur);
            break;
          }
          cur = cur.parentElement;
        }
      } else if (parsePrice(value)) {
        out.add(el);
      }
    }
  }

  function collectExplicit(scope, out) {
    if (scope.matches && scope.matches(DUBIZZLE_DETAIL_SELECTOR)) out.add(scope);
    if (scope.querySelectorAll) {
      scope.querySelectorAll(DUBIZZLE_DETAIL_SELECTOR).forEach((el) => out.add(el));
    }
  }

  /* ------------------------------------------------------------- injection */

  function buildElement(priceEl, parsed, isDetail, inside) {
    const labels = buildLabels(parsed);
    if (!labels) return null;

    // A <span> is valid inside headings/paragraphs; a <div> is only used when we
    // insert the line as a sibling. Detail pages always nest the line.
    const el = document.createElement(isDetail || inside ? "span" : "div");
    el.className = isDetail ? CLASS + " " + DETAIL_CLASS : CLASS;
    el.dataset.dzt = "1";
    el.dataset.dztCode = parsed.code;
    el.textContent = labels.text;
    el.title = labels.title;

    if (isDetail) {
      const priceFont = maxFontSize(priceEl) || 24;
      const size = Math.min(40, Math.max(12, Math.round(priceFont * 0.7)));
      el.style.fontSize = size + "px";
    }
    return el;
  }

  // 4Sale (and similar) cards float a reactions bar over the bottom of the
  // card content. The card's own layout reserves a strip for it, which the
  // added price line otherwise eats into -> the bar ends up drawn over the
  // Toman value. Tag the card so CSS can reserve a little more room.
  function markCard(priceEl) {
    const article = priceEl.closest("article");
    if (!article) return;
    article.classList.add("dzt-card");

    const row = priceEl.parentElement;
    if (row) {
      row.classList.add("dzt-price-row");
      const content = row.parentElement;
      if (content) content.classList.add("dzt-content");
    }
  }

  function inject(priceEl, isDetail) {
    if (!enabled) return;

    const parsed = parsePrice(readPriceText(priceEl));
    if (!parsed) return;
    const labels = buildLabels(parsed);
    if (!labels) return;

    // Card prices rendered as a <p> usually sit in a flex row next to a date,
    // e.g. 4Sale: <p>26.50 K KWD</p><p>Pinned today</p>. Inserting a sibling
    // would make that row a 3-child layout and overlap, so nest the line inside
    // the price paragraph instead so it simply wraps onto its own line.
    const inside = isDetail || priceEl.tagName === "P";
    if (!isDetail) markCard(priceEl);

    // Refresh in place only when the value really changed - assigning
    // textContent unconditionally would retrigger the MutationObserver forever.
    const existing = inside
      ? priceEl.querySelector(":scope > ." + CLASS)
      : priceEl.nextElementSibling;
    if (existing && existing.classList && existing.classList.contains(CLASS)) {
      if (existing.textContent !== labels.text) existing.textContent = labels.text;
      if (existing.title !== labels.title) existing.title = labels.title;
      return;
    }

    const el = buildElement(priceEl, parsed, isDetail, inside);
    if (!el) return;
    if (inside) {
      priceEl.appendChild(el); // stays glued to the price in any layout
    } else {
      priceEl.insertAdjacentElement("afterend", el);
    }
  }

  /* --------------------------------------------------------------- scanning */

  function scan(root) {
    if (!enabled || !root || !root.querySelectorAll) return;

    const out = new Set();
    collectFromTextNodes(root, out);
    collectExplicit(root, out);

    for (const el of out) {
      if (el.closest("." + CLASS)) continue;
      if (el.querySelector(":scope > ." + CLASS)) continue;
      if (!isUsable(el)) continue;
      // Anchor-wrapped prices are listing cards -> add a line under the price.
      // Everything else (product / detail page) -> attach the line to the price,
      // but skip tiny inline mentions so filter chips stay clean.
      const isCard = !!(el.closest(CARD_SELECTOR) || el.closest("a"));
      if (!isCard && maxFontSize(el) < 15) continue;
      inject(el, !isCard);
    }
  }

  function removeAll() {
    document.querySelectorAll("." + CLASS).forEach((el) => el.remove());
    document
      .querySelectorAll(".dzt-card, .dzt-content, .dzt-price-row")
      .forEach((el) => el.classList.remove("dzt-card", "dzt-content", "dzt-price-row"));
  }

  function apply() {
    removeAll();
    if (enabled) scan(document);
  }

  /* ------------------------------------------------------ mutation watching */

  const pendingRoots = new Set();
  let queued = false;

  function schedule(root) {
    if (root && root.nodeType === 1) pendingRoots.add(root);
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      if (!enabled) {
        pendingRoots.clear();
        return;
      }
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      // Many separate roots usually mean a full re-render: one document scan is
      // cheaper than many overlapping subtree scans.
      if (roots.length === 0 || roots.length > 60) {
        scan(document);
        return;
      }
      for (const r of roots) {
        if (r.isConnected) scan(r);
      }
    }, 250);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains(CLASS)) continue;
          schedule(n);
        }
        if (m.target && m.target.nodeType === 1) schedule(m.target);
      } else if (m.type === "characterData") {
        const parent = m.target.parentElement;
        if (parent && !parent.classList.contains(CLASS)) schedule(parent);
      }
    }
  });

  const startObserver = () => {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  };

  /* ---------------------------------------------- SPA navigation + settings */

  // Content scripts live in an isolated world, so overriding history.pushState
  // here would never see the page's own calls. Watch the URL instead; the
  // MutationObserver then picks up the freshly rendered prices.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      schedule(document);
    }
  }, 800);
  window.addEventListener("popstate", () => schedule(document));

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.dztEnabled) enabled = changes.dztEnabled.newValue !== false;
    if (changes[RATES_KEY]) {
      const next = changes[RATES_KEY].newValue;
      if (next && typeof next === "object") {
        const merged = defaultRates();
        for (const c of CURRENCIES) {
          const v = parseFloat(next[c.code]);
          if (Number.isFinite(v) && v > 0) merged[c.code] = v;
        }
        rates = merged;
      }
    }
    if (changes.dztEnabled || changes[RATES_KEY]) apply();
  });

  /* ------------------------------------------------------------------ start */

  chrome.storage.sync.get(
    { dztEnabled: true, [RATES_KEY]: defaultRates(), dztRate: null },
    (stored) => {
      enabled = stored.dztEnabled !== false;

      rates = defaultRates();
      const saved = stored[RATES_KEY];
      if (saved && typeof saved === "object") {
        for (const c of CURRENCIES) {
          const v = parseFloat(saved[c.code]);
          if (Number.isFinite(v) && v > 0) rates[c.code] = v;
        }
      }
      // Migrate the original single-rate setting into the AED slot.
      const legacy = parseFloat(stored.dztRate);
      if (Number.isFinite(legacy) && legacy > 0 && !(saved && saved.AED)) {
        rates.AED = legacy;
      }

      scan(document);
      startObserver();

      // Both sites render client-side - re-scan a few times while they settle.
      [600, 1500, 3000].forEach((delay) =>
        setTimeout(() => scan(document), delay)
      );
    }
  );
})();
