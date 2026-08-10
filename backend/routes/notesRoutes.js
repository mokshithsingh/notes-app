const express = require('express');
const router = express.Router();
const notesController = require('../controllers/notesController');

router.get('/', notesController.notes);
router.post('/', notesController.newNote);
router.get('/trash', notesController.trash);
router.patch('/:noteId/trash', notesController.trashNote);
router.patch('/:noteId/restore', notesController.restoreNote);
router.get('/:noteId', notesController.fetchById);
router.patch('/:noteId', notesController.updateNote);
router.delete('/:noteId', notesController.delete);
router.post('/:noteId/attachments', notesController.attachment);
router.delete('/:noteId/attachments/:attachmentId', notesController.deleteAttachment);

module.exports = router;