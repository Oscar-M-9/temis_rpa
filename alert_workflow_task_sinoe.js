// var mysql = require('mysql');
const fetch = require('node-fetch');
const moment = require('moment');
const util = require('util');
const winston = require('winston');

const transporter = require('./helpers/mailer');
const conectarBaseDeDatos = require('./helpers/conexion');

if (process.env.NODE_ENV != 'production'){
    require('dotenv').config();
}

var urlAPI = process.env.URL_API_RPA;


// Configura los transportes (destinos) de registro
const logger = winston.createLogger({
    level: 'error',
    transports: [
        new winston.transports.File({
            filename: 'logs/alert_workflow_task_sinoe.log',
            level: 'info',
        }),
        new winston.transports.Console({
            level: 'error',
        }),
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


async function obtenerRegistrosTask(conexion) {
    const currentDate = new Date().toISOString().slice(0, 10);
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM work_flow_task_expediente_sinoes WHERE estado = ? AND fecha_alerta  = ? ', ['En progreso', currentDate], (error, results) => {
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

// obtener el registro del expediente
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

// Crear una función para obtener registro de user_partes 
async function obtenerUserParte(conexion, id) {
    return new Promise((resolve, reject) => {
        conexion.query('SELECT * FROM user_partes WHERE id_exp = ? AND entidad = ?', [id, 'sinoe'], (error, results) => {
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


async function main() {
    try {
        const conexion = conectarBaseDeDatos();
        conexion.connect();

        const firstRecord = await obtenerRegistrosTask(conexion);

        if (!firstRecord) {
            // throw new Error('No se obtuvo datos de la tabla temporal');
            console.log('No hay registros en la tabla.');
            logger.warn('No hay registros en la tabla.');
            conexion.end();
            return;
        }

        for (const row in firstRecord) {
            if (Object.hasOwnProperty.call(firstRecord, row)) {
                const element = firstRecord[row];
                console.log('element: ', element);
                // Obtener firstExp aquí, por ejemplo:
                const firstExp = await obtenerRegistroExpedientes(conexion, element.id_exp);

                if (!firstExp) {
                    const fechaYHora = new Date().toUTCString();
                    strMsg = fechaYHora +': Error no se encontro el registro del expediente con el id :' + element.id_exp;
                    logger.error(strMsg);
                    break;
                }

                const firstClient = await obtenerRegistroClientes(conexion, firstExp.id_client);

                var urlPage = "https://" + firstExp.code_company + ".temisperu.com";

                const resultEmails = await obtenerUserParte(conexion, firstExp.id);
                console.log('resultEmails: ', resultEmails);
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
                console.log('recipients: ', recipients);

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
                            Tiene una alerta de tarea en el expediente ${firstExp.n_expediente} ${
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
                            
                            ${
                                `<ul>
                                    <li><strong>Prioridad:</strong> ${element["prioridad"]}  <br></li>
                                    <li><strong>Nombre:</strong> ${element['nombre']} <br></li>
                                    <li><strong>Descripción:</strong> ${element['descripcion']} <br></li>
                                    <li><strong>Estado:</strong> ${element['estado']} <br></li>
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
                        <span style="display:block;padding:10px 20px;line-height:120%;"><span style="line-height: 16.8px;">Ver tarea</span></span>
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
                    subject: '🚨 Alerta de tarea - Temis',
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


        conexion.end();
    } catch (error) {
        console.error('Error:', error);
        logger.error('Error:', error)
        conexion.end();
    }
}

main();