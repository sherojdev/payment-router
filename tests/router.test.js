const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const routerSource = fs.readFileSync(path.join(root, 'router.js'), 'utf8');

function makeClassList() {
    const values = new Set();
    return {
        add(value) { values.add(value); },
        remove(value) { values.delete(value); },
        contains(value) { return values.has(value); }
    };
}

async function runRouter({ search, userAgent = 'Desktop Browser', maxTouchPoints = 0, qrLibrary = true }) {
    const ids = ['redirecting-state', 'desktop-state', 'error-state', 'error-message', 'qrcode', 'qrcode-library'];
    const elements = Object.fromEntries(ids.map(id => [id, { id, classList: makeClassList(), innerText: '', listeners: {} }]));
    elements['desktop-state'].classList.add('hidden');
    elements['error-state'].classList.add('hidden');
    elements['qrcode-library'].addEventListener = (name, callback) => {
        elements['qrcode-library'].listeners[name] = callback;
    };

    const documentListeners = {};
    const document = {
        readyState: 'loading',
        getElementById(id) { return elements[id]; },
        addEventListener(name, callback) { documentListeners[name] = callback; }
    };
    const location = { search, href: '' };
    const context = {
        document,
        window: { location },
        navigator: { userAgent, maxTouchPoints },
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
        QRCode: qrLibrary ? Object.assign(function QRCode(element, options) {
            element.qr = options;
        }, { CorrectLevel: { M: 0 } }) : undefined
    };

    vm.runInNewContext(routerSource, context, { filename: 'router.js' });
    const completed = documentListeners.DOMContentLoaded();
    await completed;
    return { elements, location };
}

test('encoded UPI link renders a desktop QR with all payment fields', async () => {
    const upi = 'upi://pay?pa=test-merchant@example&pn=Test User&am=875.00&cu=INR';
    const { elements } = await runRouter({ search: `?paymentLink=${encodeURIComponent(upi)}` });

    assert.equal(elements['desktop-state'].classList.contains('hidden'), false);
    assert.equal(elements['redirecting-state'].classList.contains('hidden'), true);
    assert.equal(elements.qrcode.qr.text, upi);
    assert.equal(elements['error-state'].classList.contains('hidden'), true);
});

test('raw UPI link preserves ampersand-delimited payment fields', async () => {
    const upi = 'upi://pay?pa=test-merchant@example&pn=Test%20User&am=875.00&cu=INR';
    const { elements } = await runRouter({ search: `?paymentLink=${upi}` });

    assert.equal(elements.qrcode.qr.text, decodeURIComponent(upi));
    assert.equal(elements['desktop-state'].classList.contains('hidden'), false);
});

test('valid UPI link launches the native app on mobile', async () => {
    const upi = 'upi://pay?pa=test-merchant@example&am=875.00&cu=INR';
    const { location } = await runRouter({
        search: `?paymentLink=${encodeURIComponent(upi)}`,
        userAgent: 'Mozilla/5.0 (iPhone)',
        maxTouchPoints: 5
    });

    assert.equal(location.href, upi);
});

test('Cashfree production and test hosts are allowed', async (t) => {
    for (const host of ['payments.cashfree.com', 'payments-test.cashfree.com']) {
        await t.test(host, async () => {
            const target = `https://${host}/links/example`;
            const { location } = await runRouter({ search: `?paymentLink=${encodeURIComponent(target)}` });
            assert.equal(location.href, target);
        });
    }
});

test('untrusted and non-HTTPS gateway URLs are blocked', async (t) => {
    const cases = [
        ['https://evil.example/pay', 'This payment gateway domain is not authorised. Redirect blocked.'],
        ['http://payments.cashfree.com/pay', 'Only HTTPS payment gateway links are permitted.']
    ];

    for (const [target, message] of cases) {
        await t.test(target, async () => {
            const { elements, location } = await runRouter({ search: `?paymentLink=${encodeURIComponent(target)}` });
            assert.equal(location.href, '');
            assert.equal(elements['error-state'].classList.contains('hidden'), false);
            assert.equal(elements['error-message'].innerText, message);
        });
    }
});

test('router SHA-256 stays synchronized across SRI and CSP declarations', () => {
    const expected = `sha256-${crypto.createHash('sha256').update(routerSource).digest('base64')}`;
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');

    assert.ok(html.includes(`integrity="${expected}"`));
    assert.ok(html.includes(`script-src '${expected}'`));
    assert.ok(headers.includes(`script-src '${expected}'`));
});
