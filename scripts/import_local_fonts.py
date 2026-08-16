"""
Bulk-import font files from a local folder (font-library-import/) into MinIO +
the fonts DB table, so they show up as selectable fonts in the app.

Meant to run on the HOST (not inside a container) against the docker-compose
stack's published ports (localhost:5432 / localhost:9000), since the source
folder isn't mounted into any container.

Usage:
  source <venv with fonttools, boto3, sqlalchemy[asyncio], asyncpg>/bin/activate
  python3 scripts/import_local_fonts.py                # dry run (default) — no writes
  python3 scripts/import_local_fonts.py --commit        # actually upload + insert

What it does:
  1. Extracts any .zip files found under font-library-import/ (in place).
  2. Recursively finds all .ttf/.otf/.woff/.woff2 files.
  3. Reads each font's own 'name' table (not the filename) for family/subfamily,
     and its cmap to detect Devanagari/Gujarati Unicode coverage -> language.
  4. Skips files that look like legacy non-Unicode Indic "symbol" fonts (path
     hints at Hindi/Gujarati but the font has no real Unicode coverage for
     it) — those render garbage through this app's Unicode-based transliteration
     and are listed separately for manual review instead of being imported.
  5. Dedupes against what's already in the DB and within this batch, by
     (family_name, weight, style).
  6. Dry run only reports counts + a sample; --commit uploads to MinIO under
     fonts/{uuid}.{ext} and inserts one fonts row per accepted file.
"""
import argparse
import asyncio
import re
import sys
import uuid
import zipfile
from pathlib import Path

import boto3
from botocore.client import Config as BotoConfig
from fontTools.ttLib import TTFont, TTLibError

import os

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = Path(os.environ.get("FONT_IMPORT_SOURCE", REPO_ROOT / "font-library-import"))

# Defaults assume host execution against docker-compose's published ports;
# when run inside the backend container (docker compose run), the container's
# own env (from .env) already points these at the internal service hostnames.
MINIO_ENDPOINT = os.environ.get("S3_ENDPOINT_URL") or "http://localhost:9000"
MINIO_ACCESS = os.environ.get("S3_ACCESS_KEY", "minioadmin")
MINIO_SECRET = os.environ.get("S3_SECRET_KEY", "minioadmin123")
MINIO_BUCKET = os.environ.get("S3_BUCKET_NAME", "invitation-video")
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+asyncpg://invitation:invitation_secret@localhost:5432/invitation_video"
)

FONT_EXTS = {".ttf", ".otf", ".woff", ".woff2"}
PREVIEW_TEXT = {"gujarati": "શુભ લગ્ન", "hindi": "शुभ विवाह", "english": "Wedding"}

DEVANAGARI_RANGE = range(0x0900, 0x0980)
GUJARATI_RANGE = range(0x0A80, 0x0B00)

INDIC_HINT_RE = re.compile(
    r"guj|hindi|devanagari|deva\b|shree|kruti|dev\s?lys|chanakya|walkman|marathi|sanskrit",
    re.IGNORECASE,
)

WEIGHT_NAMES = {
    100: "100", 200: "200", 300: "300", 400: "regular",
    500: "500", 600: "600", 700: "700", 800: "800", 900: "900",
}


def extract_zips(root: Path) -> int:
    count = 0
    for zpath in list(root.rglob("*.zip")):
        dest = zpath.with_suffix("")
        if dest.exists():
            continue
        try:
            with zipfile.ZipFile(zpath) as zf:
                zf.extractall(dest)
            count += 1
        except Exception as e:
            print(f"  [warn] could not extract {zpath.relative_to(root)}: {e}")
    return count


def find_font_files(root: Path) -> list[Path]:
    files = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in FONT_EXTS:
            continue
        if "__MACOSX" in p.parts or p.name.startswith("."):
            continue
        files.append(p)
    return files


def get_name(font: TTFont, name_id_pref: int, name_id_fallback: int) -> str | None:
    name_table = font["name"]
    for nid in (name_id_pref, name_id_fallback):
        rec = name_table.getName(nid, 3, 1, 0x409) or name_table.getName(nid, 1, 0, 0)
        if rec:
            try:
                return rec.toUnicode().strip()
            except Exception:
                continue
    return None


def detect_language(font: TTFont) -> str:
    try:
        cmap = font.getBestCmap()
    except Exception:
        cmap = None
    if not cmap:
        return "english"
    codepoints = cmap.keys()
    if any(cp in GUJARATI_RANGE for cp in codepoints):
        return "gujarati"
    if any(cp in DEVANAGARI_RANGE for cp in codepoints):
        return "hindi"
    return "english"


def parse_font(path: Path) -> dict | None:
    try:
        font = TTFont(str(path), lazy=True, fontNumber=0)
    except (TTLibError, Exception) as e:
        return {"error": f"unparseable: {e}"}

    family = get_name(font, 16, 1) or path.stem
    subfamily = get_name(font, 17, 2) or "Regular"

    weight_class = 400
    try:
        weight_class = font["OS/2"].usWeightClass
    except Exception:
        pass
    weight = WEIGHT_NAMES.get(round(weight_class / 100) * 100, "regular")

    style = "italic" if re.search(r"italic|oblique", subfamily, re.IGNORECASE) else "normal"
    language = detect_language(font)

    is_indic_hint = bool(INDIC_HINT_RE.search(str(path)))
    suspicious = is_indic_hint and language == "english"

    display_bits = [family]
    wn = {"regular": "", "300": "Light", "500": "Medium", "600": "SemiBold",
          "700": "Bold", "800": "ExtraBold", "900": "Black", "200": "ExtraLight", "100": "Thin"}
    if wn.get(weight):
        display_bits.append(wn[weight])
    if style == "italic":
        display_bits.append("Italic")

    return {
        "path": path,
        "family": family,
        "weight": weight,
        "style": style,
        "language": language,
        "display_name": " ".join(display_bits),
        "suspicious": suspicious,
    }


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", action="store_true", help="Actually upload + insert (default is dry-run)")
    args = ap.parse_args()

    if not SOURCE_DIR.exists():
        print(f"Source folder not found: {SOURCE_DIR}", file=sys.stderr)
        sys.exit(1)

    print(f"Scanning {SOURCE_DIR} ...")
    n_zips = extract_zips(SOURCE_DIR)
    print(f"Extracted {n_zips} new zip(s).")

    font_files = find_font_files(SOURCE_DIR)
    print(f"Found {len(font_files)} font files.")

    parsed = []
    errors = []
    for p in font_files:
        result = parse_font(p)
        if result is None:
            continue
        if "error" in result:
            errors.append((p, result["error"]))
            continue
        parsed.append(result)

    # Dedup within this batch by (family, weight, style) — keep first occurrence
    seen = set()
    accepted = []
    dup_in_batch = 0
    suspicious = []
    for r in parsed:
        key = (r["family"], r["weight"], r["style"])
        if r["suspicious"]:
            suspicious.append(r)
            continue
        if key in seen:
            dup_in_batch += 1
            continue
        seen.add(key)
        accepted.append(r)

    by_lang = {"english": 0, "hindi": 0, "gujarati": 0}
    for r in accepted:
        by_lang[r["language"]] += 1

    print("\n=== SUMMARY ===")
    print(f"Parsed OK:          {len(parsed)}")
    print(f"Unparseable/errors: {len(errors)}")
    print(f"Duplicate in batch: {dup_in_batch}")
    print(f"Suspicious (Indic filename, no Unicode Indic coverage — excluded): {len(suspicious)}")
    print(f"Accepted for import: {len(accepted)}")
    print(f"  english:  {by_lang['english']}")
    print(f"  hindi:    {by_lang['hindi']}")
    print(f"  gujarati: {by_lang['gujarati']}")

    if errors:
        print("\n--- Unparseable files (sample, up to 15) ---")
        for p, e in errors[:15]:
            print(f"  {p.relative_to(SOURCE_DIR)}: {e}")

    if suspicious:
        print("\n--- Suspicious / needs manual review (sample, up to 20) ---")
        for r in suspicious[:20]:
            print(f"  {r['path'].relative_to(SOURCE_DIR)}  (family guess: {r['family']!r})")

    print("\n--- Sample of accepted fonts (up to 25) ---")
    for r in accepted[:25]:
        print(f"  [{r['language']:8s}] {r['display_name']:40s}  <- {r['path'].relative_to(SOURCE_DIR)}")

    if not args.commit:
        print("\nDry run only — nothing uploaded or written. Re-run with --commit to import.")
        return

    # --- Commit: dedup against DB, upload to MinIO, insert rows ---
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker, declarative_base
    from sqlalchemy import Column, String
    import uuid as uuid_mod
    from sqlalchemy.dialects.postgresql import UUID as PG_UUID

    Base = declarative_base()

    class FontRow(Base):
        __tablename__ = "fonts"
        id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid_mod.uuid4)
        name = Column(String(100))
        family_name = Column(String(100))
        language = Column(String(20))
        weight = Column(String(20), default="regular")
        style = Column(String(20), default="normal")
        file_key = Column(String(500))
        preview_text = Column(String(200), nullable=True)

    engine = create_async_engine(DATABASE_URL)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        result = await db.execute(select(FontRow.family_name, FontRow.weight, FontRow.style))
        existing = {(r[0], r[1], r[2]) for r in result.all()}
    print(f"\nExisting DB fonts: {len(existing)}")

    s3 = boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS,
        aws_secret_access_key=MINIO_SECRET,
        config=BotoConfig(signature_version="s3v4"),
        region_name="us-east-1",
    )

    added = 0
    skipped_existing = 0
    failed = 0
    for r in accepted:
        key = (r["family"], r["weight"], r["style"])
        if key in existing:
            skipped_existing += 1
            continue

        ext = r["path"].suffix.lower().lstrip(".")
        font_id = uuid.uuid4()
        file_key = f"fonts/{font_id}.{ext}"
        content_type = {"ttf": "font/ttf", "otf": "font/otf", "woff": "font/woff", "woff2": "font/woff2"}[ext]

        try:
            data = r["path"].read_bytes()
            s3.put_object(Bucket=MINIO_BUCKET, Key=file_key, Body=data, ContentType=content_type)
        except Exception as e:
            print(f"  [fail] upload {r['path'].name}: {e}")
            failed += 1
            continue

        async with Session() as db:
            db.add(FontRow(
                id=font_id,
                name=r["display_name"],
                family_name=r["family"],
                language=r["language"],
                weight=r["weight"],
                style=r["style"],
                file_key=file_key,
                preview_text=PREVIEW_TEXT[r["language"]],
            ))
            await db.commit()

        existing.add(key)
        added += 1

    await engine.dispose()

    print(f"\n=== DONE: added={added}, skipped_existing_in_db={skipped_existing}, failed={failed} ===")


if __name__ == "__main__":
    asyncio.run(main())
