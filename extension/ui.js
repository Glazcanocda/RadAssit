(function () {
    const btn = document.createElement("button");
    btn.innerHTML = "CORREGIR INFORME";
    btn.style.cssText = "position:fixed; top:10px; right:300px; z-index:9999999; padding:10px; background:blue; color:white; border:none; cursor:pointer; border-radius:5px;";
    document.body.appendChild(btn);

    btn.onmousedown = (e) => {
        e.preventDefault();
        // Busca el elemento editable activo donde el usuario está escribiendo
        const active = document.activeElement.isContentEditable ? document.activeElement : 
                       document.querySelector('[contenteditable="true"]');
        
        if (window.RadAssistEngine) {
            window.RadAssistEngine.replaceAllInEditor(active);
        } else {
            alert("Motor no cargado, recarga la página.");
        }
    };
})();