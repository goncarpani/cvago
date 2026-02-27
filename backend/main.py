"""
API: perfil CV, adapt por URL, CV Parser (archivo → JSON) y CV Generator (JSON + JD → PDF/DOCX).
"""
import json
import tempfile
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

load_dotenv()

# Ruta al repo (asumiendo que se corre desde raíz: uvicorn backend.main:app)
ROOT = Path(__file__).resolve().parent.parent
PROFILE_PATH = ROOT / "data" / "profile.json"
CV_OUTPUT_DIR = Path(__file__).resolve().parent / "generated_cvs"
CV_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="CVago")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Último JD obtenido por /api/jd/summary (para paso 3: generar CV sin reenviar URL)
_last_jd_raw_text: str | None = None


class AdaptRequest(BaseModel):
    job_url: str | None = None  # si no se envía, se usa el último JD obtenido en /api/jd/summary
    language: str = "es"  # "es" | "en" — idioma del CV generado


class JdSummaryRequest(BaseModel):
    job_url: str | None = None
    jd_text: str | None = None  # si se envía, se usa en vez de fetchear la URL (para ofertas que cargan con JS)


class GenerateCVRequest(BaseModel):
    profile: dict
    jd_text: str
    language: str = "es"  # "es" (español) | "en" (inglés)


class EnrichRequest(BaseModel):
    profile: dict


class MatchRequest(BaseModel):
    profile: dict
    jd: str | None = None  # si no se envía, se usa el último JD cargado en /api/jd/summary


@app.get("/api/profile")
def get_profile():
    """Devuelve el CV parametrizado (solo lectura desde JSON)."""
    if not PROFILE_PATH.exists():
        raise HTTPException(status_code=404, detail="data/profile.json no encontrado")
    with open(PROFILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@app.put("/api/profile")
def save_profile(profile: dict):
    """
    Guarda el JSON del perfil en data/profile.json.
    Usado después de parsear un CV y confirmar que está bien.
    """
    if not isinstance(profile, dict) or "personal" not in profile:
        raise HTTPException(
            status_code=400,
            detail="El perfil debe ser un objeto con al menos la clave 'personal'.",
        )
    PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PROFILE_PATH, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
    return {"ok": True, "message": "Perfil guardado en data/profile.json"}


@app.post("/api/jd/summary")
def jd_summary(request: JdSummaryRequest):
    """
    Paso 2: resumen de la oferta.
    - Si envías jd_text: se usa ese texto (pegado) y se resume. Ideal cuando el link no carga (SPA/Oracle, etc.).
    - Si envías job_url: se obtiene el contenido desde la URL y se resume.
    Guarda el texto crudo para el paso 3 (Generar CV).
    """
    global _last_jd_raw_text
    from .services import fetch_job_content, summarize_jd

    raw_text: str
    if request.jd_text and request.jd_text.strip():
        raw_text = request.jd_text.strip()
    elif request.job_url and request.job_url.strip():
        try:
            raw_text = fetch_job_content(request.job_url.strip())
        except Exception as e:
            raise HTTPException(
                status_code=422,
                detail=f"No se pudo obtener la oferta desde la URL: {str(e)}",
            )
    else:
        raise HTTPException(
            status_code=400,
            detail="Enviá job_url o jd_text (descripción pegada).",
        )

    _last_jd_raw_text = raw_text
    try:
        summary = summarize_jd(raw_text)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al resumir la oferta: {str(e)}",
        )
    return {"jd_summary": summary}


@app.post("/api/cv/match")
def cv_match(request: MatchRequest):
    """
    Tool 3 — Match Analyzer.
    Evalúa el match entre un perfil y una JD antes de generar el CV.
    """
    global _last_jd_raw_text
    from .match_analyzer import analyze_match

    jd_text = (request.jd or "").strip()
    if not jd_text:
        # Si no se envía JD explícita, usamos la última JD cruda obtenida en el paso 2.
        if not _last_jd_raw_text:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No hay JD disponible. Enviá 'jd' en el cuerpo o corré primero "
                    "el resumen de la posición (paso 2)."
                ),
            )
        jd_text = _last_jd_raw_text

    try:
        report = analyze_match(request.profile, jd_text)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error al analizar el match perfil/JD: {str(e)}"
        )
    return report


@app.post("/api/adapt")
def adapt_cv(request: AdaptRequest):
    """
    Paso 3 (o todo en uno): genera CV adaptado.
    - Si envías job_url: obtiene JD, genera CV y devuelve también resumen + archivos.
    - Si no envías job_url: usa el último JD obtenido con POST /api/jd/summary (paso 2).
    Descarga: GET /api/cv/download/{filename}
    """
    global _last_jd_raw_text
    if request.language not in ("es", "en"):
        raise HTTPException(status_code=400, detail="language debe ser 'es' o 'en'")

    if not PROFILE_PATH.exists():
        raise HTTPException(status_code=404, detail="data/profile.json no encontrado")

    with open(PROFILE_PATH, "r", encoding="utf-8") as f:
        profile = json.load(f)

    from .services import fetch_job_content, summarize_jd
    from .cv_generator import generate_cv_pdf_and_docx

    if request.job_url:
        raw_text = fetch_job_content(request.job_url)
        _last_jd_raw_text = raw_text
    else:
        raw_text = _last_jd_raw_text
        if not raw_text:
            raise HTTPException(
                status_code=400,
                detail="Primero obtené el resumen de la oferta (paso 2) o enviá job_url.",
            )

    jd_summary = summarize_jd(raw_text)
    pdf_name, docx_name = generate_cv_pdf_and_docx(
        profile, raw_text, language=request.language
    )

    return {
        "jd_summary": jd_summary,
        "pdf_filename": pdf_name,
        "docx_filename": docx_name,
    }


# --- Tool 1: CV Parser ---

ALLOWED_CV_EXTENSIONS = {".pdf", ".docx", ".txt"}


@app.post("/api/cv/parse")
async def cv_parse(file: UploadFile = File(...)):
    """
    Tool 1 — CV Parser: subís PDF, DOCX o TXT y recibís el JSON estructurado.
    Revisalo y guardalo antes de usar en el Generator.
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_CV_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no soportado. Use: {', '.join(ALLOWED_CV_EXTENSIONS)}",
        )
    try:
        contents = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents)
            tmp_path = Path(tmp.name)
        try:
            from .extractors import extract_cv_text
            from .cv_parser import parse_cv_to_json

            text = extract_cv_text(tmp_path)
            if not text.strip():
                raise HTTPException(status_code=400, detail="No se pudo extraer texto del archivo.")
            result = parse_cv_to_json(text)
            # Asegurar metadata
            if "metadata" not in result:
                result["metadata"] = {}
            result["metadata"]["version"] = "1.0"
            result["metadata"]["lastUpdated"] = date.today().isoformat()
            return result
        finally:
            try:
                tmp_path.unlink()
            except OSError:
                pass
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Enrich ---

@app.post("/api/cv/enrich")
def cv_enrich(request: EnrichRequest):
    """
    Enriquece el perfil: completa facts, capabilities, technologies,
    leadershipSignals, relevanceTags por experiencia y constraints/strategy.
    Devuelve el perfil enriquecido para revisar y guardar.
    """
    if not isinstance(request.profile, dict) or "personal" not in request.profile:
        raise HTTPException(status_code=400, detail="El perfil debe tener al menos 'personal'.")
    try:
        from .cv_enrich import enrich_profile, normalize_profile
        enriched = enrich_profile(request.profile)
        normalize_profile(enriched)
        return {"profile": enriched}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/cv/parse-and-enrich")
async def cv_parse_and_enrich(file: UploadFile = File(...)):
    """
    Subís el CV (PDF/DOCX/TXT): se parsea y se enriquece en un solo paso.
    Devuelve el perfil listo para revisar y guardar.
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_CV_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Formato no soportado. Use: {', '.join(ALLOWED_CV_EXTENSIONS)}",
        )
    try:
        contents = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents)
            tmp_path = Path(tmp.name)
        try:
            from .extractors import extract_cv_text
            from .cv_parser import parse_cv_to_json
            from .cv_enrich import enrich_profile, normalize_profile

            text = extract_cv_text(tmp_path)
            if not text.strip():
                raise HTTPException(status_code=400, detail="No se pudo extraer texto del archivo.")
            result = parse_cv_to_json(text)
            if "metadata" not in result:
                result["metadata"] = {}
            result["metadata"]["version"] = "1.0"
            result["metadata"]["lastUpdated"] = date.today().isoformat()
            result = enrich_profile(result)
            normalize_profile(result)
            return result
        finally:
            try:
                tmp_path.unlink()
            except OSError:
                pass
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Tool 2: CV Generator ---

@app.post("/api/cv/generate")
def cv_generate(request: GenerateCVRequest):
    """
    Tool 2 — CV Generator: enviás perfil (JSON) + texto de la JD + idioma (es|en).
    Recibís nombres de PDF y DOCX. Descargalos desde GET /api/cv/download/{filename}.
    """
    if request.language not in ("es", "en"):
        raise HTTPException(status_code=400, detail="language debe ser 'es' o 'en'")
    try:
        from .cv_generator import generate_cv_pdf_and_docx

        pdf_name, docx_name = generate_cv_pdf_and_docx(
            request.profile, request.jd_text, language=request.language
        )
        return {
            "pdf_filename": pdf_name,
            "docx_filename": docx_name,
        }
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/cv/download/{filename}")
def cv_download(filename: str, inline: bool = False):
    """Sirve un archivo generado (PDF o DOCX) desde generated_cvs.
    ?inline=true sirve el archivo para preview en iframe (Content-Disposition: inline).
    """
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo no válido")
    path = CV_OUTPUT_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    media = "application/pdf" if filename.lower().endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if inline:
        return FileResponse(path, media_type=media, content_disposition_type="inline")
    return FileResponse(path, media_type=media, filename=filename)
