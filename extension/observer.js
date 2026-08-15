(function () {
    const scan = () => {
        const check = (el) => {
            if (!el) return;
            const text = (el.innerText || el.textContent || "").toLowerCase();
            const criticals = window.RadAssist?.criticalFindings || {};
            
            Object.keys(criticals).forEach(term => {
                if (text.includes(term.toLowerCase())) {
                    el.style.setProperty("border", "4px solid red", "important");
                }
            });
        };

        // Escaneo recursivo (incluye Shadow Roots)
        function walk(node) {
            if (node.nodeType === 1) {
                if (node.matches('textarea, [contenteditable="true"]')) check(node);
                if (node.shadowRoot) walk(node.shadowRoot);
            }
            node.childNodes.forEach(walk);
        }
        walk(document.body);
    };

    // Escaneo implacable cada segundo
    setInterval(scan, 1000);
})();