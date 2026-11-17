// Shared UI helpers: escaping, formatting, icons, toasts and confirm dialogs.

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function snippet(text, length = 90) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    return clean.length > length ? clean.slice(0, length).trimEnd() + '…' : clean;
}

export function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatRelative(value) {
    if (!value) return '';
    const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 45) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
    return formatDate(value);
}

export function formatMoney(cents, currency = 'INR') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(cents / 100);
}

export function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

const svg = (paths) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
    logo: `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--accent)"/><path d="M10 9h9l3 3v11H10z" fill="#fff"/><path d="M13 15h6M13 18.5h6" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round"/></svg>`,
    note: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    paperclip: svg('<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>'),
    download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    restore: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
    sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
    lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    alert: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>'),
    file: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>'),
    card: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'),
};

// Toast notifications. `action` is an optional { label, onClick } button (e.g. "Undo").
export function toast(message, type = 'info', action = null) {
    const container = document.getElementById('toasts');
    const element = document.createElement('div');
    element.className = `toast toast-${type}`;
    element.setAttribute('role', type === 'error' ? 'alert' : 'status');
    element.innerHTML = `<span>${escapeHtml(message)}</span>`;

    if (action) {
        const button = document.createElement('button');
        button.className = 'toast-action';
        button.textContent = action.label;
        button.addEventListener('click', () => {
            dismiss();
            action.onClick();
        });
        element.appendChild(button);
    }

    container.appendChild(element);
    // Keep at most 3 toasts on screen so they never cover the page
    [...container.querySelectorAll('.toast:not(.toast-leaving)')].slice(0, -3).forEach((old) => old.remove());
    const timer = setTimeout(dismiss, type === 'error' ? 6000 : 4000);

    function dismiss() {
        clearTimeout(timer);
        element.classList.add('toast-leaving');
        setTimeout(() => element.remove(), 200);
    }
}

// Promise-based confirm dialog: resolves true if the user confirms
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
        const root = document.getElementById('modal-root');
        root.innerHTML = `
            <div class="modal-backdrop">
                <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                    <h2 id="modal-title">${escapeHtml(title)}</h2>
                    <p>${escapeHtml(message)}</p>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" data-answer="no">Cancel</button>
                        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-answer="yes">${escapeHtml(confirmLabel)}</button>
                    </div>
                </div>
            </div>`;

        const close = (answer) => {
            root.innerHTML = '';
            document.removeEventListener('keydown', onKey);
            resolve(answer);
        };
        const onKey = (event) => { if (event.key === 'Escape') close(false); };

        root.querySelector('.modal-backdrop').addEventListener('click', (event) => {
            if (event.target.dataset.answer) close(event.target.dataset.answer === 'yes');
            else if (event.target.classList.contains('modal-backdrop')) close(false);
        });
        document.addEventListener('keydown', onKey);
        root.querySelector('[data-answer="yes"]').focus();
    });
}
