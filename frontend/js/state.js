// App-wide state shared between views, with a tiny change-notification system
// so the sidebar can update when the user's plan or note count changes.

export const state = {
    user: null,          // { id, name, email, plan: 'free'|'pro', planExpiresOn }
    noteCount: null,     // number of active (not trashed) notes
    upgradeReason: '',   // message shown on the upgrade page (e.g. "note limit reached")
};

const listeners = new Set();

export function onStateChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setState(changes) {
    Object.assign(state, changes);
    listeners.forEach((listener) => listener(state));
}

export const FREE_NOTE_LIMIT = 10;
