require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db.js');

let register = async(req, res) => {
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;

    if ( !name || !email || !password ) { 
        return res.status(400).json({message : "Name, email and password are all required to register"});
    };

    try {
        const isExists = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);

        if (isExists.rows.length != 0) {
            return res.status(409).json({message : "This email is already registered"});
        };

        const passwordHash = await bcrypt.hash(password, 10);

        const createUser = await pool.query("INSERT INTO users(name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name", [name, email, passwordHash]);

        return res.status(201).json({message : "Registration successful", id : createUser.rows[0].id, name : createUser.rows[0].name});

    } catch (err) {
        console.error(err);
        return res.status(500).json({message : "Something went wrong, please try again"});
    }
        
}

let login = async(req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    if (!email || !password) {
        return res.status(400).json({message : "Both email and password are required to login"})
    }

    try {
        const user = await pool.query("SELECT id, password_hash FROM users WHERE email = $1", [email]);

        if (user.rows.length == 0) {
            return res.status(404).json({message : "This email is not registered with us"});
        }

        const passwordCheck = await bcrypt.compare(password, user.rows[0].password_hash);

        if (!passwordCheck) {
            return res.status(401).json({message : "Incorrect password. Please try again"});
        }

        const token = jwt.sign({id : user.rows[0].id}, process.env.JWT_SECRET, {expiresIn : '14d'});

        res.cookie('token', token, {
            httpOnly : true, 
            secure : true, 
            sameSite : 'lax', 
            maxAge : 14 * 24 * 60 * 60 * 1000
        });

        return res.status(200).json({message : "Login successful"});

    } catch(err) { 
        console.error(err);
        return res.status(500).json({message : "Something went wrong, please try again"});
    }
}

let logout = (req, res) => {
    res.clearCookie('token', {
        httpOnly : true, 
        secure : true, 
        sameSite : 'lax'
    });

    res.status(200).json({message : "Cookie cleared successfully"});
}

let getMe = async(req, res) => {
    try {
        const getUser = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [req.userId]);
        
        if (getUser.rows.length == 0) {
            return res.status(404).json({message : "No user found"});
        };

        return res.status(200).json({id : getUser.rows[0].id, name : getUser.rows[0].name, email : getUser.rows[0].email});
    } catch (err) {
        console.error(err);
        return res.status(500).json({message : "Something went wrong, please try again"});
    }
}

exports.register = register;
exports.login = login;
exports.logout = logout;
exports.getMe = getMe;