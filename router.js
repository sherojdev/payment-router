window.onload = function () {

    // =========================================================
    // ALLOWLISTS — edit these to match your actual gateway URLs
    // Tightened to exact hostnames only (no wildcard subdomains)
    // =========================================================
    const trustedDomains = [
        'payments.cashfree.com'
        // Add exact hostnames as needed: 'api.razorpay.com', 'checkout.stripe.com'
    ];

    // =========================================================
    // ROUTING ENGINE
    // =========================================================
    const urlParams = new URLSearchParams(window.location.search);
    // .get() automatically decodes percent-encoding (%40 → @, %20 → space)
    const targetUrl = urlParams.get('paymentLink');

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
};
