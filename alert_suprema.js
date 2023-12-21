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
    //   new winston.transports.File({ filename: 'logs/alert_suprema.log' }) // Registra en un archivo
      new winston.transports.File({ filename: '/home/temisperu/public_html/rpa.temisperu.com/RPA/logs/alert_suprema.log' }) // Registra en un archivo
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

async function obtenerPrimerRegistro(conexion) {
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM temp_suprema_alerts WHERE estado = ? LIMIT 1', ['pendiente'], async (error, results) => {
            if (error) {
                reject(error);
            } else if (results.length === 0) {
                // No hay registros, restablecer la secuencia de autoincremento a 0
                await resetAutoIncrement(conexion, 'temp_suprema_alerts');
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


// Crear una función para enviar los datos a un endpoint
async function enviarDatosAlEndpoint(data) {
    const endpointURL = urlAPI + '/supremo-data';
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

// obtener el registro de indecopi
async function obtenerRegistroExpedientes(conexion , id) {
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM corte_supremas WHERE id = ?', [id], (error, results) => {
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

// Crear una función para actualizar el registro de expedientes
async function actualizarRegistroExpedientes(conexion, data, firstExp) {
    // console.log('firstExp: ', firstExp);
    // console.log('data: ', data);
    // PARTES PROCESALES 
    const dataParteProcesal = data.data["Partes Procesales"];
    const dataParte = Object.entries(dataParteProcesal).map(([key, values]) => [key, ...values]);
    const dataParteExp = firstExp.partes_procesales;

    if (dataParteExp !== JSON.stringify(dataParte)){
        const sql = `UPDATE corte_supremas SET partes_procesales = ? WHERE id= ?`;
        conexion.query(sql, [JSON.stringify(dataParte), firstExp.id], function(error, results) {
            if (error) {
                console.error('Error al actualizar el registro:', error);
                return;
            }
            console.log('Registro actualizado con éxito - partes procesales.');
        });
    }

    // Actualizar el registro del expediente
    const sql = `UPDATE corte_supremas SET relator = ?, distrito_judicial = ?, secretario = ?, delito = ?, ubicacion = ?, estado = ? WHERE id= ?`;
    // Ejecuta la consulta SQL 7
    conexion.query(sql, [data.data['Datos Expediente']['Relator'], data.data['Datos Expediente']['Distrito Judicial'],
    data.data['Datos Expediente']['Secretario'], data.data['Datos Expediente']['Delito'], 
    data.data['Datos Expediente']['Ubicación'], data.data['Datos Expediente']['Estado'], firstExp.id], function(error, results) {
        if (error) {
            console.error('Error al actualizar el registro:', error);
            return;
        }
        console.log('Registro actualizado con éxito - Datos generales de Corte Suprema.');
    });
}


async function ejecutarQueryInsert(conexion, sql, values) {
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

async function ejecutarQuerySelect(conexion , sql, values) {
    return new Promise((resolve, reject) => {
        conexion.query(sql, values, (error, results) => {
            if (error) {
                reject(error);
            } else if (results.length === 0) {
                resolve(null);
            } else {
                resolve(results[0]);
            }
        });
    });
}

// Crear una función para obtener registro de user_partes 
async function obtenerUserParte(conexion, id) {
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM user_partes WHERE id_exp = ? AND entidad = ?', [id, 'indecopi'], (error, results) => {
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

// Crear una función para obtener registro de user_partes
async function obtenerAccionesNuevas(conexion, id, count) {
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM seguimiento_supremas WHERE id_exp = ? AND n_seguimiento > ? AND abog_virtual = ? ORDER BY n_seguimiento DESC', [id, count, 'si'], (error, results) => {
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

async function eliminarTempRegistro(conexion, id) {
    try {
        const sql = 'DELETE FROM temp_suprema_alerts WHERE id = ?';
        await promisifyQuery(conexion, sql, [id]);
        console.log('Alerta temporal de la tabla eliminada con éxito. ID:', id);
    } catch (error) {
        throw new Error('Error al eliminar registro de la tabla temporal: ' + error);
    }
}




async function main() {
    try {
        var strMsg;
        const conexion = conectarBaseDeDatos();
        conexion.connect();

        const firstRecord = await obtenerPrimerRegistro(conexion);
        // console.log('firstRecord: ', firstRecord);

        if (!firstRecord) {
            // throw new Error('No se obtuvo datos de la tabla temporal');
            const fechaYHora = new Date().toUTCString();
            console.log('No hay registros en la tabla temporal.');
            strMsg = fechaYHora + ': No hay registros en la tabla temporal.';
            logger.warn(strMsg);
            conexion.end();
            return;
        }

        const data = {
            url: firstRecord.url,
        };

        const responseData = await enviarDatosAlEndpoint(data);
        // console.log('responseData: ', responseData);
        if (responseData.status == 404 && responseData.msg.name == 'TimeoutError'){
            console.warn('responseData.msg.name: ', responseData.msg.name);
            conexion.end();
            return;
        }
        if (responseData.status == 404 && responseData.msg.name == 'ProtocolError'){
            console.warn('responseData.msg.name: ', responseData.msg.name);
            conexion.end();
            return;
        }
        if (responseData.status == 404){
            throw new Error('Recurso no encontrado');
        }


        // Obtener firstExp aquí, por ejemplo:
        const firstExp = await obtenerRegistroExpedientes(conexion, firstRecord.id_suprema);
        // console.log('firstExp: ', firstExp);
        
        if (firstExp) {
            const firstClient = await obtenerRegistroClientes(conexion, firstExp.id_client);

            var urlPage = "https://" + firstExp.code_company + ".temisperu.com";

            await actualizarRegistroExpedientes(conexion, responseData, firstExp);
            // VISTA CAUSAS DEL EXPEDIENTE
            const countTotalVC = parseInt(firstRecord.vista_causa);
            const dataVistaCausas = responseData.data['Vistas de causas'];
            const countTotalVCRPA = Object.keys(dataVistaCausas).length;
            const countFaltanteinVC = countTotalVCRPA - countTotalVC;
            if (countTotalVCRPA > countTotalVC){
                var intCount = 0;
                var ncountTotalVC = countTotalVC + 1;
                for (const key in dataVistaCausas) {
                    if (intCount < countFaltanteinVC){
                        if (Object.hasOwnProperty.call(dataVistaCausas, key)) {
                            const element = dataVistaCausas[key];
                            const sqlInsert = 'INSERT INTO vista_causa_supremas (n_vista, fecha_vista, fecha_programacion, sentido_resultado, observacion, tipo_vista, abog_virtual, code_company, code_user, id_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                            const fechaVista = element["fecha vista"];
                            const fechaVistaConvertida = moment(fechaVista, 'DD/MM/YYYY HH:mm:ss').format('YYYY-MM-DD HH:mm:ss');
                            const fechaProgramacion = element["fechaProgramacion"];
                            const fechaProgramacionConvertida = moment(fechaProgramacion, 'DD/MM/YYYY').format('YYYY-MM-DD');

                            const dataInsert = [ncountTotalVC++, fechaVistaConvertida, fechaProgramacionConvertida, element["sentidoResultado"], element["observacion"], element["tipodeVista"], "si", firstExp.code_company, firstExp.code_user, firstExp.id];
                            await ejecutarQueryInsert(conexion, sqlInsert, dataInsert);
                        }
                    }
                    intCount++;
                }
            }

            // SEGUIMIENTO DEL EXPEDIENTE
            // datos del ultimo movimiento de corte suprema
            const countTotalMovi = (firstRecord.count_movi + 1);
            const dataMovi = responseData.data["Seguimiento del expediente"];
            const countTotalMoviRPA = Object.keys(dataMovi).length;
            const countFaltanteInMovi = countTotalMoviRPA - countTotalMovi;
            if (countTotalMoviRPA > countTotalMovi){
                var intCountM = 0;
                var ncountTotalMovi = countTotalMovi + 1;
                for (const key in dataMovi) {
                    if (intCountM < countFaltanteInMovi){
                        if (Object.hasOwnProperty.call(dataMovi, key)) {
                            const element = dataMovi[key];
                            const sqlInsertM = 'INSERT INTO seguimiento_supremas (n_seguimiento, fecha, acto, resolucion, fojas, sumilla, desc_usuario, presentante, abog_virtual, code_company, code_user, id_exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                            const fechaM = key;
                            const fechaMConvert = moment(fechaM, 'DD/MM/YYYY').format('YYYY-MM-DD');

                            const dataInsertM = [ncountTotalMovi++, fechaMConvert, element["txtActo"], element["txtResolucion"], element["numFojas"], element["txtSumillaSeg"], element["xDescUsuario"], element["presentante"], "si", firstExp.code_company, firstExp.code_user, firstExp.id];
                            await ejecutarQueryInsert(conexion, sqlInsertM, dataInsertM);
                        }
                    }
                    intCountM++;
                }


                // NOTIFICAR POR CORREO
                const resultEmails = await obtenerUserParte(conexion, firstExp.id);
                if (!resultEmails){
                    const fechaYHora = new Date().toUTCString();
                    strMsg = fechaYHora + ': No se encontró correos en el expediente (' + firstExp.id + ') : '+ resultEmails;
                    logger.error(strMsg);
                    conexion.end();
                    return;
                }

                var recipients = [];
                
                for (const row of resultEmails) {
                    recipients.push(row.email);
                }
                if (Object.keys(dataMovi).length > 0){
                    var dataAll = await obtenerAccionesNuevas(conexion, firstExp.id, (firstRecord.count_movi + 1));

                    if (dataAll){
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
                                            
                                            ${String(Object.keys(dataAll).length)} Seguimiento del expediente.<br><br>
                                            
                                            ${
                                                Object.keys(dataAll).length === 0
                                                ? '<p><em>Sin Seguimiento del expediente</em></p>'
                                                : `<ul>
                                                    ${
                                                        Object.keys(dataAll).map(key => `
                                                        <li>Fecha: ${moment(dataAll[key]["fecha"], "YYYY-MM-DD HH:mm:ss").format("DD/MM/YYYY HH:mm:ss")}  <br></li>
                                                        <li>Acto: ${dataAll[key]['acto']} <br></li>
                                                        <li>Resolución: ${dataAll[key]['fojas']} <br></li>
                                                        <li>Sumilla: ${dataAll[key]['sumilla']} <br></li>
                                                        <li>DESCARGADO POR: ${dataAll[key]['desc_usuario']} <br></li> <br><br>
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
                                        <a href="${urlPage}/seguimientos-corte-suprema?Exp=${firstExp.id}" target="_blank" class="v-button v-size-width v-font-size" style="box-sizing: border-box;display: inline-block;text-decoration: none;-webkit-text-size-adjust: none;text-align: center;color: #FFFFFF; background-color: #172842; border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px; width:auto; max-width:100%; overflow-wrap: break-word; word-break: break-word; word-wrap:break-word; mso-border-alt: none;font-size: 14px;">
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
                            const fechaYHora = new Date().toUTCString();
                            if (error) {
                                console.error('Error al enviar el correo electrónico:', error);
                                strMsg = fechaYHora +': Error al enviar el correo electrónico:' + error;
                                logger.error(strMsg)
                            } else {
                                console.log('Correo electrónico enviado con éxito:', info.response);
                                strMsg = fechaYHora + ': Correo electrónico enviado con éxito:'+ info.response;
                                logger.info(strMsg);
                            }
                        });
                    }

                    


                }
            }
            

        }
        
        // Eliminar el primer registro de la tabla temporal si es necesario
        await eliminarTempRegistro(conexion, firstRecord.id);

        conexion.end();
    } catch (error) {
        const fechaYHora = new Date().toUTCString();
        console.error('Error:', error);
        var strMsg = fechaYHora + ' Error:' + error;
        logger.error(strMsg)
        conexion.end();
    }
}

main();

