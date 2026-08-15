// extension/content.js - RadAssist Pro Copilot (Inyección Protegida Antiborrado)

(function() {
    const urlActual = window.location.href.toLowerCase();

    if (!urlActual.includes('dalca')) return;

    const esIframe = window !== window.top;
    let procesandoTransferencia = false;
    let timerProactivo = null;
    let estudioNotificadoActual = "";
    let debounceAuditoria = null;
    let textoAlertaActualRenderizado = "";
    let preinformeOfrecidoParaEstudio = false;

    let perfilRadAssist = { 
        nombreCorto: "Doctor(a)", 
        nombreCompleto: "Médico Radiólogo Informante" 
    };

    async function sincronizarPerfilLocal() {
        try {
            const res = await fetch('http://127.0.0.1:3000/perfil-usuario');
            if (res.ok) {
                const data = await res.json();
                if (data && data.nombreCompleto) {
                    perfilRadAssist.nombreCompleto = data.nombreCompleto;
                    perfilRadAssist.nombreCorto = data.nombreCorto || data.nombreCompleto;
                }
            }
        } catch(e) {}
    }
    
    sincronizarPerfilLocal();

    const ROBOT_ICON_URL = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL 
        ? chrome.runtime.getURL('assets/icon128.png') 
        : '';

    function normalizarTexto(txt) {
        if (!txt) return "";
        return txt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    }

    function estaFichaInformeAbierta() {
        if (urlActual.includes('admin') || urlActual.includes('users') || urlActual.includes('pacs')) {
            return false;
        }
        const cHal = document.getElementById('write_findings_textarea') || document.querySelector('#write_findings_textarea');
        const cImp = document.getElementById('write_impression_textarea') || document.querySelector('#write_impression_textarea');
        const cAnt = document.getElementById('write_background_textarea') || document.querySelector('#write_background_textarea');
        return !!(cHal || cImp || cAnt);
    }

    function esPaginaWorklist() {
        return !estaFichaInformeAbierta();
    }

    function obtenerUbicacionOSliceActivo() {
        try {
            const nodosVisor = Array.from(document.querySelectorAll('div, span, text, p, b, tspan, .viewport-element, [class*="overlay"]'));
            let serieDetectada = "";
            let corteDetectado = "";

            for (let el of nodosVisor) {
                if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
                const txt = (el.innerText || el.textContent || "").trim();

                if (/\b(?:S|Serie|SERIE)\s*:\s*\d+/i.test(txt) || /\b(?:AXIAL|SAGITAL|CORONAL|T1|T2|FLAIR|DWI|ADC|COLUMNA|CERV|DORSAL|LUMBAR|THORAX|CHEST)\b/i.test(txt)) {
                    if (txt.length < 50) serieDetectada = txt;
                }

                if (/^\d+\/\d+$/.test(txt)) {
                    corteDetectado = `Corte ${txt}`;
                }
            }

            if (serieDetectada) return `${serieDetectada}${corteDetectado ? ' • ' + corteDetectado : ''}`;
            return corteDetectado || "Serie Activa DICOM";
        } catch(e) {
            return "Serie Activa DICOM";
        }
    }

    function purificarNombreEstudio(txtBruto) {
        if (!txtBruto) return "ESTUDIO RADIOLÓGICO";
        let limpio = normalizarTexto(txtBruto);
        limpio = limpio.replace(/\d{1,2}-[A-Z]{3,4}-\d{2,4}/g, '');
        limpio = limpio.replace(/\b(?:CR|DX|CT|MR|US|MX|AP|LAT|PIE|ERECT|CONVENIO|DIGITAL)\b/g, '');
        limpio = limpio.replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim();

        return limpio || "ESTUDIO RADIOLÓGICO";
    }

    function obtenerTituloRealEstudio() {
        const campoTitulo = document.getElementById('write_title_textarea') || document.querySelector('#write_title_textarea');
        if (campoTitulo) {
            const val = campoTitulo.value || campoTitulo.innerText || "";
            if (val && val.trim().length > 3) return purificarNombreEstudio(val);
        }

        const textosDicom = Array.from(document.querySelectorAll('div, span, text, p'));
        for (let el of textosDicom) {
            const txt = (el.innerText || el.textContent || "").trim();
            if (txt.includes("RESONANCIA") || txt.includes("COLUMNA") || txt.includes("ABDOMEN") || txt.includes("PELVIS") || txt.includes("TC") || txt.includes("TORAX") || txt.includes("CEREBRO") || txt.includes("ORBITAS")) {
                if (txt.length < 80) return purificarNombreEstudio(txt);
            }
        }

        return "ESTUDIO RADIOLÓGICO";
    }

    function obtenerSexoPaciente() {
        const textoCuerpo = document.body.innerText || "";
        if (/\b(?:SEXO|GÉNERO|GENERO)\s*:\s*(?:M|MASCULINO|HOMBRE)\b/i.test(textoCuerpo) || /\b M \b/i.test(textoCuerpo) || /\b Masculino \b/i.test(textoCuerpo)) {
            return "MASCULINO";
        }
        if (/\b(?:SEXO|GÉNERO|GENERO)\s*:\s*(?:F|FEMENINO|MUJER)\b/i.test(textoCuerpo) || /\b F \b/i.test(textoCuerpo) || /\b Femenino \b/i.test(textoCuerpo)) {
            return "FEMENINO";
        }
        return "MASCULINO";
    }

    function resolverElementoEditableProfundo(contenedorPadre) {
        if (!contenedorPadre) return null;
        if (contenedorPadre.isContentEditable || contenedorPadre.tagName === 'TEXTAREA' || contenedorPadre.tagName === 'INPUT') {
            return contenedorPadre;
        }
        return contenedorPadre.querySelector('.ql-editor, [contenteditable="true"], textarea, input') || contenedorPadre;
    }

    function obtenerCamposDalca() {
        let antEl = null, halEl = null, impEl = null;

        const cAnt = document.getElementById('write_background_textarea') || document.querySelector('#write_background_textarea');
        const cHal = document.getElementById('write_findings_textarea') || document.querySelector('#write_findings_textarea');
        const cImp = document.getElementById('write_impression_textarea') || document.querySelector('#write_impression_textarea');

        if (cAnt) antEl = resolverElementoEditableProfundo(cAnt);
        if (cHal) halEl = resolverElementoEditableProfundo(cHal);
        if (cImp) impEl = resolverElementoEditableProfundo(cImp);

        return { antecedentes: antEl, hallazgos: halEl, impresion: impEl };
    }

    function limpiarAlertaVisible() {
        const alertBox = document.getElementById('eva-alert-box-critica');
        if (alertBox) alertBox.remove();
        textoAlertaActualRenderizado = "";
    }

    function mostrarToastAlertaJuntoAlRobot(msg, colorBorde = "#ef4444", duracionMs = 0) {
        if (textoAlertaActualRenderizado === msg && document.getElementById('eva-alert-box-critica')) {
            return;
        }

        limpiarAlertaVisible();
        textoAlertaActualRenderizado = msg;

        const menuAbierto = document.getElementById('radassist-menu-robot');
        const posCSS = menuAbierto 
            ? `top: 20px !important; left: 50% !important; transform: translateX(-50%) !important;` 
            : `bottom: 180px !important; right: 20px !important;`;

        const alertBox = document.createElement('div');
        alertBox.id = 'eva-alert-box-critica';

        alertBox.style.cssText = `
            position: fixed !important;
            ${posCSS}
            background: #0f172a !important;
            color: #ffffff !important;
            border: 2px solid ${colorBorde} !important;
            border-radius: 12px !important;
            padding: 10px 14px !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            z-index: 2147483646 !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.9), 0 0 15px ${colorBorde} !important;
            max-width: 320px !important;
            line-height: 1.4 !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            gap: 10px !important;
            pointer-events: auto !important;
        `;

        alertBox.innerHTML = `
            <div>${msg}</div>
            <button id="btn-cerrar-alerta-toast" style="background:none; border:none; color:#94a3b8; font-size:12px; cursor:pointer;">✕</button>
        `;

        document.body.appendChild(alertBox);

        document.getElementById('btn-cerrar-alerta-toast').onclick = () => {
            limpiarAlertaVisible();
        };

        if (duracionMs > 0) {
            setTimeout(() => {
                limpiarAlertaVisible();
            }, duracionMs);
        }
    }

    const MAPEO_ANATOMICO = {
        CABEZA_CUELLO: ["CEREBRO", "ENCEFALO", "CRANEO", "CRANEOTOMIA", "PARIETAL", "OCCIPITAL", "FRONTAL", "TEMPORAL", "VENTRICULO", "CEREBELO", "CISTERNA", "SUBDURAL", "ATM", "CONDILO", "MANDIBULA", "CARA", "CUELLO", "ORBITA", "ORBITAS", "SINUS", "SENOS PARANASALES"],
        TORAX: ["PULMON", "PULMONAR", "PLEURA", "MEDIASTINO", "CORAZON", "TRAQUEA", "BRONQUIO", "AORTA TORACICA", "NEUMOTORAX", "TÓRAX", "TORAX"],
        ABDOMEN_PELVIS: ["HIGADO", "PROSTATA", "PANCREAS", "RIÑON", "BAZO", "VESICULA", "INTESTINO", "COLON", "ESTOMAGO", "VEJIGA", "OVARIO", "UTERO", "TESTICULO", "PENE", "ESCROTO", "PELVIS", "ABDOMEN", "CIEGO", "APENDICE"],
        EXTREMIDADES: ["MANO", "PIE", "RODILLA", "HOMBRO", "CODO", "MUÑECA", "TOBILLO", "CADERA", "FEMUR", "TIBIA", "PERONE", "HUMERO", "RADIO", "CUBITO", "FALANGE", "TALON", "CALCANEO"],
        COLUMNA: ["CERVICAL", "DORSAL", "LUMBAR", "SACRO", "COXIS", "VERTEBRA", "DISCO", "CANAL ESPINAL"]
    };

    function determinarRegionAnatomicaTermino(txtUpper) {
        for (let [region, palabras] of Object.entries(MAPEO_ANATOMICO)) {
            for (let p of palabras) {
                const regexPalabraExacta = new RegExp(`(?:^|\\s+)${p}(?:$|\\s+|\\.|,)`, 'i');
                if (regexPalabraExacta.test(txtUpper)) {
                    return { region, palabraEncontrada: p };
                }
            }
        }
        return null;
    }

    function verificarAlertasUniversalInstantaneas(texto) {
        if (!texto || texto.trim().length < 2) {
            limpiarAlertaVisible();
            return false;
        }

        const txtUpper = normalizarTexto(texto);
        const sexoPaciente = obtenerSexoPaciente();
        const tituloEstudio = obtenerTituloRealEstudio().toUpperCase();

        if (sexoPaciente === "MASCULINO") {
            const terminosFemeninos = ["OVARIO", "UTEROS", "UTERINA", "ENDOMETRIO", "TROMPA", "MAMOGRAFIA", "MAMARIA"];
            for (let t of terminosFemeninos) {
                if (new RegExp(`(?:^|\\s+)${t}(?:$|\\s+|\\.|,)`, 'i').test(txtUpper)) {
                    mostrarToastAlertaJuntoAlRobot(`⚠️ ALERTA DE SEXO: Paciente MASCULINO pero se menciona "${t}".`, "#ef4444");
                    return true;
                }
            }
        } else if (sexoPaciente === "FEMENINO") {
            const terminosMasculinos = ["PROSTATA", "TESTICULO", "VESICULAS SEMINALES", "ESCROTO", "PENE"];
            for (let t of terminosMasculinos) {
                if (new RegExp(`(?:^|\\s+)${t}(?:$|\\s+|\\.|,)`, 'i').test(txtUpper)) {
                    mostrarToastAlertaJuntoAlRobot(`⚠️ ALERTA DE SEXO: Paciente FEMENINO pero se menciona "${t}".`, "#ef4444");
                    return true;
                }
            }
        }

        const hallazgoAnatomico = determinarRegionAnatomicaTermino(txtUpper);
        if (hallazgoAnatomico) {
            let regionEstudio = "";
            if (tituloEstudio.includes("COLUMNA") || tituloEstudio.includes("LUMBAR") || tituloEstudio.includes("DORSAL") || tituloEstudio.includes("CERVICAL")) regionEstudio = "COLUMNA";
            else if (tituloEstudio.includes("TORAX") || tituloEstudio.includes("PULMON")) regionEstudio = "TORAX";
            else if (tituloEstudio.includes("ABDOMEN") || tituloEstudio.includes("PELVIS")) regionEstudio = "ABDOMEN_PELVIS";
            else if (tituloEstudio.includes("CEREBRO") || tituloEstudio.includes("ENCÉFALO") || tituloEstudio.includes("CRANEO") || tituloEstudio.includes("ORBITAS")) regionEstudio = "CABEZA_CUELLO";

            if (regionEstudio && hallazgoAnatomico.region !== regionEstudio) {
                const nombreRegion = hallazgoAnatomico.region.replace('_', ' ');
                mostrarToastAlertaJuntoAlRobot(`⚠️ ALERTA DE ANATOMÍA: El estudio solicitado es "${tituloEstudio}", pero se informan hallazgos de la región [${nombreRegion}: "${hallazgoAnatomico.palabraEncontrada}"]. Verifique si corresponde a otra zona.`, "#ef4444");
                return true;
            }
        }

        const hallazgosCriticos = [
            "NEUMOTORAX", "NEUMOPERITONEO", "HEMOPERITONEO", "TEP", "EMBOLIA PULMONAR", 
            "FRACTURA", "ACV", "ISQUEMIA", "SANGRAMIENTO", "HEMORRAGIA", "ACUMULO DE AIRE",
            "OBSTRUCCION INTESTINAL", "VOLVULO", "ISQUEMIA MESENTERICA", "HERNIACION",
            "ANEURISMA ROTO", "DISSECCION AORTICA", "HEMATOMA SUBDURAL", "EPIDURAL", "TAMPONAMIENTO"
        ];

        for (let critico of hallazgosCriticos) {
            if (new RegExp(`(?:^|\\s+)${critico}(?:$|\\s+|\\.|,)`, 'i').test(txtUpper)) {
                mostrarToastAlertaJuntoAlRobot(`🚨 ALERTA CRÍTICA: Hallazgo urgente de ${critico} detectado en el informe.`, "#ef4444");
                return true;
            }
        }

        limpiarAlertaVisible();
        return false;
    }

    function ejecutarAuditoriaIaInforme() {
        if (!estaFichaInformeAbierta()) return;

        const campos = obtenerCamposDalca();
        const textoCompleto = ((campos.antecedentes ? campos.antecedentes.innerText || campos.antecedentes.value || "" : "") + " " +
                              (campos.hallazgos ? campos.hallazgos.innerText || campos.hallazgos.value || "" : "") + " " +
                              (campos.impresion ? campos.impresion.innerText || campos.impresion.value || "" : "")).trim();

        if (!textoCompleto || textoCompleto.length === 0) {
            limpiarAlertaVisible();
            return;
        }

        const seDisparoLocal = verificarAlertasUniversalInstantaneas(textoCompleto);
        if (seDisparoLocal) return;

        if (debounceAuditoria) clearTimeout(debounceAuditoria);
        debounceAuditoria = setTimeout(async () => {
            try {
                const resp = await fetch('http://127.0.0.1:3000/auditar-informe-universal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        textoInforme: textoCompleto,
                        tituloEstudio: obtenerTituloRealEstudio(),
                        sexoPaciente: obtenerSexoPaciente()
                    })
                });

                if (resp.ok) {
                    const data = await resp.json();
                    if (data.tieneAlerta && data.alertas && data.alertas.length > 0) {
                        for (let alt of data.alertas) {
                            mostrarToastAlertaJuntoAlRobot(`🚨 ALERTA EVA [${alt.tipo}]: ${alt.mensaje}`, "#ef4444");
                        }
                    } else {
                        limpiarAlertaVisible();
                    }
                }
            } catch(e) {}
        }, 800);
    }

    // 🛡️ INYECCIÓN PROTEGIDA Y ANTIBORRADO
    async function inyectarTextoDirecto(element, texto) {
        if (!element || texto === undefined || texto === null) return false;
        
        const textoLimpio = texto.trim();
        if (textoLimpio.length === 0) return false; // Aborta si el texto entrante está vacío para no borrar el contenido

        let target = resolverElementoEditableProfundo(element);

        try {
            target.focus();
            await new Promise(r => setTimeout(r, 20));

            const htmlFormateado = textoLimpio.split('\n').map(linea => `<p>${linea || '<br>'}</p>`).join('');

            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                target.value = textoLimpio;
            } else {
                target.innerHTML = htmlFormateado;
            }

            const eventos = ['compositionstart', 'input', 'change', 'compositionend', 'keyup', 'blur'];
            for (let evName of eventos) {
                target.dispatchEvent(new Event(evName, { bubbles: true, cancelable: true }));
            }

            ejecutarAuditoriaIaInforme();
            return true;
        } catch (e) {
            return false;
        }
    }

    function extraerTresSecciones(textoCompleto) {
        if (!textoCompleto) return { ant: "", hal: "", imp: "" };
        let ant = "", hal = "", imp = "";
        const txt = textoCompleto.replace(/\r\n/g, "\n").trim();

        const regexAnt = /ANTECEDENTES\s*:?\s*/i;
        const regexHal = /HALLAZGOS\s*:?\s*/i;
        const regexImp = /(?:IMPRESI[ÓO]N|CONCLUSI[ÓO]N)\s*:?\s*/i;

        const posAnt = txt.search(regexAnt);
        const posHal = txt.search(regexHal);
        const posImp = txt.search(regexImp);

        if (posImp !== -1) {
            imp = txt.substring(posImp).replace(regexImp, '').trim();
            if (posHal !== -1 && posHal < posImp) {
                hal = txt.substring(posHal, posImp).replace(regexHal, '').trim();
                ant = (posAnt !== -1 && posAnt < posHal) ? txt.substring(posAnt, posHal).replace(regexAnt, '').trim() : "";
            } else {
                hal = txt.substring(0, posImp).replace(regexHal, '').trim();
            }
            return { ant, hal, imp };
        }

        const bloques = txt.split(/\n\s*\n/).map(b => b.trim()).filter(b => b.length > 0);
        if (bloques.length >= 3) {
            ant = bloques[0].replace(regexAnt, '').trim();
            hal = bloques[1].replace(regexHal, '').trim();
            imp = bloques.slice(2).join("\n\n").replace(regexImp, '').trim();
        } else if (bloques.length === 2) {
            hal = bloques[0].replace(regexHal, '').trim();
            imp = bloques[1].replace(regexImp, '').trim();
        } else {
            hal = txt;
            imp = txt;
        }

        return { ant, hal, imp };
    }

    async function aplicarPlantillaEstructurada(plantillaData) {
        if (!plantillaData) return false;

        limpiarAlertaVisible();

        const camposDalca = obtenerCamposDalca();
        if (procesandoTransferencia) return false;
        procesandoTransferencia = true;

        try {
            const textoCompleto = typeof plantillaData === 'string' ? plantillaData : (plantillaData.texto || "");
            const { ant, hal, imp } = extraerTresSecciones(textoCompleto);

            let exito = false;
            if (camposDalca.antecedentes && ant && ant.length > 0) {
                await inyectarTextoDirecto(camposDalca.antecedentes, ant);
                exito = true;
            }
            if (camposDalca.hallazgos && hal && hal.length > 0) {
                await inyectarTextoDirecto(camposDalca.hallazgos, hal);
                exito = true;
            }
            if (camposDalca.impresion && imp && imp.length > 0) {
                await inyectarTextoDirecto(camposDalca.impresion, imp);
                exito = true;
            }

            preinformeOfrecidoParaEstudio = true;
            mostrarToastRadAssist(exito ? "✅ Informe transferido a Dalca" : "⚠️ Verifique los campos de Dalca");
            return exito;
        } finally {
            procesandoTransferencia = false;
        }
    }

    function extraerBase64DelVisor() {
        const documentos = [document];
        document.querySelectorAll('iframe').forEach(frame => {
            try { if (frame.contentDocument) documentos.push(frame.contentDocument); } catch(e) {}
        });

        for (let doc of documentos) {
            const canvases = Array.from(doc.querySelectorAll('canvas'));
            for (let c of canvases) {
                if (c.offsetWidth > 150) {
                    try {
                        const data = c.toDataURL('image/jpeg', 0.85);
                        if (data && data.length > 1000) return data;
                    } catch(e) {}
                }
            }
        }
        return null;
    }

    function alternarMenuRobot() {
        if (esIframe) {
            if (window.top) window.top.postMessage({ type: "RADASSIST_TOGGLE_MENU" }, "*");
            return;
        }

        const menuViejo = document.getElementById('radassist-menu-robot');
        if (menuViejo) {
            menuViejo.remove();
            return;
        }

        const enWorklist = esPaginaWorklist();

        const ball = document.getElementById('radassist-robot-ball');
        const rectBall = ball ? ball.getBoundingClientRect() : { top: window.innerHeight - 150, left: window.innerWidth - 370 };

        const menu = document.createElement('div');
        menu.id = 'radassist-menu-robot';
        
        let posBottom = Math.max(20, window.innerHeight - rectBall.top);
        let posRight = Math.max(20, window.innerWidth - rectBall.right);

        menu.style.cssText = `
            position: fixed !important;
            bottom: ${Math.min(window.innerHeight - 520, posBottom)}px !important;
            right: ${posRight}px !important;
            background: #090e1a !important;
            color: #ffffff !important;
            padding: 14px !important;
            border-radius: 16px !important;
            box-shadow: 0 20px 50px rgba(0,0,0,0.9), 0 0 0 1px #1e293b, 0 0 25px rgba(56, 189, 248, 0.25) !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            width: 350px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
            backdrop-filter: blur(12px) !important;
            user-select: none !important;
        `;

        if (enWorklist) {
            menu.innerHTML = `
                <div id="eva-drag-handle" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 8px; cursor: move;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 12px rgba(56, 189, 248, 0.5);">
                            <img src="${ROBOT_ICON_URL}" style="width: 22px; height: 22px; object-fit: contain; pointer-events: none;">
                        </div>
                        <div>
                            <div style="font-weight: 800; font-size: 14px; color: #ffffff;">EVA Copilot</div>
                            <div style="font-weight: 700; font-size: 10px; color: #10b981;">Modo Consulta Médica</div>
                        </div>
                    </div>
                    <button id="close-rad-menu" style="background: rgba(255,255,255,0.05); border: 1px solid #334155; color: #94a3b8; width: 24px; height: 24px; border-radius: 6px; font-size: 12px; cursor: pointer;">✕</button>
                </div>

                <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid #1e293b; padding: 10px; border-radius: 10px;">
                    <div style="font-weight: 800; font-size: 12px; color: #ffffff;">👋 ¡Hola, ${perfilRadAssist.nombreCorto}!</div>
                    <div style="font-size: 10px; color: #cbd5e1; margin-top: 4px;">
                        Seleccione un estudio para abrir el visor y comenzar a redactar el informe.
                    </div>
                </div>

                <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid #1e293b; padding: 8px 10px; border-radius: 10px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; align-items: center; gap: 4px; font-size: 10px; color: #ffffff; font-weight: 800; text-transform: uppercase;">
                        <span>💬</span> CONSULTA CLÍNICA O PROTOCOLO
                    </div>
                    <div id="jarvis-chat-response" style="font-size: 10px; color: #cbd5e1; max-height: 80px; overflow-y: auto; display: none; background: #020617; padding: 6px; border-radius: 6px; line-height: 1.3;"></div>
                    <div style="display: flex; gap: 6px;">
                        <input id="jarvis-chat-input" type="text" placeholder="Ej: Criterios BI-RADS 3 en mamografía..." style="flex: 1; background: #020617; border: 1px solid #334155; color: white; border-radius: 6px; padding: 6px 8px; font-size: 10px; outline: none;" />
                        <button id="jarvis-chat-send" style="background: #0284c7; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-weight: bold; font-size: 10px; cursor: pointer;">
                            Consultar ✈️
                        </button>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1e293b; padding-top: 6px; font-size: 9px; color: #64748b;">
                    <div style="display: flex; align-items: center; gap: 4px; color: #10b981; font-weight: 700;">
                        🛡️ EVA Copilot Activa
                    </div>
                </div>
            `;
        } else {
            const tituloEstudioActual = obtenerTituloRealEstudio();
            const ubicacionActiva = obtenerUbicacionOSliceActivo();

            menu.innerHTML = `
                <div id="eva-drag-handle" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 8px; cursor: move;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: radial-gradient(circle, #38bdf8 0%, #0284c7 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 12px rgba(56, 189, 248, 0.5);">
                            <img src="${ROBOT_ICON_URL}" style="width: 22px; height: 22px; object-fit: contain; pointer-events: none;">
                        </div>
                        <div>
                            <div style="font-weight: 800; font-size: 14px; color: #ffffff; letter-spacing: 0.5px; line-height: 1;">EVA</div>
                            <div style="font-weight: 700; font-size: 10px; color: #38bdf8; margin-top: 1px;">Copiloto Radiológico Senior</div>
                        </div>
                    </div>
                    <button id="close-rad-menu" style="background: rgba(255,255,255,0.05); border: 1px solid #334155; color: #94a3b8; width: 24px; height: 24px; border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✕</button>
                </div>

                <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.6)); border: 1px solid #1e293b; padding: 10px; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 16px;">👋</span>
                        <div>
                            <div style="font-weight: 800; font-size: 12px; color: #ffffff;">¡Hola, ${perfilRadAssist.nombreCorto}!</div>
                            <div style="font-size: 10px; color: #cbd5e1; margin-top: 1px; line-height: 1.2;">
                                <strong style="color:#38bdf8;">"${tituloEstudioActual}"</strong><br>
                                <span style="font-size:9px; color:#10b981;">📍 ${ubicacionActiva}</span>
                            </div>
                        </div>
                    </div>
                    <button id="btn-generar-robot" style="background: #0284c7; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-weight: 700; font-size: 10px; cursor: pointer; white-space: nowrap; box-shadow: 0 0 10px rgba(56,189,248,0.3);">
                        ✨ Pre-informe IA
                    </button>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px;">
                    <button id="btn-auto-conclusion" style="background: rgba(15, 23, 42, 0.9); border: 1px solid #334155; color: #38bdf8; padding: 7px 4px; border-radius: 8px; font-size: 9px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        🎯 Conclusión
                    </button>
                    <button id="btn-corregir-tarjeta" style="background: rgba(15, 23, 42, 0.9); border: 1px solid #a855f7; color: #c084fc; padding: 7px 4px; border-radius: 8px; font-size: 9px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        🪄 Corregir
                    </button>
                    <button id="btn-traducir-paciente" style="background: rgba(15, 23, 42, 0.9); border: 1px solid #334155; color: #10b981; padding: 7px 4px; border-radius: 8px; font-size: 9px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        👨‍👩‍👧 Paciente
                    </button>
                </div>

                <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid #1e293b; padding: 8px 10px; border-radius: 10px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; align-items: center; gap: 4px; font-size: 10px; color: #ffffff; font-weight: 800; text-transform: uppercase;">
                        <span>💬</span> CONSULTA CLÍNICA DE IA
                    </div>
                    <div id="jarvis-chat-response" style="font-size: 10px; color: #cbd5e1; max-height: 120px; overflow-y: auto; display: none; background: #020617; padding: 8px; border-radius: 6px; line-height: 1.3;"></div>
                    <div style="display: flex; gap: 6px;">
                        <input id="jarvis-chat-input" type="text" placeholder="Escriba una duda clínica..." style="flex: 1; background: #020617; border: 1px solid #334155; color: white; border-radius: 6px; padding: 6px 8px; font-size: 10px; outline: none;" />
                        <button id="jarvis-chat-send" style="background: #0284c7; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-weight: bold; font-size: 10px; cursor: pointer;">
                            Enviar ✈️
                        </button>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #1e293b; padding-top: 6px; font-size: 9px; color: #64748b;">
                    <div style="display: flex; align-items: center; gap: 4px; color: #10b981; font-weight: 700;">
                        🛡️ EVA Copilot Activa | EVA v2.5.8
                    </div>
                </div>
            `;
        }

        document.body.appendChild(menu);

        const handleDrag = document.getElementById('eva-drag-handle');
        let isMenuDragging = false, dragX = 0, dragY = 0;

        handleDrag.addEventListener('mousedown', (e) => {
            if (e.target.id === 'close-rad-menu') return;
            isMenuDragging = true;
            dragX = e.clientX - menu.offsetLeft;
            dragY = e.clientY - menu.offsetTop;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isMenuDragging) return;
            menu.style.left = `${e.clientX - dragX}px`;
            menu.style.top = `${e.clientY - dragY}px`;
            menu.style.bottom = 'auto';
            menu.style.right = 'auto';
        });

        window.addEventListener('mouseup', () => { isMenuDragging = false; });

        document.getElementById('close-rad-menu').onclick = () => menu.remove();

        const btnTraducirPaciente = document.getElementById('btn-traducir-paciente');
        if (btnTraducirPaciente) {
            btnTraducirPaciente.onclick = async () => {
                const campos = obtenerCamposDalca();
                const textoInformeCompleto = ((campos.hallazgos ? campos.hallazgos.innerText || campos.hallazgos.value || "" : "") + " " +
                                             (campos.impresion ? campos.impresion.innerText || campos.impresion.value || "" : "")).trim();

                if (!textoInformeCompleto) {
                    mostrarToastRadAssist("⚠️ Redacte un informe antes de consultar la versión paciente.");
                    return;
                }

                mostrarToastRadAssist("👨‍👩‍👧 Generando explicación para el paciente...");

                try {
                    const resp = await fetch('http://127.0.0.1:3000/traducir-para-paciente', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ informe: textoInformeCompleto })
                    });

                    if (resp.ok) {
                        const data = await resp.json();
                        const chatBox = document.getElementById('jarvis-chat-response');
                        if (chatBox && data.explicacionPaciente) {
                            chatBox.style.display = 'block';
                            
                            const textoLimpio = data.explicacionPaciente;

                            chatBox.innerHTML = `
                                <div style="font-weight: 800; color: #10b981; margin-bottom: 6px; font-size: 11px;">👨‍👩‍👧 Resumen para el paciente:</div>
                                <div style="margin-bottom: 8px; color: #e2e8f0; font-size: 10px; line-height: 1.3;">${textoLimpio}</div>
                                <div style="display: flex; gap: 6px;">
                                    <button id="btn-copiar-resumen" style="background: #334155; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 9px; cursor: pointer;">📋 Copiar</button>
                                    <button id="btn-imprimir-resumen" style="background: #0284c7; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 9px; cursor: pointer; font-weight: bold;">🖨️ Imprimir</button>
                                </div>
                            `;

                            document.getElementById('btn-copiar-resumen').onclick = () => {
                                navigator.clipboard.writeText(textoLimpio);
                                mostrarToastRadAssist("📋 Copiado al portapapeles");
                            };

                            document.getElementById('btn-imprimir-resumen').onclick = () => {
                                const ventana = window.open('', '_blank', 'width=580,height=480');
                                
                                const doc = ventana.document;
                                doc.title = `Resumen Paciente - ${perfilRadAssist.nombreCompleto}`;

                                const style = doc.createElement('style');
                                style.textContent = `@media print { .no-imprimir { display: none !important; } }`;
                                doc.head.appendChild(style);

                                doc.body.style.cssText = "font-family: Arial, sans-serif; padding: 35px; line-height: 1.6; color: #1e293b; background: #ffffff;";

                                const titulo = doc.createElement('h2');
                                titulo.style.cssText = "color: #0284c7; margin-top: 0; margin-bottom: 4px; font-size: 18px;";
                                titulo.innerText = "Resumen Clínico Informativo para el Paciente";

                                const subTitulo = doc.createElement('div');
                                subTitulo.style.cssText = "font-size: 11px; color: #64748b; border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 20px; font-weight: bold;";
                                subTitulo.innerText = `${perfilRadAssist.nombreCompleto}  •  Generado con asistencia de EVA Copilot IA`;

                                const parrafo = doc.createElement('p');
                                parrafo.style.cssText = "font-size: 13px; text-align: justify; color: #334155; background: #f8fafc; padding: 15px; border-radius: 6px;";
                                parrafo.innerText = textoLimpio;

                                const btnImprimir = doc.createElement('button');
                                btnImprimir.className = "no-imprimir";
                                btnImprimir.style.cssText = "background: #0284c7; color: white; border: none; padding: 10px 22px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 12px; margin-top: 20px;";
                                btnImprimir.innerText = "🖨️ Imprimir Documento";
                                btnImprimir.onclick = () => ventana.print();

                                const hr = doc.createElement('hr');
                                hr.style.cssText = "margin-top: 35px; border: none; border-top: 1px solid #e2e8f0;";

                                const nota = doc.createElement('small');
                                nota.style.cssText = "color: #94a3b8; font-size: 10px; display: block; margin-top: 10px; text-align: center;";
                                nota.innerText = "Este documento es una guía explicativa redactada en lenguaje sencillo por EVA Copilot IA para acompañar la consulta médica. No sustituye el informe radiológico diagnóstico oficial.";

                                doc.body.appendChild(titulo);
                                doc.body.appendChild(subTitulo);
                                doc.body.appendChild(parrafo);
                                doc.body.appendChild(btnImprimir);
                                doc.body.appendChild(hr);
                                doc.body.appendChild(nota);
                            };
                        }
                    }
                } catch(e) {}
            };
        }

        // =========================================================================
        // 🪄 CORRECCIÓN INDIVIDUAL SEGURA (MANTIENE intactas LAS OTRAS SECCIONES)
        // =========================================================================
        const btnCorregirTarjeta = document.getElementById('btn-corregir-tarjeta');
        if (btnCorregirTarjeta) {
            btnCorregirTarjeta.onclick = async () => {
                const campos = obtenerCamposDalca();
                let alMenosUnoCorregido = false;

                mostrarToastRadAssist("🧠 EVA IA corrigiendo estilo u ortografía...");

                const listaTrabajo = [
                    { elem: campos.antecedentes, nombre: "Antecedentes" },
                    { elem: campos.hallazgos, nombre: "Hallazgos" },
                    { elem: campos.impresion, nombre: "Impresión" }
                ];

                for (let item of listaTrabajo) {
                    if (item.elem) {
                        const txtOriginal = (item.elem.innerText || item.elem.value || "").trim();
                        if (txtOriginal.length > 1) {
                            try {
                                const resp = await fetch('http://127.0.0.1:3000/corregir-informe-ia', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ texto: txtOriginal })
                                });
                                if (resp.ok) {
                                    const data = await resp.json();
                                    // SOLO INYECTAR SI EL TEXTO DEVUELTO TIENE CONTENIDO REAL
                                    if (data.textoCorregido && data.textoCorregido.trim().length > 0) {
                                        await inyectarTextoDirecto(item.elem, data.textoCorregido);
                                        alMenosUnoCorregido = true;
                                    }
                                }
                            } catch(e) {}
                        }
                    }
                }

                mostrarToastRadAssist(alMenosUnoCorregido ? "✅ Texto corregido con éxito" : "⚠️ Escriba o dicte texto antes de corregir");
            };
        }

        const btnAutoConclusion = document.getElementById('btn-auto-conclusion');
        if (btnAutoConclusion) {
            btnAutoConclusion.onclick = async () => {
                const campos = obtenerCamposDalca();
                const hallazgosTexto = campos.hallazgos ? (campos.hallazgos.innerText || campos.hallazgos.value || "") : "";

                mostrarToastRadAssist("🎯 Sintetizando impresión diagnóstica...");
                
                try {
                    const resp = await fetch('http://127.0.0.1:3000/generar-conclusion-automatica', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hallazgos: hallazgosTexto, estudio: obtenerTituloRealEstudio() })
                    });

                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.impresion && campos.impresion) {
                            await inyectarTextoDirecto(campos.impresion, data.impresion);
                            mostrarToastRadAssist("✅ Impresión inyectada");
                        }
                    }
                } catch(e) {}
            };
        }

        const btnGenerar = document.getElementById('btn-generar-robot');
        if (btnGenerar) {
            btnGenerar.onclick = async () => {
                menu.remove();
                mostrarToastRadAssist("🧠 EVA IA analizando imagen...");

                const canvasImg = extraerBase64DelVisor();
                const tituloEstudio = obtenerTituloRealEstudio();
                const corteActivo = obtenerUbicacionOSliceActivo();

                try {
                    const resp = await fetch('http://127.0.0.1:3000/analizar-e-informar-ia', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            imagenBase64: canvasImg,
                            estudio: tituloEstudio,
                            corte: corteActivo,
                            sexo: obtenerSexoPaciente()
                        })
                    });

                    if (resp.ok) {
                        const data = await resp.json();
                        if (data.texto) await aplicarPlantillaEstructurada(data.texto);
                    }
                } catch(e) {
                    mostrarToastRadAssist("⚠️ Error al comunicarse con EVA IA");
                }
            };
        }
    }

    function mostrarBurbujaProactivaEva() {
        if (esIframe || !estaFichaInformeAbierta() || preinformeOfrecidoParaEstudio) return;

        const ball = document.getElementById('radassist-robot-ball');
        const rectBall = ball ? ball.getBoundingClientRect() : { top: window.innerHeight - 150, left: window.innerWidth - 120 };

        let burbuja = document.getElementById('eva-speech-bubble');
        if (burbuja) burbuja.remove();

        burbuja = document.createElement('div');
        burbuja.id = 'eva-speech-bubble';

        const doctorNombre = perfilRadAssist.nombreCorto;
        const ubicacionActiva = obtenerUbicacionOSliceActivo();

        burbuja.style.cssText = `
            position: fixed !important;
            bottom: ${window.innerHeight - rectBall.top + 10}px !important;
            right: ${window.innerWidth - rectBall.right + 10}px !important;
            background: linear-gradient(135deg, #090e1a 0%, #1e293b 100%) !important;
            color: #ffffff !important;
            border: 2px solid #38bdf8 !important;
            border-radius: 16px !important;
            padding: 14px 16px !important;
            font-size: 11px !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            box-shadow: 0 12px 35px rgba(0,0,0,0.9), 0 0 25px rgba(56, 189, 248, 0.4) !important;
            z-index: 2147483647 !important;
            width: 290px !important;
            line-height: 1.4 !important;
            backdrop-filter: blur(10px) !important;
        `;

        burbuja.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #334155; padding-bottom: 6px;">
                <div style="font-weight: 800; color: #38bdf8; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                    🤖 EVA Copilot
                </div>
                <button id="btn-cerrar-burbuja" style="background: none; border: none; color: #64748b; font-size: 12px; cursor: pointer;">✕</button>
            </div>
            <div style="font-size: 11px; color: #e2e8f0; margin-bottom: 10px;">
                ¡<strong>${doctorNombre}</strong>! En la serie <span style="color:#10b981; font-weight:bold;">${ubicacionActiva}</span>, ¿desea que redacte el pre-informe o genere las conclusiones?
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <button id="btn-burbuja-preinforme" style="background: #0284c7; color: white; border: none; padding: 8px; border-radius: 8px; font-weight: 700; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 0 12px rgba(56,189,248,0.3);">
                    ✨ Pre-informe IA
                </button>
                <button id="btn-burbuja-conclusion" style="background: rgba(15, 23, 42, 0.9); border: 1px solid #38bdf8; color: #38bdf8; padding: 7px; border-radius: 8px; font-weight: 700; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    🎯 Auto-Conclusión
                </button>
            </div>
        `;

        document.body.appendChild(burbuja);

        document.getElementById('btn-cerrar-burbuja').onclick = () => {
            burbuja.remove();
            preinformeOfrecidoParaEstudio = true;
        };

        document.getElementById('btn-burbuja-preinforme').onclick = async () => {
            burbuja.remove();
            preinformeOfrecidoParaEstudio = true;
            mostrarToastRadAssist("🧠 EVA IA procesando pre-informe...");

            const canvasImg = extraerBase64DelVisor();
            const tituloEstudio = obtenerTituloRealEstudio();
            const corteActivo = obtenerUbicacionOSliceActivo();

            try {
                const resp = await fetch('http://127.0.0.1:3000/analizar-e-informar-ia', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagenBase64: canvasImg,
                        estudio: tituloEstudio,
                        corte: corteActivo,
                        sexo: obtenerSexoPaciente()
                    })
                });

                if (resp.ok) {
                    const data = await resp.json();
                    if (data.texto) await aplicarPlantillaEstructurada(data.texto);
                }
            } catch(e) {
                mostrarToastRadAssist("⚠️ Error al comunicarse con EVA IA");
            }
        };

        document.getElementById('btn-burbuja-conclusion').onclick = async () => {
            burbuja.remove();
            const campos = obtenerCamposDalca();
            const hallazgosTexto = campos.hallazgos ? (campos.hallazgos.innerText || campos.hallazgos.value || "") : "";

            mostrarToastRadAssist("🎯 Sintetizando conclusión...");

            try {
                const resp = await fetch('http://127.0.0.1:3000/generar-conclusion-automatica', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hallazgos: hallazgosTexto, estudio: obtenerTituloRealEstudio() })
                });

                if (resp.ok) {
                    const data = await resp.json();
                    if (data.impresion && campos.impresion) {
                        await inyectarTextoDirecto(campos.impresion, data.impresion);
                        mostrarToastRadAssist("✅ Impresión inyectada");
                    }
                }
            } catch(e) {}
        };
    }

    function verificarCambioDeEstudioOAutoRefresh() {
        if (esIframe) return;

        if (!estaFichaInformeAbierta()) {
            const ball = document.getElementById('radassist-robot-ball');
            if (ball) ball.remove();

            const menu = document.getElementById('radassist-menu-robot');
            if (menu) menu.remove();

            limpiarAlertaVisible();

            const burbuja = document.getElementById('eva-speech-bubble');
            if (burbuja) burbuja.remove();

            preinformeOfrecidoParaEstudio = false;
            return;
        }

        const identificadorActual = obtenerTituloRealEstudio() + "_" + obtenerSexoPaciente() + "_" + obtenerUbicacionOSliceActivo();

        if (identificadorActual !== estudioNotificadoActual) {
            estudioNotificadoActual = identificadorActual;
            preinformeOfrecidoParaEstudio = false;

            limpiarAlertaVisible();

            const burbuja = document.getElementById('eva-speech-bubble');
            if (burbuja) burbuja.remove();

            if (timerProactivo) clearTimeout(timerProactivo);

            timerProactivo = setTimeout(() => {
                mostrarBurbujaProactivaEva();
            }, 20000);
        }

        ejecutarAuditoriaIaInforme();
    }

    function asegurarRobotFlotante() {
        if (esIframe || !document.body || !estaFichaInformeAbierta()) return;

        let ball = document.getElementById('radassist-robot-ball');
        if (!ball) {
            ball = document.createElement('div');
            ball.id = 'radassist-robot-ball';
            
            let savedBottom = localStorage.getItem('radassist_robot_bottom') || "110";
            let savedRight = localStorage.getItem('radassist_robot_right') || "90";

            ball.style.cssText = `
                position: fixed !important;
                bottom: ${savedBottom}px !important;
                right: ${savedRight}px !important;
                width: 60px !important;
                height: 60px !important;
                border-radius: 50% !important;
                background: transparent !important;
                filter: drop-shadow(0px 0px 12px rgba(56, 189, 248, 0.9)) !important;
                cursor: grab !important;
                z-index: 2147483647 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                user-select: none !important;
            `;

            const img = document.createElement('img');
            img.src = ROBOT_ICON_URL;
            img.style.cssText = "width: 100%; height: 100%; object-fit: contain; pointer-events: none;";
            ball.appendChild(img);
            document.body.appendChild(ball);

            let isDragging = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

            ball.addEventListener('mousedown', (e) => {
                isDragging = false;
                startX = e.clientX;
                startY = e.clientY;

                const rect = ball.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;

                const onMouseMove = (moveEvent) => {
                    const dx = moveEvent.clientX - startX;
                    const dy = moveEvent.clientY - startY;

                    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                        isDragging = true;
                        ball.style.cursor = 'grabbing';
                        
                        let newLeft = initialLeft + dx;
                        let newTop = initialTop + dy;

                        ball.style.left = `${newLeft}px`;
                        ball.style.top = `${newTop}px`;
                        ball.style.bottom = 'auto';
                        ball.style.right = 'auto';
                    }
                };

                const onMouseUp = () => {
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                    ball.style.cursor = 'grab';

                    if (isDragging) {
                        const finalRect = ball.getBoundingClientRect();
                        const finalBottom = window.innerHeight - finalRect.bottom;
                        const finalRight = window.innerWidth - finalRect.right;
                        localStorage.setItem('radassist_robot_bottom', finalBottom);
                        localStorage.setItem('radassist_robot_right', finalRight);
                    }
                };

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
            });

            ball.addEventListener('click', (e) => {
                if (!isDragging) {
                    alternarMenuRobot();
                }
            });
        }
    }

    function mostrarToastRadAssist(msg) {
        let toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; background: #0f172a; color: #38bdf8;
            padding: 10px 16px; border-radius: 8px; border: 1px solid #38bdf8;
            font-family: sans-serif; font-size: 12px; font-weight: 700; z-index: 2147483647;
            box-shadow: 0 8px 20px rgba(0,0,0,0.6);
        `;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    setInterval(() => {
        if (!esIframe) {
            asegurarRobotFlotante();
            verificarCambioDeEstudioOAutoRefresh();

            if (!procesandoTransferencia && estaFichaInformeAbierta()) {
                fetch('http://127.0.0.1:3000/obtener-orden-transferencia')
                    .then(res => res.json())
                    .then(async data => {
                        if (data && data.transferir && data.texto) {
                            await aplicarPlantillaEstructurada(data.texto);
                        }
                    })
                    .catch(() => {});
            }
        }
    }, 300);

})();