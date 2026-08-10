const express = require('express');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const authRoutes = require('./routes/authRoutes');
// const notesRoutes = require('./routes/notesRoutes');
require('dotenv').config();
const cookieParser = require('cookie-parser');

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
// app.use('/api/notes', notesRoutes);

const PORT = process.env.PORT;

const options = {
    key : fs.readFileSync('./localhost+2-key.pem'),
    cert : fs.readFileSync('./localhost+2.pem')
}

https.createServer(options, app).listen(PORT, () => {
    console.log(`Server running on https://localhost:${PORT}`);
});