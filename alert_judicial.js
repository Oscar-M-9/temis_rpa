
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
    //   new winston.transports.File({ filename: 'logs/alert_judicial.log' }) // Registra en un archivo
      new winston.transports.File({ filename: '/home/temisperu/public_html/rpa.temisperu.com/RPA/logs/alert_judicial.log' }) // Registra en un archivo
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
        conexion.query('SELECT * FROM temp_expediente_alerts WHERE estado = ? LIMIT 1', ['pendiente'], async (error, results) => {
            if (error) {
                reject(error);
            } else if (results.length === 0) {
                // No hay registros, restablecer la secuencia de autoincremento a 0
                await resetAutoIncrement(conexion, 'temp_expediente_alerts');
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
        conexion.query('SELECT * FROM expedientes WHERE id = ?', [id], (error, results) => {
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
    const endpointURL = urlAPI + '/poder-judicial-update-data';
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




// Crear una función para actualizar el registro de expedientes
async function actualizarRegistroExpedientes(conexion, data, firstExp) {
    // PARTES PROCESALES 
    const partesProcesales = data.data['Partes procesales'];
    const partesSeparadas = [];

    // Saltar el primer elemento que contiene los encabezados
    partesProcesales.shift();
    partesProcesales.forEach(parte => {
        if (parte.length === 5) {
            partesSeparadas.push([parte[0], parte[1], `${parte[2]} ${parte[3]}, ${parte[4]}`]);
        } else {
            partesSeparadas.push([parte[0], parte[1], parte[2]]);
        }
    });
    let updateParteProcesales = '';
    if (JSON.stringify(partesSeparadas) === firstExp.partes_procesales){
        console.log('iguales');
    }else{
        // Ejecuta la consulta SQL
        updateParteProcesales = JSON.stringify(partesSeparadas);
        const sql = `UPDATE expedientes SET partes_procesales = ? WHERE id= ?`;
        conexion.query(sql, [updateParteProcesales, firstExp.id], function(error, results) {
            if (error) {
                console.error('Error al actualizar el registro:', error);
                return;
            }
            console.log('Registro actualizado con éxito - partes procesales.');
        });
        console.log('diferente');
    }

    // Actualizar el registro del expediente
    const sql = `UPDATE expedientes SET o_jurisdicional = ?, d_judicial = ?, juez = ?, ubicacion = ?, e_procesal = ?, sumilla = ?, proceso = ?, especialidad = ?, observacion = ?, estado = ?, materia = ?, lawyer_responsible = ?, date_conclusion = ?, motivo_conclusion = ? WHERE id= ?`;
    let valueDateConclusion = null;
    if (data.data['Reporte de expediente']['Fecha Conclusión'] == ""){
        valueDateConclusion = null;
    }else{
        valueDateConclusion = moment(data.data['Reporte de expediente']['Fecha Conclusión'], "DD/MM/YYYY").format("YYYY-MM-DD");
        
    }

    // Ejecuta la consulta SQL
    conexion.query(sql, [data.data['Reporte de expediente']['Órgano Jurisdiccional'], data.data['Reporte de expediente']['Distrito Judicial'],
    data.data['Reporte de expediente']['Juez'], data.data['Reporte de expediente']['Ubicación'], data.data['Reporte de expediente']['Etapa Procesal'], data.data['Reporte de expediente']['Sumilla'],
    data.data['Reporte de expediente']['Proceso'], data.data['Reporte de expediente']['Especialidad'], data.data['Reporte de expediente']['Observación'], data.data['Reporte de expediente']['Estado'],
    data.data['Reporte de expediente']['Materia(s)'], data.data['Reporte de expediente']['Especialista Legal'], valueDateConclusion, data.data['Reporte de expediente']['Motivo Conclusión'],
    firstExp.id], function(error, results) {
        if (error) {
            console.error('Error al actualizar el registro:', error);
            return;
        }
        console.log('Registro actualizado con éxito - reporte del expediente.');
    });
}

async function insertarMovimientoNuevo(conexion, data, firstExp, firstRecord) {
    console.log('El objeto no está vacío.');
    const idsNotify = [];
    const dataNewSeguimientoTemp = data.data['Segimiento del expediente'];
    // const dataNewSeguimientoTemp =  {
    //     "pnlSeguimiento1": {
    //         "Fecha de Resolución": "22/12/2022",
    //         "Resolución": "NOTA",
    //         "Tipo de Notificación": "",
    //         "Acto": "NOTA",
    //         "Fojas": "1",
    //         "Proveido": "22/12/2022",
    //         "Sumilla": "EXPEDIENTE SE ENCUENTRA EN JUZGADO ESPECIALIZADO",
    //         "Descripción de Usuario": "DESCARGADO POR: CORZO MOYANO, CLAUDIA",
    //         "Descarga resolucion": "El documento de la resolución no se encuentra anexado.\nFavor de ponerse en contacto con el personal del Juzgado o el Secretario del Juzgado.",
    //         "notifi": {
    //             "NOTIFICACIÓN 2019-0020677-JP-CI": {
    //                 "Destinatario": "FERREYROS S.A.",
    //                 "Fecha de envio": "03/09/2019 14:11",
    //                 "Anexo(s)": "RES.  11 CON ESCRITO DEL 01/07/2019  (APELACION)",
    //                 "Forma de entrega": ""
    //             },
    //             "NOTIFICACIÓN 2019-0020678-JP-CI": {
    //                 "Destinatario": "INVERSIONES Y ALQUILERES REGIONALES S.A.C.",
    //                 "Fecha de envio": "03/09/2019 14:11",
    //                 "Anexo(s)": "RES. 11 CON ESCRITO DEL 18/07/2019",
    //                 "Forma de entrega": ""
    //             }
    //         }
    //     }
    // };

    const keys = Object.keys(dataNewSeguimientoTemp);
    var nMovimiento = firstRecord.n_ult_movi + 1;

    for (const key of keys) {
        const seguimientoData = dataNewSeguimientoTemp[key];

        var newResolucion = seguimientoData["Resolución"];
        var newTipoNotificacion = seguimientoData["Tipo de Notificación"];
        var fechaProveido = moment(seguimientoData["Proveido"], "DD/MM/YYYY");
        var fechaYHoraW = moment().format('YYYY-MM-DD HH:mm:ss');
        strMsg = fechaYHoraW + "seguimientoData Proveido: " + seguimientoData["Proveido"]  + fechaProveido;
        logger.warn(strMsg);
        var newProveido = null;
        if (fechaProveido.isValid()) {
            fechaProveido = fechaProveido.format("YYYY-MM-DD");
            console.log("Fecha formateada:", fechaProveido);
        } else {
            fechaProveido = null;
            console.log("Fecha proporcionada no es válida.");
        }
        var newSumilla = seguimientoData["Sumilla"];
        var newDescripcion = seguimientoData["Descripción de Usuario"];
        var newFile = seguimientoData["Descarga resolucion"];
        var newNotify = seguimientoData["notifi"];
        var newActo = seguimientoData["Acto"];
        var newAbogVirtual = "si";

        if (newNotify && Object.keys(newNotify).length > 0) {
            console.log('Notificaciones no vacias');
            const notify = Object.keys(newNotify);
            const idsNotifyNew = [];

            for (const noti of notify) {
                const notificacionesData = newNotify[noti];

                var notifyName = noti;
                var notifyDestinatario = notificacionesData["Destinatario"];
                var fechaFormateada = moment(notificacionesData["Fecha de envio"], "DD/MM/YYYY HH:mm").format("YYYY-MM-DD HH:mm:ss");
                var notifyFechaEnvio = fechaFormateada ? fechaFormateada : null;
                var notifyAnexo = notificacionesData["Anexo(s)"];
                var notifyformaEntrega = notificacionesData['Forma de entrega'];
                var msgLog = "1-- fecha formateada " + fechaFormateada + ' fecha de envio '+ notificacionesData["Fecha de envio"] + '[notificaciones]'+ JSON.stringify(notificacionesData);
                logger.info(msgLog);

                const sqlInsertFollowUp = 'INSERT INTO notificacion_seguimientos (name, destinatario, fecha_envio, anexos, forma_entrega, abog_virtual, id_exp) VALUES (?, ?, ?, ?, ?, ?, ?)';

                const values = [
                    notifyName,
                    notifyDestinatario,
                    notifyFechaEnvio,
                    notifyAnexo,
                    notifyformaEntrega,
                    newAbogVirtual,
                    firstExp.id
                ];

                const insertResult = await ejecutarQueryInsertNotify(conexion, sqlInsertFollowUp, values, idsNotify);
                idsNotifyNew.push(insertResult.insertId);
            }

            if (seguimientoData["Fecha de Resolución"]){
                const fechaFormateada = moment(seguimientoData["Fecha de Resolución"], "DD/MM/YYYY").format("YYYY-MM-DD");
                var newFechaResolucion = fechaFormateada;
                var newFojas = seguimientoData["Fojas"];

                if (newFojas == ""){
                    newFojas = null;
                }
        
                const sqlInsertFollowUp = 'INSERT INTO follow_ups (n_seguimiento, fecha_resolucion, resolucion, type_notificacion, acto, fojas, proveido, obs_sumilla, descripcion, file, noti, abog_virtual, code_company, code_user, id_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        
                const values = [
                    nMovimiento,
                    newFechaResolucion,
                    newResolucion,
                    newTipoNotificacion,
                    newActo,
                    newFojas,
                    newProveido,
                    newSumilla,
                    newDescripcion,
                    newFile,
                    JSON.stringify(idsNotifyNew),
                    newAbogVirtual,
                    firstExp.code_company,
                    firstExp.code_user,
                    firstExp.id
                ];
        
                const insertResult = await ejecutarQueryInsertFollowUp(conexion, sqlInsertFollowUp, values);

                const fechaHoraActual = moment().format('YYYY-MM-DD HH:mm:ss');
                const sqlInsertHistoryMovements = 'INSERT INTO history_movements (id_movimiento, id_exp, id_client, entidad, estado, code_company, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
                // 6
                const valuesHistoryMovements = [
                    insertResult.insertId,
                    firstExp.id,
                    firstExp.id_client,
                    "judicial",
                    'no',
                    firstExp.code_company,
                    fechaHoraActual
                ];
                await ejecutarQueryInsertFollowUp(conexion, sqlInsertHistoryMovements, valuesHistoryMovements);

            }else{
                const fechaFormateada = moment(seguimientoData["Fecha de Ingreso"], "DD/MM/YYYY HH:mm").format("YYYY-MM-DD HH:mm:ss");
                var newFechaIngreso = fechaFormateada;
                var newFolios = seguimientoData["Folios"];
                if (newFolios == ""){
                    newFolios = null;
                }
        
                const sqlInsertFollowUp = 'INSERT INTO follow_ups (n_seguimiento, fecha_ingreso, resolucion, type_notificacion, acto, folios, proveido, obs_sumilla, descripcion, file, noti, abog_virtual, code_company, code_user, id_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        
                const values = [
                    nMovimiento,
                    newFechaIngreso,
                    newResolucion,
                    newTipoNotificacion,
                    newActo,
                    newFolios,
                    newProveido,
                    newSumilla,
                    newDescripcion,
                    newFile,
                    JSON.stringify(idsNotifyNew),
                    newAbogVirtual,
                    firstExp.code_company,
                    firstExp.code_user,
                    firstExp.id
                ];
        
                const insertResult = await ejecutarQueryInsertFollowUp(conexion, sqlInsertFollowUp, values);

                const fechaHoraActual = moment().format('YYYY-MM-DD HH:mm:ss');
                const sqlInsertHistoryMovements = 'INSERT INTO history_movements (id_movimiento, id_exp, id_client, entidad, estado, code_company, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
                // 6
                const valuesHistoryMovements = [
                    insertResult.insertId,
                    firstExp.id,
                    firstExp.id_client,
                    "judicial",
                    'no',
                    firstExp.code_company,
                    fechaHoraActual
                ];
                await ejecutarQueryInsertFollowUp(conexion, sqlInsertHistoryMovements, valuesHistoryMovements);

            }
        } else {
            console.log('Notificaciones vacias');
            if (seguimientoData["Fecha de Resolución"]){
                const fechaFormateada = moment(seguimientoData["Fecha de Resolución"], "DD/MM/YYYY").format("YYYY-MM-DD");
                var newFechaResolucion = fechaFormateada;
                var newFojas = seguimientoData["Fojas"];
                if (newFojas == ""){
                    newFojas = null;
                }
                const sqlInsertFollowUp = 'INSERT INTO follow_ups (n_seguimiento, fecha_resolucion, resolucion, type_notificacion, acto, fojas, proveido, obs_sumilla, descripcion, file, noti, abog_virtual, code_company, code_user, id_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        
                const values = [
                    nMovimiento,
                    newFechaResolucion,
                    newResolucion,
                    newTipoNotificacion,
                    newActo,
                    newFojas,
                    newProveido,
                    newSumilla,
                    newDescripcion,
                    newFile,
                    null,
                    newAbogVirtual,
                    firstExp.code_company,
                    firstExp.code_user,
                    firstExp.id
                ];
        
                const insertResult = await ejecutarQueryInsertFollowUp(conexion, sqlInsertFollowUp, values);

                const fechaHoraActual = moment().format('YYYY-MM-DD HH:mm:ss');
                const sqlInsertHistoryMovements = 'INSERT INTO history_movements (id_movimiento, id_exp, id_client, entidad, estado, code_company, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
                // 6
                const valuesHistoryMovements = [
                    insertResult.insertId,
                    firstExp.id,
                    firstExp.id_client,
                    "judicial",
                    'no',
                    firstExp.code_company,
                    fechaHoraActual
                ];
                await ejecutarQueryInsertFollowUp(conexion, sqlInsertHistoryMovements, valuesHistoryMovements);

            }else{
                const fechaFormateada = moment(seguimientoData["Fecha de Ingreso"], "DD/MM/YYYY HH:mm").format("YYYY-MM-DD HH:mm:ss");
                var newFechaIngreso = fechaFormateada;
                var newFolios = seguimientoData["Folios"];
                if (newFolios == ""){
                    newFolios = null;
                }
        
                const sqlInsertFollowUp = 'INSERT INTO follow_ups (n_seguimiento, fecha_ingreso, resolucion, type_notificacion, acto, folios, proveido, obs_sumilla, descripcion, file, noti, abog_virtual, code_company, code_user, id_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        
                const values = [
                    nMovimiento,
                    newFechaIngreso,
                    newResolucion,
                    newTipoNotificacion,
                    newActo,
                    newFolios,
                    newProveido,
                    newSumilla,
                    newDescripcion,
                    newFile,
                    null,
                    newAbogVirtual,
                    firstExp.code_company,
                    firstExp.code_user,
                    firstExp.id
                ];
        
                const insertResult = await ejecutarQueryInsertFollowUp(conexion, sqlInsertFollowUp, values);
                console.log()

                const fechaHoraActual = moment().format('YYYY-MM-DD HH:mm:ss');
                const sqlInsertHistoryMovements = 'INSERT INTO history_movements (id_movimiento, id_exp, id_client, entidad, estado, code_company, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
                // 6
                const valuesHistoryMovements = [
                    insertResult.insertId,
                    firstExp.id,
                    firstExp.id_client,
                    "judicial",
                    'no',
                    firstExp.code_company,
                    fechaHoraActual
                ];
                await ejecutarQueryInsertFollowUp(conexion, sqlInsertHistoryMovements, valuesHistoryMovements);

            }
        }

        nMovimiento++;
    }
}

async function ejecutarQueryInsertFollowUp(conexion, sql, values) {
    return new Promise((resolve, reject) => {
        conexion.query(sql, values, (error, results, fields) => {
            if (error) {
                reject(error);
                return;
            }

            const insertId = results.insertId;
            console.log('Nuevo registro insertado con éxito (Follow up). ID:', insertId);
            resolve({ insertId });
        });
    });
}


// Crear una función para obtener el primer registro de la de movimientos
async function obtenerMovimiento(conexion, id) {
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM follow_ups WHERE id = ?', [id], (error, results) => {
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


async function procesarMovimientoPendiente(conexion, idMoviPending, dataPendingSeguimiento, firstExp, key) {
    try {
        const firstFollowUp = await obtenerMovimiento(conexion, idMoviPending);

        // Elimina notificaciones de movimiento
        if (firstFollowUp !== null){
            const idsParaEliminar = JSON.parse(firstFollowUp.noti);
            if (idsParaEliminar !== null) {
                await Promise.all(idsParaEliminar.map(async (id) => {
                    await eliminarNotificacion(conexion, id);
                }));
            }
        }

        const newNotify = dataPendingSeguimiento[key]["notifi"];
        if (newNotify && Object.keys(newNotify).length > 0) {
            const notify = Object.keys(newNotify);
            const idsNotifyPendiente = [];

            const promises = notify.map(async (noti) => {
                const notificacionesData = newNotify[noti];
            
                // Realiza las inserciones necesarias en notificacion_seguimientos
                const notifyName = noti;
                const notifyDestinatario = notificacionesData["Destinatario"];
                const fechaFormateada = moment(notificacionesData["Fecha de envio"], "DD/MM/YYYY HH:mm").format("YYYY-MM-DD HH:mm:ss");
                const notifyFechaEnvio = fechaFormateada ? fechaFormateada : null;
                const notifyAnexo = notificacionesData["Anexo(s)"];
                const notifyFormaEntrega = notificacionesData['Forma de entrega'];

                var msgLog = "2-- fecha formateada " + fechaFormateada + ' fecha de envio '+ notificacionesData["Fecha de envio"] + '[notificaciones]'+ JSON.stringify(notificacionesData);
                logger.info(msgLog);
            
                const sqlInsertFollowUp = 'INSERT INTO notificacion_seguimientos (name, destinatario, fecha_envio, anexos, forma_entrega, abog_virtual, id_exp) VALUES (?, ?, ?, ?, ?, ?, ?)';
            
                const values = [
                    notifyName,
                    notifyDestinatario,
                    notifyFechaEnvio,
                    notifyAnexo,
                    notifyFormaEntrega,
                    'si',
                    firstExp.id
                ];
            
                const insertResult = await ejecutarQueryInsertNotify(conexion, sqlInsertFollowUp, values);
            
                // Agrega el ID generado al arreglo global idsNotifyPendiente
                idsNotifyPendiente.push(insertResult.insertId);
            });
            
            await Promise.all(promises);
            
            // Actualiza el campo 'noti' en la tabla 'follow_ups'
            await ejecutarQueryUpdateNotifyInFollowUp(conexion, idMoviPending, idsNotifyPendiente);
        }
    } catch (error) {
        console.error('Error al procesar el movimiento pendiente:', error);
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


async function eliminarNotificacion(conexion, idNotificacion) {
    try {
        const sql = 'DELETE FROM notificacion_seguimientos WHERE id = ?';
        await promisifyQuery(conexion, sql, [idNotificacion]);
    } catch (error) {
        throw new Error('Error al eliminar notificación: ' + error);
    }
}

async function ejecutarQueryUpdateNotifyInFollowUp(conexion, idMoviPending, idsNotifyPendiente) {
    try {
        const sql = 'UPDATE follow_ups SET noti = ? WHERE id = ?';
        await promisifyQuery(conexion, sql, [JSON.stringify(idsNotifyPendiente), idMoviPending]);
    } catch (error) {
        throw new Error('Error al actualizar notificaciones en follow_ups: ' + error);
    }
}


async function manejarMovimientosPendientes(conexion, dataPendingSeguimiento, arrayIdspending, firstExp) {
    var countIdPending = 0;
    for (const key in dataPendingSeguimiento) {
        const idMoviPending = arrayIdspending[countIdPending];
        if (idMoviPending !== undefined){
            await procesarMovimientoPendiente(conexion, idMoviPending, dataPendingSeguimiento, firstExp, key);
        }
        countIdPending++;
    }
}

// Crear una función para obtener registro de user_partes 
async function obtenerUserParte(conexion, id) {
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM user_partes WHERE id_exp = ? AND entidad = ?', [id, 'judicial'], (error, results) => {
            if (error) {
                reject(error);
            } else if (results.length === 0) {
                resolve(null); // No hay registros
            } else {
                resolve(results);
            }
        });
    });
}

// eliminar el primer registro de la tabla temporal
async function eliminarTempRegistro(conexion, id) {
    try {
        const sql = 'DELETE FROM temp_expediente_alerts WHERE id = ?';
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
            const fechaYHora = moment().format('YYYY-MM-DD HH:mm:ss');
            console.log('No hay registros en la tabla temporal.');
            strMsg = fechaYHora + ' No hay registros en la tabla temporal.';
            logger.warn(strMsg);
            conexion.end();
            return;
        }

        const data = {
            codigoExpediente: firstRecord.n_expediente,
            updateInformation: {
                'last': {
                    'title': firstRecord.title_ult_movi,
                    'value': firstRecord.date_ult_movi
                },
                'pending': JSON.parse(firstRecord.data_pending)
            },
        };

        const responseData = await enviarDatosAlEndpoint(data);

        if (responseData.status == 404){
            conexion.end();
            return;
        }
        if (responseData.status == 404 && responseData.msg.name == 'TimeoutError'){
            conexion.end();
            return;
        }

        // Obtener firstExp aquí, por ejemplo:
        const firstExp = await obtenerRegistroExpedientes(conexion, firstRecord.id_exp);
        
        
        if (firstExp) {
            const firstClient = await obtenerRegistroClientes(conexion, firstExp.id_client);

            // var dataUpdateReport = [];
    
            // if (responseData.data['Reporte de expediente']['Juez'] != firstExp.juez){
            //     dataUpdateReport.push({'Juez': responseData.data['Reporte de expediente']['Juez']});
            // }
            // if (responseData.data['Reporte de expediente']['Especialista Legal'] != firstExp.lawyer_responsible){
            //     dataUpdateReport.push({'Especialista Legal': responseData.data['Reporte de expediente']['Especialista Legal']});
            // }
            // if (responseData.data['Reporte de expediente']['Estado'] != firstExp.estado){
            //     dataUpdateReport.push({'Estado': responseData.data['Reporte de expediente']['Estado']});
            // }
            // if (responseData.data['Reporte de expediente']['Fecha Conclusión'] != ""){
            //     dataUpdateReport.push({'Fecha Conclusión': responseData.data['Reporte de expediente']['Fecha Conclusión']});
            // }
            // if (responseData.data['Reporte de expediente']['Motivo Conclusión'] != firstExp.motivo_conclusion){
            //     dataUpdateReport.push({'Motivo Conclusión': responseData.data['Reporte de expediente']['Motivo Conclusión']});
            // }
            
            // console.log('dataUpdateReport: ', dataUpdateReport);
            // const dataInsertNewMovimientoReport = responseData.data['Segimiento del expediente'];
            // console.log('dataInsertNewMovimientoReport: ', dataInsertNewMovimientoReport);

            await actualizarRegistroExpedientes(conexion, responseData, firstExp);
            await insertarMovimientoNuevo(conexion, responseData, firstExp, firstRecord);
            await manejarMovimientosPendientes(conexion, responseData.data['pendientes'], JSON.parse(firstRecord.ids_pending), firstExp);

            const resultEmails = await obtenerUserParte(conexion, firstExp.id);

            if (!resultEmails){
                const fechaYHora = moment().format('YYYY-MM-DD HH:mm:ss');
                strMsg = fechaYHora + ' No se encontró correos en el expediente (' + firstExp.id + ') : ' + resultEmails
                logger.error(strMsg);
                await eliminarTempRegistro(conexion, firstRecord.id);
                conexion.end();
                return;
            }

            var recipients = [];
            var urlPage = "https://" + firstExp.code_company + ".temisperu.com";

            for (const row of resultEmails) {
                recipients.push(row.email);
            }
            if (Object.keys(responseData.data['Segimiento del expediente']).length > 0){
                var dataEmail = responseData.data['Segimiento del expediente']['pnlSeguimiento1'];
                // var dataEmail = {
                //     "Fecha de Resolución": "22/12/2022",
                //     "Resolución": "NOTA",
                //     "Tipo de Notificación": "",
                //     "Acto": "NOTA",
                //     "Fojas": "1",
                //     "Proveido": "22/12/2022",
                //     "Sumilla": "EXPEDIENTE SE ENCUENTRA EN JUZGADO ESPECIALIZADO",
                //     "Descripción de Usuario": "DESCARGADO POR: CORZO MOYANO, CLAUDIA",
                //     "Descarga resolucion": "El documento de la resolución no se encuentra anexado.\nFavor de ponerse en contacto con el personal del Juzgado o el Secretario del Juzgado.",
                //     "notifi": {
                //         "NOTIFICACIÓN 2019-0020677-JP-CI": {
                //             "Destinatario": "FERREYROS S.A.",
                //             "Fecha de envio": "03/09/2019 14:11",
                //             "Anexo(s)": "RES.  11 CON ESCRITO DEL 01/07/2019  (APELACION)",
                //             "Forma de entrega": ""
                //         },
                //         "NOTIFICACIÓN 2019-0020678-JP-CI": {
                //             "Destinatario": "INVERSIONES Y ALQUILERES REGIONALES S.A.C.",
                //             "Fecha de envio": "03/09/2019 14:11",
                //             "Anexo(s)": "RES. 11 CON ESCRITO DEL 18/07/2019",
                //             "Forma de entrega": ""
                //         }
                //     }
                // };

                var htmlBuildMail = `
                    <html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
                    <head>
                    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta name="x-apple-disable-message-reformatting">
                    <meta http-equiv="X-UA-Compatible" content="IE=edge">
                    <title>Temis</title>
                    
                        <style type="text/css">
                        @media only screen and (min-width: 620px) {
                    .u-row {
                        width: 600px !important;
                    }
                    .u-row .u-col {
                        vertical-align: top;
                    }
                    
                    .u-row .u-col-37p74 {
                        width: 226.44px !important;
                    }
                    
                    .u-row .u-col-62p26 {
                        width: 373.56px !important;
                    }
                    
                    .u-row .u-col-100 {
                        width: 600px !important;
                    }
                    
                    }
                    
                    @media (max-width: 620px) {
                    .u-row-container {
                        max-width: 100% !important;
                        padding-left: 0px !important;
                        padding-right: 0px !important;
                    }
                    .u-row .u-col {
                        min-width: 320px !important;
                        max-width: 100% !important;
                        display: block !important;
                    }
                    .u-row {
                        width: 100% !important;
                    }
                    .u-col {
                        width: 100% !important;
                    }
                    .u-col > div {
                        margin: 0 auto;
                    }
                    }
                    body {
                    margin: 0;
                    padding: 0;
                    }
                    
                    table,
                    tr,
                    td {
                    vertical-align: top;
                    border-collapse: collapse;
                    }
                    
                    p {
                    margin: 0;
                    }
                    
                    .ie-container table,
                    .mso-container table {
                    table-layout: fixed;
                    }
                    
                    * {
                    line-height: inherit;
                    }
                    
                    a[x-apple-data-detectors='true'] {
                    color: inherit !important;
                    text-decoration: none !important;
                    }
                    
                    table, td { color: #000000; } #u_body a { color: #0000ee; text-decoration: underline; } @media (max-width: 480px) { #u_content_image_1 .v-container-padding-padding { padding: 25px 10px 0px !important; } #u_content_image_1 .v-src-width { width: auto !important; } #u_content_image_1 .v-src-max-width { max-width: 35% !important; } #u_content_text_1 .v-container-padding-padding { padding: 20px 10px 10px !important; } #u_content_text_1 .v-text-align { text-align: center !important; } #u_content_button_1 .v-container-padding-padding { padding: 10px !important; } #u_content_button_1 .v-size-width { width: 65% !important; } #u_content_button_1 .v-text-align { text-align: center !important; } #u_content_text_2 .v-container-padding-padding { padding: 0px 10px 20px !important; } #u_content_text_2 .v-text-align { text-align: center !important; } #u_content_heading_9 .v-container-padding-padding { padding: 40px 10px 10px !important; } #u_content_heading_9 .v-text-align { text-align: center !important; } #u_content_text_11 .v-container-padding-padding { padding: 20px 0px 10px !important; } #u_content_text_11 .v-font-size { font-size: 13px !important; } #u_content_text_11 .v-text-align { text-align: center !important; } #u_content_image_9 .v-container-padding-padding { padding: 10px 0px 20px !important; } #u_content_image_9 .v-src-width { width: auto !important; } #u_content_image_9 .v-src-max-width { max-width: 51% !important; } #u_content_image_9 .v-text-align { text-align: center !important; } }
                        </style>
                    
                    
                    <link href="https://fonts.googleapis.com/css?family=Raleway:400,700&display=swap" rel="stylesheet" type="text/css">
                    
                    </head>
                    
                    <body class="clean-body u_body" style="margin: 0;padding: 0;-webkit-text-size-adjust: 100%;background-color: #ecf0f1;color: #000000">
                    
                    <table id="u_body" style="border-collapse: collapse;table-layout: fixed;border-spacing: 0;vertical-align: top;min-width: 320px;Margin: 0 auto;background-color: #ecf0f1;width:100%" cellpadding="0" cellspacing="0">
                    <tbody>
                    <tr style="vertical-align: top">
                        <td style="word-break: break-word;border-collapse: collapse !important;vertical-align: top">
                    
                    <div class="u-row-container" style="padding: 0px;background-color: transparent">
                    <div class="u-row" style="margin: 0 auto;min-width: 320px;max-width: 600px;overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;">
                        <div style="border-collapse: collapse;display: table;width: 100%;height: 100%;background-color: transparent;">
                    
                    <div class="u-col u-col-100" style="max-width: 320px;min-width: 600px;display: table-cell;vertical-align: top;">
                    <div style="background-color: #0A2E4D;height: 100%;width: 100% !important;border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px;">
                    <div style="box-sizing: border-box; height: 100%; padding: 0px;border-top: 0px solid transparent;border-left: 0px solid transparent;border-right: 0px solid transparent;border-bottom: 0px solid transparent;border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px;">
                    
                    <table id="u_content_image_1" style="font-family:'Raleway',sans-serif;" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                    <tbody>
                        <tr>
                        <td class="v-container-padding-padding" style="overflow-wrap:break-word;word-break:break-word;padding:25px 10px 15px;font-family:'Raleway',sans-serif;" align="left">
                            
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td class="v-text-align" style="padding-right: 0px;padding-left: 10px; width: 50%;" align="center">
                        <h5 style="font-size: 24px; color: #fff; margin: auto; margin-top: 10px;">Temis</h5>
                        </td>
                    </tr>
                    </table>
                    
                        </td>
                        </tr>
                    </tbody>
                    </table>
                    
                    </div>
                    </div>
                    </div>
                        </div>
                    </div>
                    </div>
                    
                    <div class="u-row-container" style="padding: 0px;background-color: transparent">
                    <div class="u-row" style="margin: 0 auto;min-width: 320px;max-width: 600px;overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;">
                        <div style="border-collapse: collapse;display: table;width: 100%;height: 100%;background-color: transparent;">
                        
                    <div class="u-col u-col-100" style="max-width: 320px;min-width: 600px;display: table-cell;vertical-align: top;">
                    <div style="background-color: #ffffff;height: 100%;width: 100% !important;border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px;">
                    <div style="box-sizing: border-box; height: 100%; padding: 0px;border-top: 0px solid transparent;border-left: 0px solid transparent;border-right: 0px solid transparent;border-bottom: 0px solid transparent;border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px;">
                    
                    <table id="u_content_text_1" style="font-family:'Raleway',sans-serif;" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                    <tbody>
                        <tr>
                        <td class="v-container-padding-padding" style="overflow-wrap:break-word;word-break:break-word;padding:50px 90px 20px 40px;font-family:'Raleway',sans-serif;" align="left">
                            
                        <div class="v-text-align v-font-size" style="font-size: 14px; line-height: 140%; text-align: left; word-wrap: break-word;">
                            <p style="line-height: 140%;">Hola: <br><br>
                            Se detectó movimientos en el expediente ${firstExp.n_expediente} ${
                                firstClient.type_contact == 'Empresa'
                                    ? 'de la Empresa '
                                    : 'del Cliente '
                            }
                            ${
                                firstClient.name && firstClient.last_name
                                    ? `${firstClient.name}, ${firstClient.last_name}`
                                    : `${firstClient.name_company}`
                            }
                            .<br><br>
                            En el proceso ${firstExp.sumilla}<br><br>
                            
                                01 Movimientos - ${
                                    Object.keys(dataEmail['notifi']).length === 0
                                    ? ''
                                    : String(Object.keys(dataEmail['notifi']).length)
                                } Notificaciones <br><br>
                            
                                ${
                                    dataEmail['Fecha de Ingreso']
                                    ? '<li>Fecha de Ingreso: ' + dataEmail['Fecha de Ingreso'] + '<br></li>'
                                    : '<li>Fecha de Resolución: ' + dataEmail['Fecha de Resolución'] + '<br></li>'
                                }
                            
                                ${
                                    dataEmail['Resolución']
                                    ? '<li>Resolución: ' + dataEmail['Resolución'] + '<br></li>'
                                    : ''
                                }
                                
                            
                                ${
                                    dataEmail['Tipo de Notificación']
                                    ? '<li>Tipo de Notificación: ' + dataEmail['Tipo de Notificación'] + '<br></li>'
                                    : ''
                                }
                            
                                ${
                                    dataEmail['Acto']
                                    ? '<li>Acto: ' + dataEmail['Acto'] + '<br></li>'
                                    : ''
                                }
                                
                            
                                ${
                                    dataEmail['Folios']
                                    ? '<li>Folios: ' + dataEmail['Folios'] + '<br></li>'
                                    : ''
                                }

                                ${
                                    dataEmail['Proveidos']
                                    ? '<li>Proveidos: ' + dataEmail['Proveidos'] + '<br></li>'
                                    : ''
                                }

                                ${
                                    dataEmail['Sumilla']
                                    ? '<li>Sumilla: ' + dataEmail['Sumilla'] + '<br></li>'
                                    : ''
                                }

                                ${
                                    dataEmail['Descripción de Usuario']
                                    ? '<li>Descripción de Usuario: ' + dataEmail['Descripción de Usuario'] + '<br></li>'
                                    : ''
                                }
                                
                            <!-- <li> 📎 res_080820230 <br> </li> -->
                            
                            Notificaciones:
                            ${
                                Object.keys(dataEmail['notifi']).length === 0
                                ? '<p><em>Sin notificaciones</em></p>'
                                : `<ul>
                                    ${
                                        Object.keys(dataEmail['notifi']).map(key => `
                                            <li>${key}</li>
                                        `).join('')
                                    }
                                </ul>`
                            }
                            
                            
                            </p>
                        </div>
                    
                        </td>
                        </tr>
                    </tbody>
                    </table>
                    
                    
                    
                    <table id="u_content_text_2" style="font-family:'Raleway',sans-serif;" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                    <tbody>
                        <tr>
                        <td class="v-container-padding-padding" style="overflow-wrap:break-word;word-break:break-word;padding:0px 10px 20px 40px;font-family:'Raleway',sans-serif;" align="left">
                            
                    <div class="v-text-align v-font-size" style="font-size: 13px; line-height: 140%; text-align: left; word-wrap: break-word;">
                        <p style="line-height: 140%;"><span style="line-height: 18.2px;">* Enviado a través de <span style="color: #0A2E4D; font-weight: 600;">Temis</span>.</span></p>
                    </div>
                    
                        </td>
                        </tr>
                    </tbody>
                    </table>

                    <table id="u_content_button_1" style="font-family:'Raleway',sans-serif;" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                    <tbody>
                        <tr>
                        <td class="v-container-padding-padding" style="overflow-wrap:break-word;word-break:break-word;padding:10px 10px 10px 40px;font-family:'Raleway',sans-serif;" align="left">
                            
                    <div class="v-text-align" align="left">
                        <a href="${urlPage}/seguimientos?Exp=${firstExp.id}" target="_blank" class="v-button v-size-width v-font-size" style="box-sizing: border-box;display: inline-block;text-decoration: none;-webkit-text-size-adjust: none;text-align: center;color: #FFFFFF; background-color: #172842; border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px; width:auto; max-width:100%; overflow-wrap: break-word; word-break: break-word; word-wrap:break-word; mso-border-alt: none;font-size: 14px;">
                        <span style="display:block;padding:10px 20px;line-height:120%;"><span style="line-height: 16.8px;">Ver Movimientos</span></span>
                        </a>
                    </div>

                        </td>
                        </tr>
                    </tbody>
                    </table>
                    
                    </div>
                    </div>
                    </div>
                        </div>
                    </div>
                    </div>
                    
                    
                    <div class="u-row-container" style="padding: 0px;background-color: transparent">
                    <div class="u-row" style="margin: 0 auto;min-width: 320px;max-width: 600px;overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;">
                        <div style="border-collapse: collapse;display: table;width: 100%;height: 100%;background-color: transparent;">
                    <div class="u-col u-col-100" style="max-width: 320px;min-width: 600px;display: table-cell;vertical-align: top;">
                    <div style="background-color: #0A2E4D;height: 100%;width: 100% !important;border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px;">
                    <div style="box-sizing: border-box; height: 100%; padding: 0px;border-top: 0px solid transparent;border-left: 0px solid transparent;border-right: 0px solid transparent;border-bottom: 0px solid transparent;border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px;">
                    
                    </div>
                    </div>
                        </div>
                    </div>
                    </div>
                    </div>
                    
                    <div class="u-row-container" style="padding: 0px;background-color: transparent">
                    <div class="u-row" style="margin: 0 auto;min-width: 320px;max-width: 600px;overflow-wrap: break-word;word-wrap: break-word;word-break: break-word;background-color: transparent;">
                        <div style="border-collapse: collapse;display: table;width: 100%;height: 100%;background-color: transparent;">
                    <div class="u-col u-col-62p26" style="max-width: 320px;min-width: 373.56px;display: table-cell;vertical-align: top;">
                    <div style="background-color: #0A2E4D;height: 100%;width: 100% !important;border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px;">
                    <div style="box-sizing: border-box; height: 100%; padding: 0px;border-top: 0px solid transparent;border-left: 0px solid transparent;border-right: 0px solid transparent;border-bottom: 0px solid transparent;border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px;">
                    
                    <table id="u_content_text_11" style="font-family:'Raleway',sans-serif;" role="presentation" cellpadding="0" cellspacing="0" width="100%" border="0">
                    <tbody>
                        <tr>
                        <td class="v-container-padding-padding" style="overflow-wrap:break-word;word-break:break-word;padding:20px 10px 20px 40px;font-family:'Raleway',sans-serif;" align="left">
                            
                    <div class="v-text-align v-font-size" style="font-size: 13px; color: #ffffff; line-height: 140%; text-align: left; word-wrap: break-word;">
                        <p style="line-height: 140%;"> &copy; 2023 Temis. Todos los derechos reservados</p>
                    </div>
                    
                        </td>
                        </tr>
                    </tbody>
                    </table>
                    
                    </div>
                    </div>
                    </div>
                    
                    <div class="u-col u-col-37p74" style="max-width: 320px;min-width: 226.44px;display: table-cell;vertical-align: top;">
                    <div style="background-color: #0A2E4D;height: 100%;width: 100% !important;border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px;">
                    <div style="box-sizing: border-box; height: 100%; padding: 0px;border-top: 0px solid transparent;border-left: 0px solid transparent;border-right: 0px solid transparent;border-bottom: 0px solid transparent;border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px;">
                    
                    </div>
                    </div>
                    </div>
                        </div>
                    </div>
                    </div>
                        </td>
                    </tr>
                    </tbody>
                    </table>
                    </body>
                    
                    </html>
                    `;
                const mailOptions = {
                    from: `Temis ${process.env.EMAIL}`,
                    to: recipients.join(', '),
                    subject: 'Alerta Temis - Cambios en el expediente',
                    html: htmlBuildMail
                };

                // Envía el correo electrónico
                await transporter.sendMail(mailOptions, (error, info) => {
                    const fechaYHora = moment().format('YYYY-MM-DD HH:mm:ss');
                    if (error) {
                        console.error('Error al enviar el correo electrónico:', error);
                        strMsg = fechaYHora + ' Error al enviar el correo electrónico:' + error;
                        logger.error(strMsg);
                    } else {
                        console.log('Correo electrónico enviado con éxito:', info.response);
                        strMsg = fechaYHora + ' Correo electrónico enviado con éxito:' + info.response;
                        logger.info(strMsg);
                    }
                });
            }

        }
        
        // Eliminar el primer registro de la tabla temporal si es necesario
        await eliminarTempRegistro(conexion, firstRecord.id);

        conexion.end();
    } catch (error) {
        const fechaYHora = moment().format('YYYY-MM-DD HH:mm:ss');
        console.error('Error:', error);
        strMsg = fechaYHora + ' Error:' + error;
        logger.error(strMsg);
        conexion.end();
    }
}

main();