// inlineSuggestions.js - Autocompletado Flotante Nativo para Dalca RIS/PACS

(function() {
    let frasesAutocompletar = {};
    let popupSugerencia = null;
    let sugerenciaActual = "";
    let elementoEditando = null;

    async function cargarFrases() {
        const archivos = [
            'smart_phrases.json',
            'autocomplete.json',
            'thorax_phrases.json',
            'abdomen_phrases.json',
            'medical_phrases.json'
        ];

        for (const file of archivos) {
            try {
                const url = chrome.runtime.getURL(file);
                const data = await fetch(url).then(r => r.json());
                
                if (typeof data === 'object') {
                    Object.keys(data).forEach(key => {
                        const val = data[key];
                        const claveLimpia = key.toLowerCase().trim();
                        if (typeof val === 'string') {
                            frasesAutocompletar[claveLimpia] = val;
                        } else if (typeof val === 'object' && val !== null) {
                            frasesAutocompletar[claveLimpia] = val.texto || val.phrase || val.reemplazo || "";
                        }
                    });
                }
            } catch (e) {}
        }
    }

    cargarFrases();

    function crearPopup() {
        if (document.getElementById('radassist-inline-popup')) return;

        popupSugerencia = document.createElement('div');
        popupSugerencia.id = 'radassist-inline-popup';
        popupSugerencia.style.cssText = `
            position: fixed !important;
            display: none !important;
            background: #0f172a !important;
            color: #f8fafc !important;
            border: 1px solid #38bdf8 !important;
            border-radius: 8px !important;
            padding: 8px 12px !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            font-size: 12px !important;
            box-shadow: 0 10px 25px rgba(0,0,0,0.8) !important;
            z-index: 2147483647 !important;
            max-width: 450px !important;
            cursor: pointer !important;
            line-height: 1.4 !important;
        `;

        document.body.appendChild(popupSugerencia);

        popupSugerencia.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            aplicarSugerencia();
        });
    }

    function mostrarPopup(rect, textoCompleto) {
        if (!popupSugerencia) crearPopup();

        sugerenciaActual = textoCompleto;
        popupSugerencia.innerHTML = `
            <div style="font-size: 9px; color: #38bdf8; font-weight: 800; text-transform: uppercase; margin-bottom: 3px;">
                💡 Autocompletar RadAssist (Presiona TAB o haz clic para aplicar):
            </div>
            <div style="color: #e2e8f0; font-weight: 600;">${textoCompleto}</div>
        `;

        popupSugerencia.style.top = `${rect.bottom + 6}px`;
        popupSugerencia.style.left = `${rect.left}px`;
        popupSugerencia.style.display = 'block';
    }

    function ocultarPopup() {
        if (popupSugerencia) popupSugerencia.style.display = 'none';
        sugerenciaActual = "";
    }

    async function aplicarSugerencia() {
        if (!elementoEditando || !sugerenciaActual) return;

        let target = elementoEditando.isContentEditable ? elementoEditando : elementoEditando.querySelector('[contenteditable="true"]');
        if (!target) target = elementoEditando;

        target.focus();
        target.innerHTML = `<p>${sugerenciaActual}</p>`;

        const ev = new InputEvent('input', { inputType: 'insertText', data: sugerenciaActual, bubbles: true });
        target.dispatchEvent(ev);
        target.dispatchEvent(new Event('change', { bubbles: true }));

        ocultarPopup();
    }

    // Escuchar tipeo en Dalca
    function evaluarTipeo(e) {
        const target = e.target;
        if (!target) return;

        const editorPadre = target.closest('[contenteditable="true"]') || target.closest('[id*="write_"]');
        if (!editorPadre) return;

        elementoEditando = editorPadre;
        const textoEscrito = (editorPadre.innerText || editorPadre.textContent || "").toLowerCase().trim();

        if (textoEscrito.length < 3) {
            ocultarPopup();
            return;
        }

        let coincidencia = null;
        Object.keys(frasesAutocompletar).forEach(key => {
            if (key === textoEscrito || textoEscrito.endsWith(key)) {
                coincidencia = frasesAutocompletar[key];
            }
        });

        if (coincidencia) {
            const rect = editorPadre.getBoundingClientRect();
            mostrarPopup(rect, coincidencia);
        } else {
            ocultarPopup();
        }
    }

    document.addEventListener('input', evaluarTipeo, true);
    document.addEventListener('keyup', evaluarTipeo, true);

    document.addEventListener('keydown', (e) => {
        if (popupSugerencia && popupSugerencia.style.display === 'block') {
            if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                aplicarSugerencia();
            } else if (e.key === 'Escape') {
                ocultarPopup();
            }
        }
    }, true);

})();