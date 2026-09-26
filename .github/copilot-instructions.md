# GitHub Copilot Instructions — payment-router

## ⚠️ SRI Hash Consistency (Critical — Never Skip)

This repository uses **Subresource Integrity (SRI)** to verify the exact bytes of
`router.js` before the browser executes it. The SHA-256 hash of `router.js` is
hardcoded in **two places** and **must be kept in sync** whenever `router.js` changes.

### When reviewing any PR that modifies `router.js`:

**Always check that the SRI hash has been updated in BOTH of these files:**

1. `index.html` — the `integrity=` attribute on the `<script src="./router.js">` tag
2. `_headers` — the `sha256-...` value inside the `Content-Security-Policy` header

**How to compute the correct hash:**
```bash
cat router.js | openssl dgst -sha256 -binary | base64
```

Then the result must appear as `sha256-<result>` in both places.

**What breaks if this is missed:**
- The browser will refuse to load `router.js` (SRI mismatch → script blocked)
- The payment page will silently fail: no routing, no QR code, no error shown to user
- The CSP in `_headers` will also block the script at the HTTP layer

### Checklist for any `router.js` change:

- [ ] `router.js` modified
- [ ] New SHA-256 hash computed: `cat router.js | openssl dgst -sha256 -binary | base64`
- [ ] Hash updated in `index.html` on the `integrity=` attribute of `<script src="./router.js">`
- [ ] Hash updated in `_headers` inside the `Content-Security-Policy` value
- [ ] Both hashes match the computed value exactly

---

## General Rules

- **`trustedDomains` in `router.js`** must list only exact payment gateway hostnames
  (e.g. `payments.cashfree.com`). Never use a bare apex domain like `cashfree.com`
  as it trusts all subdomains via `endsWith()`.

- **UPI links** passed as `?paymentLink=upi://...` must be `encodeURIComponent()`-encoded
  by the caller. Bare `&` in the UPI link will be parsed as separate query params
  by the browser, truncating `pn`, `am`, `cu` values.

- **`_headers`** must be deployed alongside `index.html` on Netlify / Cloudflare Pages.
  Without it, `frame-ancestors 'none'` (clickjacking protection) is not active —
  it is silently ignored when set via `<meta>` tags.
