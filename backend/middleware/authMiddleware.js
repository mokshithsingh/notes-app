require('dotenv').config();
const jwt = require('jsonwebtoken');

// Name of the login cookie. Not plain "token": browsers share cookies between
// ports on the same host, and Faultline (same server, port 4200) already uses "token".
const AUTH_COOKIE_NAME = 'notes_token';

let authMiddleware = (req, res, next) => {
    const token = req.cookies[AUTH_COOKIE_NAME];

    if (!token) {
        return res.status(401).json({message : "Missing token"});
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = payload.id;
        next();
    } catch (err) {
        console.error(err);
        return res.status(401).json({message : "Invalid/expired token"});
    }
}

exports.authMiddleware = authMiddleware;
exports.AUTH_COOKIE_NAME = AUTH_COOKIE_NAME;