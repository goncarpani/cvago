"""
Tool 1 — CV Parser: texto de CV → JSON estructurado.
Usa LLM para mapear el texto al schema. No inventa datos; campos inciertos en "" o null.
Por cada experiencia, raw = texto original de ese rol. experience ordenado más reciente primero.
"""
import json
import os
from pathlib import Path

from openai import OpenAI

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "data" / "cv_schema_v1.json"

# Carga del schema para incluir en el prompt
with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
    SCHEMA_REF = json.dumps(json.load(f), indent=2, ensure_ascii=False)


SYSTEM_PROMPT = f"""Sos un parser de CVs. Tu única tarea es convertir el texto de un CV en un JSON válido que respete exactamente esta estructura.

Estructura esperada (resumen):
- metadata: version "1.0", lastUpdated (YYYY-MM-DD de hoy), owner (string o "")
- personal: firstName, lastName, email, phone, location, links (linkedin, github, portfolio)
- narrative: headline, coreIdentity, careerGoal, avoidFraming (array). Si el CV tiene sección de presentación o resumen, extraé lo que consideres relevante y repartilo en headline/coreIdentity/careerGoal. Si no hay presentación, dejá los campos vacíos o ""; no inventes contenido.
- experience: array de objetos. CADA UNO debe tener:
  - immutable: company, officialTitle, start (YYYY-MM), end (YYYY-MM o "present"), location
  - context: industry, companySize, teamSize (número), reportsTo, stakeholders (array)
  - raw: OBLIGATORIO. El texto original del CV correspondiente a ESE rol, COMPLETO y sin modificar. Incluí todas las oraciones y párrafos que describan ese rol en el CV; no truncar, no resumir, no omitir el último párrafo ni ninguna frase.
  - facts: array de {{ what, metric (número o null), scope, myRole: "owner"|"contributor"|"support" }}
  - capabilities: array de {{ name, evidence: array de strings }}
  - technologies: array de {{ name, yearsInThisRole, usedInProduction (bool), depth: "architecture"|"implementation"|"basic", contexts: array }}
  - leadershipSignals: {{ mentored (número), ledProjects, hiringInvolvement, crossFunctional (bool) }}
  - relevanceTags: array de strings
- education: array de {{ degree, institution, year, notes }}
- skills: {{ technical: array de {{ name, level: "básico"|"intermedio"|"avanzado", yearsTotal, usedInProduction, lastUsed (YYYY) }}, soft: array de strings }}
- languages: array de {{ language, level }}
- certifications: array de {{ name, issuer, year, url }}
- constraints: cannotModify (array), canReframe (array) — dejar los valores fijos del schema
- strategy: targetRoles, avoidRoles (arrays), seniority ("mid"|"senior"|"staff"), workMode ("remoto"|"híbrido"|"presencial"), industries (array)

Reglas críticas:
1. Si no podés inferir un campo con certeza, dejalo en "" (string vacío), [] (array vacío), 0 o null. NUNCA inventes datos.
2. Para skills técnicas: si el CV no indica explícitamente el nivel de una skill (básico/intermedio/avanzado), dejá el campo "level" en null. No inferas ni inventes niveles. Lo mismo aplica para "lastUsed" y "yearsTotal": si no hay evidencia concreta en el CV de cuándo se usó por última vez o cuántos años en total, dejá esos campos en null.
3. Para cada ítem en experience, el campo "raw" es OBLIGATORIO: debe contener TODO el texto del CV que corresponde a ese rol (todas las oraciones y párrafos), literal, sin reescribir ni recortar. Si en el CV ese rol tiene 3 párrafos, raw debe tener los 3.
4. narrative (headline, coreIdentity, careerGoal): si el CV tiene presentación o resumen, extraé lo relevante; si no tiene, dejá vacío. No inventes.
5. Ordená experience de más reciente a más antigua (cronológico inverso).
6. Respondé ÚNICAMENTE con el JSON. Sin markdown, sin explicaciones, sin ```json. Empezá por {{ y terminá por }}.
"""


def parse_cv_to_json(cv_text: str) -> dict:
    """
    Recibe el texto completo del CV y devuelve el JSON estructurado.
    Requiere OPENAI_API_KEY en el entorno.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no configurada. Necesaria para el CV Parser.")

    client = OpenAI(api_key=api_key)
    model = os.environ.get("OPENAI_MODEL", "gpt-4o")
    # Limitar tamaño para no pasarnos de contexto
    chunk = (cv_text[:40000] + "...") if len(cv_text) > 40000 else cv_text

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Parseá este CV y devolvé el JSON.\n\n{chunk}"},
        ],
        max_tokens=16000,
        temperature=0.1,
    )
    raw_content = (response.choices[0].message.content or "").strip()
    # Quitar posibles bloques markdown
    if raw_content.startswith("```"):
        raw_content = raw_content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return json.loads(raw_content)
