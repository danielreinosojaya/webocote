#!/usr/bin/env python3
"""
Unpack Ocote brand delivery zips into public/brand/source for web projects.

Includes: logos, logo lockups, graphic elements, phrases, fonts, social photos,
presentations. Excludes: montajes mockups, heavy posters and stationery AI/PDF,
Photoshop masters, .DS_Store.

Re-run after replacing OCOTE-*.zip files in the repo root.
"""
from __future__ import annotations

import unicodedata as ud
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "public" / "brand" / "source"
PREFIX = "OCOTE/Entrega Final Ocote/"

ALLOWED_SEGMENTS = frozenset(
    ud.normalize("NFC", s)
    for s in (
        "1. Logos",
        "2. Logo + ",
        "3. Elementos Gr\u00e1ficos",
        "4. Frases",
        "8. Tipograf\u00edas",
        "9. Im\u00e1genes Redes",
        "11. Presentaciones",
    )
)


def first_segment(rel: str) -> str:
    return rel.split("/", 1)[0]


def should_extract(name: str) -> bool:
    if not name.startswith(PREFIX):
        return False
    rel = name[len(PREFIX) :]
    if rel == "" or rel.endswith("/"):
        return False
    if ud.normalize("NFC", first_segment(rel)) not in ALLOWED_SEGMENTS:
        return False
    lower = name.lower()
    if lower.endswith(".ds_store"):
        return False
    if "__macosx" in lower:
        return False
    if lower.endswith(".psd"):
        return False
    return True


def main() -> None:
    zips = sorted(ROOT.glob("OCOTE-*.zip"))
    if not zips:
        raise SystemExit(f"No OCOTE-*.zip files under {ROOT}")

    DEST.mkdir(parents=True, exist_ok=True)
    dest_root = DEST.resolve()

    def safe_target(rel_inside: str) -> Path:
        out = (dest_root / rel_inside).resolve()
        out.relative_to(dest_root)
        return out

    count = 0
    total = 0
    for zpath in zips:
        with zipfile.ZipFile(zpath, "r") as zf:
            for info in zf.infolist():
                name = info.filename
                if not should_extract(name):
                    continue
                rel_inside = name[len(PREFIX) :]
                target = safe_target(rel_inside)
                target.parent.mkdir(parents=True, exist_ok=True)
                if name.endswith("/"):
                    continue
                target.write_bytes(zf.read(info))
                count += 1
                total += info.file_size

    print(f"Wrote {count} files ({total / 1e9:.2f} GB) -> {DEST}")


if __name__ == "__main__":
    main()
