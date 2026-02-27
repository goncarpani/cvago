#!/usr/bin/env python3
"""
Modo "enrich" del CV inteligente (CLI).
Lee un JSON de perfil, enriquece con backend.cv_enrich y guarda en perfil_enriched.json.
"""
import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Import después de load_dotenv para que OPENAI_API_KEY esté disponible
from backend.cv_enrich import enrich_profile


def main():
    parser = argparse.ArgumentParser(description="Enriquece un perfil JSON con GPT-4o.")
    parser.add_argument("input_json", type=Path, help="Ruta al archivo JSON del perfil")
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=None,
        help="Ruta de salida (por defecto: perfil_enriched.json en el mismo directorio que el input)",
    )
    parser.add_argument("--model", default="gpt-4o", help="Modelo OpenAI (default: gpt-4o)")
    args = parser.parse_args()

    input_path = args.input_json.resolve()
    if not input_path.is_file():
        print(f"Error: no existe el archivo {input_path}", file=sys.stderr)
        sys.exit(1)

    output_path = args.output
    if output_path is None:
        output_path = input_path.parent / "perfil_enriched.json"
    else:
        output_path = output_path.resolve()

    with open(input_path, "r", encoding="utf-8") as f:
        profile = json.load(f)

    try:
        profile = enrich_profile(profile, model=args.model)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)

    print(f"Guardado en {output_path}")


if __name__ == "__main__":
    main()
