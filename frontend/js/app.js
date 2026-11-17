// App entry: login/register screen, sidebar layout and hash-based routing.
import { api, setUnauthorizedHandler } from './api.js';
import { state, setState, onStateChange, FREE_NOTE_LIMIT } from './state.js';
import { escapeHtml, formatDate, initials, icons, toast } from './ui.js';
import * as notesView from './views/notes.js';
import * as trashView from './views/trash.js';
import * as accountView from './views/account.js';
import * as upgradeView from './views/upgrade.js';

const app = document.getElementById('app');
let currentView = null;

// ---------- Boot ----------

async function boot() {
    setUnauthorizedHandler(() => {
        if (!state.user) return;
        toast('Your session has expired. Please log in again.', 'error');
        signedOut();
    });

    try {
        const user = await api.me();
        signedIn(user);
    } catch {
        renderAuth('login');
    }
}

function signedIn(user) {
    setState({ user, noteCount: null });
    renderShell();
    window.addEventListener('hashchange', route);
    route();
    // Note count for the sidebar usage meter
    api.listNotes().then((data) => setState({ noteCount: data.notes.length })).catch(() => {});
}

function signedOut() {
    window.removeEventListener('hashchange', route);
    setState({ user: null, noteCount: null });
    currentView = null;
    history.replaceState(null, '', location.pathname);
    renderAuth('login');
}

// ---------- Login / register ----------

function renderAuth(mode) {
    const isLogin = mode === 'login';
    document.title = isLogin ? 'Log in · Notes' : 'Create account · Notes';

    app.innerHTML = `
        <div class="auth-page">
            <section class="auth-hero">
                <div class="brand brand-light">${icons.logo}<span>Notes</span></div>
                <div class="auth-hero-text">
                    <h1>Your thoughts, organised.</h1>
                    <p>Write notes, attach files, and find anything in seconds. Start free, upgrade when you need more.</p>
                    <ul class="auth-features">
                        <li>${icons.check}Autosave on every keystroke</li>
                        <li>${icons.check}Attachments up to 10 MB</li>
                        <li>${icons.check}Trash with one-click restore</li>
                    </ul>
                </div>
            </section>
            <section class="auth-panel">
                <form class="auth-form" id="auth-form" novalidate>
                    <h2>${isLogin ? 'Welcome back' : 'Create your account'}</h2>
                    <p class="muted">${isLogin ? 'Log in to continue to your notes.' : 'Free forever for up to 10 notes.'}</p>
                    ${isLogin ? '' : `
                        <label class="field"><span>Name</span><input name="name" autocomplete="name" required></label>`}
                    <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
                    <label class="field"><span>Password</span>
                        <input name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required minlength="8"
                            placeholder="${isLogin ? '' : 'At least 8 characters'}">
                    </label>
                    <div class="form-error" id="auth-error" role="alert" hidden></div>
                    <button class="btn btn-primary btn-block" type="submit">${isLogin ? 'Log in' : 'Create account'}</button>
                    <p class="auth-switch">
                        ${isLogin ? "Don't have an account?" : 'Already have an account?'}
                        <button type="button" class="link-button" id="auth-switch">${isLogin ? 'Sign up' : 'Log in'}</button>
                    </p>
                </form>
            </section>
        </div>`;

    document.getElementById('auth-switch').addEventListener('click', () => renderAuth(isLogin ? 'register' : 'login'));

    const form = document.getElementById('auth-form');
    form.elements[isLogin ? 'email' : 'name'].focus();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const errorBox = document.getElementById('auth-error');
        const button = form.querySelector('button[type="submit"]');
        const values = Object.fromEntries(new FormData(form));
        errorBox.hidden = true;

        if (!isLogin && String(values.password).length < 8) {
            errorBox.textContent = 'Password must be at least 8 characters long';
            errorBox.hidden = false;
            return;
        }

        button.disabled = true;
        try {
            if (isLogin) {
                await api.login(values.email, values.password);
            } else {
                await api.register(values.name, values.email, values.password);
            }
            const user = await api.me();
            if (!location.hash) location.hash = '#/notes';
            signedIn(user);
            if (!isLogin) toast(`Welcome, ${user.name}!`, 'success');
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.hidden = false;
            button.disabled = false;
        }
    });
}

// ---------- Shell (sidebar + main area) ----------

function renderShell() {
    app.innerHTML = `
        <div class="layout">
            <aside class="sidebar">
                <div class="brand">${icons.logo}<span>Notes</span></div>
                <button class="btn btn-primary btn-block" id="sidebar-new-note">${icons.plus}<span>New note</span></button>
                <nav class="nav">
                    <a href="#/notes" data-nav="notes">${icons.note}<span>All notes</span></a>
                    <a href="#/trash" data-nav="trash">${icons.trash}<span>Trash</span></a>
                    <a href="#/account" data-nav="account">${icons.user}<span>Account</span></a>
                </nav>
                <div class="plan-box" id="plan-box"></div>
                <div class="user-box">
                    <div class="avatar" id="user-avatar"></div>
                    <div class="user-box-text">
                        <div class="user-name" id="user-name"></div>
                        <div class="user-email" id="user-email"></div>
                    </div>
                    <button class="icon-button" id="logout" title="Log out">${icons.logout}</button>
                </div>
            </aside>
            <main class="main" id="main"></main>
        </div>`;

    document.getElementById('sidebar-new-note').addEventListener('click', () => notesView.createNote());
    document.getElementById('logout').addEventListener('click', logout);
    renderSidebar();
}

function renderSidebar() {
    const planBox = document.getElementById('plan-box');
    if (!planBox || !state.user) return;

    document.getElementById('user-avatar').textContent = initials(state.user.name);
    document.getElementById('user-name').textContent = state.user.name;
    document.getElementById('user-email').textContent = state.user.email;

    if (state.user.plan === 'pro') {
        planBox.innerHTML = `
            <div class="plan-box-title"><span class="badge badge-pro">${icons.sparkle}Pro</span></div>
            <p class="small muted">Unlimited notes · renews ${escapeHtml(formatDate(state.user.planExpiresOn))}</p>`;
        return;
    }

    const used = state.noteCount ?? 0;
    const percent = Math.min(100, Math.round((used / FREE_NOTE_LIMIT) * 100));
    planBox.innerHTML = `
        <div class="plan-box-title"><span class="badge">Free plan</span></div>
        <p class="small muted">${state.noteCount === null ? '…' : used} of ${FREE_NOTE_LIMIT} notes used</p>
        <div class="progress"><div class="progress-bar ${percent >= 100 ? 'full' : ''}" style="width:${percent}%"></div></div>
        <a class="btn btn-secondary btn-sm btn-block" href="#/upgrade">${icons.sparkle}<span>Upgrade to Pro</span></a>`;
}

onStateChange(() => renderSidebar());

async function logout() {
    await notesView.beforeLeave();
    try {
        await api.logout();
    } catch {
        // Even if the request fails, show the login screen
    }
    signedOut();
}

// ---------- Routing ----------

const VIEWS = {
    notes: { module: notesView, title: 'Notes' },
    trash: { module: trashView, title: 'Trash' },
    account: { module: accountView, title: 'Account' },
    upgrade: { module: upgradeView, title: 'Upgrade' },
};

async function route() {
    if (!state.user) return;

    const [, section = 'notes', id] = location.hash.replace(/^#/, '').split('/');
    const view = VIEWS[section] ? section : 'notes';
    if (!VIEWS[section] || !location.hash) {
        history.replaceState(null, '', '#/notes');
    }

    if (currentView === 'notes' && view !== 'notes') {
        await notesView.beforeLeave();
    }
    currentView = view;

    document.title = `${VIEWS[view].title} · Notes`;
    document.querySelectorAll('[data-nav]').forEach((link) => {
        link.classList.toggle('active', link.dataset.nav === view || (view === 'upgrade' && link.dataset.nav === 'account'));
    });

    const main = document.getElementById('main');
    if (view !== 'notes') main.dataset.view = '';
    await VIEWS[view].module.show(main, id);
}

window.addEventListener('beforeunload', (event) => {
    if (notesView.hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = '';
    }
});

boot();
