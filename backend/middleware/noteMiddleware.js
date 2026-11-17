const { pool } = require('../config/db.js');
const { FREE_NOTE_LIMIT, isPro } = require('../utils/plans');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Blocks creating/restoring notes once a free user has FREE_NOTE_LIMIT active notes.
// Pro users (active plan that hasn't expired) are never limited.
let checkNoteLimit = async(req, res, next) => {
    const result = await pool.query(
        `SELECT users.plan, users.plan_expires_on, COUNT(notes.id)::int AS note_count
         FROM users
         LEFT JOIN notes ON notes.user_id = users.id AND notes.deleted_at IS NULL
         WHERE users.id = $1
         GROUP BY users.id`,
        [req.userId]
    );

    const user = result.rows[0];

    if (!user) {
        return res.status(401).json({message : "Your session is no longer valid. Please log in again"});
    }

    if (isPro(user)) {
        return next();
    }

    if (user.note_count >= FREE_NOTE_LIMIT) {
        return res.status(403).json({
            message : `Free accounts can have up to ${FREE_NOTE_LIMIT} notes. Upgrade to Pro for unlimited notes`,
            code : 'NOTE_LIMIT_REACHED'
        });
    }

    next();
};

// Loads the note from the URL (:noteId) into req.note, but only if it belongs to the logged-in user.
// Unknown, malformed or someone else's note ids all get the same 404.
let loadNote = async(req, res, next) => {
    const noteId = req.params.noteId;

    if (!UUID_REGEX.test(noteId)) {
        return res.status(404).json({message : "Note not found"});
    }

    const result = await pool.query(
        "SELECT id, title, body, created_at, updated_at, deleted_at FROM notes WHERE id = $1 AND user_id = $2",
        [noteId, req.userId]
    );

    if (result.rows.length == 0) {
        return res.status(404).json({message : "Note not found"});
    }

    req.note = result.rows[0];
    next();
};

exports.checkNoteLimit = checkNoteLimit;
exports.loadNote = loadNote;
