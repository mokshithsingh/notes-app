require('dotenv').config();
const jwt = require('jsonwebtoken');

let authMiddleware = (req, res, next) => {
    const token = req.cookies.token;

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