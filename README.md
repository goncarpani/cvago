# CVago

**CV + Vago** — Herramienta para candidatos: subís tu CV, analizás ofertas (resumen + compatibilidad con tu perfil) y generás un CV adaptado en Word y PDF para cada posición.

**Flujo en 3 pasos:**

1. **Mi CV** — Subís tu CV (PDF, DOCX o TXT). Se parsea y enriquece automáticamente. Podés comparar con un perfil guardado y guardar como perfil actual.
2. **Posición** — Pegás un link o el texto de la oferta. Un botón obtiene el resumen y analiza la compatibilidad (score, seniority fit, razones a favor/en contra).
3. **CV adaptado** — Elegís idioma (es/en), generás el CV adaptado a esa oferta. Vista previa en PDF y descarga en Word (para editar) o PDF (para enviar).

---

## Requisitos

- **Python 3.11+**
- **Node.js 18+** (para el frontend)
- **OpenAI API Key** (usado para parsear CV, enriquecer perfil, resumir JD, analizar match y generar el CV)

---

## Instalación

### 1. Clonar y entrar al proyecto

```bash
git clone https://github.com/goncarpani/cvago.git
cd cvago
```

### 2. Backend (Python)

```bash
# Crear entorno virtual
python -m venv .venv

# Activar (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Activar (Linux/macOS)
source .venv/bin/activate

# Instalar dependencias (requirements están en backend/)
pip install -r backend/requirements.txt
```

### 3. Variables de entorno

Copiá el ejemplo y completá tu API key:

```bash
cp .env.example .env
```

En `.env`:

```
OPENAI_API_KEY=sk-...
```

Opcional:

- `OPENAI_MODEL=gpt-4o` — modelo para parser, match y generación de CV (por defecto: gpt-4o).
- `OPENAI_SUMMARY_MODEL=gpt-4o-mini` — modelo para resumir la JD (más barato).

### 4. Frontend

```bash
cd frontend
npm install
cd ..
```

---

## Cómo correr el proyecto

**Terminal 1 — Backend:**

```bash
# Desde la raíz del repo, con el venv activado
uvicorn backend.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
```

Abrí **http://localhost:5173** en el navegador. La API corre en **http://localhost:8000**.

---

## Uso

1. **Paso 1 (Mi CV):** Elegí un archivo (PDF, DOCX o TXT). El sistema parsea y enriquece el CV. Revisá el resultado, comparalo con el perfil guardado si hay uno, y hacé clic en **Guardar como perfil** para usarlo en los siguientes pasos.
2. **Paso 2 (Posición):** Pegá la URL de la oferta o el texto de la job description. Clic en **Analizar posición y compatibilidad** para obtener el resumen y el análisis de match (score, seniority fit, razones a favor/en contra).
3. **Paso 3 (CV adaptado):** Seleccioná idioma (Español/English) y **Generar CV adaptado**. Verás la vista previa en PDF y podés **Descargar Word (para editar)** o **Descargar PDF (listo para enviar)**.

El perfil guardado se persiste en `data/profile.json`. Los CVs generados quedan en `backend/generated_cvs/`.

---

## Estructura del repo

```
cvago/
├── backend/               # API FastAPI
│   ├── main.py            # Rutas y entrada
│   ├── cv_parser.py       # CV → JSON
│   ├── cv_enrich.py       # Enriquecimiento del perfil
│   ├── cv_generator.py    # CV adaptado (Word + PDF)
│   ├── match_analyzer.py  # Análisis de compatibilidad
│   ├── services.py        # Resumen de JD, fetch URL
│   └── requirements.txt   # Dependencias del backend
├── frontend/              # React + Vite
│   └── src/
│       └── App.jsx        # UI de 3 pasos
├── data/
│   └── profile.json       # Perfil guardado (local, no subir si es personal)
├── .env.example
└── README.md
```

**Importante:** `data/profile.json` está en `.gitignore`. Cada persona que clone el repo arranca sin perfil y lo genera en el Paso 1; no se versionan datos personales.

---

## Licencia

Proyecto de uso personal/educativo. Revisá los términos de uso de la API de OpenAI al usarla en producción.
