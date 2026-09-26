async function routePayment() {

    // =========================================================
    // ALLOWLISTS — edit these to match your actual gateway URLs
    // Tightened to exact hostnames only (no wildcard subdomains)
    // =========================================================
    const trustedDomains = [
        'payments.cashfree.com',
        'payments-test.cashfree.com'
        // Add exact hostnames as needed: 'api.razorpay.com', 'checkout.stripe.com'
    ];

    // =========================================================
    // ROUTING ENGINE
    // =========================================================

    // WHY NOT URLSearchParams.get()?
    // URLSearchParams splits on every '&', so an unencoded UPI link like:
    //   ?paymentLink=upi://pay?pa=x@y&am=875.00&cu=INR
    // gets truncated to just: upi://pay?pa=x@y
    // (the browser treats &am= and &cu= as separate top-level params)
    //
    // FIX: grab the raw query string and take everything after 'paymentLink='
    // This is greedy — it captures the full value including any unencoded & chars.
    // Works correctly for both encoded (?paymentLink=upi%3A%2F%2F...) and
    // unencoded (?paymentLink=upi://pay?pa=...&am=...) URLs.
    const rawSearch   = window.location.search.slice(1); // strip leading '?'
    const plPrefix    = 'paymentLink=';
    const plIndex     = rawSearch.indexOf(plPrefix);
    let   targetUrl   = null;

    if (plIndex !== -1) {
        const rawValue = rawSearch.slice(plIndex + plPrefix.length);
        try {
            // If the caller used encodeURIComponent(), decode it back.
            // If it was passed raw (unencoded), decodeURIComponent is a safe no-op.
            targetUrl = decodeURIComponent(rawValue);
        } catch (e) {
            // Malformed encoding — use the raw string as-is
            targetUrl = rawValue;
        }
    }

    const redirectingState = document.getElementById('redirecting-state');
    const desktopState     = document.getElementById('desktop-state');
    const errorState       = document.getElementById('error-state');
    const errorMessage     = document.getElementById('error-message');

    function showError(msg) {
        redirectingState.classList.add('hidden');
        desktopState.classList.add('hidden');
        errorState.classList.remove('hidden');
        errorMessage.innerText = msg;
    }

    if (!targetUrl) {
        showError("Missing payment link parameter.");
        return;
    }

    // --- ROUTE 1: UPI NATIVE PROTOCOL ---
    // Checked BEFORE new URL() — browsers throw TypeError on non-standard schemes.
    if (/^upi:\/\//i.test(targetUrl)) {

        // Improved mobile detection: also handles iPads in desktop mode
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
            || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));

        // Safely extract UPI params without the URL constructor
        const queryStart = targetUrl.indexOf('?');
        const upiParams  = queryStart !== -1
            ? new URLSearchParams(targetUrl.slice(queryStart + 1))
            : new URLSearchParams();

        // pa must exist
        const payeeAddress = (upiParams.get('pa') || '').trim().toLowerCase();
        if (!payeeAddress) {
            showError("UPI recipient address is missing. Transaction blocked.");
            return;
        }

        // Amount must be a valid positive number
        const amount = parseFloat(upiParams.get('am') || '');
        if (isNaN(amount) || amount <= 0) {
            showError("Invalid payment amount in UPI link.");
            return;
        }

        // Currency must be INR if present
        const currency = (upiParams.get('cu') || 'INR').toUpperCase();
        if (currency !== 'INR') {
            showError("Only INR payments are supported.");
            return;
        }

        if (isMobile) {
            window.location.href = targetUrl;
        } else {
            // Desktop: render QR code so the user can scan with their phone
            redirectingState.classList.add('hidden');
            desktopState.classList.remove('hidden');

            const qrScript = document.getElementById('qrcode-library');
            if (typeof QRCode === 'undefined' && qrScript) {
                // The QR library loads asynchronously; don't hold routing until
                // every page resource finishes loading.
                await new Promise(resolve => {
                    const timeout = setTimeout(resolve, 10000);
                    qrScript.addEventListener('load', () => {
                        clearTimeout(timeout);
                        resolve();
                    }, { once: true });
                    qrScript.addEventListener('error', () => {
                        clearTimeout(timeout);
                        resolve();
                    }, { once: true });
                    if (typeof QRCode !== 'undefined') {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            }

            if (typeof QRCode === 'undefined') {
                showError("QR library failed to load. Please refresh and try again.");
                return;
            }

            new QRCode(document.getElementById("qrcode"), {
                text: targetUrl,
                width: 200,
                height: 200,
                correctLevel: QRCode.CorrectLevel.M
            });
        }
        return;
    }

    // --- ROUTE 2: STANDARD HTTPS PAYMENT GATEWAYS ---
    try {
        const parsedUrl = new URL(targetUrl);

        // Block every non-HTTPS scheme: data:, javascript:, blob:, ftp:, http:
        if (parsedUrl.protocol !== 'https:') {
            showError("Only HTTPS payment gateway links are permitted.");
            return;
        }

        const hostname = parsedUrl.hostname.toLowerCase();

        // Exact match only — no wildcard subdomain trust
        const isDomainTrusted = trustedDomains.some(domain =>
            hostname === domain
        );

        if (!isDomainTrusted) {
            showError("This payment gateway domain is not authorised. Redirect blocked.");
            return;
        }

        window.location.href = targetUrl;

    } catch (e) {
        showError("The payment link could not be parsed. Please check the URL.");
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', routePayment, { once: true });
} else {
    routePayment();
}
