# Toman Price for Dubizzle, OpenSooq & 4Sale

A Chrome extension (Manifest V3) that adds the Iranian **Toman** equivalent of
foreign prices on Dubizzle, OpenSooq and 4Sale listing cards and product/detail
pages.

It is **multi-currency**: each currency has its own rate, so AED and KWD can be
set independently — either typed in by hand or pulled live from
[Navasan.net](https://www.navasan.net/) with one click.

> Toman value = amount x (your rate for that currency)

| Site / currency | Page example | With a rate | Result |
| --- | --- | --- | --- |
| Dubizzle — AED | `AED 130,000` | 63,500 | `8,255,000,000 Toman` |
| OpenSooq AE — AED | `9,990 AED` | 63,500 | `634,365,000 Toman` |
| OpenSooq KW — KWD | `1,350 دينار` | 760,000 | `1,026,000,000 Toman` |
| 4Sale — KWD | `KWD 2,000` | 760,000 | `1,520,000,000 Toman` |
| 4Sale — KWD (K = thousand) | `26.50 K KWD` | 760,000 | `20,140,000,000 Toman` |

Works on:

- `*.dubizzle.com` (AED)
- `*.opensooq.com` — UAE (AED), Kuwait (KWD), and any other country whose
  currency is listed below
- `*.q84sale.com` (KWD)

## Supported currencies

Set a rate for each in the popup. The rate is the value of **1 unit of that
currency in Toman**.

| Currency | Codes recognised | Default rate |
| --- | --- | --- |
| AED | `AED`, `د.إ`, `درهم` (UAE site) | 63,500 |
| KWD | `KWD`, `KD`, `د.ك`, `دينار` (Kuwait site) | 760,000 |

Arabic-Indic digits (`١٬٣٥٠ دينار`) and Arabic separators are understood too.

Only these currencies are converted; other currencies on OpenSooq (SAR, EGP,
KWD-only sites, etc.) are left alone. The defaults are just starting points —
change them to your market rate.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension and open it. Click **Update Price** to pull the live AED
   and KWD rates from Navasan.net, or type your own values.
5. Visit any Dubizzle or OpenSooq page — each recognised price gets a green
   Toman line.

## Usage

- **Update Price** — fetches the live AED and KWD rates (in Toman) from
  [Navasan.net](https://www.navasan.net/) and fills both fields at once. The line
  under the button shows when the rates were last fetched. If Navasan cannot be
  reached, your saved values are kept and a red message is shown.
- **Manual rates** — one field per currency (`1 AED = … Toman`,
  `1 KWD = … Toman`). Type your own rate any time; it overrides the fetched one.
  Fields save automatically and every open tab updates instantly.
- **On/off switch** — toggles the extra price line without losing your rates.
- Hover a Toman line to see the calculation
  (`KWD 500 x 760,000 = 380,000,000 Toman`).

## Live rates from Navasan.net

The popup's **Update Price** button requests
`https://www.navasan.net/last_currencies.php`, which returns live Toman rates as
JSON under the lower-case currency codes (`aed`, `kwd`). The values are written
into the two rate fields, saved, and applied to every open tab.

- The fetch happens in the popup (extension) context, so it needs host access to
  `navasan.net` (already declared in `manifest.json`).
- No API key is required. If you would rather use the official web service
  (`api.navasan.tech`), point `NAVASAN_URL` in `popup.js` at it and append your
  `api_key`.
- Manual values always win: fetching only overwrites a field when Navasan returns
  a valid, positive number for that currency.

## How it works

`content.js` recognises every way the sites render a price:

- **`AED 130,000`** (currency first) — Dubizzle cards.
- **`9,990 AED`** / **`500 KWD`** / **`9,990AED`** (number first).
- **`AED` + `44,999` in separate nodes** (newer Dubizzle markup).
- Kuwaiti decimals such as **`1,250.500 KWD`**.
- 4Sale's **"K" thousands shorthand**: **`26.50 K KWD`** is 26,500 KWD, and
  **`44 K KWD`** is 44,000 KWD (the `K` multiplies the number by 1,000).

Then it decides where the line goes:

- **Listing cards** (a price inside a link, e.g. `a[data-testid="view-listing"]`
  or `a.postListItemData`) — a new line is inserted **under** the price. When the
  price is a `<p>` sitting in a flex row next to a date (4Sale), the line is
  nested *inside* that paragraph so it wraps onto its own line instead of
  splitting the row and overlapping the date. On 4Sale cards, which float a
  "Like it" reactions bar over the bottom of the content, extra bottom padding
  is reserved so the reactions bar never covers the Toman line.
- **Product / detail pages** (Dubizzle `[data-testid="listing-price"]`, OpenSooq's
  large price heading, etc.) — the line is attached **to** the price element so
  it stays glued to it in any layout.
- Tiny inline mentions (< 15px) outside cards are left alone, so filter chips
  stay clean.

A `MutationObserver` plus a URL watcher handle both sites' client-side
navigation and infinite scroll. Rates are stored with `chrome.storage.sync`.

## Files

```
.
├── manifest.json        # MV3 manifest (storage permission, site matches)
├── content.js           # finds prices and injects the Toman line
├── content.css          # style of the injected line
├── popup.html/.css/.js  # settings popup (one rate per currency)
├── icons/               # 16 / 48 / 128 px icons
└── test/                # offline harnesses used during development (optional)
```

## Adding a currency

1. Add an entry to `CURRENCIES` in `content.js`:
   `{ code: "SAR", defaultRate: 20000, aliases: ["SAR", "ر.س"] }`
2. Add the same entry to `CURRENCIES` in `popup.js` (with a `sample` value for
   the preview), e.g. `{ code: "SAR", sample: 5000, defaultRate: 20000 }`.
3. Reload the extension.

## Customising

- **Rate defaults** — the `defaultRate` fields in `content.js` / `popup.js`.
- **More sites** — add match patterns to both `host_permissions` and
  `content_scripts[].matches` in `manifest.json`.
- **Label text** — the output format lives in `buildLabels()` in `content.js`.
