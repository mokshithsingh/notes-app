const fs = require('fs/promises');
const { pool } = require('../config/db.js');
const { storedFilePath } = require('../middleware/attachmentsMiddleware');

const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 100000;

// Escape % and _ so a search for "50%" matches the literal text
function likePattern(search) {
    return '%' + search.replace(/[\\%_]/g, (ch) => '\\' + ch) + '%';
}

// Deletes attachment files from disk. A file that is already gone is not an error.
async function removeFiles(attachments) {
    await Promise.all(attachments.map((a) => fs.unlink(storedFilePath(a)).catch((err) => {
        if (err.code !== 'ENOENT') throw err;
    })));
}

// GET /api/notes?search=... -> the user's active notes, most recently edited first
let notes = async(req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const params = [req.userId];
    let searchClause = '';
    if (search !== '') {
        params.push(likePattern(search));
        searchClause = 'AND (notes.title ILIKE $2 OR notes.body ILIKE $2)';
    }

    const result = await pool.query(
        `SELECT notes.id, notes.title, notes.body, notes.created_at, notes.updated_at,
                COUNT(attachments.id)::int AS attachment_count
         FROM notes
         LEFT JOIN attachments ON attachments.note_id = notes.id
         WHERE notes.user_id = $1 AND notes.deleted_at IS NULL ${searchClause}
         GROUP BY notes.id
         ORDER BY notes.updated_at DESC`,
        params
    );

    return res.status(200).json({notes : result.rows});
};

// POST /api/notes -> create a note (checkNoteLimit runs first)
let newNote = async(req, res) => {
    const title = typeof req.body?.title === 'string' && req.body.title.trim() !== '' ? req.body.title.trim() : 'Untitled';
    const body = typeof req.body?.body === 'string' ? req.body.body : '';

    if (title.length > MAX_TITLE_LENGTH || body.length > MAX_BODY_LENGTH) {
        return res.status(400).json({message : "Note is too long"});
    }

    const result = await pool.query(
        "INSERT INTO notes(user_id, title, body) VALUES ($1, $2, $3) RETURNING id, title, body, created_at, updated_at, deleted_at",
        [req.userId, title, body]
    );

    return res.status(201).json({note : {...result.rows[0], attachments : []}});
};

// GET /api/notes/trash -> notes in the trash, most recently deleted first
let trash = async(req, res) => {
    const result = await pool.query(
        "SELECT id, title, body, created_at, updated_at, deleted_at FROM notes WHERE user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
        [req.userId]
    );

    return res.status(200).json({notes : result.rows});
};

// GET /api/notes/:noteId -> one note with its attachments (loadNote runs first)
let fetchById = async(req, res) => {
    const attachments = await pool.query(
        "SELECT id, file_name, url, created_at FROM attachments WHERE note_id = $1 ORDER BY created_at",
        [req.note.id]
    );

    return res.status(200).json({note : {...req.note, attachments : attachments.rows}});
};

// PATCH /api/notes/:noteId -> update the title and/or body
let updateNote = async(req, res) => {
    if (req.note.deleted_at) {
        return res.status(409).json({message : "Restore this note from the trash before editing it"});
    }

    const title = req.body.title.trim();
    const body = req.body.body;

    if (title === '') {
        return res.status(400).json({message : "Title cannot be empty"});
    }

    if (title.length > MAX_TITLE_LENGTH || (typeof body === 'string' && body.length > MAX_BODY_LENGTH)) {
        return res.status(400).json({message : "Note is too long"});
    }

    const result = await pool.query(
        `UPDATE notes
         SET title = COALESCE($1, title), body = COALESCE($2, body), updated_at = NOW()
         WHERE id = $3
         RETURNING id, title, body, created_at, updated_at, deleted_at`,
        [title, typeof body === 'string' ? body : null, req.note.id]
    );

    return res.status(200).json({note : result.rows[0]});
};

// PATCH /api/notes/:noteId/trash -> move to trash
let trashNote = async(req, res) => {
    const result = await pool.query(
        "UPDATE notes SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, deleted_at",
        [req.note.id]
    );

    if (result.rows.length == 0) {
        return res.status(409).json({message : "This note is already in the trash"});
    }

    return res.status(200).json({message : "Note moved to trash", note : result.rows[0]});
};

// PATCH /api/notes/:noteId/restore -> bring back from trash (checkNoteLimit runs first)
let restoreNote = async(req, res) => {
    const result = await pool.query(
        "UPDATE notes SET deleted_at = NULL, updated_at = NOW() WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id, title, body, created_at, updated_at, deleted_at",
        [req.note.id]
    );

    if (result.rows.length == 0) {
        return res.status(409).json({message : "This note is not in the trash"});
    }

    return res.status(200).json({message : "Note restored", note : result.rows[0]});
};

// DELETE /api/notes/:noteId -> permanently delete a note that is in the trash
let deleteNote = async(req, res) => {
    if (!req.note.deleted_at) {
        return res.status(409).json({message : "Move the note to the trash before deleting it permanently"});
    }

    const attachments = await pool.query("SELECT id, file_name FROM attachments WHERE note_id = $1", [req.note.id]);

    // Attachments rows are removed by ON DELETE CASCADE
    await pool.query("DELETE FROM notes WHERE id = $1", [req.note.id]);
    await removeFiles(attachments.rows);

    return res.status(200).json({message : "Note deleted permanently"});
};

// POST /api/notes/:noteId/attachments -> upload one file (field name "file")
let addAttachment = async(req, res) => {
    if (!req.file) {
        return res.status(400).json({message : "Choose a file to upload"});
    }

    if (req.note.deleted_at) {
        await removeFiles([{id : req.attachmentId, file_name : req.file.originalname}]);
        return res.status(409).json({message : "Restore this note from the trash before adding files"});
    }

    const url = `/api/notes/${req.note.id}/attachments/${req.attachmentId}`;

    const result = await pool.query(
        "INSERT INTO attachments(id, note_id, file_name, url) VALUES ($1, $2, $3, $4) RETURNING id, file_name, url, created_at",
        [req.attachmentId, req.note.id, req.file.originalname, url]
    );
    await pool.query("UPDATE notes SET updated_at = NOW() WHERE id = $1", [req.note.id]);

    return res.status(201).json({attachment : result.rows[0]});
};

// GET /api/notes/:noteId/attachments/:attachmentId -> download the file
let downloadAttachment = async(req, res) => {
    const result = await pool.query(
        "SELECT id, file_name FROM attachments WHERE id::text = $1 AND note_id = $2",
        [req.params.attachmentId, req.note.id]
    );

    if (result.rows.length == 0) {
        return res.status(404).json({message : "Attachment not found"});
    }

    const attachment = result.rows[0];
    res.download(storedFilePath(attachment), attachment.file_name, (err) => {
        if (err && !res.headersSent) {
            res.status(404).json({message : "Attachment file is missing"});
        }
    });
};

// DELETE /api/notes/:noteId/attachments/:attachmentId
let deleteAttachment = async(req, res) => {
    const result = await pool.query(
        "DELETE FROM attachments WHERE id::text = $1 AND note_id = $2 RETURNING id, file_name",
        [req.params.attachmentId, req.note.id]
    );

    if (result.rows.length == 0) {
        return res.status(404).json({message : "Attachment not found"});
    }

    await removeFiles(result.rows);

    return res.status(200).json({message : "Attachment deleted"});
};

exports.notes = notes;
exports.newNote = newNote;
exports.trash = trash;
exports.fetchById = fetchById;
exports.updateNote = updateNote;
exports.trashNote = trashNote;
exports.restoreNote = restoreNote;
exports.delete = deleteNote;
exports.addAttachment = addAttachment;
exports.downloadAttachment = downloadAttachment;
exports.deleteAttachment = deleteAttachment;
