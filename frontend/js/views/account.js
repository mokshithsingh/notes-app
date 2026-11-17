// Account view: profile, current plan, usage and payment history.
import { api } from '../api.js';
import { escapeHtml, formatDate, formatDateTime, formatMoney, initials, icons } from '../ui.js';

const BRAND_NAMES = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', rupay: 'RuPay', card: 'Card' };

let main = null;

export async function show(container) {
    main = container;
    main.dataset.view = 'account';
    main.classList.remove('has-open-note');
    main.innerHTML = `
        <div class="page">
            <header class="page-header">
                <div>
                    <h1>Account</h1>
                    <p class="muted">Your profile, plan and billing history.</p>
                </div>
            </header>
            <div id="account-content"><div class="center-block"><div class="spinner"></div></div></div>
        </div>`;

    try {
        const data = await api.account();
        render(data);
    } catch (err) {
        document.getElementById('account-content').innerHTML = `
            <div class="card empty-state">
                ${icons.alert}
                <h2>We couldn't load your account details</h2>
                <p>${escapeHtml(err.message)}</p>
                <button class="btn btn-secondary" id="retry">Try again</button>
            </div>`;
        document.getElementById('retry').addEventListener('click', () => show(main));
    }
}

function render({ user, plan, usage, payments }) {
    const isPro = plan.id !== 'free';
    const percent = usage.limit ? Math.min(100, Math.round((usage.notes / usage.limit) * 100)) : 0;

    document.getElementById('account-content').innerHTML = `
        <div class="account-grid">
            <section class="card">
                <h2 class="card-title">Profile</h2>
                <div class="profile">
                    <div class="avatar avatar-lg">${escapeHtml(initials(user.name))}</div>
                    <div>
                        <div class="profile-name">${escapeHtml(user.name)}</div>
                        <div class="muted">${escapeHtml(user.email)}</div>
                        <div class="muted small">Member since ${formatDate(user.memberSince)}</div>
                    </div>
                </div>
            </section>

            <section class="card">
                <h2 class="card-title">Plan</h2>
                <div class="plan-summary">
                    <span class="badge ${isPro ? 'badge-pro' : ''}">${isPro ? icons.sparkle : ''}${escapeHtml(plan.name)}</span>
                    ${isPro
                        ? `<p>Your Pro plan is active until <strong>${formatDate(plan.renewsOn)}</strong>.</p>
                           <p class="muted small">Unlimited notes. You can add another month at any time.</p>
                           <a class="btn btn-secondary" href="#/upgrade">Add another month</a>`
                        : `<p><strong>${usage.notes}</strong> of ${usage.limit} notes used</p>
                           <div class="progress"><div class="progress-bar ${percent >= 100 ? 'full' : ''}" style="width:${percent}%"></div></div>
                           <a class="btn btn-primary" href="#/upgrade">${icons.sparkle}<span>Upgrade to Pro</span></a>`}
                </div>
            </section>

            <section class="card card-wide">
                <h2 class="card-title">Payment history</h2>
                ${payments.length === 0
                    ? '<p class="muted">No payments yet.</p>'
                    : `<div class="table-wrap"><table class="table">
                        <thead><tr><th>Date</th><th>Description</th><th>Card</th><th>Amount</th><th>Status</th></tr></thead>
                        <tbody>
                            ${payments.map((p) => `
                                <tr>
                                    <td>${formatDateTime(p.created_at)}</td>
                                    <td>Pro · 1 month<div class="muted small mono">${escapeHtml(p.gateway_ref)}</div></td>
                                    <td>${escapeHtml(BRAND_NAMES[p.card_brand] || 'Card')} •••• ${escapeHtml(p.card_last4)}</td>
                                    <td>${formatMoney(p.amount_cents, p.currency)}</td>
                                    <td><span class="pill ${p.status === 'succeeded' ? 'pill-success' : 'pill-danger'}">${p.status === 'succeeded' ? 'Paid' : 'Declined'}</span></td>
                                </tr>`).join('')}
                        </tbody>
                    </table></div>`}
            </section>
        </div>`;
}
