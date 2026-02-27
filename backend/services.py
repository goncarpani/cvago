"""
Lógica de negocio: obtener JD desde URL y resumir con LLM.
El CV adaptado se genera en cv_generator (PDF/DOCX).
"""
import re
import os

import httpx


def fetch_job_content(url: str, timeout: float = 30.0) -> str:
    """Obtiene el contenido de la página de la job description."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    with httpx.Client(follow_redirects=True, timeout=timeout) as client:
        r = client.get(url, headers=headers)
        r.raise_for_status()
        html = r.text
    # Extracción burda de texto: quitar scripts/styles y tags, quedarnos con texto
    text = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", html, flags=re.I)
    text = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:50000]  # tope para no pasarnos de contexto


def summarize_jd(raw_text: str) -> str:
    """Resume la job description. Con OPENAI_API_KEY usa LLM; si no, primer bloque de texto."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or not raw_text.strip():
        return raw_text[:2000].strip() or "No se pudo obtener contenido de la URL."

    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    model = os.environ.get("OPENAI_SUMMARY_MODEL", "gpt-4o")
    chunk = raw_text[:12000]  # límite razonable para el prompt
    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": "Resumís job descriptions en español: rol, requisitos must-have, nice-to-have y responsabilidades principales. Respuesta concisa en prosa o bullets.",
            },
            {"role": "user", "content": f"Resumí esta oferta:\n\n{chunk}"},
        ],
        max_tokens=800,
    )
    return (response.choices[0].message.content or "").strip()
