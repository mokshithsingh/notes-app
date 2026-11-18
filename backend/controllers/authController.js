require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db.js');
const { isPro } = require('../utils/plans');
const { AUTH_COOKIE_NAME } = require('../middleware/authMiddleware');

const TOKEN_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// "secure" cookies are only sent over HTTPS, so set it based on how the request arrived.
// (Locally the app runs on plain http://localhost.)
function cookieOptions(req) {
    return {
        httpOnly : true,
        secure : req.secure || req.headers['x-forwarded-proto'] === 'https',
        sameSite : 'lax'
    };
}

function setAuthCookie(req, res, userId) {
    const token = jwt.sign({id : userId}, process.env.JWT_SECRET, {expiresIn : '14d'});
    res.cookie(AUTH_COOKIE_NAME, token, {...cookieOptions(req), maxAge : TOKEN_MAX_AGE_MS});
}

let register = async(req, res, next) => {
    const { name, email, password } = req.body || {};

    if ( !name || !email || !password ) {
        return res.status(400).json({message : "Name, email and password are all required to register"});
    };

    if (String(password).length < 8) {
        return res.status(400).json({message : "Password must be at least 8 characters long"});
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    try {
        const isExists = await pool.query("SELECT 1 FROM users WHERE email = $1", [normalizedEmail]);

        if (isExists.rows.length != 0) {
            return res.status(409).json({message : "This email is already registered"});
        };

        const passwordHash = await bcrypt.hash(password, 10);

        const createUser = await pool.query("INSERT INTO users(name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name", [String(name).trim(), normalizedEmail, passwordHash]);

        // Log the new user in straight away
        setAuthCookie(req, res, createUser.rows[0].id);

        return res.status(201).json({message : "Registration successful", id : createUser.rows[0].id, name : createUser.rows[0].name});

    } catch (err) {
        return next(err);
    }
}

let login = async(req, res, next) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({message : "Both email and password are required to login"})
    }

    try {
        const user = await pool.query("SELECT id, password_hash FROM users WHERE email = $1", [String(email).trim().toLowerCase()]);

        if (user.rows.length == 0) {
            return res.status(404).json({message : "This email is not registered with us"});
        }

        const passwordCheck = await bcrypt.compare(password, user.rows[0].password_hash);

        if (!passwordCheck) {
            return res.status(401).json({message : "Incorrect password. Please try again"});
        }

        setAuthCookie(req, res, user.rows[0].id);

        return res.status(200).json({message : "Login successful"});

    } catch(err) {
        return next(err);
    }
}

let logout = (req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, cookieOptions(req));

    res.status(200).json({message : "Cookie cleared successfully"});
}

let getMe = async(req, res, next) => {
    try {
        const getUser = await pool.query("SELECT id, name, email, plan, plan_expires_on FROM users WHERE id = $1", [req.userId]);

        if (getUser.rows.length == 0) {
            return res.status(404).json({message : "No user found"});
        };

        const user = getUser.rows[0];

        return res.status(200).json({
            id : user.id,
            name : user.name,
            email : user.email,
            plan : isPro(user) ? 'pro' : 'free',
            planExpiresOn : user.plan_expires_on
        });
    } catch (err) {
        return next(err);
    }
}

exports.register = register;
exports.login = login;
exports.logout = logout;
exports.getMe = getMe;
