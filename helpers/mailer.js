const nodemailer = require('nodemailer');

const trasporter = nodemailer.createTransport({
    // host: process.env.EMAIL_HOST || "mail.ingytal.com",
    host: process.env.EMAIL_HOST || "mail.temisperu.com",
    port: process.env.EMAIL_PORT || 465,
    secure: true,
    auth: {
        user: process.env.EMAIL || "alert@temisperu.com",
        pass: process.env.EMAIL_PASSWORD || "dYCZxVbGrX*U",
    },
});

module.exports = trasporter;
