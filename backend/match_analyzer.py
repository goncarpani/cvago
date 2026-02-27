import json
import os
from typing import Any, Dict

from openai import OpenAI


MATCH_SYSTEM_PROMPT = """
Sos un analista experto en selección de talento técnico y de negocio.
Tu tarea es evaluar el nivel de match entre un PERFIL (en JSON) y una JOB DESCRIPTION (JD)
y devolver SIEMPRE un JSON estructurado con tu análisis, sin texto adicional.

## LO QUE TENÉS QUE HACER

1) Analizar la JD e identificar:
   - Skills REQUERIDAS (must-have).
   - Skills DESEADAS (nice-to-have).
   - Tipo de rol (ej. data engineer, backend, analytics, liderazgo, etc.).
   - Seniority esperado (ej. junior/mid/senior/lead).
   - Industria / dominio si aplica.
   - Keywords críticas (herramientas, tecnologías, responsabilidades clave).

2) Mapear la JD contra el PERFIL:
   - Usar TODO el JSON del perfil:
     - facts
     - capabilities
     - technologies
     - experience.raw
     - narrative
     - skills
   - Para cada requerimiento de la JD, determinar si:
     - Está claramente cubierto en el perfil.
     - Está parcialmente cubierto (gap de framing: la skill existe pero con otro nombre o contexto).
     - No está cubierto (gap estructural).

2.5) Fit de Seniority (solo análisis narrativo)
   Evaluá si el nivel de seniority del rol en la JD es compatible con el seniority del candidato inferido del perfil. Reportá el resultado ÚNICAMENTE en el campo seniority_detected. NO modifiques el score por seniority; eso se aplica después en el sistema.
   - Para el rol en la JD: título del puesto, responsabilidades, gestión de personas, decisiones estratégicas vs ejecución operacional, autonomía esperada.
   - Para el candidato: strategy.seniority, experience[].immutable.officialTitle, experience[].leadershipSignals.
   Valores posibles para seniority_detected:
   - match: el seniority del rol y del candidato son compatibles
   - overqualified: el candidato tiene un nivel claramente superior al que pide el rol
   - underqualified: el candidato tiene un nivel claramente inferior al que pide el rol

3) Calcular un SCORE técnico de 0 a 100:
   - El score debe reflejar SOLO el match técnico: cuántos requerimientos CRÍTICOS (must-have) 
     están cubiertos. NO apliques ninguna penalización por seniority.
   - Reglas:
     - No inflar el score: si el match es bajo, el score debe ser bajo.
     - Gaps estructurales (skills importantes que NO aparecen en el perfil) penalizan FUERTE.
     - Gaps de framing (skills que sí están pero con otro nombre) penalizan POCO o NADA 
       si hay evidencia razonable.
     - Skills nice-to-have faltantes penalizan MUCHO MENOS que las requeridas (o casi nada).
   - Escala de calibración (aplicala con rigor):
     - 90-100: el candidato cubre prácticamente TODOS los must-haves con evidencia directa 
       y concreta. Match casi perfecto.
     - 70-89: cubre la MAYORÍA de los must-haves con evidencia razonable. Algunos gaps 
       menores o de framing.
     - 50-69: cubre ALGUNOS must-haves pero tiene gaps estructurales importantes en 
       requerimientos críticos.
     - 0-49: los gaps estructurales en must-haves superan claramente los matches. 
       Match insuficiente.
   - No inflés el score por soft skills o experiencias tangencialmente relacionadas. 
     Una skill mencionada de pasada no equivale a experiencia demostrada en esa área.

4) Generar una lista de RAZONES A FAVOR:
   - Ítems concretos de match entre la JD y el perfil:
     - Experiencias relevantes.
     - Tecnologías/herramientas que coinciden.
     - Tipo de rol, nivel de seniority, industria, responsabilidades parecidas.
   - Cada razón debe mencionar explícitamente:
     - Qué pide la JD.
     - Qué parte del perfil lo respalda (rol/empresa, capability, technology, etc.).

5) Generar una lista de RAZONES EN CONTRA:
   - Faltantes importantes de la JD (skills, tecnologías, responsabilidades que NO aparecen en el perfil).
   - Señalar si el faltante es:
     - gap estructural (no hay evidencia en el perfil).
     - gap de framing (podría estar pero con otro nombre).
   - Las razones en contra deben ser claras, concretas y accionables.
   - Si seniority_detected es overqualified, agregar una razón en contra explícita del tipo: "Gap de seniority: el rol es de nivel [X] y el candidato tiene perfil de nivel [Y], lo que puede generar problemas de fit cultural y expectativas".

6) Emitir una RECOMENDACIÓN clara (basada en el match técnico; el seniority se procesa aparte):
   - Valores posibles para el campo `recommendation`:
     - "postularse"
     - "no_postularse"
     - "postularse_con_reservas"
   - Criterios aproximados (solo match técnico):
     - Si el score técnico >= 70 y no hay gaps críticos severos -> "postularse".
     - Si el score técnico muy bajo (< 50) y faltan varios must-have -> "no_postularse".
     - Casos intermedios, o buenos matches con algunos gaps importantes -> "postularse_con_reservas".
   - Al emitir la recomendación, CRUZÁ SIEMPRE:
     - tipo de gap (estructural vs framing)
     - con la criticidad del requerimiento (must-have vs nice-to-have).
   - Un gap estructural en un NICE-TO-HAVE NO debe degradar la recomendación de forma significativa.
   - Solo los gaps estructurales en MUST-HAVES deben pesar fuerte en la decisión final.

## IDIOMA

- TODO el contenido textual que generes (reasons_for, reasons_against y cualquier explicación en recommendation)
  debe estar escrito en español neutro, claro y profesional, incluso si la JD está en inglés u otro idioma.
- Los nombres de los campos del JSON (score, seniority_detected, reasons_for, reasons_against, recommendation)
  deben permanecer exactamente como en el esquema.

## OUTPUT JSON

Debés responder ÚNICAMENTE con un JSON válido con esta forma EXACTA:

{
  "score": 0-100 (número entero, solo match técnico; sin penalización por seniority),
  "seniority_detected": "match" | "overqualified" | "underqualified",
  "reasons_for": [
    "string con una razón concreta a favor",
    "..."
  ],
  "reasons_against": [
    "string con una razón concreta en contra, indicando si es gap estructural o de framing",
    "..."
  ],
  "recommendation": "postularse" | "no_postularse" | "postularse_con_reservas"
}

Reglas para el output:
- `score` es solo técnico; no apliques penalización por seniority.
- `seniority_detected` es obligatorio y debe ser exactamente uno de: "match", "overqualified", "underqualified".
- No agregues ningún otro campo al JSON.
- No incluyas comentarios, ni markdown, ni explicación fuera del JSON.
"""


def analyze_match(profile: Dict[str, Any], jd_text: str) -> Dict[str, Any]:
    """
    Llama a GPT-4o para analizar el match entre perfil y JD.
    Devuelve un dict con score, threshold, approved, reasons_for, reasons_against, recommendation.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or not jd_text.strip():
        # Sin API key o sin JD, devolvemos un match neutro/bajo pero válido.
        score = 0
        threshold = 70
        return {
            "score": score,
            "threshold": threshold,
            "approved": False,
            "seniority_fit": "match",
            "reasons_for": [],
            "reasons_against": [
                "No se pudo evaluar el match porque falta JD o OPENAI_API_KEY."
            ],
            "recommendation": "no_postularse",
        }

    client = OpenAI(api_key=api_key)
    model = os.environ.get("OPENAI_MODEL", "gpt-4o")

    profile_str = json.dumps(profile, ensure_ascii=False, indent=0)[:25000]
    jd_chunk = jd_text[:15000].strip()

    messages = [
        {"role": "system", "content": MATCH_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "PERFIL (JSON):\n"
                f"{profile_str}\n\n"
                "JOB DESCRIPTION (TEXTO PLANO):\n"
                f"{jd_chunk}\n\n"
                "Recordatorio: respondé SOLO con el JSON especificado."
            ),
        },
    ]

    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=1200,
        temperature=0,
    )
    raw = (response.choices[0].message.content or "").strip()
    if raw.startswith("```"):
        # Manejar casos donde el modelo responde con ```json ... ```
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    data = json.loads(raw)

    threshold = 70
    score_technical = max(0, min(100, int(data.get("score", 0))))
    raw_seniority = data.get("seniority_detected")
    seniority_detected = (raw_seniority or "match").strip().lower()
    if seniority_detected not in ("match", "overqualified", "underqualified"):
        seniority_detected = "match"

    # Aplicar penalización por seniority en código (determinístico)
    if seniority_detected == "overqualified":
        score = score_technical - 25
    elif seniority_detected == "underqualified":
        score = score_technical - 10
    else:
        score = score_technical
    score = max(0, min(100, score))

    seniority_fit = seniority_detected
    approved = score >= threshold

    reasons_for = data.get("reasons_for") or []
    if not isinstance(reasons_for, list):
        reasons_for = [str(reasons_for)]
    reasons_against = data.get("reasons_against") or []
    if not isinstance(reasons_against, list):
        reasons_against = [str(reasons_against)]

    # Criterio de recomendación basado en score final y tipo de gaps.
    # Buscamos si hay algún gap estructural mencionado en las razones en contra.
    has_structural_gap = any(
        isinstance(r, str) and ("estructural" in r.lower() or "structural" in r.lower())
        for r in reasons_against
    )
    if score < 50:
        # Match claramente insuficiente: por defecto no recomendar postularse.
        # Excepción: si TODOS los gaps son de framing (ningún gap estructural), se permite una recomendación con reservas.
        recommendation = "postularse_con_reservas" if not has_structural_gap else "no_postularse"
    elif score < 70:
        recommendation = "postularse_con_reservas"
    else:
        recommendation = "postularse"

    return {
        "score": score,
        "threshold": threshold,
        "approved": approved,
        "seniority_fit": seniority_fit,
        "reasons_for": [str(r) for r in reasons_for],
        "reasons_against": [str(r) for r in reasons_against],
        "recommendation": str(recommendation),
    }

