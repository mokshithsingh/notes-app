const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const noteMiddleware = require('../middleware/noteMiddleware');
const attachmentsMiddleware = require('../middleware/attachmentsMiddleware');
const notesController = require('../controllers/notesController');

const { checkNoteLimit, loadNote } = noteMiddleware;

router.use(authMiddleware.authMiddleware);
router.get('/', notesController.notes);
router.post('/', checkNoteLimit, notesController.newNote);
router.get('/trash', notesController.trash);
router.patch('/:noteId/trash', loadNote, notesController.trashNote);
router.patch('/:noteId/restore', loadNote, checkNoteLimit, notesController.restoreNote);
router.get('/:noteId', loadNote, notesController.fetchById);
router.patch('/:noteId', loadNote, notesController.updateNote);
router.delete('/:noteId', loadNote, notesController.delete);
router.post('/:noteId/attachments', loadNote, attachmentsMiddleware.uploadAttachment, notesController.addAttachment);
router.get('/:noteId/attachments/:attachmentId', loadNote, notesController.downloadAttachment);
router.delete('/:noteId/attachments/:attachmentId', loadNote, notesController.deleteAttachment);

module.exports = router;
