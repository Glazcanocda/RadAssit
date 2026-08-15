# EVA Medical AI 🚀

> Copiloto Radiológico Inteligente para Integración RIS/PACS (Dalca)

**EVA Medical AI** es un asistente clínico avanzado diseñado para radiólogos, que integra un motor de Inteligencia Artificial (Llama 3.3 70B & Vision vía Groq) directamente sobre el visor RIS/PACS Dalca. Optimiza la redacción de pre-informes, realiza auditorías clínicas en tiempo real y genera resúmenes divulgativos para pacientes.

---

## 🌟 Características Principales

### 🧠 1. Generación y Pre-Informes IA
- **Análisis de Imágenes DICOM:** Captura y analiza el canvas del visor activo en Dalca.
- **Formato Narrativo Fluido:** Redacción clínica estructurada sin viñetas, guiones ni markdown invasivo.
- **Auto-Conclusión:** Sintetiza hallazgos complejos en una impresión diagnóstica ejecutiva en segundos.

### 🛡️ 2. Auditoría Clínica Universal & Alertas Proactivas
- **Alertas Incongruentes de Sexo:** Detecta en tiempo real incoherencias anatómicas según el género del paciente (ej. *próstata/testículo* en pacientes femeninos o *ovarios/útero/mamografía* en masculinos).
- **Control Anatómico y de Plantillazos:** Identifica menciones de zonas corporales ajenas al título del estudio (ej. *hallazgos de rodilla o mano* en una *TC de Columna*).
- **Detección de Patología Crítica de Urgencia:** Gatilla alertas destacadas neón ante hallazgos de alta sospecha (*neumotórax, TEP, ACV, fracturas, sangrados*).
- **Resiliencia Visual Antiparpadeo:** Sistema de renderizado estable sobre el nodo flotante del robot EVA sin interferir con la navegación del médico.

### 👨‍👩‍👧 3. Generador de Resúmenes para el Paciente
- **Traducción a Lenguaje Sencillo:** Convierte la jerga médica a un tono amable, claro y tranquilizador.
- **Herramientas de Entrega:** Botón de copiado al portapapeles y módulo de impresión en vista previa.
- **Diseño de Impresión Limpio:** Formato con encabezado oficial del profesional (*Dr. [Nombre] • EVA Copilot IA*) que oculta los elementos interactivos al imprimir o exportar a PDF.

### 👨‍⚕️ 4. Arquitectura Multi-Usuario y Multi-Centro
- **Identidad Dinámica:** Sincronización asíncrona entre el backend local de Electron (`main.js`) y el content-script inyectado en el navegador (`extension/content.js`).

---

## 🛠️ Requisitos del Sistema & Instalación

1. **Entorno Node.js:** v18.x o superior.
2. **Dependencias:**
   ```bash
   npm install express cors groq-sdk dotenv electron
