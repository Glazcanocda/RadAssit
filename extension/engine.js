(function () {
    window.RadAssistEngine = {
        replaceAllInEditor: function(editor) {
            if (!editor) return;
            
            // Obtener texto actual
            let currentText = editor.innerText || editor.textContent || "";
            let newText = currentText;
            
            // Aplicar diccionario
            if (window.RadAssist?.medicalDictionary) {
                Object.entries(window.RadAssist.medicalDictionary).forEach(([wrong, right]) => {
                    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
                    newText = newText.replace(regex, right);
                });
            }

            // Inyectar forzadamente para engañar al framework (React/Angular)
            if (currentText !== newText) {
                editor.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, newText);
                console.log("RadAssist: Inyección exitosa vía execCommand.");
            }
        }
    };
})();