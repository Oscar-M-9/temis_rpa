const mysql = require('mysql');

function conectarBaseDeDatos() {
    return mysql.createConnection({
        host: 'localhost',
        database: 'ingytal_abogados',
        user: 'root',
        password: '',
    });
}

module.exports = conectarBaseDeDatos;