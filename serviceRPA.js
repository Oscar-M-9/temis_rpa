const express = require("express");
const puppeteer = require("puppeteer");

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

const fileType = require('file-type');

const ac = require("@antiadmin/anticaptchaofficial");

// const APIKeyAntiCaptcha = '32f794dff51c68f023161dcb0e793f16';


// const jwt = require('jsonwebtoken');
// const cors = require('cors');

// const secretKey = 'temis@Ingytal'; //? Reemplaza con tu clave secreta
// const secretKey = require("./settings/keys");
if (process.env.NODE_ENV != 'production'){
    require('dotenv').config();
    const httpsOptions = {
        key: fs.readFileSync('/home/temisperu/public_html/rpa.temisperu.com/cert.key', 'utf8'),
        cert: fs.readFileSync('/home/temisperu/public_html/rpa.temisperu.com/cert.crt', 'utf8'),
        ca: fs.readFileSync('/home/temisperu/public_html/rpa.temisperu.com/cert.pem', 'utf8')
    };
}else{
    const httpsOptions = {
        key: fs.readFileSync(process.env.DATA_KEY),
        cert: fs.readFileSync(process.env.DATA_CERT)
    };
}




const app = express();
app.set("port", 9101);
// app.use(cors());
// app.set("key", secretKey.key);
// app.use(express.urlencoded({extended: false}));
// ! NO OLVIDAR CAMBIAR LA URL PERMITIDA MAS EL PATH DE DESCARGA DE LOS DOCUMENTOS DEL PODER JUDICIAL
// Middleware de manejo de CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.use(express.json());


if (process.env.NODE_ENV != 'production'){
    const dirGeneral = 'D:/INGYTAL/ABOGADOS/abogados/storage/app/public/docs/';
}else{
    const dirGeneral = '/home/temisperu/public_html/_wildcard_.temisperu.com/storage/app/public/docs/';
}

app.post("/poder-judicial-result", (req, res) => {
    let body_filtros = req.body;

    // Elige modo de consulta
    // por Filtros: 1 / Por Código de Expediente: 0
    const  modoDeConsulta = body_filtros.modoDeConsulta;

    let codigoExpediente = [];
    // Por código de expediente
    if (body_filtros.codigoExpediente) {
        const partesCodigo = body_filtros.codigoExpediente.split('-') || "";
        codigoExpediente = [
            partesCodigo[0],
            partesCodigo[1],
            partesCodigo[2],
            partesCodigo[3],
            partesCodigo[4],
            partesCodigo[5],
            partesCodigo[6]
        ];
    }

    // por Filtros
    const distritoJudicial = body_filtros.distritoJudicial || "";
    const instancia = body_filtros.instancia || "";
    const especialidad = body_filtros.especialidad || "";
    const year = body_filtros.year || "";
    const nExpediente = body_filtros.nExpediente || "";

    const url = 'https://cej.pj.gob.pe/cej/forms/busquedaform.html';

    (async () => {

        let browser = null;
        let results = {'status': null, 'msg':'', 'data':{}};
    
        try{
    
            browser = await puppeteer.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                // headless: false
                headless: 'new'
            });
    
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
            await page.goto(url);
    
            //PAG. 01 .........................................................................................................
    
            try{
                await page.waitForSelector('#consultarExpedientes');
            } catch(error){
                results.status = 404;
                results.msg = 'Error: La pag. [Búsqueda de expedientes] no ha cargado /' + error;
                await browser.close();
                return results;
            }
    
            let modoDeC;
            switch(modoDeConsulta){
                case 0:
                    await page.waitForSelector('a[title="Por código de expediente"]');
                    modoDeC = await page.$('a[title="Por código de expediente"]');
                    await modoDeC.click();
    
                    // await page.waitForSelector('#cod_expediente');
                    await new Promise(r => setTimeout(r, 1000));
    
                    await page.type('#cod_expediente', codigoExpediente[0], { delay: 200 });
                    await page.type('#cod_anio', codigoExpediente[1], { delay: 100 });
                    await page.type('#cod_incidente', codigoExpediente[2], { delay: 100 });
                    await page.type('#cod_distprov', codigoExpediente[3], { delay: 100 });
                    await page.type('#cod_organo', codigoExpediente[4], { delay: 100 });
                    await page.type('#cod_especialidad', codigoExpediente[5], { delay: 100 });
                    await page.type('#cod_instancia', codigoExpediente[6], { delay: 100 });
                    break;
                case 1:
                    await page.waitForSelector('a[title="Por filtros"]');
                    modoDeC = await page.$('a[title="Por filtros"]');
                    await modoDeC.click();
    
                    await page.waitForSelector('select#distritoJudicial > option');
    
                    const optionsDistritoJudicial = await page.evaluate(() => {
                        const select = document.querySelector('select#distritoJudicial');
                        const options = select.options;
                        const result = {};
                        for (let i = 0; i < options.length; i++) {
                        const option = options[i];
                        if (option.value) {
                            result[option.textContent.trim()] = option.value;
                        }
                        }
                        return result;
                    });
    
                    if(!optionsDistritoJudicial.hasOwnProperty(distritoJudicial)){
                        results.status = 404;
                        results.msg = "Error: Distrito judicial ingresado no existe en la página"
                        await browser.close();
                        return results;
                    }
    
                    await page.select('select#distritoJudicial', optionsDistritoJudicial[distritoJudicial]);
    
                    await page.waitForSelector('select#organoJurisdiccional option[value=""][onmouseover="this.style.cursor="]');
    
                    const optionOrganoJurisdiccional = await page.evaluate(() => {
                        const select = document.querySelector('select#organoJurisdiccional');
                        const options = select.options;
                        const result = {};
                        for (let i = 0; i < options.length; i++) {
                        const option = options[i];
                        if (option.value) {
                            result[option.textContent.trim()] = option.value;
                        }
                        }
                        return result;
                    });
    
                    if(!optionOrganoJurisdiccional.hasOwnProperty(instancia)){
                        results.status = 404;
                        results.msg = "Error: Instancia ingresada no existe en la página"
                        await browser.close();
                        return results;
                    }
    
                    await page.select('select#organoJurisdiccional', optionOrganoJurisdiccional[instancia]);
    
                    await page.waitForSelector('select#especialidad option[value=""][onmouseover="this.style.cursor="]');
    
                    const optionEspecialidad = await page.evaluate(() => {
                        const select = document.querySelector('select#especialidad');
                        const options = select.options;
                        const result = {};
                        for (let i = 0; i < options.length; i++) {
                        const option = options[i];
                        if (option.value) {
                            result[option.textContent.trim()] = option.value;
                        }
                        }
                        return result;
                    });
    
                    if(!optionEspecialidad.hasOwnProperty(especialidad)){
                        results.status = 404;
                        results.msg = "Error: Especialidad ingresada no existe en la página"
                        await browser.close();
                        return results;
                    }
    
                    await page.select('select#especialidad', optionEspecialidad[especialidad]);
    
                    await page.waitForSelector('select#anio > option');
    
                    const optionYear = await page.evaluate(() => {
                        const select = document.querySelector('select#anio');
                        const options = select.options;
                        const result = {};
                        for (let i = 0; i < options.length; i++) {
                        const option = options[i];
                        if (option.value) {
                            result[option.textContent.trim()] = option.value;
                        }
                        }
                        return result;
                    });
    
                    if(!optionYear.hasOwnProperty(year)){
                        results.status = 404;
                        results.msg = "Error: Año ingresado no existe en la página"
                        await browser.close();
                        return results;
                    }
    
                    await page.select('select#anio', optionYear[year]);
    
                    await new Promise(resolve => setTimeout(resolve, 200));
    
                    await page.type('#numeroExpediente', nExpediente, { delay: 200 });
                    break;
                default:
                    results.status = 404;
                    results.msg = "Modo de consulta ingrasado no es válido";
                    await browser.close();
                    return results;
            }
    
            // Captcha
            const nuevaPagina = await browser.newPage();
            await nuevaPagina.goto('https://cej.pj.gob.pe/cej/xyhtml');
    
            const valorCampoOculto = await nuevaPagina.$eval('input[type="hidden"]', (element) => element.value);
            await nuevaPagina.close();
    
            await page.type('#codigoCaptcha', valorCampoOculto, { delay: 100 });
    
            // Boton consultar
            const consultar = await page.$('#consultarExpedientes');
            await consultar.click();
    
            try{
                await page.waitForNavigation({waitUntil: 'load'});
            } catch(error){
                results.status = 404;
                results.msg = 'Error: Página [Resultado de búsqueda] no ha cargado';
                await browser.close();
                return results;
            }
    
            await new Promise(r => setTimeout(r, 500));
            const respPage = await page.evaluate(()=>{
                const element = document.querySelector('#divConsultar > div[style="text-align: center;"]');
                if(element === null){ return null; }
                const spanElements = element.querySelectorAll('span[style="display: none"]');
                return [spanElements.length, spanElements[0].getAttribute('id')];
            });
    
            if(respPage !== null){
                switch(respPage[0]){
                    case 1:
                        const idDisplayNone = respPage[1];
                        if(idDisplayNone === 'codCaptchaError'){
                            results.status = 200;
                            results.msg = 'No existe expedientes con los datos ingresados';
                            await browser.close();
                        }else if(idDisplayNone === 'mensajeNoExisteExpedientes'){
                            results.status = 404;
                            results.msg = 'Error: Resolución del Captcha';
                            await browser.close();
                        }
                        return results;
                    case 2:
                        results.status = 404;
                        results.msg = 'Error: Datos ingresados para la búsqueda son incorrectos';
                        await browser.close();
                        return results;
                    default:
                        results.status = 404;
                        results.msg = 'Error: La estructura HTML de la Página [Búsqueda de expedientes] a cambiado';
                        await browser.close();
                        return results;
                }
            }
    
            // PAG. 02 ..................................................................................................
    
            try{
                await page.waitForSelector('#divDetalles');
            } catch(error){
                results.status = 404;
                results.msg = 'Error: Página [Resultado de búsqueda] no ha cargado';
                await browser.close();
                return results;
    
            }
    
            const resBusqueda = await page.evaluate(()=>{
                let resultadoDeBusqueda = {};
                const panelGrupoDiv = document.querySelectorAll('#divDetalles > div');
                for(let i=0; i< panelGrupoDiv.length; i++){
                    resultadoDeBusqueda['R' + (i + 1)] = {'header':[], 'text':''};
                    let celdCentroD = panelGrupoDiv[i].querySelector('div.celdCentroD');
                    let divNroJuz = celdCentroD.querySelectorAll('div.divNroJuz > div > b');
                    for(let b of divNroJuz){
                        resultadoDeBusqueda['R' + (i + 1)]['header'].push(b.textContent.trim());
                    }
    
                    let partesp = celdCentroD.querySelector('div.partesp');
                    resultadoDeBusqueda['R' + (i + 1)]['text'] = partesp.textContent.trim();
    
                }
                return resultadoDeBusqueda;
            });
    
            // Envia resultado preliminar a php
            results.status = 200;
            results.data['numResults'] = Object.keys(resBusqueda).length;
            results.data['data'] = resBusqueda;
    
            // console.log(JSON.stringify(results, null, 1));
    
            await new Promise(r => setTimeout(r, 1000));
            await browser.close();
            return results;
    
        }catch(error){
            results.status = 404;
            results.msg = error;
            if(browser !== null){ await browser.close();}
            return results;
        }
    })().then((results) => {
        res.send(results);
        // res.send("hello world");
        console.log('Respuesta del RPA en Poder Judicial result');
        // console.log(JSON.stringify(results, null, 1));
    })
    .catch((error) => {
        console.error("Ocurrió un error:", error);
        error.sendStatus(500);
    });
    

});

app.post("/poder-judicial-data", (req, res) => {
    let body_filtros = req.body;

    // Elige modo de consulta (solo por Código de Expediente)

    // Por código de expediente
    let codigoExpediente = [];
    // Por código de expediente
    if (body_filtros.codigoExpediente) {
        const partesCodigo = body_filtros.codigoExpediente.split('-') || "";
        codigoExpediente = [
            partesCodigo[0],
            partesCodigo[1],
            partesCodigo[2],
            partesCodigo[3],
            partesCodigo[4],
            partesCodigo[5],
            partesCodigo[6]
        ];
    }


    const url = 'https://cej.pj.gob.pe/cej/forms/busquedaform.html';

    //! Descarga de resoluciones
    // const baseDir = './storage/app/public/docs/'
    // const baseDir = 'D:/INGYTAL/ABOGADOS/abogados/storage/app/public/docs/';
    const baseDir = dirGeneral;


    function crearDirectorioRecursivo(directorio) {
        if (!fs.existsSync(directorio)) {
            const directorioPadre = path.dirname(directorio);
            crearDirectorioRecursivo(directorioPadre);
            fs.mkdirSync(directorio);
        }
    }
    
    async function downloadPDF(url, headers,  outputPath, itemPath){
    
        // Verifica si los documentos de resolución ya han sido descargados 
        if(fs.existsSync(`${outputPath}.doc`)){ return `${itemPath}.doc`; }
        else if(fs.existsSync(`${outputPath}.pdf`)){ return `${itemPath}.pdf`; }
        
        // Descarga el documento
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: headers,
            });
    
            const type = await fileType.fromBuffer(response.data);
            if (type && type.mime === 'application/x-cfb') {
                outputPath = `${outputPath}.doc`;
                itemPath = `${itemPath}.doc`;
    
            }else if (type && type.mime === 'application/pdf') {
                outputPath = `${outputPath}.pdf`;
                itemPath = `${itemPath}.pdf`;
            }else{
                // Extensión por defecto
                outputPath = `${outputPath}.pdf`;
                itemPath = `${itemPath}.pdf`;
            }
    
            fs.writeFileSync(outputPath, response.data);
        } catch (error) {
            //console.error('Error downloading PDF:', error);
        }
        return itemPath;
    }
    
    (async () => {
    
        let browser = null;
        let results = {'status': null, 'msg':'', 'data':{}};
    
        try{
    
            browser = await puppeteer.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                // headless: false
                headless: 'new'
            });
    
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
            await page.goto(url);
    
            //PAG. 01 .........................................................................................................
    
            try{
                await page.waitForSelector('#consultarExpedientes');
            } catch(error){
                results.status = 404;
                results.msg = 'Error: La pag. [Búsqueda de expedientes] no ha cargado /' + error;
                await browser.close();
                return results;
            }
    
            await page.waitForSelector('a[title="Por código de expediente"]');
            const modoDeC = await page.$('a[title="Por código de expediente"]');
            await modoDeC.click();
    
            await page.waitForSelector('#cod_expediente');
            await new Promise(r => setTimeout(r, 500));
    
            await page.type('#cod_expediente', codigoExpediente[0], { delay: 200 });
            await page.type('#cod_anio', codigoExpediente[1], { delay: 200 });
            await page.type('#cod_incidente', codigoExpediente[2], { delay: 200 });
            await page.type('#cod_distprov', codigoExpediente[3], { delay: 200 });
            await page.type('#cod_organo', codigoExpediente[4], { delay: 200 });
            await page.type('#cod_especialidad', codigoExpediente[5], { delay: 200 });
            await page.type('#cod_instancia', codigoExpediente[6], { delay: 200 });
    
            // Captcha
            const nuevaPagina = await browser.newPage();
            await nuevaPagina.goto('https://cej.pj.gob.pe/cej/xyhtml');
    
            const valorCampoOculto = await nuevaPagina.$eval('input[type="hidden"]', (element) => element.value);
            await nuevaPagina.close();
    
            await page.type('#codigoCaptcha', valorCampoOculto, { delay: 100 });
    
            // Boton consultar
            const consultar = await page.$('#consultarExpedientes');
            await consultar.click();
    
            try{
                await page.waitForNavigation({waitUntil: 'load'});
            } catch(error){
                results.status = 404;
                results.msg = 'Error: Página [Resultado de búsqueda] no ha cargado';
                await browser.close();
                return results;  
            }
    
            await new Promise(r => setTimeout(r, 500));
            const respPage = await page.evaluate(()=>{
                const element = document.querySelector('#divConsultar > div[style="text-align: center;"]');
                if(element === null){ return null; }
                const spanElements = element.querySelectorAll('span[style="display: none"]');
                return [spanElements.length, spanElements[0].getAttribute('id')];
            });
     
            if(respPage !== null){
                switch(respPage[0]){
                    case 1:
                        const idDisplayNone = respPage[1];
                        if(idDisplayNone === 'codCaptchaError'){
                            results.status = 200;
                            results.msg = 'No existe expedientes con los datos ingresados';
                            await browser.close();
                        }else if(idDisplayNone === 'mensajeNoExisteExpedientes'){
                            results.status = 404;
                            results.msg = 'Error: Resolución del Captcha';
                            await browser.close();
                        }
                        return results;
                    case 2:
                        results.status = 404;
                        results.msg = 'Error: Datos ingresados para la búsqueda son incorrectos';
                        await browser.close();
                        return results;
                    default:
                        results.status = 404;
                        results.msg = 'Error: La estructura HTML de la Página [Búsqueda de expedientes] a cambiado';
                        await browser.close();
                        return results;
                }
            }      
    
            // PAG. 02 ..................................................................................................
    
            try{
                await page.waitForSelector('#divDetalles');
            } catch(error){
                results.status = 404;
                results.msg = 'Error: Página [Resultado de búsqueda] no ha cargado';
                await browser.close();
                return results;
                
            }
    
            // Click sobre el expediente (Busqueda por código)
            await page.evaluate((codigoExpediente)=>{
                const panelGrupoDiv = document.querySelectorAll('#divDetalles > div');
                for(let i=0; i< panelGrupoDiv.length; i++){
                    let celdCentroD = panelGrupoDiv[i].querySelector('div.celdCentroD');
                    let divNroJuz = celdCentroD.querySelectorAll('div.divNroJuz > div > b');
                    let codeExped = divNroJuz[0].textContent.trim();
                    if(codeExped.toUpperCase() === codigoExpediente.toUpperCase()){
                        let button = panelGrupoDiv[i].querySelector('form#command button[type="submit"]');
                        button.click();
                        break;    
                    }
                }
            }, codigoExpediente.join('-'));
         
            // PAG. 03 ......................................................................................
    
            try{
                await page.waitForNavigation({waitUntil: 'load'})
                await page.waitForSelector('li.active')
            } catch(error){
                results.status = 404;
                results.msg = 'Error: Página [Detalles del expediente] no ha cargado';
                await browser.close();
                return results;
            }
    
            results = {'status': null, 'msg':'', 'data':{}};
    
            let cookies = await page.cookies();
            cookies = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    
            const headers = {
                'Cookie': cookies,
                'Referer': 'https://cej.pj.gob.pe/cej/forms/detalleform.html',
            };
    
    
            let dataDelExpediente = await page.evaluate(() => {
                let numResolutionsxDesc = 0;
                let dataReturn = {'Reporte de expediente':{},'Partes procesales':[], 'Segimiento del expediente':{}};
    
                //_______________________________Reporte de expediente___________________________________________________
    
                const gridDiv = document.getElementById('gridRE');
                const rows = gridDiv.querySelectorAll('.divRepExp');
                dataReturn['Reporte de expediente'] = processRows(rows, '.celdaGridN', '.celdaGrid, .celdaGridxT');
    
                //_______________________________Partes procesales___________________________________________________
    
                let datosPartesProcesales = [];
                const panelGrup = document.getElementsByClassName('panelGrupo');
            
                for (const element of panelGrup) {
                    const headPanelGrup = element.querySelectorAll('.partes');
                    
                    headPanelGrup.forEach((head) => {
                        let title = head.textContent.trim();
                        title = title.split(/\n\t*/);
                        const arrayFiltrado = title.filter((elemento) => elemento !== "");
                        datosPartesProcesales.push(arrayFiltrado);
                    });
                }
    
                dataReturn['Partes procesales'] = datosPartesProcesales;
    
                //_______________________________Segimiento del expediente___________________________________________
    
                //.........................................dataRow......................................................
    
                const collapseThree = document.getElementById('collapseThree');
                const elementosDiv = collapseThree.querySelectorAll('div[id^="pnlSeguimiento"]');
                let idNames = Array.from(elementosDiv).map((div) => div.id);
                
                for(let i=0; i < idNames.length; i++){  
    
                    let seguimientoDelExpediente = {};
    
                    let pnl = document.getElementById(idNames[i]);
    
                    let rowsColSm = pnl.querySelectorAll('.row .borderinf');
                    let dataRow = processRows(rowsColSm, '.roptionss', '.fleft');
    
                    if(Object.keys(dataRow).length === 0){ break; }
    
                    let divs = Array.from(pnl.querySelectorAll('div.row > div, div[style*="text-align: center;"][style*="min-height: 50px"] > div'));
                    let classNames = divs.map(div =>{
                        const clase = div.getAttribute('class');
                        return clase ? clase.trim() : null;
                        });
    
                    classNames = classNames.filter(clase => clase !== null);
                    if(classNames.length !== 4){ break; }
    
                    switch(classNames[classNames.length -1]){
                        case 'dBotonDesc':
                            let urlInElements= pnl.querySelector('.row .dBotonDesc a.aDescarg');
                            dataRow['Descarga resolucion'] = urlInElements.href;
                            numResolutionsxDesc += 1;
                            break;
                        case 'sinResol divResolPar' :
                            let NoResolutionElemet = pnl.querySelector('.row .sinResol.divResolPar');
                            dataRow['Descarga resolucion'] = NoResolutionElemet.textContent.trim();
                            break;
                        case 'sinResol divResolImpar' :
                            let NoResolutionElemetI = pnl.querySelector('.row .sinResol.divResolImpar');
                            dataRow['Descarga resolucion'] = NoResolutionElemetI.textContent.trim();
                            break;
                    }
                
                    seguimientoDelExpediente = dataRow;
    
                    //.....................................notifi............................................
    
                    let divNotifiPanelBody = pnl.querySelectorAll('#divNotif .panel-body[style="padding: 0px; "]');
                    let notifi = {};
                    
                    for(let i= 0; i < divNotifiPanelBody.length; i++){
                        
                        let notification = divNotifiPanelBody[i].querySelector('.borderinf h5.redb').textContent.trim();
                        
                        notifi[notification] = {};
    
                        let divNotifColSm = divNotifiPanelBody[i].querySelectorAll('.spaceinf');
                        let datadivNotifiColSm = processRows(divNotifColSm, '.subtit', '.fleft');
                        notifi[notification] = {...notifi[notification], ...datadivNotifiColSm};
    
                    }
    
                    seguimientoDelExpediente['notifi'] = notifi;
    
                    dataReturn['Segimiento del expediente']['pnlSeguimiento' + (i +1)] = seguimientoDelExpediente;
                }
                return [dataReturn, numResolutionsxDesc]; 
    
                function processRows(rows, titleSelector, valueSelector1) {
                    let data = {};
                    rows.forEach((row) => {
                        const titleElements = row.querySelectorAll(titleSelector);
                        const valueElements = row.querySelectorAll(valueSelector1);
    
                        if (titleElements.length === valueElements.length) {
    
                            titleElements.forEach((titleElement, index) => {
                                let title = titleElement.textContent.trim();
                                const value = valueElements[index].textContent.trim();
                                if (title.endsWith(':')){ title = title.slice(0, -1); }
                                data[title] = value  
                            });
                        }
                    }); 
                    return data;  
                }  
            });
    
            const numResolutionsxDesc = dataDelExpediente[1];
            dataDelExpediente = dataDelExpediente[0];
    
    
            const pnlSeguimientoClaves = Object.keys(dataDelExpediente['Segimiento del expediente']);
            const expedienteDir = dataDelExpediente['Reporte de expediente']['Expediente N°'];
            let fullPath = baseDir + expedienteDir;
            crearDirectorioRecursivo(fullPath);       
           
            let countRDesc = 0;
            const downloadPromises = [];
    
            for (const pnlSeguimiento of pnlSeguimientoClaves) {
                const url = dataDelExpediente['Segimiento del expediente'][pnlSeguimiento]['Descarga resolucion'];
                if (url.includes('https://cej.pj.gob.pe/cej/forms/')) {
                    const fRes = dataDelExpediente['Segimiento del expediente'][pnlSeguimiento]['Fecha de Resolución'];
                    const formattedDate = fRes.split(' ')[0].replace(/\//g, '');
                    const filename = `res_${formattedDate}`; // sin extensión de archivo
                    const fullPath = `${baseDir + expedienteDir}/${filename}`;
    
                    const itemPath = `${'../storage/docs/' + expedienteDir}/${filename}`;
    
                    downloadPromises.push(downloadPDF(url, headers, fullPath, itemPath));
                    
                    countRDesc += 1;
                    //dataDelExpediente['Segimiento del expediente'][pnlSeguimiento]['Descarga resolucion'] = itemPath;
                }
            }
    
            if(numResolutionsxDesc !== countRDesc){
                results.msg = `Advertencia: Resoluciónes no descargadas: ${numResolutionsxDesc - countRDesc}`;
            }
    
            // Wait for all download promises to complete
            const allResults = await Promise.all(downloadPromises);
    
            // Colocar las rutas hacia los documentos descargados
            let itPath = 0;
            for (const pnlSeguimiento of pnlSeguimientoClaves) {
                const url = dataDelExpediente['Segimiento del expediente'][pnlSeguimiento]['Descarga resolucion'];
                if (url.includes('https://cej.pj.gob.pe/cej/forms/')) {
                    dataDelExpediente['Segimiento del expediente'][pnlSeguimiento]['Descarga resolucion'] = allResults[itPath];
                    itPath ++;
                }
            }
    
            results.status = 200;
            results.data = {...results.data, ...dataDelExpediente};
    
            await new Promise(r => setTimeout(r, 1000));
            await browser.close();
            return results;
    
        }catch(error){
            results.status = 404;
            results.msg = error;
            if(browser !== null){ await browser.close();}
            return results;
        }
    })().then((results) => {
        res.send(results);
        console.log('Respuesta del RPA en Poder Judicial data');
        // console.log(JSON.stringify(results, null, 1)); 

    })
    .catch((error) => {
        console.error("Ocurrió un error:", error);
        error.sendStatus(500);
    });
});

app.post("/indecopi-result", (req, res) => {
    let body_filtros = req.body;

    // Reclamos: 0 / Buenos Oficios: 1
    const tipo = body_filtros.tipo;

    // 0: por número / 1: por Reclamante/Ciudadano / 2: por Reclamado/Proveedor
    const tipoDeBusqueda = body_filtros.tipoDeBusqueda;

    // Búsqueda por número de Reclamo/Buen Oficio

    const numero = body_filtros.numero;
    const year = body_filtros.year;
    const lugarDeTramite = body_filtros.lugarDeTramite;

    // Búsqueda por Reclamante/Ciudadano y Reclamado/Proveedor
    const fechaDesde = body_filtros.fechaDesde;
    const fechaHasta = body_filtros.fechaHasta;
    const tipoDocumento= body_filtros.tipoDocumento;
    const nombresORazonSocial= body_filtros.nombresORazonSocial;
    const apellidoPaterno= body_filtros.apellidoPaterno;
    const apellidoMaterno= body_filtros.apellidoMaterno;
    const nroDocumento = body_filtros.nroDocumento;

    const url = 'https://servicio.indecopi.gob.pe/consultareclamos/index.seam';

    (async () => {

        let browser = null;
        let results = {'status': null, 'msg':'', 'data':{}};
    
        try{
    
            browser = await puppeteer.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                // headless: false
                headless: 'new'
            });
    
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
            await page.goto(url);
    
            try{
                await page.waitForSelector('#frmBuscRecl\\:rdbTipoAsignacion\\:0');
            } catch(error){
                results.status = 404;
                results.msg = 'Error: La pag. [Consulta] no ha cargado /' + error;;
                await browser.close();
                return results;
            }
    
            const radioButtonID = {
                0: '#frmBuscRecl\\:rdbTipoAsignacion\\:0',
                1: '#frmBuscRecl\\:rdbTipoAsignacion\\:1'
            };
    
            const radioButton = await page.$(radioButtonID[tipo]);
            await radioButton.click();
            await new Promise(r => setTimeout(r, 500));
    
            let buscarBtn = null;
    
            const reCiudSelector = {
                'aHeaderPanel': 'a:nth-child(6)',
                'fechaInicio': 'txtFechInicio1InputDate',
                'fechaFin': 'txtFechFin1InputDate',
                'tipoDocumento': 'cboTipoDocRe',
                'nroDocumento': 'txtnrodoc',
                'NomRas': 'txtnombre',
                'apPaterno': 'txtappate',
                'apMaterno': 'txtapmate',
                'bttnBuscar': 'j_id94'
            }
    
            const reProvSelector = {
                'aHeaderPanel': 'a:nth-child(8)',
                'fechaInicio': 'txtFechInicio2InputDate',
                'fechaFin': 'txtFechFin2InputDate',
                'tipoDocumento': 'cboTipoDocRe2',
                'nroDocumento': 'txtnrodoc2',
                'NomRas': 'txtnombre2',
                'apPaterno': 'txtappate2',
                'apMaterno': 'txtapmate2',
                'bttnBuscar': 'j_id123'
            }
    
            switch(tipoDeBusqueda){
                case 0:
                    await page.waitForSelector('#frmBuscRecl\\:txtNumeroRecl');
                    await page.type('#frmBuscRecl\\:txtNumeroRecl', numero, { delay: 200 });
    
                    await page.waitForSelector('#frmBuscRecl\\:txtAnioExpe');
                    await page.type('#frmBuscRecl\\:txtAnioExpe', year, { delay: 200 });
    
                    if(lugarDeTramite){
    
                        const optionsLugarDeTramite = await page.evaluate(() => {
                            const select = document.querySelector('select#frmBuscRecl\\:cboTipoOficina');
                            const options = select.options;
                            const result = {};
                            for (let i = 0; i < options.length; i++) {
                            const option = options[i];
                            if (option.value) {
                                result[option.textContent.trim()] = option.value;
                            }
                            }
                            return result;
                        });
    
                        if(!optionsLugarDeTramite.hasOwnProperty(lugarDeTramite)){
                            results.status = 404;
                            results.msg = "Error: Lugar de trámite ingresado no existe en la página"
                            await browser.close();
                            return results;
                        }
    
                        await page.select('select#frmBuscRecl\\:cboTipoOficina', optionsLugarDeTramite[lugarDeTramite]);
                    }
                    await new Promise(r => setTimeout(r, 500));
                    buscarBtn = await page.$('#frmBuscRecl\\:j_id65');
                    await buscarBtn.click();
                    break;
    
                default:
                    let selector = {};
                    if(tipoDeBusqueda === 1){ selector = reCiudSelector;
                    }else{ selector = reProvSelector;}
    
                    await page.waitForSelector(
                        '#frmBuscRecl > div.gWidth90p.gMargin0Auto.gPositionRelative.gBoxInputBuscar > ' + selector.aHeaderPanel);
    
                    const aElement6 = await page.$(
                        '#frmBuscRecl > div.gWidth90p.gMargin0Auto.gPositionRelative.gBoxInputBuscar > ' + selector.aHeaderPanel);
                    await aElement6.click();
    
                    await page.waitForSelector('#frmBuscRecl\\:' + selector.fechaInicio);
    
                    await page.evaluate((fechaDesde, fechaHasta, selector) => {
                        let inputFecha = document.querySelector('#frmBuscRecl\\:' + selector.fechaInicio);
                        inputFecha.value = fechaDesde;
                        inputFecha = document.querySelector('#frmBuscRecl\\:' + selector.fechaFin);
                        inputFecha.value = fechaHasta;
                    }, fechaDesde, fechaHasta, selector);
    
                    if(tipoDocumento){
    
                        await page.waitForSelector('#frmBuscRecl\\:' + selector.tipoDocumento);
                        const optionsTipoDocumento = await page.evaluate((selector) => {
                            const select = document.querySelector('#frmBuscRecl\\:' + selector.tipoDocumento);
                            const options = select.options;
                            const result = {};
                            for (let i = 0; i < options.length; i++) {
                            const option = options[i];
                            if (option.value) {
                                result[option.textContent.trim()] = option.value;
                            }
                            }
                            return result;
                        },selector);
    
                        if(!optionsTipoDocumento.hasOwnProperty(tipoDocumento)){
                            results.status = 404;
                            results.msg = "Error: Tipo de documento ingresado no existe en la página"
                            await browser.close();
                            return results;
                        }
    
                        await page.select('#frmBuscRecl\\:' + selector.tipoDocumento,optionsTipoDocumento[tipoDocumento]);
                        await page.evaluate((selector) => {
                            const selectElementOnClick = document.querySelector('#frmBuscRecl\\:' + selector.tipoDocumento);
                            selectElementOnClick.click();
                        },selector);
    
                        await new Promise(r => setTimeout(r, 500));
                        await page.waitForSelector('#frmBuscRecl\\:' + selector.nroDocumento);
                        await page.type('#frmBuscRecl\\:' + selector.nroDocumento, nroDocumento, { delay: 100 });
    
                    }else{
                        await page.waitForSelector('#frmBuscRecl\\:' + selector.NomRas);
                        await page.type('#frmBuscRecl\\:' + selector.NomRas, nombresORazonSocial, { delay: 100 });
    
                        await page.waitForSelector('#frmBuscRecl\\:' + selector.apPaterno);
                        await page.type('#frmBuscRecl\\:' + selector.apPaterno, apellidoPaterno, { delay: 100 });
    
                        await page.waitForSelector('#frmBuscRecl\\:' + selector.apMaterno);
                        await page.type('#frmBuscRecl\\:' + selector.apMaterno, apellidoMaterno, { delay: 100 });
                    }
    
                    await new Promise(r => setTimeout(r, 500));
                    buscarBtn = await page.$('#frmBuscRecl\\:' + selector.bttnBuscar);
                    await buscarBtn.click();
            }
    
    
            await new Promise(r => setTimeout(r, 500));
            let espCircle = 2;
            do {
                let xElement = await page.$x('/html/body/div/div[1]/div/div/form/div[1]');
                if(xElement.length > 0) {
                  let n1 = await xElement[0].getProperty('childElementCount');
                  espCircle = await n1.jsonValue();
                }
            } while (espCircle === 2);
    
            const data = await page.evaluate(()=>{
                let resultsFound = {};
                let header = [];
    
                const tbodyTrElements = document.querySelectorAll('tbody#FormListado3\\:testpList\\:tb > tr');
                resultsFound['numResults'] = tbodyTrElements.length;
    
                let referenceIdNames = [];
                if(resultsFound['numResults'] > 0){
                    const headerElements = document.querySelectorAll('#FormListado3\\:testpList > thead > tr.rich-table-header-continue > th');
                    headerElements.forEach((element) =>{
                        header.push(element.textContent.trim());
                    });
                    header = header.slice(1,-1);
    
                    const tdElements = tbodyTrElements[0].querySelectorAll('td');
                    tdElements.forEach((td)=>{
                        referenceIdNames.push(td.getAttribute('id'));
                    });
                }
                resultsFound['resultados'] = {};
    
                for(let index= 0; index < tbodyTrElements.length; index++){
                    resultsFound['resultados']['N' + (index +1)] = {};
    
                    let nSelector = `#${`${referenceIdNames[1].replace(/:0:/, `:${index}:`)} > span`.replace(/:/g, '\\:')}`;
                    let fecha = tbodyTrElements[index].querySelector(nSelector);
                    let elementValue = fecha === null? '': fecha.textContent.trim();
                    resultsFound['resultados']['N' + (index +1)][header[0]] = elementValue;
    
                    nSelector = `#${`${referenceIdNames[2].replace(/:0:/, `:${index}:`)} > span`.replace(/:/g, '\\:')}`;
                    let nReclamo = tbodyTrElements[index].querySelector(nSelector);
                    elementValue = nReclamo === null?'': nReclamo.textContent.trim();
                    resultsFound['resultados']['N' + (index +1)][header[1]] = elementValue;
    
                    nSelector = `#${`${referenceIdNames[3].replace(/:0:/, `:${index}:`)} > span`.replace(/:/g, '\\:')}`;
                    let nombresReclamantesElements = tbodyTrElements[index].querySelectorAll(nSelector + ' > dl > dt');
                    resultsFound['resultados']['N' + (index +1)][header[2]] = [];
                    for(let element of nombresReclamantesElements){
                        let nombreReclamante = element.querySelector('span');
                        elementValue = nombreReclamante === null?'': nombreReclamante.textContent.trim();
                        resultsFound['resultados']['N' + (index +1)][header[2]].push(elementValue);
                    }
    
                    nSelector = `#${`${referenceIdNames[4].replace(/:0:/, `:${index}:`)} > span`.replace(/:/g, '\\:')}`;
                    let nombresReclamadosElements = tbodyTrElements[index].querySelectorAll(nSelector + ' > dl > dt');
                    resultsFound['resultados']['N' + (index +1)][header[3]] = [];
                    for(let element of nombresReclamadosElements){
                        let nombreReclamado = element.querySelector('span');
                        elementValue = nombreReclamado === null?'': nombreReclamado.textContent.trim();
                        resultsFound['resultados']['N' + (index +1)][header[3]].push(elementValue);
                    }
    
                    nSelector = `#${`${referenceIdNames[5].replace(/:0:/, `:${index}:`)} > span`.replace(/:/g, '\\:')}`;
                    let estado = tbodyTrElements[index].querySelector(nSelector);
                    elementValue = estado === null?'': estado.textContent.trim();
                    resultsFound['resultados']['N' + (index +1)][header[4]] = elementValue;
    
                    nSelector = `#${`${referenceIdNames[6].replace(/:0:/, `:${index}:`)} > a`.replace(/:/g, '\\:')}`;
                    let detalles = tbodyTrElements[index].querySelector(nSelector);
                    elementValue = detalles === null?'': detalles.href;
                    resultsFound['resultados']['N' + (index +1)]["Detalles"] = elementValue;
    
                }
    
                return resultsFound;
            });
    
            /* const response = await fetch('http://localhost:8000/resultados_preliminares.php', {
                method: 'POST',
                headers: {
                'Content-Type': 'application/json'
                },
                body: JSON.stringify(resultadosPreliminares)
            }); */
    
            //const datosSeleccionados = await response.json();
    
    
            results.status = 200;
            results.data = {...results.data, ...data};
    
            await new Promise(r => setTimeout(r, 1000));
            await browser.close();
            return results;
    
        }catch(error){
            results.status = 404;
            results.msg = error;
            if(browser !== null){ await browser.close();}
            return results;
        }
    })().then((results) => {
        res.send(results);
        console.log('Respuesta del RPA en Indecopi result');
        // console.log(JSON.stringify(results, null, 1));
    
    })
    .catch((error) => {
        console.error("Ocurrió un error:", error);
        error.sendStatus(500);
    });
    
});

app.post("/indecopi-data", (req, res) => {
    let body_filtros = req.body;

    const url = body_filtros.url;

    (async () => {

        let browser = null;
        let results = {'status': null, 'msg':'', 'data':{}};
    
        try{
    
            browser = await puppeteer.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                // headless: false
                headless: 'new'
            });
    
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
            await page.goto(url);
    
            try{
                await page.waitForSelector('body > div > div > div > div:nth-child(4) > div.panel-body');
            } catch(error){
                results.status = 404;
                results.msg = error;
                await browser.close();
                return results;
            }
    
            const data = await page.evaluate(() => {
                let detalles = {};
    
                let panelNames = [];
                let panelHeadingElements = document.querySelectorAll('div.panel-heading > span');
                panelHeadingElements.forEach((span)=>{
                    panelNames.push(span.textContent.trim());
                });
    
                panelNames.forEach((n)=> { detalles[n] = {}; });
    
                let divElement = document.querySelector('body > div > div > div > div:nth-child(1) > div.panel-body > div');
                let labelsElements = divElement.querySelectorAll('label > span');
                let valuesElements = divElement.querySelectorAll('div > span');
    
                //if(labelsElements.length === valuesElements.length + 1){
                for(let i=0; i< valuesElements.length; i++){
                    let title = labelsElements[i].textContent.trim();
                    let value = valuesElements[i].textContent.trim();
                    detalles[panelNames[0]][title]= value;
                }
                //}
    
                const dataKey = Object.keys(detalles).slice(1);
                for(let i= 2; i <= 4; i++){
    
                    let header = [];
                    let table = document.querySelector(`body > div > div > div > div:nth-child(${i}) > div.panel-body > span > table`);
                    let thElements = table.querySelectorAll('thead > tr > th');
                    thElements.forEach((element)=>{
                        header.push(element.textContent.trim());
                    });
    
                    let tbodyElements = table.querySelectorAll('tbody > tr');
                    const numRows = tbodyElements.length;
                    tbodyElements.forEach((tr, index)=>{
                        detalles[dataKey[i - 2]]['R' + (numRows - index)]= {};
                        let tdElements = tr.querySelectorAll('td');
                        for(let k= 1; k < tdElements.length; k++){
                            let value = tdElements[k].textContent.trim();
                            detalles[dataKey[i - 2]]['R' + (numRows - index)][header[k]]= value;
                        }
                    });
    
                }
    
                return detalles;
              });
    
    
            results.status = 200;
            results.data = {...results.data, ...data};
    
            await new Promise(r => setTimeout(r, 1000));
            await browser.close();
            return results;
    
        }catch(error){
            results.status = 404;
            results.msg = error;
            if(browser !== null){ await browser.close();}
            return results;
        }
    })().then((results) => {
        res.send(results);
        console.log('Respuesta del RPA en Indecopi data');
        // console.log(JSON.stringify(results, null, 1));
    
    })
    .catch((error) => {
        console.error("Ocurrió un error:", error);
        error.sendStatus(500);
    });

});

app.post("/supremo-result", (req, res) => {
    let body_filtros = req.body;

    // const salaSuprema = '';  
    // const tipoRecurso = '';
    // const numeroDeRecurso = ['',''];             
    // const numDeExpedienteProcedencia = ['','',''];     
    // const apellidoPaternoRazonSocial = 'jose';
    // const apellidoMaterno = '';
    // const nombres = '';

    const salaSuprema = body_filtros.salaSuprema;
    const tipoRecurso = body_filtros.tipoRecurso;
    const numeroDeRecurso = body_filtros.numeroDeRecurso;
    const numDeExpedienteProcedencia = body_filtros.numDeExpedienteProcedencia;
    const apellidoPaternoRazonSocial = body_filtros.apellidoPaternoRazonSocial;
    const apellidoMaterno = body_filtros.apellidoMaterno;
    const nombres = body_filtros.nombres;

    const url = 'https://apps.pj.gob.pe/cejSupremo/';

    (async () => {

        let browser = null;
        let results = {'status': null, 'msg':'', 'data':{}};

        try{

            // Validando algunos datos de entrada en forma de array .........................................
            
            if(numeroDeRecurso.length !== 2 
                || numeroDeRecurso.filter(str => str.length > 0).length == 1){
                results.status = 404;
                results.msg = 'Error: Elementos ingresados en numeroDeRecurso'
                return results;
            }

            if(numDeExpedienteProcedencia.length !== 3 
                || numDeExpedienteProcedencia.filter(str => str.length > 0).length == 1
                || numDeExpedienteProcedencia.filter(str => str.length > 0).length == 2){
                results.status = 404;
                results.msg = 'Error: Elementos de numDeExpedienteProcedencia';
                return results;
            }
            
            //.....................................PAGINA DE INICIO.........................................
    
            browser = await puppeteer.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                // headless: false
                headless: 'new'
            }); 
            
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            await page.goto(url);

            try{
                await page.waitForSelector('#btnBuscar');
            
            } catch(error){
                results.status = 404;
                results.msg = error;
                await browser.close();
                return results;
            }

            // Ingreso de datos

            if(salaSuprema){

                await page.waitForSelector('#ddlSala');
                const optionsSalaSuprema = await page.evaluate(() => {
                    const select = document.querySelector('select#ddlSala');
                    const options = select.options;
                    const result = {};
                    for (let i = 0; i < options.length; i++) {
                    const option = options[i];
                    if (option.value) {
                        result[option.textContent.trim()] = option.value;
                    }
                    }
                    return result;
                });

                if(!optionsSalaSuprema.hasOwnProperty(salaSuprema)){
                    results.status = 404;
                    results.msg = "Error: Sala Suprema ingresado no existe en la página"
                    await browser.close();
                    return results;
                }
                
                await page.select('select#ddlSala', optionsSalaSuprema[salaSuprema]);
            }
            
            if(tipoRecurso){

                await page.waitForSelector('#ddlMotIng');

                const optionsTipoRecurso = await page.evaluate(() => {
                    const select = document.querySelector('select#ddlMotIng');
                    const options = select.options;
                    const result = {};
                    for (let i = 0; i < options.length; i++) {
                    const option = options[i];
                    if (option.value) {
                        result[option.textContent.trim()] = option.value;
                    }
                    }
                    return result;
                });

                if(!optionsTipoRecurso.hasOwnProperty(tipoRecurso)){
                    results.status = 404;
                    results.msg = "Error: Tipo Recurso ingresado no existe en la página"
                    await browser.close();
                    return results;
                }
                await new Promise(r => setTimeout(r, 100));
                await page.select('select#ddlMotIng', optionsTipoRecurso[tipoRecurso]);
            }
            
            if(numeroDeRecurso.every(str => str.length > 0)){

                await page.waitForSelector('#txtNum');
                await new Promise(r => setTimeout(r, 500));
                await page.type('#txtNum', numeroDeRecurso[0], { delay: 100 });
                
                await page.waitForSelector('#ddlAnio');

                const optionsNumeroDeRecursoYear = await page.evaluate(() => {
                    const select = document.querySelector('select#ddlAnio');
                    const options = select.options;
                    const result = {};
                    for (let i = 0; i < options.length; i++) {
                    const option = options[i];
                    if (option.value) {
                        result[option.textContent.trim()] = option.value;
                    }
                    }
                    return result;
                });

                if(!optionsNumeroDeRecursoYear.hasOwnProperty(numeroDeRecurso[1])){
                    results.status = 404;
                    results.msg = "Error: Número de Recurso > Año ingresado no existe en la página"
                    await browser.close();
                    return results; 
                }

                await new Promise(r => setTimeout(r, 100));
                await page.select('select#ddlAnio',optionsNumeroDeRecursoYear[numeroDeRecurso[1]]);
            }

            if(numDeExpedienteProcedencia.every(str => str.length > 0)){

                await page.waitForSelector('#txtNum0');
                await new Promise(r => setTimeout(r, 500));
                await page.type('#txtNum0', numDeExpedienteProcedencia[0], { delay: 100 });

                await page.waitForSelector('#ddlAnio0');

                const optionsNumDeExpedienteProcedenciaYear = await page.evaluate(() => {
                    const select = document.querySelector('select#ddlAnio0');
                    const options = select.options;
                    const result = {};
                    for (let i = 0; i < options.length; i++) {
                    const option = options[i];
                    if (option.value) {
                        result[option.textContent.trim()] = option.value;
                    }
                    }
                    return result;
                });

                if(!optionsNumDeExpedienteProcedenciaYear.hasOwnProperty(numDeExpedienteProcedencia[1])){
                    results.status = 404;
                    results.msg = "Error: Num de Expediente Procedencia > Año ingresado no existe en la página"
                    await browser.close();
                    return results; 
                }

                await new Promise(r => setTimeout(r, 100));
                await page.select('select#ddlAnio0',optionsNumDeExpedienteProcedenciaYear[numDeExpedienteProcedencia[1]]);
                

                await page.waitForSelector('#ddlDisOri');

                const optionsDistritoOrigen = await page.evaluate(() => {
                    const select = document.querySelector('select#ddlDisOri');
                    const options = select.options;
                    const result = {};
                    for (let i = 0; i < options.length; i++) {
                    const option = options[i];
                    if (option.value) {
                        result[option.textContent.trim()] = option.value;
                    }
                    }
                    return result;
                });

                if(!optionsDistritoOrigen.hasOwnProperty(numDeExpedienteProcedencia[2])){
                    results.status = 404;
                    results.msg = "Error: Num de Expediente Procedencia > Distrito origen ingresado no existe en la página"
                    await browser.close(); 
                    return results; 
                }

                await new Promise(r => setTimeout(r, 100));
                await page.select('select#ddlDisOri',optionsDistritoOrigen[numDeExpedienteProcedencia[2]]);
            }

            if(apellidoPaternoRazonSocial){
                await new Promise(r => setTimeout(r, 500));
                await page.waitForSelector('#txtPat');
                await page.type('#txtPat', apellidoPaternoRazonSocial, { delay: 100 });
            }

            if(apellidoMaterno){
                await new Promise(r => setTimeout(r, 500));
                await page.waitForSelector('#txtMat');
                await page.type('#txtMat', apellidoMaterno, { delay: 100 });
            }

            if(nombres){
                await new Promise(r => setTimeout(r, 500));
                await page.waitForSelector('#txtNom');
                await page.type('#txtNom', nombres, { delay: 100 });
            }

            // Resolver captcha

            const imgCapcha = await page.$('#c_consultaexpediente_captcha1_CaptchaImage');
            const captchaBuffer = await imgCapcha.screenshot({ clip: await imgCapcha.boundingBox() });
            const captcha = captchaBuffer.toString('base64');
            // ac.setAPIKey(APIKeyAntiCaptcha);
            ac.setAPIKey(process.env.APIKEYANTICAPTCHA);
            //Specify softId to earn 10% commission with your app.
            //Get your softId here: https://anti-captcha.com/clients/tools/devcenter
            ac.setSoftId(0);

            let text = '';
            try{
                text = await ac.solveImage(captcha, true);
            }catch(e){
                results.status = 404;
                results.msg = 'No se puedo resolver captcha: ' + e ;
                await browser.close();
                return results;
            }

            await page.waitForSelector('#TextBox1');
            await page.type('#TextBox1', text, { delay: 100 });
            await new Promise(r => setTimeout(r, 500));

            const buscar = await page.$('#btnBuscar');
            await buscar.click();


            //..........PAG. 02 RESULTADOS DE BUSQUEDA O RESUMEN DE EXPEDIENTE(s)...........................

            try{
                await page.waitForNavigation({waitUntil: 'load'})
            } catch(error){
                results.status = 404;
                results.msg = error;
                await browser.close();
                return results;
            }

            const btnSeguimiento = await page.$('#btnSeguimiento');

            let tableDataResults = {};

            if(btnSeguimiento === null){
                
                const existeInput = await page.evaluate(() => {
                    const botonVer = document.querySelector('input[title="Visualizar Etapas Expediente"]');
                    return botonVer !== null;
                });

                if(!existeInput){
                    const elementText = await page.$eval('#gvResultado > tbody > tr > td', (element) => {
                        return element.textContent.trim();
                    });

                    results.status = 200;
                    results.msg = elementText;
                    await browser.close();
                    return results;
                }

                tableDataResults  = await page.evaluate(()=>{
                    let tableData = {};
                    const elementsTr = document.querySelectorAll('#gvResultado > tbody > tr');
                    for(let i=0; i< elementsTr.length; i++){
                        tableData[`data_row_${i}`] = {
                            'Tipo_recurso': '',
                            'Numero_recurso': '',
                            'Sala_suprema': '',
                            //'Nombres':'',
                            'URL':''
                        };
                        let tableDataTemp = [];
                        let elementSpan = elementsTr[i].querySelectorAll('span');
                        elementSpan.forEach((span) => tableDataTemp.push(span.textContent.trim()));
                        if(tableDataTemp.length === 4){   
                            tableData[`data_row_${i}`]['Tipo_recurso'] = tableDataTemp[0].split(':')[0].trim();
                            tableData[`data_row_${i}`]['Numero_recurso'] = 
                                `${tableDataTemp[0].split(':')[1].split('-')[0].trim()}-${tableDataTemp[0].split(':')[1].split('-')[1].trim()}`
                            tableData[`data_row_${i}`]['Sala_suprema'] = 
                                `${tableDataTemp[1].split('-')[0].trim()} - ${tableDataTemp[1].split('-')[1].trim()}`;
                            //tableData[`data_row_${i}`]['Nombres'] = tableDataTemp[3].trim();  
                        }
                        let botonVer = elementsTr[i].querySelector('input');
                        let IDBoton = botonVer.getAttribute('id');
                        tableData[`data_row_${i}`]['URL'] = IDBoton;
                    }
                    return tableData;
                });

            }else{
                await btnSeguimiento.click();

                await page.waitForNavigation({waitUntil: 'load'})
                await new Promise(r => setTimeout(r, 500));

                tableDataResults = await page.evaluate(()=>{
                    tableData = {};
                    tableData['data_row_0'] = {
                        'Tipo_recurso': '',
                        'Numero_recurso': '',
                        'Sala_suprema': '',
                        //'Nombres':'',
                        'URL':''
                    };

                    const instancia = document.getElementById('txtinstancia').textContent.trim();
                    tableData['data_row_0']['Sala_suprema'] = instancia;
        
                    let tr = document.querySelector('#form1 > table > tbody > tr:nth-child(7)');
                    const recursoSala = tr.querySelector('#txtrecurso').textContent.trim();
                    const recursoSalaSplit = recursoSala.match(/(.*?)(\d{5} - \d{4})/).slice(1);
                    tableData['data_row_0']['Tipo_recurso'] = recursoSalaSplit[0].trim();
                    tableData['data_row_0']['Numero_recurso'] = recursoSalaSplit[1].trim().replace(/\s/g, '');
                    return tableData;  
                });
                
            }

            for(let dataRow in tableDataResults){

                if(Object.keys(tableDataResults).length > 1){
                    await page.waitForSelector(`#${tableDataResults[dataRow]['URL']}`);
                    let buttonVer = await page.$(`#${tableDataResults[dataRow]['URL']}`);
                    await buttonVer.click();

                    await page.waitForNavigation({waitUntil: 'load'})
                    
                    await page.waitForSelector('#btnSeguimiento');
                    const btnSeguimiento = await page.$('#btnSeguimiento');
                    await btnSeguimiento.click();

                    await page.waitForNavigation({waitUntil: 'load'})
                    await new Promise(r => setTimeout(r, 500));

                    let currentUrl = await page.url();
                    tableDataResults[dataRow]['URL'] = currentUrl;

                    await page.goBack();
                    await page.waitForSelector('#btnSeguimiento');
                    await new Promise(r => setTimeout(r, 500));
                    await page.goBack();

                }else{
                    let currentUrl = await page.url();
                    tableDataResults[dataRow]['URL'] = currentUrl;
                }
            }

            results.status = 200;
            results.data['numResults'] = Object.keys(tableDataResults).length;
            results.data['resultados'] = tableDataResults;
            
            await new Promise(r => setTimeout(r, 1000));
            await browser.close();
            return results;

        }catch(error){
            results.status = 404;
            results.msg = error;
            if(browser !== null){ await browser.close();}
            return results;
        }
    })().then((results) => {
        res.send(results);
        console.log('Respuesta del RPA en Corte suprema Result');
        // console.log(JSON.stringify(results, null, 1)); 

    })
    .catch((error) => {
        console.error("Ocurrió un error:", error);
        error.sendStatus(500);
    });

});

app.post("/supremo-data", (req, res) => {
    let body_filtros = req.body;
    
    // const url = 'https://apps.pj.gob.pe/cejSupremo/Expediente/DetalleExpediente.aspx?data=EMjd9urO2uFVqEx2lMzX4EayVUnegEWN4n557FzkF1QfmOL567Dris3VUKe7Z9H%2bs%2ffOSE9o1fJ6z7YViPf6F6OEabORT3iIXaZtDMns0gxY9vEu5qqYt5R4LfSJt4ek%2bQxlDdNxHWq9pGEch%2fRsk43aAuvaBqqIsisM9B1LHLI9Wjr3zEH7UfQi2uF4Deg8lNKt6kwqp6AYueR93DUd2EdRuK%2fkGGuY6At9A%2fWo4MWK';
    const url = body_filtros.url;

    (async () => {

        let browser = null;
        let results = {'status': null, 'msg':'', 'data':{}};
    
        try{
      
            browser = await puppeteer.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                // headless: false
                headless: 'new'
            }); 
            
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
            await page.goto(url);
            await new Promise(r => setTimeout(r, 1000));
            
            let data = await page.evaluate(()=>{
    
                let dataReporteDeExpediente = {};
    
                dataReporteDeExpediente['Datos Expediente'] = {};
                const numExpediente = document.getElementById('CodExpediente').textContent.trim();
                dataReporteDeExpediente['Datos Expediente']['Expediente N°'] = numExpediente;
    
                const instancia = document.getElementById('txtinstancia').textContent.trim();
                dataReporteDeExpediente['Datos Expediente']['Instancia'] = instancia;
    
                let tr = document.querySelector('#form1 > table > tbody > tr:nth-child(7)');
    
                let title = tr.querySelector('td:nth-child(2) > table > tbody > tr:nth-child(1) > td.style3').textContent.trim();
                const recursoSala = tr.querySelector('#txtrecurso').textContent.trim();
                dataReporteDeExpediente['Datos Expediente'][title] = recursoSala;
    
                title = tr.querySelector('td:nth-child(2) > table > tbody > tr:nth-child(2) > td.style3').textContent.trim();
                const fechaIngresoMP = tr.querySelector('#fecinicio').textContent.trim();
                dataReporteDeExpediente['Datos Expediente'][title] = fechaIngresoMP;
    
                title = tr.querySelector('td:nth-child(2) > table > tbody > tr:nth-child(3) > td.style3').textContent.trim();
                title = title.replace(/\s+/g, '-').trim();
                let organoProcedencia = tr.querySelector('#txtOrgPro').textContent.trim();
                dataReporteDeExpediente['Datos Expediente'][title] = organoProcedencia;
    
                title = tr.querySelector('td:nth-child(2) > table > tbody > tr:nth-child(4) > td.style3').textContent.trim();
                const relator = tr.querySelector('#txtespecialista').textContent.trim();
                dataReporteDeExpediente['Datos Expediente'][title] = relator;
    
                title = tr.querySelector('td:nth-child(2) > table > tbody > tr:nth-child(2) > td:nth-child(5)').textContent.trim();
                const distritoJudicial = tr.querySelector('#txtDisPro').textContent.trim();
                dataReporteDeExpediente['Datos Expediente'][title] = distritoJudicial;
    
                title = tr.querySelector('td:nth-child(2) > table > tbody > tr:nth-child(3) > td:nth-child(5)').textContent.trim();
                title = title.replace(/\s+/g, '-').trim();
                let expProcedeciaNro = tr.querySelector('#txtNroPro').textContent.trim();
                dataReporteDeExpediente['Datos Expediente'][title] = expProcedeciaNro;
    
                title = tr.querySelector('td:nth-child(2) > table > tbody > tr:nth-child(4) > td:nth-child(5)').textContent.trim();
                const secretario = tr.querySelector('#txtsecretario').textContent.trim();
                dataReporteDeExpediente['Datos Expediente'][title] = secretario;
    
                let tbody = document.querySelector('#form1 > table > tbody > tr:nth-child(10) > td:nth-child(2) > table > tbody');
    
                title = document.querySelector('#lblMateria').textContent.trim();
                const delito  = document.querySelector('#txtdelito').textContent.trim();
                dataReporteDeExpediente['Datos Expediente'][title] = delito;
    
                title = tbody.querySelector('tr:nth-child(2) > td.style4').textContent.trim();
                const ubicacion = tbody.querySelector('#txtubicacion').textContent.trim();
                dataReporteDeExpediente['Datos Expediente'][title] = ubicacion;
    
                title = tbody.querySelector('tr:nth-child(1) > td:nth-child(4)').textContent.trim();
                const estado = tbody.querySelector('#txtestado').textContent.trim();
                dataReporteDeExpediente['Datos Expediente'][title] = estado;
    
                let tbodyTrElements = document.querySelectorAll('#gvPartes > tbody > tr');
    
                dataReporteDeExpediente['Partes Procesales'] = {}
    
                tbodyTrElements.forEach(element =>{
                    const values = element.querySelectorAll('td');
                    
                    let title = values[0].textContent.trim();
                    if(title.endsWith(':')){ title= title.slice(0,-1); }
    
                    let value1 = values[1].textContent.trim();
                    value1  = value1.replace(/\s+/g, ' ').trim();
    
                    let value2 = values[2].textContent.trim();
    
                    if(!(title in dataReporteDeExpediente['Partes Procesales'])){
                        dataReporteDeExpediente['Partes Procesales'][title] = [];
                    }
                    dataReporteDeExpediente['Partes Procesales'][title].push(value1);
                    dataReporteDeExpediente['Partes Procesales'][title].push(value2);  
                    
                });
    
                tbodyTrElements = document.querySelectorAll('#gvVistas > tbody > tr');
                dataReporteDeExpediente['Vistas de causas']= {};
                
                for(let i= 0; i < tbodyTrElements.length; i++){
    
                    let tbodyElement = tbodyTrElements[i].querySelector('tbody');
                    if(tbodyElement === null){ continue; }
                    
                    dataReporteDeExpediente['Vistas de causas']['vista_' + (i+1)] = {};
    
                    let referenceIdName = tbodyElement.querySelector('tr:nth-child(1) > td:nth-child(1) > span');
                    if(referenceIdName === null){ continue; }
    
                    referenceIdName = referenceIdName.getAttribute('id');
                    if(referenceIdName === null){ continue; }
                    
                    referenceIdName = referenceIdName.substring(0, referenceIdName.lastIndexOf('_') + 1);
    
                    let fechaVista = tbodyElement.querySelector('#' + referenceIdName + 'fechaVista');
                    let elementValue = "";
                    if(fechaVista !== null){ elementValue = fechaVista.textContent.trim(); }
                    dataReporteDeExpediente['Vistas de causas']['vista_' + (i+1)]['fecha vista'] = elementValue;
    
                    let fechaProgramacion = tbodyElement.querySelector('#' + referenceIdName + 'fechaProgramacion');
                    elementValue = "";
                    if(fechaProgramacion !== null){ elementValue = fechaProgramacion.textContent.trim(); }
                    dataReporteDeExpediente['Vistas de causas']['vista_' + (i+1)]['fechaProgramacion'] = elementValue;
    
                    /* let nombreParte = tbodyElement.querySelector('#' + referenceIdName + 'nombreParte');
                    if(nombreParte === null){ continue; }
                    elementValue = nombreParte.textContent.trim(); 
                    dataReporteDeExpediente['Vistas de causas']['vista_' + (i+1)]['nombreParte'] = elementValue; */
    
                    let sentidoResultado = tbodyElement.querySelector('#' + referenceIdName + 'sentidoResultado');
                    elementValue = "";
                    if(sentidoResultado !== null){ elementValue = sentidoResultado.textContent.trim(); }
                    dataReporteDeExpediente['Vistas de causas']['vista_' + (i+1)]['sentidoResultado'] = elementValue;
    
                    let observacion = tbodyElement.querySelector('#' + referenceIdName + 'observacion');
                    elementValue = "";
                    if(observacion !== null){ elementValue = observacion.textContent.trim(); }
                    dataReporteDeExpediente['Vistas de causas']['vista_' + (i+1)]['observacion'] = elementValue;
    
                    let tipoAudiencia = tbodyElement.querySelector('#' + referenceIdName + 'tipoAudiencia');
                    elementValue = "";
                    if(tipoAudiencia !== null){ elementValue = tipoAudiencia.textContent.trim(); }
                    dataReporteDeExpediente['Vistas de causas']['vista_' + (i+1)]['tipodeVista'] = elementValue;
              
                }
    
                return dataReporteDeExpediente;  
    
            });
    
            
            data['Seguimiento del expediente']= {};
    
            const numTbodyTrElements = await page.$$eval('#gvSeguimiento > tbody > tr', elements => elements.length);
            const numPages = await page.$$eval('#gvSeguimiento > tbody > tr:nth-child('+ numTbodyTrElements +
                ')[align="center"][valign="middle"] > td > table > tbody > tr > td',
                (elements) => elements.length);
            
            if(numPages > 0){ 
                for (let i = 0; i < numPages; i++) {
                    await page.evaluate((index) => {
                        const tbodyTrElements = document.querySelectorAll('#gvSeguimiento > tbody > tr');
                        const tdElements = tbodyTrElements[tbodyTrElements.length - 1].querySelectorAll('td > table > tbody > tr > td');
                
                        let tagA = tdElements[index].querySelector('a');
                        if (tagA !== null) { tagA.click(); } 
                    }, i);
    
                    let dataPage = await SeguimientoDelExpediente({ multiplePages: true });
                    data['Seguimiento del expediente'] = {...data['Seguimiento del expediente'], ...dataPage};
                    
                }
            }else{
                let dataPage = await SeguimientoDelExpediente();
                data['Seguimiento del expediente'] = {...data['Seguimiento del expediente'], ...dataPage}; 
            }
    
            async function SeguimientoDelExpediente({ multiplePages = false } = {}) {
                await page.waitForSelector('#gvSeguimiento > tbody');
                await new Promise(r => setTimeout(r, 500));
                
                let dataPage = await page.evaluate((multiplePages) => {
                    let data = {};  
                    const tbodyTrElements = document.querySelectorAll('#gvSeguimiento > tbody > tr');
                    
                    for(let i= 0; i< tbodyTrElements.length - multiplePages? 1:0; i++){  
    
                        let tbody = tbodyTrElements[i].querySelector('tbody');
                        if(tbody === null){ continue; }  // SeguimientoDelExpediente sin datos
    
                        let referenceIdName = tbody.querySelector('tr:nth-child(1) > td:nth-child(1) > span');
                        if(referenceIdName === null){ continue; }
    
                        referenceIdName = referenceIdName.getAttribute('id');
                        if(referenceIdName === null){ continue; }
    
                        let fecResolucionElement = tbody.querySelector('#' + referenceIdName);
                        if(fecResolucionElement === null){ continue; }
                        let fecResolucion = fecResolucionElement.textContent.trim(); 
                        data[fecResolucion] = {};
    
                        referenceIdName = referenceIdName.substring(0, referenceIdName.lastIndexOf('_') + 1);
                        
                        let txtActo = tbody.querySelector('#' + referenceIdName + 'txtActo');
                        let value = txtActo !== null? txtActo.textContent.trim():'';
                        data[fecResolucion]['txtActo'] = value;
    
                        let txtResolucion = tbody.querySelector('#' + referenceIdName + 'txtResolucion');
                        value = txtResolucion !== null? txtResolucion.textContent.trim():'';
                        data[fecResolucion]['txtResolucion'] = value;
    
                        let numFojas = tbody.querySelector('#' + referenceIdName + 'numFojas');
                        value = numFojas !== null? numFojas.textContent.trim():'';
                        data[fecResolucion]['numFojas'] = value;
    
                        let txtSumilla = tbody.querySelector('#' + referenceIdName + 'txtSumillaSeg');
                        value = txtSumilla !== null? txtSumilla.textContent.trim():'';
                        data[fecResolucion]['txtSumillaSeg'] = value;
    
                        let xDescUsuario = tbody.querySelector('#' + referenceIdName + 'xDescUsuario');
                        value = xDescUsuario !== null? xDescUsuario.textContent.trim():'';
                        data[fecResolucion]['xDescUsuario'] = value;
    
                        let presentante = tbody.querySelector('#' + referenceIdName + 'presentante');
                        value = presentante !== null? presentante.textContent.trim():'';
                        data[fecResolucion]['presentante'] = value;
                    }
                    return data;
                },multiplePages);
    
                return dataPage;
            }
    
            results.status = 200;
            results.data = {...results.data, ...data};
    
            await new Promise(r => setTimeout(r, 1000));
            await browser.close();
            return results;
    
        }catch(error){
            results.status = 404;
            results.msg = error;
            if(browser !== null){ await browser.close();}
            return results;
        }
    })().then((results) => {
        res.send(results);
        console.log('Respuesta del RPA en Corte suprema data');
        // console.log(JSON.stringify(results, null, 1)); 

    })
    .catch((error) => {
        console.error("Ocurrió un error:", error);
        error.sendStatus(500);
    });

});




// ? Reporte de Actualización de datos
app.post("/poder-judicial-update-data", (req, res) => {

    let body_filtros = req.body;
    // Elige modo de consulta (solo por Código de Expediente)

    // Por código de expediente
    // const codigoExpediente = [
    //     '00161', 
    //     '2017', 
    //     '0', 
    //     '1815', 
    //     'jp', 
    //     'ci', 
    //     '08'];

    let codigoExpediente = [];
    // Por código de expediente
    if (body_filtros.codigoExpediente) {
        const partesCodigo = body_filtros.codigoExpediente.split('-') || "";
        codigoExpediente = [
            partesCodigo[0],
            partesCodigo[1],
            partesCodigo[2],
            partesCodigo[3],
            partesCodigo[4],
            partesCodigo[5],
            partesCodigo[6]
        ];
    }



    const url = 'https://cej.pj.gob.pe/cej/forms/busquedaform.html';

    // Descarga de resoluciones
    const baseDir = dirGeneral;

    // Actualizar informacion del expediente
    // const updateInformation = {
    //     'last': {
    //         'title': 'Fecha de Resolución',
    //         'value': '22/12/2022'
    //     },
    //     'pending': [
    //         '22/12/2022',
    //         '02/10/2019',
    //         '15/08/2019'
    //     ]

    // };
    const updateInformation = body_filtros.updateInformation;

    function crearDirectorioRecursivo(directorio) {
        if (!fs.existsSync(directorio)) {
            const directorioPadre = path.dirname(directorio);
            crearDirectorioRecursivo(directorioPadre);
            fs.mkdirSync(directorio);
        }
    }
    
    async function downloadPDF(url, headers,  outputPath, itemPath){
    
        // Verifica si los documentos de resolución ya han sido descargados 
        if(fs.existsSync(`${outputPath}.doc`)){ return `${itemPath}.doc`; }
        else if(fs.existsSync(`${outputPath}.pdf`)){ return `${itemPath}.pdf`; }
        
        // Descarga el documento
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: headers,
            });
    
            const type = await fileType.fromBuffer(response.data);
            if (type && type.mime === 'application/x-cfb') {
                outputPath = `${outputPath}.doc`;
                itemPath = `${itemPath}.doc`;
    
            }else if (type && type.mime === 'application/pdf') {
                outputPath = `${outputPath}.pdf`;
                itemPath = `${itemPath}.pdf`;
            }else{
                // Extensión por defecto
                outputPath = `${outputPath}.pdf`;
                itemPath = `${itemPath}.pdf`;
            }
    
            fs.writeFileSync(outputPath, response.data);
        } catch (error) {
            //console.error('Error downloading PDF:', error);
        }
        return itemPath;
    }
    
    (async () => {
    
        let browser = null;
        let results = {'status': null, 'msg':'', 'data':{}};
    
        try{
    
            browser = await puppeteer.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
                // headless: false
                headless: 'new'
            });
    
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
            await page.goto(url);
    
            //PAG. 01 .........................................................................................................
    
            try{
                await page.waitForSelector('#consultarExpedientes');
            } catch(error){
                results.status = 404;
                results.msg = 'Error: La pag. [Búsqueda de expedientes] no ha cargado /' + error;
                await browser.close();
                return results;
            }
    
            await page.waitForSelector('a[title="Por código de expediente"]');
            const modoDeC = await page.$('a[title="Por código de expediente"]');
            await modoDeC.click();
    
            await page.waitForSelector('#cod_expediente');
            await new Promise(r => setTimeout(r, 500));
    
            await page.type('#cod_expediente', codigoExpediente[0], { delay: 200 });
            await page.type('#cod_anio', codigoExpediente[1], { delay: 200 });
            await page.type('#cod_incidente', codigoExpediente[2], { delay: 200 });
            await page.type('#cod_distprov', codigoExpediente[3], { delay: 200 });
            await page.type('#cod_organo', codigoExpediente[4], { delay: 200 });
            await page.type('#cod_especialidad', codigoExpediente[5], { delay: 200 });
            await page.type('#cod_instancia', codigoExpediente[6], { delay: 200 });
    
            // Captcha
            const nuevaPagina = await browser.newPage();
            await nuevaPagina.goto('https://cej.pj.gob.pe/cej/xyhtml');
    
            const valorCampoOculto = await nuevaPagina.$eval('input[type="hidden"]', (element) => element.value);
            await nuevaPagina.close();
    
            await page.type('#codigoCaptcha', valorCampoOculto, { delay: 100 });
    
            // Boton consultar
            const consultar = await page.$('#consultarExpedientes');
            await consultar.click();
    
            try{
                await page.waitForNavigation({waitUntil: 'load'});
            } catch(error){
                results.status = 404;
                results.msg = 'Error: Página [Resultado de búsqueda] no ha cargado';
                await browser.close();
                return results;  
            }
    
            await new Promise(r => setTimeout(r, 500));
            const respPage = await page.evaluate(()=>{
                const element = document.querySelector('#divConsultar > div[style="text-align: center;"]');
                if(element === null){ return null; }
                const spanElements = element.querySelectorAll('span[style="display: none"]');
                return [spanElements.length, spanElements[0].getAttribute('id')];
            });
     
            if(respPage !== null){
                switch(respPage[0]){
                    case 1:
                        const idDisplayNone = respPage[1];
                        if(idDisplayNone === 'codCaptchaError'){
                            results.status = 200;
                            results.msg = 'No existe expedientes con los datos ingresados';
                            await browser.close();
                        }else if(idDisplayNone === 'mensajeNoExisteExpedientes'){
                            results.status = 404;
                            results.msg = 'Error: Resolución del Captcha';
                            await browser.close();
                        }
                        return results;
                    case 2:
                        results.status = 404;
                        results.msg = 'Error: Datos ingresados para la búsqueda son incorrectos';
                        await browser.close();
                        return results;
                    default:
                        results.status = 404;
                        results.msg = 'Error: La estructura HTML de la Página [Búsqueda de expedientes] a cambiado';
                        await browser.close();
                        return results;
                }
            }      
    
            // PAG. 02 ..................................................................................................
    
            try{
                await page.waitForSelector('#divDetalles');
            } catch(error){
                results.status = 404;
                results.msg = 'Error: Página [Resultado de búsqueda] no ha cargado';
                await browser.close();
                return results;
                
            }
    
            // Click sobre el expediente (Busqueda por código)
            await page.evaluate((codigoExpediente)=>{
                const panelGrupoDiv = document.querySelectorAll('#divDetalles > div');
                for(let i=0; i< panelGrupoDiv.length; i++){
                    let celdCentroD = panelGrupoDiv[i].querySelector('div.celdCentroD');
                    let divNroJuz = celdCentroD.querySelectorAll('div.divNroJuz > div > b');
                    let codeExped = divNroJuz[0].textContent.trim();
                    if(codeExped.toUpperCase() === codigoExpediente.toUpperCase()){
                        let button = panelGrupoDiv[i].querySelector('form#command button[type="submit"]');
                        button.click();
                        break;    
                    }
                }
            }, codigoExpediente.join('-'));
    
            // PAG. 03 ......................................................................................
    
            try{
                await page.waitForNavigation({waitUntil: 'load'})
                await page.waitForSelector('li.active')
            } catch(error){
                results.status = 404;
                results.msg = 'Error: Página [Detalles del expediente] no ha cargado';
                await browser.close();
                return results;
            }
    
            results = {'status': null, 'msg':'', 'data':{}};
    
            let cookies = await page.cookies();
            cookies = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    
            const headers = {
                'Cookie': cookies,
                'Referer': 'https://cej.pj.gob.pe/cej/forms/detalleform.html',
            };
    
    
            let dataDelExpediente = await page.evaluate((updateInformation) => {
                let numResolutionsxDesc = 0;
                let dataReturn = {
                    'Reporte de expediente':{},
                    'Partes procesales':[], 
                    'Segimiento del expediente':{},
                    'pendientes':{}
                };
    
                //_______________________________Reporte de expediente___________________________________________________
    
                const gridDiv = document.getElementById('gridRE');
                const rows = gridDiv.querySelectorAll('.divRepExp');
                dataReturn['Reporte de expediente'] = processRows(rows, '.celdaGridN', '.celdaGrid, .celdaGridxT');
    
                //_______________________________Partes procesales___________________________________________________
    
                let datosPartesProcesales = [];
                const panelGrup = document.getElementsByClassName('panelGrupo');
            
                for (const element of panelGrup) {
                    const headPanelGrup = element.querySelectorAll('.partes');
                    
                    headPanelGrup.forEach((head) => {
                        let title = head.textContent.trim();
                        title = title.split(/\n\t*/);
                        const arrayFiltrado = title.filter((elemento) => elemento !== "");
                        datosPartesProcesales.push(arrayFiltrado);
                    });
                }
    
                dataReturn['Partes procesales'] = datosPartesProcesales;
    
                //_______________________________Segimiento del expediente___________________________________________
    
                //.........................................dataRow......................................................
    
                const collapseThree = document.getElementById('collapseThree');
                const elementosDiv = collapseThree.querySelectorAll('div[id^="pnlSeguimiento"]');
                let idNames = Array.from(elementosDiv).map((div) => div.id);
                
                let updateInfo = updateData(0, idNames.length, dataReturn, numResolutionsxDesc,updateInformation.last);
                dataReturn = updateInfo[1];
                let pendingInfo = updateData(updateInfo[0], idNames.length, dataReturn, updateInfo[2], null, updateInformation.pending);
                dataReturn = pendingInfo[1];
                numResolutionsxDesc = pendingInfo[2]
    
                return [dataReturn, numResolutionsxDesc];
                
                function updateData(vmin, vmax, dataReturn, numResolutionsxDesc,lastDate = null, pending= null){
                    let i = vmin;
                    while(i < vmax ){  
    
                        let seguimientoDelExpediente = {};
        
                        let pnl = document.getElementById(idNames[i]);
        
                        let rowsColSm = pnl.querySelectorAll('.row .borderinf');
                        let dataRow = processRows(rowsColSm, '.roptionss', '.fleft', lastDate, pending);
                        
                        if(Object.keys(dataRow).length === 0){
                            if(pending !== null){ 
                                i++;
                                continue; }
                            break; 
                        }
        
                        let divs = Array.from(pnl.querySelectorAll('div.row > div, div[style*="text-align: center;"][style*="min-height: 50px"] > div'));
                        let classNames = divs.map(div =>{
                            const clase = div.getAttribute('class');
                            return clase ? clase.trim() : null;
                            });
        
                        classNames = classNames.filter(clase => clase !== null);
                        if(classNames.length !== 4){ break; }
    
                        switch(classNames[classNames.length -1]){
                            case 'dBotonDesc':
                                let urlInElements= pnl.querySelector('.row .dBotonDesc a.aDescarg');
                                dataRow['Descarga resolucion'] = urlInElements.href;
                                numResolutionsxDesc += 1;
                                break;
                            case 'sinResol divResolPar' :
                                let NoResolutionElemet = pnl.querySelector('.row .sinResol.divResolPar');
                                dataRow['Descarga resolucion'] = NoResolutionElemet.textContent.trim();
                                break;
                            case 'sinResol divResolImpar' :
                                let NoResolutionElemetI = pnl.querySelector('.row .sinResol.divResolImpar');
                                dataRow['Descarga resolucion'] = NoResolutionElemetI.textContent.trim();
                                break;
                        }
                    
                        seguimientoDelExpediente = dataRow;
        
                        //.....................................notifi............................................
        
                        let divNotifiPanelBody = pnl.querySelectorAll('#divNotif .panel-body[style="padding: 0px; "]');
                        let notifi = {};
                        
                        for(let i= 0; i < divNotifiPanelBody.length; i++){
                            
                            let notification = divNotifiPanelBody[i].querySelector('.borderinf h5.redb').textContent.trim();
                            
                            notifi[notification] = {};
        
                            let divNotifColSm = divNotifiPanelBody[i].querySelectorAll('.spaceinf');
                            let datadivNotifiColSm = processRows(divNotifColSm, '.subtit', '.fleft');
                            notifi[notification] = {...notifi[notification], ...datadivNotifiColSm};
        
                        }
        
                        seguimientoDelExpediente['notifi'] = notifi;
        
                        if(pending !== null){ 
                            dataReturn['pendientes']['pnlSeguimiento' + (i +1)] = seguimientoDelExpediente;
                        }else{
                            dataReturn['Segimiento del expediente']['pnlSeguimiento' + (i +1)] = seguimientoDelExpediente;
                        }
                        i++;
                    }
                    return [i, dataReturn, numResolutionsxDesc];
                }
    
                function processRows(rows, titleSelector, valueSelector1, lastDate= null, pending = null) {
                    let data = {};
                    let interruption = false;
    
                    for( let row of rows ){
                        let titleElements = row.querySelectorAll(titleSelector);
                        let valueElements = row.querySelectorAll(valueSelector1);
    
                        if (titleElements.length === valueElements.length) {
    
                            for(let index= 0; index < titleElements.length; index ++){
                                let title = titleElements[index].textContent.trim();
                                const value = valueElements[index].textContent.trim();
                                if (title.endsWith(':')){ title = title.slice(0, -1); }
                                if(lastDate !== null){
                                    if(lastDate.title === title && lastDate.value === value){
                                        interruption = true;
                                        break;
                                    }
                                }else if(pending !== null){
                                    if((title !== 'Fecha de Resolución' || !pending.includes(value)) && Object.keys(data).length === 0){
                                        interruption = true;
                                        break; 
                                    }
                                }
                                data[title] = value 
                            }
                        }
                        if(interruption){ break; }
                    }
                    return data;  
                }
    
            }, updateInformation);
    
            const numResolutionsxDesc = dataDelExpediente[1];
            dataDelExpediente = dataDelExpediente[0];
    
            
            // Descarga resoluciones __________________________________________________________________
    
            // Pueden haber resoluciones en 'Segimiento del expediente' o en 'pendientes'
    
            const expedienteDir = dataDelExpediente['Reporte de expediente']['Expediente N°'];
            let fullPath = baseDir + expedienteDir;
            // NO DEBERIA CREARSE NUEVAMENTE, SE SUPONE QUE LA CARPETA YA EXISTE
            crearDirectorioRecursivo(fullPath);
            
            let pnlSeguimientoClaves = [ 
                Object.keys(dataDelExpediente['Segimiento del expediente']),
                Object.keys(dataDelExpediente['pendientes'])
            ];
            const dataKey= ['Segimiento del expediente',  'pendientes' ]
            
    
            const  downloadTask = downloadResol(pnlSeguimientoClaves, dataKey);
            const downloadPromises = downloadTask[0]
            const countRDesc = downloadTask[1]
    
            function downloadResol(pnlSeguimientoClaves, dataKey){
                let countRDesc = 0;
                const downloadPromises = [];
                for(let i = 0; i < 2; i++){
                    for(let pnlSeguimiento of pnlSeguimientoClaves[i]){
                        let url = dataDelExpediente[dataKey[i]][pnlSeguimiento]['Descarga resolucion'];
                        if(url.includes('https://cej.pj.gob.pe/cej/forms/')){ 
                            let fRes = dataDelExpediente[dataKey[i]][pnlSeguimiento]['Fecha de Resolución'];
                            const formattedDate = fRes.split(' ')[0].replace(/\//g, '');
                            const filename = `res_${formattedDate}`;  // sin extensión de archivo
                            const fullPath = `${baseDir + expedienteDir}/${filename}`;
    
                            const itemPath = `${'../storage/docs/' + expedienteDir}/${filename}`;
    
                            downloadPromises.push(downloadPDF(url, headers, fullPath, itemPath));
                            
                            countRDesc += 1;
                            //dataDelExpediente[dataKey[i]][pnlSeguimiento]['Descarga resolucion'] = itemPath;
                        }
                         
                    }
                }
                return [downloadPromises, countRDesc];
            }
    
            // Ingresa las respectias rutas de la resolución descargada
            function placeRoutes(pnlSeguimientoClaves, dataKey, allResults){
                let itPath = 0;
                for(let i = 0; i < 2; i++){
                    for(let pnlSeguimiento of pnlSeguimientoClaves[i]){
                        let url = dataDelExpediente[dataKey[i]][pnlSeguimiento]['Descarga resolucion'];
                        if(url.includes('https://cej.pj.gob.pe/cej/forms/')){ 
                            dataDelExpediente[dataKey[i]][pnlSeguimiento]['Descarga resolucion'] = allResults[itPath];
                            itPath ++;
                        }   
                    }
                }
            }
           
            // Wait for all download promises to complete
            const allResults = await Promise.all(downloadPromises);
    
            // Coloca las rutas en la clave correspondiente
            placeRoutes(pnlSeguimientoClaves, dataKey, allResults)
    
            if(numResolutionsxDesc !== countRDesc){
                results.msg = `Advertencia: Resoluciónes no descargadas: ${numResolutionsxDesc - countRDesc}`;
            }
    
            results.status = 200;
            results.data = {...results.data, ...dataDelExpediente};
    
            await new Promise(r => setTimeout(r, 1000));
            await browser.close();
            return results;
    
        }catch(error){
            results.status = 404;
            results.msg = error;
            if(browser !== null){ await browser.close();}
            return results;
        }
    })().then((results) => {
        res.send(results);
        console.log('Respuesta del RPA en Poder Judicial Update');
        // console.log(JSON.stringify(results, null, 1));
    })
    .catch((error) => {
        console.error("Ocurrió un error:", error);
        error.sendStatus(500);
    });
});


app.post("/error", (req, res) => {
    let body_filtros = req.body;
    res.send("Error de busqueda");
});

app.get("/", (req, res) => {
    // let body_filtros = req.body;
    res.send("Hello world");
});

const httpsServer = https.createServer(httpsOptions, app);
httpsServer.listen(app.get("port"), () => {
    console.log('app running on port', app.get("port"));
});
// app.listen(app.get("port"), /* "192.30.241.7", */ () => 
//     console.log("app running on port", app.get("port"))
// );