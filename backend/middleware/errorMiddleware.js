const multer = require('multer');
const Faultline = require('faultline-tracker');
const { MAX_FILE_SIZE } = require('./attachmentsMiddleware');

// Unknown /api/... routes
let notFound = (req, res) => {
    res.status(404).json({message : "Not found"});
};

// Central error handler. Express 5 sends every error thrown in a route here
// (including rejected promises from async handlers), so one failing request
// never takes the whole server down. (Express needs all 4 parameters to treat it as an error handler.)
let errorHandler = (err, req, res, next) => {
    // Expected client mistakes: answer with a 400 and don't report them
    if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? `Files can be at most ${MAX_FILE_SIZE / (1024 * 1024)} MB`
            : "Upload failed: " + err.message;
        return res.status(400).json({message});
    }

    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
        return res.status(400).json({message : "Invalid request body"});
    }

    // Anything else is a bug: log it and report it to Faultline
    console.error(`${req.method} ${req.originalUrl} failed:`, err);
    Faultline.captureException(err);

    if (res.headersSent) {
        return;
    }
    res.status(500).json({message : "Something went wrong, please try again"});
};

exports.notFound = notFound;
exports.errorHandler = errorHandler;
