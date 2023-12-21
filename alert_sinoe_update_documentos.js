
var mysql = require('mysql');
const fetch = require('node-fetch');
const moment = require('moment');
const util = require('util');
const winston = require('winston');
const https = require('https');

const transporter = require('./helpers/mailer');
const conectarBaseDeDatos = require('./helpers/conexion');

if (process.env.NODE_ENV != 'production'){
    require('dotenv').config();
}


// var urlAPI = "http://127.0.0.1:9101";
var urlAPI = process.env.URL_API_RPA || "https://rpa.temisperu.com:8083";


// Configura los transportes (destinos) de registro
const logger = winston.createLogger({
    level: 'info', // Nivel mínimo de registro
    format: winston.format.simple(), // Formato de registro simple
    transports: [
      new winston.transports.Console(), // Registra en la consola
    //   new winston.transports.File({ filename: 'logs/alert_sinoe_update_documentos.log' }) // Registra en un archivo
      new winston.transports.File({ filename: '/home/temisperu/public_html/rpa.temisperu.com/RPA/logs/alert_sinoe_update_documentos.log' }) // Registra en un archivo
    ],
});

// Función para promisificar consultas SQL
const promisifyQuery = util.promisify((conexion, sql, values, callback) => {
    conexion.query(sql, values, (error, results, fields) => {
        if (error) {
            callback(error, null);
            return;
        }
        callback(null, results);
    });
});

// Crear una función para obtener el primer registro de la tabla temporal
async function obtenerPrimerRegistro(conexion) {
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM temp_sinoe_document_alerts WHERE estado = ? LIMIT 1', ['pendiente'], async (error, results) => {
            if (error) {
                reject(error);
            } else if (results.length === 0) {
                // No hay registros, restablecer la secuencia de autoincremento a 0
                await resetAutoIncrement(conexion, 'temp_sinoe_document_alerts');
                resolve(null);
            } else {
                resolve(results[0]);
            }
        });
    });
}

async function resetAutoIncrement(conexion, tabla) {
    return new Promise((resolve, reject) => {
        // Ejecutar una consulta SQL para restablecer la secuencia de autoincremento a 0
        conexion.query(`ALTER TABLE ${tabla} AUTO_INCREMENT = 0`, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

// Crear una función para obtener el primer registro de la tabla temporal
async function obtenerRegistroExpedientes(conexion , id) {
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM expediente_sinoes WHERE id = ?', [id], (error, results) => {
            if (error) {
                reject(error);
            } else if (results.length === 0) {
                resolve(null); // No hay registros
            } else {
                resolve(results[0]);
            }
        });
    });
}

// Crear una función para obtener datos del Cliente
async function obtenerRegistroClientes(conexion , id) {
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM clientes WHERE id = ?', [id], (error, results) => {
            if (error) {
                reject(error);
            } else if (results.length === 0) {
                resolve(null); // No hay registros
            } else {
                resolve(results[0]);
            }
        });
    });
}

// Crear una función para enviar los datos a un endpoint
async function enviarDatosAlEndpoint(data) {
    const endpointURL = urlAPI + '/sinoe-historial-update-data';
    const jsonData = JSON.stringify(data);

    const httpsAgent = new https.Agent({
        rejectUnauthorized: false // Esto evita la verificación del certificado (NO recomendado en producción).
    });

    const response = await fetch(endpointURL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: jsonData,
        agent: httpsAgent
    });

    if (!response.ok) {
        throw new Error(`Error al enviar datos al endpoint: ${response.statusText}`);
    }

    return await response.json();
}




async function insertarNuevaNotificacion(conexion, data, firstExp, firstRecord) {
    if (data.data.numResults > 0){
        const dataNewNotificacionTemp = data.data['resultados'];
        const reversedJson = Object.keys(dataNewNotificacionTemp).reverse().reduce((acc, key) => {
            acc[key] = dataNewNotificacionTemp[key];
            return acc;
          }, {});

          for (const keyNotificacion in reversedJson) {
            if (Object.hasOwnProperty.call(reversedJson, keyNotificacion)) {
                const element = reversedJson[keyNotificacion];
                console.log("🥓", element);
                const fechaDateTime = moment(element["Registro"]["Fecha de Presentación"], 'DD/MM/YYYY HH:mm:ss');
                const fechaFormateada = fechaDateTime.format('YYYY-MM-DD HH:mm:ss');

                const sqlInsertNotifi = 'INSERT INTO historial_documentos_sinoes (n_expediente, id_exp, n_escrito, distrito_judicial, organo_juris, tipo_doc, fecha_presentacion, sumilla, metadata, code_user, code_company) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ? , ?, ?)';

                const values = [
                    element["Registro"]["Cod. Expediente"],
                    firstExp.id,
                    element["Registro"]["Nro. Escrito"],
                    element["Registro"]["Distrito Judicial"],
                    element["Registro"]["Órgano Jurisdiccional"],
                    element["Registro"]["Tipo de Documento"],
                    fechaFormateada,
                    element["Registro"]["Sumilla"],
                    "si",
                    firstExp.code_user,
                    firstExp.code_company,
                ];

                const insertResult = await ejecutarQueryInsertNotify(conexion, sqlInsertNotifi, values);
                var idNotifi = insertResult.insertId;

                for (const keyDP in element["Archivos"]) {
                    if (Object.hasOwnProperty.call(element["Archivos"], keyDP)) {
                        const element2 = element["Archivos"][keyDP];

                        const sqlInsertNotifi = 'INSERT INTO documentos_presentados_sinoes (id_exp, id_historial, descripcion, file_doc, code_user, code_company) VALUES (?, ?, ?, ?, ?, ?)';

                        const values = [
                            firstExp.id,
                            idNotifi,
                            element2["Descripción"],
                            element2["Documento"],
                            firstExp.code_user,
                            firstExp.code_company,
                        ];

                        const insertResult = await ejecutarQueryInsertNotify(conexion, sqlInsertNotifi, values);
                    }
                }
            }
          }
    }

}

async function ejecutarQueryInsertNotify(conexion, sql, values) {
    return new Promise((resolve, reject) => {
        conexion.query(sql, values, (error, results, fields) => {
            if (error) {
                reject(error);
                return;
            }
            
            // El ID generado estará disponible aquí
            const insertId = results.insertId;
            resolve({ insertId });
        });
    });
}

// eliminar el primer registro de la tabla temporal
async function eliminarTempRegistro(conexion, id) {
    try {
        const sql = 'DELETE FROM temp_sinoe_document_alerts WHERE id = ?';
        await promisifyQuery(conexion, sql, [id]);
        console.log('Alerta temporal de la tabla eliminada con éxito. ID:', id);
    } catch (error) {
        throw new Error('Error al eliminar notificación: ' + error);
    }
}




// Función principal
async function main() {
    try {
        const conexion = conectarBaseDeDatos();
        conexion.connect();

        var strMsg;

        const firstRecord = await obtenerPrimerRegistro(conexion);

        if (!firstRecord) {
            const fechaYHora = new Date().toUTCString();
            console.log('No hay registros en la tabla temporal.');
            strMsg = fechaYHora + ' No hay registros en la tabla temporal.';
            logger.warn(strMsg);
            conexion.end();
            return;
        }

        if(firstRecord.fecha_hora === ""){
            const fechaYHora = new Date().toUTCString();
            strMsg = fechaYHora + ' No se encontró documentos en el expediente (' + firstExp.id + ') : '
            logger.error(strMsg);
            await eliminarTempRegistro(conexion, firstRecord.id);
            conexion.end();
            return;
        }

        const data = {
            numExpediente: firstRecord.n_expediente,
            fechaHoraPresentacion: firstRecord.fecha_hora,
            credential: firstRecord.uid
        };
        console.log("❤", data);

        const responseData = await enviarDatosAlEndpoint(data);
        // const responseData = {
        //     "status": 200,
        //     "msg": "",
        //     "data": {
        //         "numResults": 1,
        //         "resultados": {
        //             "R_1": {
        //                 "Registro": {
        //                     "Cod. Expediente": "10600-2023-0-1706-JR-PE-01",
        //                     "CII": "",
        //                     "Nro. Escrito": "162320",
        //                     "Distrito Judicial": "LAMBAYEQUE",
        //                     "Órgano Jurisdiccional": "1 JUZGADO DE INVEST. PREPARATORIA-MBJ JLO",
        //                     "Tipo de Documento": "ESCRITO",
        //                     "Fecha de Presentación": "10/11/2023 09:46:02",
        //                     "Sumilla": "OTROS: ADJUNTO BAUCHER POR REPARACION CIVIL"
        //                 },
        //                 "Archivos": [
        //                     {
        //                         "Descripción": "DOCUMENTO",
        //                         "Documento": "../storage/docs/sinoe/10600-2023-0-1706-JR-PE-01/historial/ESCRITO-10-11-2023-09-46-02/10600-2023-0-1706-JR-PE-01_ESCRITO.pdf"
        //                     },
        //                     {
        //                         "Descripción": "CARGO",
        //                         "Documento": "../storage/docs/sinoe/10600-2023-0-1706-JR-PE-01/historial/ESCRITO-10-11-2023-09-46-02/10600-2023-0-1706-JR-PE-01_CARGO.pdf"     
        //                     }
        //                 ]
        //             }
        //         }   
        //     }
        // }

        console.log("responseData: ", responseData)

        if (responseData.status == 404){
            conexion.end();
            return;
        }
        if (responseData.status == 404 && responseData.msg.name == 'TimeoutError'){
            conexion.end();
            return;
        }
        if (responseData.status == 200 && responseData.msg !== ""){
            conexion.end();
            const fechaYHoraW = new Date().toUTCString();
            console.log(responseData.msg);
            strMsg = fechaYHoraW + responseData.msg;
            logger.warn(strMsg);
            return;
        }


        // Obtener firstExp aquí, por ejemplo:
        const firstExp = await obtenerRegistroExpedientes(conexion, firstRecord.id_exp);
        console.log("🍕",firstExp);
        
        if (firstExp) {
            const firstClient = await obtenerRegistroClientes(conexion, firstExp.id_client);
            console.log("🍔",firstClient);
            await insertarNuevaNotificacion(conexion, responseData, firstExp, firstRecord);

        }
        
        // Eliminar el primer registro de la tabla temporal si es necesario
        await eliminarTempRegistro(conexion, firstRecord.id);

        conexion.end();
    } catch (error) {
        const fechaYHora = new Date().toUTCString();
        console.error('Error:', error);
        strMsg = fechaYHora + ' Error:' + error;
        logger.error(strMsg);
        conexion.end();
    }
}

main();