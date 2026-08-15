// renderer.js - RadAssist Pro UI (Transferencia Directa + Dictado Estable)

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const txtArea = document.getElementById('informe-texto');
const wordCount = document.getElementById('word-count');
const btnTransferir = document.getElementById('btn-transferir');
const btnBorrar = document.getElementById('btn-borrar-todo');
const btnDictado = document.getElementById('btn-iniciar-dictado');
const lblDictado = document.getElementById('lbl-dictado');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const btnCorregir = document.getElementById('btn-corregir');
const imgRobot = document.getElementById('img-robot');

const modalCargar = document.getElementById('modal-cargar-plantillas');
const btnCargarPlantilla = document.getElementById('btn-cargar-plantilla');
const btnCerrarCargar = document.getElementById('btn-cerrar-modal-cargar');
const listaPlantillas = document.getElementById('lista-plantillas');
const filtroPlantilla = document.getElementById('filtro-plantilla');

const modalGuardar = document.getElementById('modal-guardar-plantilla');
const btnGuardarPlantilla = document.getElementById('btn-guardar-plantilla');
const btnCerrarGuardar = document.getElementById('btn-cerrar-modal-guardar');
const inputNombrePlantilla = document.getElementById('nombre-plantilla');
const selectTipoExamen = document.getElementById('tipo-examen-plantilla');
const btnConfirmarGuardar = document.getElementById('btn-confirmar-guardar-plantilla');

let reconocedorVoz = null;
let grabandoContinuo = false;
let plantillasGlobales = [];

if (imgRobot) {
    let rutaIcono = path.resolve(__dirname, 'extension', 'assets', 'icon128.png');
    if (!fs.existsSync(rutaIcono)) rutaIcono = path.resolve(__dirname, 'assets', 'icon128.png');
    if (fs.existsSync(rutaIcono)) {
        imgRobot.src = `file://${rutaIcono.replace(/\\/g, '/')}`;
    }
}

// =========================================================================
// 🎙️ DICTADO POR VOZ NATIVO ESTABLE (SIN ERRORES DE STREAM)
// =========================================================================
function inicializarReconocedorVoz() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Su sistema no soporta dictado directo por voz.");
        return;
    }

    reconocedorVoz = new SpeechRecognition();
    reconocedorVoz.continuous = true;
    reconocedorVoz.interimResults = true;
    reconocedorVoz.lang = 'es-CL';

    reconocedorVoz.onstart = () => {
        grabandoContinuo = true;
        if (btnDictado) btnDictado.classList.add('recording');
        if (lblDictado) lblDictado.innerText = "Detener Dictado";
        if (statusText) statusText.innerText = "🎙️ Dictando en vivo... Hable al micrófono.";
        if (statusDot) statusDot.style.background = "#ef4444";
    };

    reconocedorVoz.onresult = (event) => {
        let transcripcionFinal = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                transcripcionFinal += event.results[i][0].transcript + " ";
            }
        }
        if (transcripcionFinal && txtArea) {
            txtArea.value += (txtArea.value ? " " : "") + transcripcionFinal.trim();
            actualizarContadores();
        }
    };

    reconocedorVoz.onerror = (e) => {
        console.warn("Aviso en dictado:", e.error);
        if (grabandoContinuo && e.error !== 'no-speech') {
            try { reconocedorVoz.start(); } catch(err) {}
        }
    };

    reconocedorVoz.onend = () => {
        if (grabandoContinuo) {
            try { reconocedorVoz.start(); } catch(err) {}
        } else {
            if (btnDictado) btnDictado.classList.remove('recording');
            if (lblDictado) lblDictado.innerText = "Iniciar Dictado";
            if (statusText) statusText.innerText = "Dr. Silva: Asistente listo.";
            if (statusDot) statusDot.style.background = "#22c55e";
        }
    };
}

function alternarDictadoDirecto() {
    if (!reconocedorVoz) inicializarReconocedorVoz();

    if (!grabandoContinuo) {
        try {
            grabandoContinuo = true;
            reconocedorVoz.start();
        } catch(e) {
            console.error(e);
        }
    } else {
        grabandoContinuo = false;
        if (reconocedorVoz) reconocedorVoz.stop();
    }
}

if (btnDictado) btnDictado.addEventListener('click', alternarDictadoDirecto);

ipcRenderer.on('trigger-f9-dictation', alternarDictadoDirecto);
ipcRenderer.on('toggle-dictado-hotkey', alternarDictadoDirecto);

// =========================================================================
// 🪄 BOTÓN CORREGIR
// =========================================================================
if (btnCorregir) {
    btnCorregir.addEventListener('click', async () => {
        if (!txtArea || !txtArea.value.trim()) return;

        if (statusText) statusText.innerText = "🧠 EVA IA corrigiendo estilo u ortografía médica...";
        if (statusDot) statusDot.style.background = "#38bdf8";

        try {
            const resp = await fetch('http://127.0.0.1:3000/corregir-informe-ia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto: txtArea.value })
            });

            if (resp.ok) {
                const data = await resp.json();
                if (data.textoCorregido) {
                    txtArea.value = data.textoCorregido;
                    actualizarContadores();
                    if (statusText) statusText.innerText = "✅ Texto corregido con éxito.";
                    if (statusDot) statusDot.style.background = "#22c55e";
                }
            }
        } catch(e) {
            if (statusText) statusText.innerText = "⚠️ Error al conectar con el corrector IA.";
        }
    });
}

function actualizarContadores() {
    if (!txtArea) return;
    const val = txtArea.value.trim();
    const palabras = val ? val.split(/\s+/).length : 0;
    const caracteres = val.length;
    if (wordCount) wordCount.innerText = `🟢 Listo | ${palabras} palabras | ${caracteres} caracteres`;
}

if (txtArea) txtArea.addEventListener('input', actualizarContadores);

if (btnBorrar) {
    btnBorrar.addEventListener('click', () => {
        if (txtArea) txtArea.value = '';
        actualizarContadores();
        if (statusText) statusText.innerText = "Dr. Silva: Texto borrado.";
    });
}

// =========================================================================
// 🚀 EJECUCIÓN DIRECTA DE TRANSFERENCIA
// =========================================================================
async function ejecutarTransferencia() {
    if (!txtArea || !txtArea.value.trim()) {
        if (statusText) statusText.innerText = "⚠️ Ingrese un texto antes de transferir.";
        return;
    }

    const textoAEnviar = txtArea.value.trim();
    ipcRenderer.send('solicitar-transferencia-ipc', textoAEnviar);

    try {
        const resp = await fetch('http://127.0.0.1:3000/solicitar-transferencia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto: textoAEnviar })
        });

        if (resp.ok) {
            if (statusText) statusText.innerText = "✅ Informe enviado. Inyectando en Dalca...";
            if (statusDot) statusDot.style.background = "#22c55e";
        }
    } catch(e) {
        if (statusText) statusText.innerText = "⚠️ Enviado por IPC secundario.";
    }
}

if (btnTransferir) btnTransferir.addEventListener('click', ejecutarTransferencia);
ipcRenderer.on('ejecutar-transferencia-hotkey', ejecutarTransferencia);

async function cargarPlantillas() {
    try {
        const res = await fetch('http://127.0.0.1:3000/obtener-plantillas-base');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                plantillasGlobales = data;
                renderizarListaPlantillas();
            }
        }
    } catch(e) {}
}

function renderizarListaPlantillas(filtro = "") {
    if (!listaPlantillas) return;
    listaPlantillas.innerHTML = '';
    const normFiltro = filtro.toLowerCase().trim();

    const filtradas = plantillasGlobales.filter(p => {
        const tit = (p.titulo || p.nombre || p.title || "").toLowerCase();
        const tipo = (p.tipo || p.zona || "").toLowerCase();
        const texto = JSON.stringify(p).toLowerCase();
        return tit.includes(normFiltro) || tipo.includes(normFiltro) || texto.includes(normFiltro);
    });

    if (filtradas.length === 0) {
        listaPlantillas.innerHTML = '<div style="color: #64748b; font-size: 12px; padding: 10px; text-align: center;">No se encontraron plantillas.</div>';
        return;
    }

    filtradas.forEach((p) => {
        const div = document.createElement('div');
        div.style.cssText = `
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid #1e293b;
            padding: 10px 12px;
            border-radius: 8px;
            margin-bottom: 6px;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            gap: 2px;
        `;

        const textoAInyectar = p.texto || p.contenido || p.hallazgos || (typeof p === 'string' ? p : "");

        div.innerHTML = `
            <div style="color: #38bdf8; font-weight: 700; font-size: 12px;">${p.titulo || p.nombre || p.title || "Plantilla"}</div>
            <div style="color: #94a3b8; font-size: 10px;">${p.tipo || p.zona || "General"}</div>
        `;

        div.onclick = () => {
            if (txtArea && textoAInyectar) {
                txtArea.value = typeof textoAInyectar === 'object' ? JSON.stringify(textoAInyectar, null, 2) : textoAInyectar;
            }
            actualizarContadores();
            if (modalCargar) modalCargar.style.display = 'none';
            if (statusText) statusText.innerText = "Plantilla cargada.";
        };

        listaPlantillas.appendChild(div);
    });
}

if (btnCargarPlantilla) {
    btnCargarPlantilla.addEventListener('click', () => {
        cargarPlantillas();
        if (modalCargar) modalCargar.style.display = 'flex';
    });
}

if (btnCerrarCargar) btnCerrarCargar.addEventListener('click', () => { if (modalCargar) modalCargar.style.display = 'none'; });
if (filtroPlantilla) filtroPlantilla.addEventListener('input', (e) => renderizarListaPlantillas(e.target.value));

if (btnGuardarPlantilla) {
    btnGuardarPlantilla.addEventListener('click', () => {
        if (!txtArea || !txtArea.value.trim()) return;
        if (inputNombrePlantilla) inputNombrePlantilla.value = '';
        if (modalGuardar) modalGuardar.style.display = 'flex';
    });
}

if (btnCerrarGuardar) btnCerrarGuardar.addEventListener('click', () => { if (modalGuardar) modalGuardar.style.display = 'none'; });

if (btnConfirmarGuardar) {
    btnConfirmarGuardar.addEventListener('click', () => {
        const nombre = (inputNombrePlantilla ? inputNombrePlantilla.value.trim() : "") || `Plantilla ${plantillasGlobales.length + 1}`;
        const tipo = selectTipoExamen ? selectTipoExamen.value : "General";

        const nueva = { titulo: nombre, tipo: tipo, texto: txtArea ? txtArea.value : "" };
        plantillasGlobales.push(nueva);
        ejecutarTransferencia();

        if (modalGuardar) modalGuardar.style.display = 'none';
        if (statusText) statusText.innerText = `Plantilla "${nombre}" guardada.`;
    });
}

window.addEventListener('DOMContentLoaded', () => {
    cargarPlantillas();
});