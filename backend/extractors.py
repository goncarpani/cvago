"""
Extracción de texto desde CV en PDF, DOCX o TXT.
El resultado es siempre texto plano para pasar al LLM.
"""
from pathlib import Path


def extract_from_pdf(file_path: Path) -> str:
    """Extrae texto de un PDF con pdfplumber."""
    import pdfplumber
    parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                parts.append(text)
    return "\n\n".join(parts).strip() if parts else ""


def extract_from_docx(file_path: Path) -> str:
    """Extrae texto de un DOCX con python-docx."""
    from docx import Document
    doc = Document(file_path)
    return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip()).replace("\n\n\n", "\n\n").strip()


def extract_from_txt(file_path: Path) -> str:
    """Lee contenido de un archivo de texto plano."""
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read().strip()


def extract_cv_text(file_path: Path) -> str:
    """
    Extrae texto del CV según la extensión del archivo.
    Acepta .pdf, .docx, .txt.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_from_pdf(path)
    if suffix == ".docx":
        return extract_from_docx(path)
    if suffix == ".txt":
        return extract_from_txt(path)
    raise ValueError(f"Formato no soportado: {suffix}. Use .pdf, .docx o .txt")