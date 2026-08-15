// extension/background.js - Captura Nativa con Control de Cuota Chrome

let capturandoEnCurso = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "CAPTURAR_PANTALLA_VISOR") {
        
        // Si ya hay una captura en proceso, omitir para no saturar la cuota
        if (capturandoEnCurso) {
            sendResponse({ exito: false, error: "Captura omitida por cuota" });
            return false;
        }

        capturandoEnCurso = true;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) {
                capturandoEnCurso = false;
                sendResponse({ exito: false, error: "Sin pestaña activa" });
                return;
            }

            const windowId = tabs[0].windowId;

            chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
                // Liberar el seguro después de 800 ms para cumplir con la cuota de Chrome
                setTimeout(() => { capturandoEnCurso = false; }, 800);

                if (chrome.runtime.lastError) {
                    sendResponse({ exito: false, error: chrome.runtime.lastError.message });
                } else if (!dataUrl) {
                    sendResponse({ exito: false, error: "Sin datos de imagen" });
                } else {
                    sendResponse({ exito: true, imagen: dataUrl });
                }
            });
        });

        return true; // Necesario para la respuesta asíncrona
    }
});