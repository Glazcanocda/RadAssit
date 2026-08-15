// main.js - Servidor Local EVA Medical AI

const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, BrowserWindow, globalShortcut, Tray, Menu, ipcMain, screen, systemPreferences } = require('electron');
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');

app.commandLine.appendSwitch('enable-speech-dispatcher');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

// Se lee la API Key desde el entorno (.env) para evitar exponer credenciales
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

const groq = new Groq({ apiKey: GROQ_API_KEY });

async function verificarConexionGroq() {
    try {
        await groq.chat.completions.create({
            messages: [{ role: "user", content: "ping" }],
            model: "llama-3.3-70b-versatile",
            max_tokens: 5
        });
        console.log("🟢 ¡CONEXIÓN EXITOSA CON GROQ IA! EVA Medical AI está lista.");
    } catch (e) {
        console.log("❌ ERROR DE AUTENTICACIÓN CON GROQ (401): Verifique la clave en el archivo .env");
    }
}

verificarConexionGroq();

let mainWindow = null;
let tray = null;
let ordenTransferenciaPendiente = "";

let cuentaRadAssistActiva = {
    nombreCompleto: "Dr. Gabriel Lazcano Cepeda",
    nombreCorto: "Dr. Gabriel"
};

function limpiarFormatosYGuiones(texto) {
    if (!texto) return "";
    return texto
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/#/g, '')
        .replace(/`/g, '')
        .replace(/^\s*[-–—]\s*/gm, '') 
        .trim();
}

function obtenerRutaIcono() {
    const posiblesRutas = [
        path.join(__dirname, 'assets/icon.ico'),
        path.join(__dirname, 'assets/icon128.png'),
        path.join(__dirname, 'extension/assets/icon128.png'),
        path.join(__dirname, 'icon128.png')
    ];
    for (let r of posiblesRutas) {
        if (fs.existsSync(r)) return r;
    }
    return null;
}

const ICON_PATH = obtenerRutaIcono();

const serverApp = express();
serverApp.use(cors({ origin: '*' }));
serverApp.use(express.json({ limit: '50mb' }));
serverApp.use(express.urlencoded({ limit: '50mb', extended: true }));

serverApp.get('/perfil-usuario', (req, res) => {
    res.json(cuentaRadAssistActiva);
});

serverApp.get('/obtener-plantillas-base', (req, res) => {
    const rutaJson = path.join(__dirname, 'report_templates.json');
    if (fs.existsSync(rutaJson)) {
        res.sendFile(rutaJson);
    } else {
        res.status(404).json({ error: "report_templates.json no encontrado" });
    }
});

serverApp.get('/obtener-orden-transferencia', (req, res) => {
    const textoAEnviar = ordenTransferenciaPendiente;
    ordenTransferenciaPendiente = ""; 
    res.json({ transferir: !!textoAEnviar, texto: textoAEnviar });
});

serverApp.post('/solicitar-transferencia', (req, res) => {
    try {
        if (req.body && (req.body.texto || req.body.texto !== undefined)) {
            ordenTransferenciaPendiente = req.body.texto || "";
            res.json({ status: "ok", message: "Orden registrada" });
        } else {
            res.status(400).json({ status: "error" });
        }
    } catch(e) {
        res.status(500).json({ status: "error" });
    }
});

serverApp.post('/auditar-informe-universal', async (req, res) => {
    try {
        const { textoInforme, tituloEstudio, sexoPaciente } = req.body;

        if (!textoInforme || !textoInforme.trim()) {
            return res.json({ tieneAlerta: false, alertas: [] });
        }

        const promptAuditoria = `Eres EVA Medical AI, auditora radiológica Senior. Evalúa el siguiente informe médico:

Título de la prestación solicitada: "${tituloEstudio || 'No especificado'}"
Sexo del Paciente: "${sexoPaciente || 'No especificado'}"
Texto del Informe Redactado:
"${textoInforme}"

TAREA DE AUDITORÍA:
1. Incongruencia de Sexo: ¿Menciona próstata/testículos/vesículas seminales en Femenino, o ovarios/útero/mamografía en Masculino?
2. Incongruencia Anatómica / Plantillazo: ¿Menciona zonas corporales totalmente ajenas al título del estudio?
3. Examen Compuesto Incompleto: Si el título includes varias regiones, ¿se omitió describir alguna de las regiones solicitadas?
4. Patología Crítica: ¿Se menciona neumotórax, TEP, ACV, fractura, sangrado o urgencia?

RESPONDE EXCLUSIVAMENTE EN FORMATO JSON:
{
    "tieneAlerta": true o false,
    "alertas": [
        {"tipo": "SEXO" | "ANATOMIA" | "INCOMPLETO" | "CRITICO", "mensaje": "Descripción breve y clara"}
    ]
}`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: promptAuditoria }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.05,
            response_format: { type: "json_object" },
            max_tokens: 500
        });

        const respuestaJson = JSON.parse(chatCompletion.choices[0]?.message?.content || "{}");
        res.json(respuestaJson);

    } catch (error) {
        res.json({ tieneAlerta: false, alertas: [] });
    }
});

serverApp.post('/analizar-e-informar-ia', async (req, res) => {
    try {
        const { imagenBase64, estudio, corte, sexo } = req.body;
        const nombreEstudio = (estudio || "ESTUDIO RADIOLÓGICO").toUpperCase();
        const ubicacionCorte = (corte || "CORTE ACTIVO 1/1").toUpperCase();

        const promptClinicoGeneral = `Eres EVA Medical AI, copiloto radiológico Senior.
Analiza el examen: "${nombreEstudio}", Vista/Corte activo: "${ubicacionCorte}", Sexo del Paciente: "${sexo || 'M'}".

REGLAS CRÍTICAS DE REDACCIÓN:
1. SÉ SINTÉTICO, BREVE Y REDACTA EN PÁRRAFOS CONTINUOS NARRATIVOS.
2. NO USES GUIONES (-), ASTERISCOS (**) NI MARKDOWN EN NINGUNA PARTE.
3. Responde ÚNICAMENTE con la estructura exacta:

ANTECEDENTES:
Evaluación radiológica de ${nombreEstudio.toLowerCase()}.

HALLAZGOS:
Estructuras preservadas de morfología habitual. Sin lesiones focales ni alterations agudas visibles.

IMPRESIÓN:
${nombreEstudio}: Sin evidencia de lesiones agudas.`;

        let modeloAUsar = "llama-3.2-11b-vision-preview";
        let mensajesContent = [];

        if (imagenBase64 && imagenBase64.length > 2000 && imagenBase64.startsWith('data:image')) {
            mensajesContent = [
                { type: "text", text: promptClinicoGeneral },
                { type: "image_url", image_url: { url: imagenBase64 } }
            ];
        } else {
            modeloAUsar = "llama-3.3-70b-versatile";
            mensajesContent = promptClinicoGeneral;
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: mensajesContent }],
            model: modeloAUsar,
            temperature: 0.1,
            max_tokens: 600
        });

        const respuestaTexto = chatCompletion.choices[0]?.message?.content || "";
        res.json({ texto: limpiarFormatosYGuiones(respuestaTexto) });

    } catch (error) {
        res.status(500).json({ error: "Error Groq: " + error.message });
    }
});

// =========================================================================
// 🪄 CORRECTOR IA CONSERVADOR (RESPETA TODO EL TEXTO Y SOLO CORRIGE ORTOGRAFÍA)
// =========================================================================
serverApp.post('/corregir-informe-ia', async (req, res) => {
    try {
        const { texto } = req.body;
        if (!texto || !texto.trim()) {
            return res.json({ textoCorregido: "" });
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [{
                role: "user",
                content: `Eres EVA Medical AI, correctora ortográfica y editorial médica.
Tu única tarea es corregir la ortografía, tildes y errores de dictado del siguiente texto radiológico.

REGLAS ESTRÍCTAS:
1. CONSERVA TODO EL TEXTO Y TODAS LAS IDEAS. NO RESUMAS, NO OMITAS NI BORRES PÁRRAFOS.
2. Corrige errores como: "izúuierda" -> "izquierda", "encefalicos" -> "encefálicos", "septodesviacion" -> "Septodesviación".
3. Elimina muletillas de dictado ("Atentamente", "Punto final") y guiones/asteriscos.

Texto a corregir:
"${texto}"

Responde ÚNICAMENTE con el texto corregido completo:`
            }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.05,
            max_tokens: 1000
        });

        const corregido = chatCompletion.choices[0]?.message?.content || texto;
        res.json({ textoCorregido: limpiarFormatosYGuiones(corregido) });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

serverApp.post('/generar-conclusion-automatica', async (req, res) => {
    try {
        const { hallazgos, estudio } = req.body;
        const nombreEstudio = (estudio || "ESTUDIO RADIOLÓGICO").toUpperCase();
        const textoHallazgos = (hallazgos || "").trim();

        if (!textoHallazgos) {
            return res.json({ impresion: `${nombreEstudio}: Sin alteraciones significativas.` });
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [{
                role: "user",
                content: `A partir del texto de HALLAZGOS de "${nombreEstudio}":
"${textoHallazgos}"
Sintetiza la IMPRESIÓN diagnóstica clínica en 1 o 2 líneas breves sin guiones, asteriscos ni markdown.`
            }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            max_tokens: 200
        });

        const impresionIA = chatCompletion.choices[0]?.message?.content || "";
        res.json({ impresion: limpiarFormatosYGuiones(impresionIA) });

    } catch (error) {
        res.json({ impresion: "Estudio dentro de límites normales." });
    }
});

serverApp.post('/traducir-para-paciente', async (req, res) => {
    try {
        const { informe } = req.body;
        if (!informe || !informe.trim()) {
            return res.json({ explicacionPaciente: "Examen dentro de límites normales." });
        }

        const chatCompletion = await groq.chat.completions.create({
            messages: [{
                role: "user",
                content: `Eres EVA Medical AI. Explica el siguiente informe radiológico médico en un lenguaje sencillo, claro, tranquilizador y fácil de entender para un paciente sin conocimientos médicos:

"${informe}"

Responde en 2 o 3 frases amables sin usar tecnicismos complejos ni guiones.`
            }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.2,
            max_tokens: 250
        });

        const explicacion = chatCompletion.choices[0]?.message?.content || "El estudio no muestra alteraciones de cuidado.";
        res.json({ explicacionPaciente: limpiarFormatosYGuiones(explicacion) });

    } catch (error) {
        res.json({ explicacionPaciente: "El examen no muestra hallazgos de urgencia. Consulte con su médico tratante." });
    }
});

const PORT = 3000;
const server = serverApp.listen(PORT, () => {
    console.log(`🚀 Servidor EVA Medical AI corriendo en http://127.0.0.1:${PORT}`);
});

server.keepAliveTimeout = 61000;
server.headersTimeout = 65000;

function createMainWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: 420,
        height: 620,
        minWidth: 360,
        minHeight: 520,
        x: width - 440,
        y: Math.round((height - 620) / 2),
        frame: true,               
        autoHideMenuBar: true,
        alwaysOnTop: true,
        resizable: true,
        title: "EVA Medical AI",
        icon: ICON_PATH,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });

    mainWindow.webContents.session.setPermissionCheckHandler(() => true);
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => callback(true));

    if (fs.existsSync(path.join(__dirname, 'index.html'))) {
        mainWindow.loadFile('index.html');
    } else if (fs.existsSync(path.join(__dirname, 'public/index.html'))) {
        mainWindow.loadFile('public/index.html');
    }

    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.on('closed', () => { mainWindow = null; });
}

function createSystemTray() {
    if (ICON_PATH) {
        try {
            tray = new Tray(ICON_PATH);
            const contextMenu = Menu.buildFromTemplate([
                { label: 'EVA Medical AI • Copiloto Radiológico', enabled: false },
                { type: 'separator' },
                { 
                    label: 'Mostrar / Ocultar Ventana', 
                    click: () => {
                        if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
                    } 
                },
                { type: 'separator' },
                { label: 'Salir', click: () => app.quit() }
            ]);
            tray.setToolTip('EVA Medical AI');
            tray.setContextMenu(contextMenu);
        } catch(e) {}
    }
}

function registrarAtajosGlobales() {
    try {
        globalShortcut.unregisterAll();

        globalShortcut.register('F9', () => {
            if (mainWindow) mainWindow.webContents.send('trigger-f9-dictation');
        });

        globalShortcut.register('F10', () => {
            if (mainWindow) mainWindow.webContents.send('trigger-f10-shortcut');
        });
    } catch(e) {}
}

app.whenReady().then(async () => {
    if (process.platform === 'win32') {
        try { await systemPreferences.askForMediaAccess('microphone'); } catch(e) {}
    }
    createMainWindow();
    createSystemTray();
    registrarAtajosGlobales();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('solicitar-transferencia-ipc', (event, texto) => {
    ordenTransferenciaPendiente = texto;
});