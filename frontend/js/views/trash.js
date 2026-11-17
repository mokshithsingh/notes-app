// Trash view: restore notes or delete them permanently.
import { api } from '../api.js';
import { state, setState } from '../state.js';
import { escapeHtml, snippet, formatRelative, icons, toast, confirmDialog } from '../ui.js';

let main = null;
let notes = [];

export async function show(container) {
    main = container;
    main.dataset.view = 'trash';
    main.classList.remove('has-open-note');
    main.innerHTML = `
        <div class="page">
            <header class="page-header">
                <div>
                    <h1>Trash</h1>
                    <p class="muted">Restore notes you still need, or delete them for good.</p>
                </div>
            </header>
            <div id="trash-content"><div class="center-block"><div class="spinner"></div></div></div>
        </div>`;

    try {
        const data = await api.listTrash();
        notes = data.notes;
        render();
    } catch (err) {
        document.getElementById('trash-content').innerHTML = errorState(err.message);
        document.getElementById('retry').addEventListener('click', () => show(main));
    }
}

function errorState(message) {
    return `<div class="card empty-state">${icons.alert}<h2>Couldn't load the trash</h2><p>${escapeHtml(message)}</p>
        <button class="btn btn-secondary" id="retry">Try again</button></div>`;
}

function render() {
    const content = document.getElementById('trash-content');
    if (!content) return;

    if (notes.length === 0) {
        content.innerHTML = `<div class="card empty-state">${icons.trash}<h2>Trash is empty</h2><p>Notes you delete will show up here.</p></div>`;
        return;
    }

    content.innerHTML = `
        <ul class="trash-list">
            ${notes.map((note) => `
                <li class="card trash-item">
                    <a class="trash-item-text" href="#/notes/${note.id}">
                        <span class="note-item-title">${escapeHtml(note.title || 'Untitled')}</span>
                        <span class="note-item-snippet">${escapeHtml(snippet(note.body, 140) || 'No additional text')}</span>
                        <span class="note-item-meta">Deleted ${formatRelative(note.deleted_at)}</span>
                    </a>
                    <div class="trash-item-actions">
                        <button class="btn btn-secondary btn-sm" data-restore="${note.id}">${icons.restore}<span>Restore</span></button>
                        <button class="btn btn-ghost btn-sm danger" data-delete="${note.id}">${icons.trash}<span>Delete forever</span></button>
                    </div>
                </li>`).join('')}
        </ul>`;

    content.querySelectorAll('[data-restore]').forEach((button) => {
        button.addEventListener('click', () => restore(button.dataset.restore, button));
    });
    content.querySelectorAll('[data-delete]').forEach((button) => {
        button.addEventListener('click', () => remove(button.dataset.delete));
    });
}

async function restore(id, button) {
    button.disabled = true;
    try {
        await api.restoreNote(id);
        notes = notes.filter((n) => n.id !== id);
        if (state.noteCount !== null) setState({ noteCount: state.noteCount + 1 });
        render();
        toast('Note restored', 'success', { label: 'Open', onClick: () => { location.hash = `#/notes/${id}`; } });
    } catch (err) {
        button.disabled = false;
        if (err.code === 'NOTE_LIMIT_REACHED') {
            toast(err.message, 'error', { label: 'Upgrade', onClick: () => { location.hash = '#/upgrade'; } });
        } else {
            toast(`Couldn't restore the note. ${err.message}`, 'error');
        }
    }
}

async function remove(id) {
    const note = notes.find((n) => n.id === id);
    const confirmed = await confirmDialog({
        title: 'Delete forever?',
        message: `“${note?.title || 'Untitled'}” and its attachments will be permanently deleted. This can't be undone.`,
        confirmLabel: 'Delete forever',
        danger: true,
    });
    if (!confirmed) return;

    try {
        await api.deleteNote(id);
        notes = notes.filter((n) => n.id !== id);
        render();
        toast('Note deleted permanently', 'success');
    } catch (err) {
        toast(`Couldn't delete the note. ${err.message}`, 'error');
    }
}
