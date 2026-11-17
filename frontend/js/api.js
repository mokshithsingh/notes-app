// Small wrapper around fetch for the backend API.
// The login cookie is httpOnly, so the browser sends it automatically on same-origin requests.

export class ApiError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

let onUnauthorized = null;

// Called when an API request (other than /api/auth/*) answers 401, i.e. the session expired
export function setUnauthorizedHandler(handler) {
    onUnauthorized = handler;
}

async function request(method, url, body) {
    const options = { method, headers: {}, credentials: 'same-origin' };

    if (body instanceof FormData) {
        options.body = body; // the browser sets the multipart Content-Type itself
    } else if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch(url, options);
    } catch {
        throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
    }

    let data = null;
    if ((response.headers.get('content-type') || '').includes('application/json')) {
        data = await response.json().catch(() => null);
    }

    if (!response.ok) {
        if (response.status === 401 && onUnauthorized && !url.startsWith('/api/auth/')) {
            onUnauthorized();
        }
        throw new ApiError(response.status, data?.message || `Request failed (${response.status})`, data?.code);
    }

    return data;
}

export const api = {
    // Auth
    me: () => request('GET', '/api/auth/me'),
    login: (email, password) => request('POST', '/api/auth/login', { email, password }),
    register: (name, email, password) => request('POST', '/api/auth/register', { name, email, password }),
    logout: () => request('POST', '/api/auth/logout'),

    // Notes
    listNotes: (search = '') => request('GET', '/api/notes' + (search ? `?search=${encodeURIComponent(search)}` : '')),
    listTrash: () => request('GET', '/api/notes/trash'),
    createNote: (note = {}) => request('POST', '/api/notes', note),
    getNote: (id) => request('GET', `/api/notes/${id}`),
    updateNote: (id, changes) => request('PATCH', `/api/notes/${id}`, changes),
    trashNote: (id) => request('PATCH', `/api/notes/${id}/trash`),
    restoreNote: (id) => request('PATCH', `/api/notes/${id}/restore`),
    deleteNote: (id) => request('DELETE', `/api/notes/${id}`),

    // Attachments
    uploadAttachment: (noteId, file) => {
        const form = new FormData();
        form.append('file', file);
        return request('POST', `/api/notes/${noteId}/attachments`, form);
    },
    deleteAttachment: (noteId, attachmentId) => request('DELETE', `/api/notes/${noteId}/attachments/${attachmentId}`),

    // Billing
    plans: () => request('GET', '/api/billing/plans'),
    account: () => request('GET', '/api/billing/account'),
    checkout: (details) => request('POST', '/api/billing/checkout', details),
};
