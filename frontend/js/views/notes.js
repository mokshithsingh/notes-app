// Notes view: searchable list on the left, editor with autosave and attachments on the right.
import { api } from '../api.js';
import { state, setState } from '../state.js';
import { escapeHtml, snippet, formatRelative, formatDateTime, icons, toast } from '../ui.js';

const AUTOSAVE_DELAY_MS = 800;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

let main = null;          // the <main> element this view renders into
let notes = [];           // notes shown in the list
let search = '';
let activeNote = null;    // note open in the editor (with attachments)
const dirtyFields = new Set();
let saveTimer = null;
let savePromise = null;
let saveStatus = 'idle';  // idle | pending | saving | saved | error
let searchTimer = null;
let lastSaveFailed = false; // show one error toast per failure streak, not one per keystroke

// ---------- Public API used by app.js ----------

export async function show(container, noteId) {
    main = container;
    if (main.dataset.view !== 'notes') {
        mountLayout();
        await loadList();
    }
    if (noteId) {
        await openNote(noteId);
    } else {
        await flushSave();
        activeNote = null;
        renderEditor();
        renderList();
    }
}

// Saves pending edits before the user navigates elsewhere
export async function beforeLeave() {
    await flushSave();
}

export function hasUnsavedChanges() {
    return dirtyFields.size > 0 || saveStatus === 'saving';
}

// Creates an empty note and opens it. Used by the sidebar's "New note" button too.
export async function createNote() {
    await flushSave();
    try {
        const { note } = await api.createNote({ title: 'Untitled' });
        if (state.noteCount !== null) setState({ noteCount: state.noteCount + 1 });
        if (main?.dataset.view === 'notes' && search === '') {
            notes.unshift({ ...note, attachment_count: 0 });
        }
        location.hash = `#/notes/${note.id}`;
        // Focus the title so the user can start typing immediately
        setTimeout(() => {
            const title = document.getElementById('note-title');
            if (title) { title.focus(); title.select(); }
        }, 50);
    } catch (err) {
        if (err.code === 'NOTE_LIMIT_REACHED') {
            setState({ upgradeReason: err.message });
            location.hash = '#/upgrade';
        } else {
            toast(`Couldn't create a note. ${err.message}`, 'error');
        }
    }
}

// ---------- Layout & list ----------

function mountLayout() {
    main.dataset.view = 'notes';
    main.innerHTML = `
        <div class="notes-layout">
            <section class="note-list-pane" aria-label="Notes">
                <div class="pane-header">
                    <h1>Notes</h1>
                    <button class="btn btn-primary btn-sm" id="list-new-note">${icons.plus}<span>New</span></button>
                </div>
                <label class="search-box">
                    ${icons.search}
                    <input type="search" id="note-search" placeholder="Search notes" autocomplete="off" value="${escapeHtml(search)}">
                </label>
                <ul class="note-list" id="note-list"><li class="list-placeholder">Loading notes…</li></ul>
            </section>
            <section class="editor-pane" id="editor" aria-label="Editor"></section>
        </div>`;

    main.querySelector('#list-new-note').addEventListener('click', createNote);
    main.querySelector('#note-search').addEventListener('input', (event) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            search = event.target.value.trim();
            loadList();
        }, 250);
    });
}

async function loadList() {
    try {
        const data = await api.listNotes(search);
        notes = data.notes;
        if (search === '') setState({ noteCount: notes.length });
        renderList();
    } catch (err) {
        const list = document.getElementById('note-list');
        if (list) list.innerHTML = `<li class="list-placeholder error">${escapeHtml(err.message)}</li>`;
    }
}

function renderList() {
    const list = document.getElementById('note-list');
    if (!list) return;

    if (notes.length === 0) {
        list.innerHTML = search
            ? `<li class="list-placeholder">No notes match “${escapeHtml(search)}”.</li>`
            : `<li class="list-placeholder">No notes yet. Create your first one!</li>`;
        return;
    }

    list.innerHTML = notes.map((note) => `
        <li>
            <a class="note-item ${activeNote?.id === note.id ? 'active' : ''}" href="#/notes/${note.id}" data-id="${note.id}">
                <span class="note-item-title">${escapeHtml(note.title || 'Untitled')}</span>
                <span class="note-item-snippet">${escapeHtml(snippet(note.body) || 'No additional text')}</span>
                <span class="note-item-meta">
                    <span>${formatRelative(note.updated_at)}</span>
                    ${note.attachment_count ? `<span class="meta-attach">${icons.paperclip}${note.attachment_count}</span>` : ''}
                </span>
            </a>
        </li>`).join('');
}

// Keeps the list entry in sync while typing, without re-rendering the whole list
function updateListItem(note) {
    const entry = notes.find((n) => n.id === note.id);
    if (!entry) return;
    Object.assign(entry, { title: note.title, body: note.body, updated_at: note.updated_at });
    const link = document.querySelector(`.note-item[data-id="${note.id}"]`);
    if (link) {
        link.querySelector('.note-item-title').textContent = note.title || 'Untitled';
        link.querySelector('.note-item-snippet').textContent = snippet(note.body) || 'No additional text';
    }
}

// ---------- Editor ----------

async function openNote(id) {
    if (activeNote?.id === id) {
        renderList();
        return;
    }
    await flushSave();

    const editor = document.getElementById('editor');
    editor.innerHTML = `<div class="editor-empty"><div class="spinner"></div></div>`;
    activeNote = { id };
    renderList();

    try {
        const { note } = await api.getNote(id);
        if (activeNote?.id !== id) return; // user already moved on
        activeNote = note;
        dirtyFields.clear();
        lastSaveFailed = false;
        setSaveStatus('idle');
        renderEditor();
    } catch (err) {
        if (activeNote?.id !== id) return;
        activeNote = null;
        editor.innerHTML = `
            <div class="editor-empty">
                ${icons.alert}
                <h2>${err.status === 404 ? 'Note not found' : "Couldn't open this note"}</h2>
                <p>${escapeHtml(err.status === 404 ? 'It may have been deleted.' : err.message)}</p>
                <a class="btn btn-secondary" href="#/notes">Back to notes</a>
            </div>`;
    }
}

function renderEditor() {
    const editor = document.getElementById('editor');
    if (!editor) return;
    main.classList.toggle('has-open-note', Boolean(activeNote));

    if (!activeNote) {
        editor.innerHTML = `
            <div class="editor-empty">
                ${icons.note}
                <h2>Select a note</h2>
                <p>Pick a note from the list or create a new one.</p>
                <button class="btn btn-primary" id="empty-new-note">${icons.plus}<span>New note</span></button>
            </div>`;
        editor.querySelector('#empty-new-note').addEventListener('click', createNote);
        return;
    }

    const inTrash = Boolean(activeNote.deleted_at);

    editor.innerHTML = `
        <div class="editor">
            ${inTrash ? `
                <div class="banner banner-warning">
                    ${icons.trash}<span>This note is in the trash. Restore it to edit.</span>
                    <button class="btn btn-secondary btn-sm" id="restore-note">${icons.restore}<span>Restore</span></button>
                </div>` : ''}
            <div class="editor-toolbar">
                <a class="btn btn-ghost btn-sm back-link" href="#/notes">← Notes</a>
                <span class="save-status" id="save-status" aria-live="polite"></span>
                <div class="toolbar-actions">
                    ${inTrash ? '' : `
                        <label class="btn btn-ghost btn-sm" title="Attach a file (max 10 MB)">
                            ${icons.paperclip}<span>Attach</span>
                            <input type="file" id="file-input" hidden>
                        </label>
                        <button class="btn btn-ghost btn-sm danger" id="trash-note" title="Move to trash">${icons.trash}<span>Trash</span></button>`}
                </div>
            </div>
            <input class="editor-title" id="note-title" maxlength="200" placeholder="Title"
                value="${escapeHtml(activeNote.title)}" ${inTrash ? 'readonly' : ''}>
            <div class="editor-meta">
                Created ${formatDateTime(activeNote.created_at)} · <span id="edited-at">Edited ${formatRelative(activeNote.updated_at)}</span>
            </div>
            <textarea class="editor-body" id="note-body" placeholder="Start writing…" ${inTrash ? 'readonly' : ''}>${escapeHtml(activeNote.body || '')}</textarea>
            <div class="attachments" id="attachments"></div>
        </div>`;

    renderAttachments();
    setSaveStatus(saveStatus);

    if (inTrash) {
        editor.querySelector('#restore-note').addEventListener('click', restoreActiveNote);
        return;
    }

    editor.querySelector('#note-title').addEventListener('input', (event) => onEdit('title', event.target.value));
    editor.querySelector('#note-body').addEventListener('input', (event) => onEdit('body', event.target.value));
    editor.querySelector('#trash-note').addEventListener('click', trashActiveNote);
    editor.querySelector('#file-input').addEventListener('change', (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) uploadFile(file);
    });
}

function onEdit(field, value) {
    activeNote[field] = value;
    dirtyFields.add(field);
    updateListItem(activeNote);
    setSaveStatus('pending');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, AUTOSAVE_DELAY_MS);
}

// Sends only the fields that changed since the last successful save
function save() {
    clearTimeout(saveTimer);
    if (!activeNote || dirtyFields.size === 0) return savePromise || Promise.resolve();

    const note = activeNote;
    const changes = {};
    dirtyFields.forEach((field) => { changes[field] = note[field]; });
    dirtyFields.clear();
    setSaveStatus('saving');

    savePromise = api.updateNote(note.id, changes)
        .then(({ note: saved }) => {
            lastSaveFailed = false;
            note.updated_at = saved.updated_at;
            updateListItem(note);
            if (activeNote === note) {
                const edited = document.getElementById('edited-at');
                if (edited) edited.textContent = 'Edited just now';
                setSaveStatus(dirtyFields.size ? 'pending' : 'saved');
            }
        })
        .catch((err) => {
            // Keep the changes marked as unsaved so "Retry" sends them again
            if (activeNote === note) {
                Object.keys(changes).forEach((field) => dirtyFields.add(field));
                if (!lastSaveFailed) toast(`Couldn't save your changes. ${err.message}`, 'error');
                lastSaveFailed = true;
                setSaveStatus('error');
            }
        })
        .finally(() => { savePromise = null; });

    return savePromise;
}

async function flushSave() {
    clearTimeout(saveTimer);
    if (savePromise) await savePromise;
    if (dirtyFields.size && saveStatus !== 'error') await save();
}

function setSaveStatus(status) {
    saveStatus = status;
    const element = document.getElementById('save-status');
    if (!element) return;

    const labels = {
        idle: '',
        pending: 'Unsaved changes',
        saving: '<span class="spinner spinner-sm"></span> Saving…',
        saved: `${icons.check} Saved`,
        error: `${icons.alert} Couldn't save <button class="link-button" id="retry-save">Retry</button>`,
    };
    element.className = `save-status save-${status}`;
    element.innerHTML = labels[status];
    element.querySelector('#retry-save')?.addEventListener('click', () => {
        setSaveStatus('pending');
        save();
    });
}

// ---------- Trash / restore ----------

async function trashActiveNote() {
    const note = activeNote;
    await flushSave();
    try {
        await api.trashNote(note.id);
        notes = notes.filter((n) => n.id !== note.id);
        if (state.noteCount !== null) setState({ noteCount: Math.max(0, state.noteCount - 1) });
        activeNote = null;
        dirtyFields.clear();
        location.hash = '#/notes';
        toast(`“${note.title || 'Untitled'}” moved to trash`, 'info', {
            label: 'Undo',
            onClick: async () => {
                try {
                    await api.restoreNote(note.id);
                    if (state.noteCount !== null) setState({ noteCount: state.noteCount + 1 });
                    if (main?.dataset.view === 'notes') await loadList();
                    location.hash = `#/notes/${note.id}`;
                } catch (err) {
                    toast(`Couldn't restore the note. ${err.message}`, 'error');
                }
            },
        });
    } catch (err) {
        toast(`Couldn't move the note to trash. ${err.message}`, 'error');
    }
}

async function restoreActiveNote() {
    try {
        const { note } = await api.restoreNote(activeNote.id);
        activeNote = { ...activeNote, ...note };
        if (state.noteCount !== null) setState({ noteCount: state.noteCount + 1 });
        await loadList();
        renderEditor();
        toast('Note restored', 'success');
    } catch (err) {
        if (err.code === 'NOTE_LIMIT_REACHED') {
            toast(err.message, 'error', { label: 'Upgrade', onClick: () => { location.hash = '#/upgrade'; } });
        } else {
            toast(`Couldn't restore the note. ${err.message}`, 'error');
        }
    }
}

// ---------- Attachments ----------

function renderAttachments(uploadingName = null) {
    const container = document.getElementById('attachments');
    if (!container || !activeNote) return;
    const attachments = activeNote.attachments || [];

    if (attachments.length === 0 && !uploadingName) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <h3>Attachments</h3>
        <ul class="attachment-list">
            ${attachments.map((a) => `
                <li class="attachment">
                    ${icons.file}
                    <a href="${escapeHtml(a.url)}" download="${escapeHtml(a.file_name)}" class="attachment-name" title="Download">${escapeHtml(a.file_name)}</a>
                    <span class="attachment-date">${formatRelative(a.created_at)}</span>
                    <a href="${escapeHtml(a.url)}" download="${escapeHtml(a.file_name)}" class="icon-button" title="Download">${icons.download}</a>
                    ${activeNote.deleted_at ? '' : `<button class="icon-button danger" data-remove="${a.id}" title="Remove">${icons.close}</button>`}
                </li>`).join('')}
            ${uploadingName ? `<li class="attachment uploading"><span class="spinner spinner-sm"></span><span class="attachment-name">Uploading ${escapeHtml(uploadingName)}…</span></li>` : ''}
        </ul>`;

    container.querySelectorAll('[data-remove]').forEach((button) => {
        button.addEventListener('click', () => removeAttachment(button.dataset.remove));
    });
}

async function uploadFile(file) {
    if (file.size > MAX_UPLOAD_BYTES) {
        toast('Files can be at most 10 MB', 'error');
        return;
    }
    const note = activeNote;
    renderAttachments(file.name);
    try {
        const { attachment } = await api.uploadAttachment(note.id, file);
        note.attachments = [...(note.attachments || []), attachment];
        const entry = notes.find((n) => n.id === note.id);
        if (entry) entry.attachment_count = (entry.attachment_count || 0) + 1;
        renderList();
        toast(`${file.name} attached`, 'success');
    } catch (err) {
        toast(`Couldn't upload ${file.name}. ${err.message}`, 'error');
    }
    if (activeNote === note) renderAttachments();
}

async function removeAttachment(attachmentId) {
    const note = activeNote;
    try {
        await api.deleteAttachment(note.id, attachmentId);
        note.attachments = note.attachments.filter((a) => a.id !== attachmentId);
        const entry = notes.find((n) => n.id === note.id);
        if (entry) entry.attachment_count = Math.max(0, (entry.attachment_count || 1) - 1);
        renderList();
        if (activeNote === note) renderAttachments();
    } catch (err) {
        toast(`Couldn't remove the file. ${err.message}`, 'error');
    }
}
