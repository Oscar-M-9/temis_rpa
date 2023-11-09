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
var urlAPI = process.env.URL_API_RPA;


// Configura los transportes (destinos) de registro
const logger = winston.createLogger({
    level: 'info', // Nivel mínimo de registro
    format: winston.format.simple(), // Formato de registro simple
    transports: [
      new winston.transports.Console(), // Registra en la consola
      new winston.transports.File({ filename: 'logs/alert_indecopi.log' }) // Registra en un archivo
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
        conexion.query('SELECT * FROM temp_indecopi_alerts WHERE estado = ? LIMIT 1', ['pendiente'], async (error, results) => {
            if (error) {
                reject(error);
            } else if (results.length === 0) {
                // No hay registros, restablecer la secuencia de autoincremento a 0
                await resetAutoIncrement(conexion, 'temp_indecopi_alerts');
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
    const endpointURL = urlAPI + '/indecopi-data';
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
        conexion.query('SELECT * FROM indecopis WHERE id = ?', [id], (error, results) => {
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
    // PARTES PROCESALES 
    let dataIndecopiPartes1 = firstExp.tipo == 'Reclamos' ? "Reclamante(s)" : "Ciudadano(s)";
    let dataIndecopiPartes2 = firstExp.tipo == 'Reclamos' ?  "Reclamado(s)" : "Proveedor(es)";
    let dataTipoIndecopi = firstExp.tipo == 'Reclamos' ?  "Reclamo" : "Buen Oficio";

    var resultDataPartes1 = data.data[dataIndecopiPartes1];
    var resultDataPartes2 = data.data[dataIndecopiPartes2];

    var datosCombinados = {
        tipo: firstExp.tipo,
        data1: JSON.stringify(resultDataPartes1),
        data2: JSON.stringify(resultDataPartes2),
    };
    
    const data1Values = [];
    const data2Values = [];

    // Acceder directamente a las propiedades de datosCombinados
    const { data1, data2 } = datosCombinados;

    // Iterar sobre las secciones "data1" y "data2"
    for (const section of [data1, data2]) {
        if (section) {
            const sectionObj = JSON.parse(section);
            for (const subarrayKey in sectionObj) {
                const subarray = sectionObj[subarrayKey];
                const values = Object.values(subarray);
                // Agregar los valores al array correspondiente (data1Values o data2Values)
                if (section === data1) {
                    data1Values.push(values);
                } else if (section === data2) {
                    data2Values.push(values);
                }
            }
        }
    }

    if (!data1Values || !data2Values){
        // Ejecuta la consulta SQL
        updateParteProcesales1 = JSON.stringify(data1Values);
        updateParteProcesales2 = JSON.stringify(data2Values);
        const sql = `UPDATE indecopis SET partes_procesales1 = ? partes_procesales2 = ? WHERE id= ?`;
        conexion.query(sql, [updateParteProcesales1, updateParteProcesales2, firstExp.id], function(error, results) {
            if (error) {
                console.error('Error al actualizar el registro:', error);
                return;
            }
            console.log('Registro actualizado con éxito - partes procesales.');
        });
        console.log('diferente');
    }

    // Actualizar el registro del expediente
    const sql = `UPDATE indecopis SET oficina = ?, responsable = ?, via_presentacion = ?, fecha_inicio = ?, estado = ?, fecha = ?, forma_conclusion = ? WHERE id= ?`;
    // 8
    let valueFormaConclusion;
    if (data.data['Forma de Conclusión:']){
        valueFormaConclusion = data.data['Datos Generales']['Forma de Conclusión:'];
    }else{
        valueFormaConclusion = null;
    }
    // Ejecuta la consulta SQL
    conexion.query(sql, [data.data['Datos Generales']['Oficina:'], data.data['Datos Generales']['Responsable del '+ dataTipoIndecopi +':'],
    data.data['Datos Generales']['Vía de Presentación:'], data.data['Datos Generales']['Fecha de inicio de trámite:'], 
    data.data['Datos Generales']['Estado:'], data.data['Datos Generales']['Fecha:'], valueFormaConclusion, firstExp.id], function(error, results) {
        if (error) {
            console.error('Error al actualizar el registro:', error);
            return;
        }
        console.log('Registro actualizado con éxito - Datos generales de indecopi.');
    });
}

async function manejarAccionesPendientes(conexion, dataAccionesRealizadas, firstExp, countTotalActual, firstRecord) {

    // Itera sobre las claves y valores invertidos
    var countPending = 1;
    for (const key in dataAccionesRealizadas) {
        if (countPending > countTotalActual){
            // console.log('dataAccionesRealizadas: ', dataAccionesRealizadas['R' + countPending]);
            // console.log("['R' + countPending]: ", ['R' + countPending]);
            await procesarAccionPendiente(conexion, dataAccionesRealizadas, firstExp, ['R' + countPending], firstRecord);
        }
        countPending++;
    }

}

async function procesarAccionPendiente(conexion, dataPendingAccion, firstExp, key, firstRecord) {
    try {
        if (dataPendingAccion) {
            const idsAccionRealizada = [];
            const sqlInsertFollowUp = 'INSERT INTO acciones_indecopis (n_accion, fecha, accion_realizada, anotaciones, abog_virtual, code_user, code_company, id_indecopi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
            // 8
            const values = [
                parseInt(firstRecord.n_ult_movi) + 1,
                moment(dataPendingAccion[key]["Fecha"], "DD/MM/YYYY").format("YYYY-MM-DD"),
                dataPendingAccion[key]["Acción realizada"],
                dataPendingAccion[key]["Anotaciones"],
                'si',
                firstExp.code_user,
                firstExp.code_company,
                firstRecord.id_indecopi
            ];

            const insertResult = await ejecutarQueryInsertAccionRealizada(conexion, sqlInsertFollowUp, values);
            
            // Agrega el ID generado al arreglo global idsAccionRealizada
            idsAccionRealizada.push(insertResult.insertId);
            
        }
    } catch (error) {
        console.error('Error al procesar el movimiento pendiente:', error);
    }
}

async function ejecutarQueryInsertAccionRealizada(conexion, sql, values) {
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
        conexion.query('SELECT * FROM acciones_indecopis WHERE id_indecopi = ? AND n_accion > ? AND abog_virtual = ? ORDER BY n_accion DESC', [id, count, 'si'], (error, results) => {
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
        const sql = 'DELETE FROM temp_indecopi_alerts WHERE id = ?';
        await promisifyQuery(conexion, sql, [id]);
        console.log('Alerta temporal de la tabla eliminada con éxito. ID:', id);
    } catch (error) {
        throw new Error('Error al eliminar notificación: ' + error);
    }
}




async function main() {
    try {
        const conexion = conectarBaseDeDatos();
        conexion.connect();

        var strMsg;

        const firstRecord = await obtenerPrimerRegistro(conexion);

        if (!firstRecord) {
            // throw new Error('No se obtuvo datos de la tabla temporal');
            const fechaYHora = new Date().toUTCString();
            console.log('No hay registros en la tabla temporal.');
            strMsg = fechaYHora + ' No hay registros en la tabla temporal.';
            logger.warn(strMsg);
            conexion.end();
            return;
        }

        const data = {
            url: firstRecord.detalle,
        };

        const responseData = await enviarDatosAlEndpoint(data);
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
        const firstExp = await obtenerRegistroExpedientes(conexion, firstRecord.id_indecopi);
        
        if (firstExp) {
            const firstClient = await obtenerRegistroClientes(conexion, firstExp.id_client);

            var urlPage = process.env.URL_PAGE || 'https://temisperu.com';

            await actualizarRegistroExpedientes(conexion, responseData, firstExp);
            const countTotalActual = parseInt(firstRecord.update_information) + 1;
            // const countTotalActual = parseInt(firstRecord.update_information) ;
            const countRPATotal = Object.keys(responseData.data['Acciones realizadas']).length;
            
            if (countRPATotal > countTotalActual){
                // Accion Nueva
                console.log('Accion Nueva: ');
                await manejarAccionesPendientes(conexion, responseData.data['Acciones realizadas'], firstExp, countTotalActual , firstRecord);

                const resultEmails = await obtenerUserParte(conexion, firstExp.id);
                if (!resultEmails){
                    const fechaYHora = new Date().toUTCString();
                    strMsg = fechaYHora + ' No se encontró correos en el expediente (' + firstExp.id + ') : ' + resultEmails
                    logger.error(strMsg);
                    // await eliminarTempRegistro(conexion, firstRecord.id);
                    conexion.end();
                    return;
                }

                var recipients = [];
                
                for (const row of resultEmails) {
                    recipients.push(row.email);
                }
                console.log('recipients: ', recipients);
                if (Object.keys(responseData.data['Acciones realizadas']).length > 0){
                    var dataAll = await obtenerAccionesNuevas(conexion, firstExp.id, countTotalActual);
                    console.log('dataAll: ', dataAll);

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
                                        Se detectó movimientos en el expediente ${firstExp.numero} ${
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
                                        
                                        ${String(Object.keys(dataAll).length)} Acciónes Realizadas.<br><br>
                                        
                                        ${
                                            Object.keys(dataAll).length === 0
                                            ? '<p><em>Sin Acciones realizadas</em></p>'
                                            : `<ul>
                                                ${
                                                    Object.keys(dataAll).map(key => `
                                                    <li>Fecha: ${moment(dataAll[key]["fecha"], "YYYY-MM-DD").format("DD/MM/YYYY")}  <br></li>
                                                    <li>Acción realizada: ${dataAll[key]['accion_realizada']} <br></li>
                                                    <li>Anotaciones: ${dataAll[key]['anotaciones']} <br></li> <br><br>
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
                                    <a href="${urlPage}/acciones-realizadas?Exp=${firstExp.id}" target="_blank" class="v-button v-size-width v-font-size" style="box-sizing: border-box;display: inline-block;text-decoration: none;-webkit-text-size-adjust: none;text-align: center;color: #FFFFFF; background-color: #172842; border-radius: 0px;-webkit-border-radius: 0px; -moz-border-radius: 0px; width:auto; max-width:100%; overflow-wrap: break-word; word-break: break-word; word-wrap:break-word; mso-border-alt: none;font-size: 14px;">
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
                            strMsg = fechaYHora, ' Error al enviar el correo electrónico:', error;
                            logger.error(strMsg);
                        } else {
                            console.log('Correo electrónico enviado con éxito:', info.response);
                            strMsg = fechaYHora + ' Correo electrónico enviado con éxito:' + info.response;
                            logger.info(strMsg);
                        }
                    });


                }

            }else{
                // No hay Acciones nuevas
                console.log('No hay Acciones nuevas: ');
            }

        }
        
        // Eliminar el primer registro de la tabla temporal si es necesario
        await eliminarTempRegistro(conexion, firstRecord.id);

        conexion.end();
    } catch (error) {
        const fechaYHora = new Date().toUTCString();
        console.error('Error:', error);
        strMsg = fechaYHora + ' Error:' + error;
        logger.error(strMsg)
        conexion.end();
    }
}

main();

