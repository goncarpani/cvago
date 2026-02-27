"""
Lógica de enriquecimiento de perfil: completa facts, capabilities, technologies,
leadershipSignals, relevanceTags por experiencia y constraints/strategy a nivel perfil.
Usado por el CLI enrich.py y por POST /api/cv/enrich.
"""
import json
import os
from copy import deepcopy

from openai import OpenAI

EXP_ENRICH_SYSTEM = """Sos un asistente que enriquece perfiles profesionales. Recibís el "raw" de una experiencia laboral y el contexto del rol (immutable, context). Tu tarea es devolver ÚNICAMENTE un JSON con los campos que se indican, inferidos del texto. No inventes nada que no esté en el raw o en el contexto.

Reglas:
- Si no podés inferir un campo con certeza, dejalo vacío: [] para arrays, null donde aplique, o el valor por defecto para leadershipSignals.
- facts: array de { "what": string, "metric": number o null, "scope": string, "myRole": "owner" | "contributor" | "support" }. myRole solo puede ser uno de esos tres.
- capabilities: array de { "name": string, "evidence": array de strings }.
- technologies: array de { "name": string, "yearsInThisRole": number, "usedInProduction": boolean, "depth": "architecture" | "implementation" | "basic", "contexts": array de strings }. depth solo puede ser "architecture", "implementation" o "basic".
- leadershipSignals: { "mentored": number, "ledProjects": boolean, "hiringInvolvement": boolean, "crossFunctional": boolean }. Inferilo del raw; si no hay evidencia, usá false o 0.
- relevanceTags: array de strings (etiquetas que describan el rol para matching).

Respondé ÚNICAMENTE con un JSON válido que tenga exactamente estas claves: facts, capabilities, technologies, leadershipSignals, relevanceTags. Sin markdown, sin explicaciones."""

CONSTRAINTS_STRATEGY_SYSTEM = """Sos un asistente que completa la sección constraints y strategy de un perfil profesional. Recibís el perfil completo en JSON.

Reglas:
- constraints.cannotModify DEBE ser exactamente este array (en ese orden): ["dates", "companies", "officialTitle", "technologies", "educationDegrees"]. No lo modifiques.
- constraints.canReframe DEBE ser exactamente este array: ["achievements", "summary", "bulletOrdering", "skillHighlighting", "capabilityEmphasis", "headline"]. No lo modifiques.
- strategy: inferí del perfil (experiencias, narrative, skills) y devolvé un JSON con: targetRoles (array de strings), avoidRoles (array), seniority ("mid" | "senior" | "staff"), workMode ("remoto" | "híbrido" | "presencial"), industries (array). Si no podés inferir, usá strings vacíos o arrays vacíos.
- No inventes datos que no estén en el perfil.

Respondé ÚNICAMENTE con un JSON válido con exactamente dos claves: constraints, strategy. Sin markdown, sin explicaciones."""

FIXED_CONSTRAINTS = {
    "cannotModify": ["dates", "companies", "officialTitle", "technologies", "educationDegrees"],
    "canReframe": ["achievements", "summary", "bulletOrdering", "skillHighlighting", "capabilityEmphasis", "headline"],
}


def _is_empty(val):
    if val is None:
        return True
    if isinstance(val, (list, dict)):
        return len(val) == 0
    if isinstance(val, str):
        return val.strip() == ""
    if isinstance(val, (int, float)):
        return val == 0
    if isinstance(val, bool):
        return val is False
    return False


def _leadership_empty(ls):
    if not ls or not isinstance(ls, dict):
        return True
    return (
        (ls.get("mentored") or 0) == 0
        and not ls.get("ledProjects")
        and not ls.get("hiringInvolvement")
        and not ls.get("crossFunctional")
    )


def _needs_experience_enrich(exp):
    return (
        _is_empty(exp.get("facts"))
        or _is_empty(exp.get("capabilities"))
        or _is_empty(exp.get("technologies"))
        or _is_empty(exp.get("relevanceTags"))
        or _leadership_empty(exp.get("leadershipSignals"))
    )


def _merge_exp(exp: dict, enriched: dict) -> None:
    for key in ("facts", "capabilities", "technologies", "leadershipSignals", "relevanceTags"):
        if key not in enriched:
            continue
        if _is_empty(exp.get(key)) and not _is_empty(enriched[key]):
            exp[key] = enriched[key]
        elif key == "leadershipSignals" and isinstance(enriched.get(key), dict):
            current = exp.get(key) or {}
            for k, v in enriched[key].items():
                if current.get(k) in (None, "", 0, False) and v not in (None, "", 0, False):
                    current[k] = v
            exp[key] = current


def _enrich_experience(client: OpenAI, exp: dict, model: str) -> dict:
    raw = exp.get("raw") or ""
    immutable = exp.get("immutable") or {}
    context = exp.get("context") or {}
    payload = {"raw": raw, "immutable": immutable, "context": context}
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": EXP_ENRICH_SYSTEM},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False, indent=0)},
        ],
        max_tokens=4000,
        temperature=0.1,
    )
    text = (response.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return json.loads(text)


def _enrich_constraints_strategy(client: OpenAI, profile: dict, model: str) -> dict:
    summary = {
        "personal": profile.get("personal"),
        "narrative": profile.get("narrative"),
        "experience": [
            {"immutable": e.get("immutable"), "raw": (e.get("raw") or "")[:800]}
            for e in profile.get("experience", [])
        ],
        "education": profile.get("education"),
        "skills": profile.get("skills"),
        "constraints": profile.get("constraints"),
        "strategy": profile.get("strategy"),
    }
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": CONSTRAINTS_STRATEGY_SYSTEM},
            {"role": "user", "content": json.dumps(summary, ensure_ascii=False, indent=0)},
        ],
        max_tokens=1500,
        temperature=0.1,
    )
    text = (response.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    data = json.loads(text)
    data["constraints"] = FIXED_CONSTRAINTS
    return data


def normalize_profile(profile: dict) -> None:
    """
    Normaliza campos que pueden venir como "" y romper validaciones (ej. generator).
    Mutación in-place. leadershipSignals: ledProjects, hiringInvolvement, crossFunctional
    deben ser bool; mentored debe ser int.
    """
    for exp in profile.get("experience") or []:
        ls = exp.get("leadershipSignals")
        if not isinstance(ls, dict):
            continue
        for key in ("ledProjects", "hiringInvolvement", "crossFunctional"):
            if ls.get(key) == "" or ls.get(key) is None:
                ls[key] = False
            elif not isinstance(ls[key], bool):
                ls[key] = bool(ls[key])
        if "mentored" in ls and not isinstance(ls.get("mentored"), (int, float)):
            try:
                ls["mentored"] = int(ls["mentored"]) if ls["mentored"] else 0
            except (TypeError, ValueError):
                ls["mentored"] = 0


def enrich_profile(profile: dict, model: str | None = None) -> dict:
    """
    Enriquece el perfil: por cada experiencia con campos vacíos llama a GPT-4o,
    luego completa constraints y strategy. Devuelve un nuevo dict (no muta el input).
    Requiere OPENAI_API_KEY en el entorno.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY no configurada. Necesaria para enriquecer.")

    model = model or os.environ.get("OPENAI_MODEL", "gpt-4o")
    result = deepcopy(profile)
    experience = result.get("experience") or []

    if not experience:
        result["constraints"] = FIXED_CONSTRAINTS
        result["strategy"] = result.get("strategy") or {}
        return result

    client = OpenAI(api_key=api_key)
    for i, exp in enumerate(result["experience"]):
        if not _needs_experience_enrich(exp):
            continue
        try:
            enriched = _enrich_experience(client, exp, model)
            _merge_exp(result["experience"][i], enriched)
        except Exception:
            pass  # mantener el bloque tal cual si falla

    try:
        cs = _enrich_constraints_strategy(client, result, model)
        result["constraints"] = cs["constraints"]
        result["strategy"] = cs.get("strategy") or result.get("strategy") or {}
    except Exception:
        pass
    result["constraints"] = FIXED_CONSTRAINTS
    normalize_profile(result)
    return result
