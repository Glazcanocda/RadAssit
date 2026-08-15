console.log("MAIN_BRIDGE INICIO");

async function loadJson(file) {
    try {
        const url = chrome.runtime.getURL(file);
        const response = await fetch(url);
        if (!response.ok) return {};
        return await response.json();
    } catch (error) {
        console.warn("RadAssist: Omitiendo archivo no encontrado:", file);
        return {}; // Devuelve un objeto vacío en lugar de romper la extensión
    }
}
    const [
        medicalDictionary,
        generalSpanish,
        radiologyTerms,
        criticalFindings,
        medicalPhrases,
        abdomenPhrases,
        thoraxPhrases,
        grammarRules
    ] = await Promise.all([
        loadJson("medical_dictionary.json"),
        loadJson("general_spanish.json"),
        loadJson("radiology_terms.json"),
        loadJson("critical_findings.json"),
        loadJson("medical_phrases.json"),
        loadJson("abdomen_phrases.json"),
        loadJson("thorax_phrases.json"),
        loadJson("grammar_rules.json")
    ]);

    window.RadAssist = {
        medicalDictionary,
        generalSpanish,
        radiologyTerms,
        criticalFindings,
        medicalPhrases: { ...medicalPhrases, ...abdomenPhrases, ...thoraxPhrases },
        grammarRules
    };

    console.log("RadAssist: Datos cargados correctamente en MAIN world");
})();