// Upgrade view: plan comparison + test-mode checkout form.
import { api } from '../api.js';
import { state, setState } from '../state.js';
import { escapeHtml, formatDate, formatMoney, icons, toast } from '../ui.js';

let main = null;

export async function show(container) {
    main = container;
    main.dataset.view = 'upgrade';
    main.classList.remove('has-open-note');

    const reason = state.upgradeReason;
    setState({ upgradeReason: '' });

    main.innerHTML = `
        <div class="page">
            <header class="page-header">
                <div>
                    <h1>${state.user.plan === 'pro' ? 'Extend Pro' : 'Upgrade to Pro'}</h1>
                    <p class="muted">Unlimited notes for ₹149 a month.</p>
                </div>
            </header>
            ${reason ? `<div class="banner banner-info">${icons.alert}<span>${escapeHtml(reason)}</span></div>` : ''}
            <div id="upgrade-content"><div class="center-block"><div class="spinner"></div></div></div>
        </div>`;

    let plans;
    try {
        ({ plans } = await api.plans());
    } catch (err) {
        document.getElementById('upgrade-content').innerHTML = `<div class="card empty-state">${icons.alert}<h2>Couldn't load plans</h2><p>${escapeHtml(err.message)}</p></div>`;
        return;
    }
    render(plans);
}

function planCard(plan, isCurrent) {
    return `
        <div class="card plan-card ${plan.id !== 'free' ? 'plan-card-pro' : ''}">
            <div class="plan-card-header">
                <h2>${escapeHtml(plan.name)}</h2>
                ${isCurrent ? '<span class="pill">Current plan</span>' : ''}
            </div>
            <div class="plan-price">${plan.priceCents === 0 ? '₹0' : formatMoney(plan.priceCents, plan.currency)}<span>${plan.interval ? ' / ' + plan.interval : ' forever'}</span></div>
            <ul class="feature-list">${plan.features.map((f) => `<li>${icons.check}${escapeHtml(f)}</li>`).join('')}</ul>
        </div>`;
}

function render(plans) {
    const [free, pro] = plans;
    const isPro = state.user.plan === 'pro';

    document.getElementById('upgrade-content').innerHTML = `
        <div class="upgrade-grid">
            <div class="plan-cards">
                ${planCard(free, !isPro)}
                ${planCard(pro, isPro)}
            </div>

            <section class="card checkout" id="checkout">
                <div class="checkout-header">
                    <h2>${icons.lock} Secure checkout</h2>
                    <span class="test-badge">Test mode</span>
                </div>
                <p class="muted small">Test mode: no real money is charged. Use one of the test cards below.</p>

                <form id="checkout-form" novalidate>
                    <label class="field">
                        <span>Name on card</span>
                        <input name="cardholderName" autocomplete="cc-name" required placeholder="${escapeHtml(state.user.name)}">
                    </label>
                    <label class="field">
                        <span>Card number</span>
                        <div class="input-with-addon">
                            <input name="cardNumber" inputmode="numeric" autocomplete="cc-number" required placeholder="1234 1234 1234 1234" maxlength="23">
                            <span class="input-addon" id="card-brand">${icons.card}</span>
                        </div>
                    </label>
                    <div class="field-row">
                        <label class="field">
                            <span>Expiry</span>
                            <input name="expiry" inputmode="numeric" autocomplete="cc-exp" required placeholder="MM / YY" maxlength="7">
                        </label>
                        <label class="field">
                            <span>CVC</span>
                            <input name="cvc" inputmode="numeric" autocomplete="cc-csc" required placeholder="123" maxlength="4">
                        </label>
                    </div>

                    <div class="form-error" id="checkout-error" role="alert" hidden></div>

                    <button class="btn btn-primary btn-block" type="submit" id="pay-button">
                        Pay ${formatMoney(pro.priceCents, pro.currency)}
                    </button>
                </form>

                <details class="test-cards">
                    <summary>Test cards</summary>
                    <table>
                        <tr><td class="mono">4242 4242 4242 4242</td><td>Payment succeeds</td></tr>
                        <tr><td class="mono">4000 0000 0000 0002</td><td>Card declined</td></tr>
                        <tr><td class="mono">4000 0000 0000 9995</td><td>Insufficient funds</td></tr>
                    </table>
                    <p class="muted small">Use any future expiry date, any 3-digit CVC and any name.</p>
                </details>
            </section>
        </div>`;

    wireForm(pro);
}

function detectBrand(digits) {
    if (/^4/.test(digits)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
    if (/^3[47]/.test(digits)) return 'Amex';
    if (/^(60|65|81|82)/.test(digits)) return 'RuPay';
    return '';
}

function wireForm(pro) {
    const form = document.getElementById('checkout-form');
    const cardInput = form.elements.cardNumber;
    const expiryInput = form.elements.expiry;
    const cvcInput = form.elements.cvc;
    const brandLabel = document.getElementById('card-brand');

    // "4242424242424242" -> "4242 4242 4242 4242"
    cardInput.addEventListener('input', () => {
        const digits = cardInput.value.replace(/\D/g, '').slice(0, 19);
        cardInput.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
        const brand = detectBrand(digits);
        brandLabel.innerHTML = brand ? `<span class="brand-name">${brand}</span>` : icons.card;
    });

    // "1228" -> "12/28"
    expiryInput.addEventListener('input', () => {
        const digits = expiryInput.value.replace(/\D/g, '').slice(0, 6);
        expiryInput.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
    });

    cvcInput.addEventListener('input', () => {
        cvcInput.value = cvcInput.value.replace(/\D/g, '').slice(0, 4);
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorBox = document.getElementById('checkout-error');
        const button = document.getElementById('pay-button');
        errorBox.hidden = true;

        const details = {
            cardholderName: form.elements.cardholderName.value.trim(),
            cardNumber: cardInput.value,
            expiry: expiryInput.value,
            cvc: cvcInput.value,
        };

        if (!details.cardholderName || !details.cardNumber || !details.expiry || !details.cvc) {
            showError('Please fill in all card details.');
            return;
        }

        setBusy(true);
        try {
            const result = await api.checkout(details);
            const user = await api.me();
            setState({ user });
            renderSuccess(result, pro);
        } catch (err) {
            showError(err.status === 402 ? err.message : `Payment failed. ${err.message}`);
            setBusy(false);
        }

        function showError(message) {
            errorBox.innerHTML = `${icons.alert}<span>${escapeHtml(message)}</span>`;
            errorBox.hidden = false;
        }

        function setBusy(busy) {
            [...form.elements].forEach((element) => { element.disabled = busy; });
            button.innerHTML = busy
                ? '<span class="spinner spinner-sm spinner-light"></span> Processing payment…'
                : `Pay ${formatMoney(pro.priceCents, pro.currency)}`;
        }
    });
}

function renderSuccess(result, pro) {
    const checkout = document.getElementById('checkout');
    const brand = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', rupay: 'RuPay' }[result.payment.brand] || 'Card';
    checkout.innerHTML = `
        <div class="success-state">
            <div class="success-icon">${icons.check}</div>
            <h2>You're on Pro!</h2>
            <p>Paid ${formatMoney(pro.priceCents, pro.currency)} with ${brand} •••• ${escapeHtml(result.payment.last4)}.</p>
            <p class="muted">Your plan is active until <strong>${formatDate(result.planExpiresOn)}</strong>.</p>
            <div class="success-actions">
                <a class="btn btn-primary" href="#/notes">Go to notes</a>
                <a class="btn btn-secondary" href="#/account">View receipt</a>
            </div>
        </div>`;
    toast('Payment successful. Welcome to Pro!', 'success');
}
