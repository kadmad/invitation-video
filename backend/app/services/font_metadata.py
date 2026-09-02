"""Read the metadata the application needs directly from a font file."""

import re
from io import BytesIO

from fontTools.ttLib import TTFont


SUPPORTED_FONT_EXTENSIONS = {".ttf", ".otf", ".woff", ".woff2"}
FONT_CONTENT_TYPES = {
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}
FONT_SIGNATURES = {
    b"wOFF": ".woff",
    b"wOF2": ".woff2",
    b"OTTO": ".otf",
    b"true": ".ttf",
    b"typ1": ".ttf",
    b"\x00\x01\x00\x00": ".ttf",
}
MAX_FONT_FILE_BYTES = 20 * 1024 * 1024
MAX_BULK_FONT_FILES = 1000

DEVANAGARI_RANGE = range(0x0900, 0x0980)
GUJARATI_RANGE = range(0x0A80, 0x0B00)

WEIGHT_NAMES = {
    100: "100",
    200: "200",
    300: "300",
    400: "regular",
    500: "500",
    600: "600",
    700: "700",
    800: "800",
    900: "900",
}
WEIGHT_LABELS = {
    "100": "Thin",
    "200": "ExtraLight",
    "300": "Light",
    "500": "Medium",
    "600": "SemiBold",
    "700": "Bold",
    "800": "ExtraBold",
    "900": "Black",
}


def content_type_for_font(filename: str) -> str:
    extension = _extension(filename)
    return FONT_CONTENT_TYPES.get(extension, "application/octet-stream")


def extension_for_font_data(data: bytes) -> str | None:
    """Identify the actual font container instead of trusting its filename."""
    for signature, extension in FONT_SIGNATURES.items():
        if data.startswith(signature):
            return extension
    return None


def _extension(filename: str) -> str:
    return f".{filename.rsplit('.', 1)[1].lower()}" if "." in filename else ""


def _font_name(font: TTFont, preferred_id: int, fallback_id: int) -> str | None:
    if "name" not in font:
        return None
    name_table = font["name"]

    # getDebugName applies the platform/locale fallback rules for us. Prefer
    # typographic family/subfamily names, then the older family names.
    for name_id in (preferred_id, fallback_id):
        value = name_table.getDebugName(name_id)
        if value and value.strip():
            return value.strip()
    return None


def _weight_class(font: TTFont) -> int:
    # Variable fonts commonly expose the useful default weight in fvar even
    # when OS/2 is missing or only contains a generic 400 value.
    try:
        for axis in font["fvar"].axes:
            if axis.axisTag == "wght":
                return int(round(axis.defaultValue / 100) * 100)
    except (KeyError, AttributeError, TypeError, ValueError):
        pass

    try:
        return int(font["OS/2"].usWeightClass)
    except (KeyError, AttributeError, TypeError, ValueError):
        return 400


def _style(font: TTFont, subfamily: str) -> str:
    if re.search(r"italic|oblique", subfamily, re.IGNORECASE):
        return "italic"
    try:
        if font["OS/2"].fsSelection & 0x01:  # italic bit
            return "italic"
    except (KeyError, AttributeError, TypeError):
        pass
    return "normal"


def _language(font: TTFont) -> str:
    try:
        codepoints = (font.getBestCmap() or {}).keys()
    except (AttributeError, KeyError, TypeError):
        codepoints = ()

    if any(codepoint in GUJARATI_RANGE for codepoint in codepoints):
        return "gujarati"
    if any(codepoint in DEVANAGARI_RANGE for codepoint in codepoints):
        return "hindi"
    return "english"


def _display_name(family: str, weight: str, style: str, full_name: str | None) -> str:
    if full_name:
        return full_name
    parts = [family]
    if weight in WEIGHT_LABELS:
        parts.append(WEIGHT_LABELS[weight])
    if style == "italic":
        parts.append("Italic")
    return " ".join(parts)


def detect_font_metadata(data: bytes, filename: str) -> dict[str, str]:
    """Return the Font model fields derived from the uploaded font bytes."""
    if not data:
        raise ValueError("The uploaded font file is empty")
    if len(data) > MAX_FONT_FILE_BYTES:
        raise ValueError("Font files must be 20 MB or smaller")
    if extension_for_font_data(data) is None:
        supported = ", ".join(sorted(SUPPORTED_FONT_EXTENSIONS))
        raise ValueError(f"Unsupported or invalid font format. Use one of: {supported}")

    try:
        font = TTFont(BytesIO(data), lazy=False, fontNumber=0)
    except Exception as exc:
        raise ValueError("The uploaded file is not a valid readable font") from exc

    try:
        family = _font_name(font, 16, 1) or filename.rsplit(".", 1)[0]
        subfamily = _font_name(font, 17, 2) or "Regular"
        weight = WEIGHT_NAMES.get(
            max(100, min(900, round(_weight_class(font) / 100) * 100)),
            "regular",
        )
        style = _style(font, subfamily)
        language = _language(font)
        full_name = _font_name(font, 4, 6)
        return {
            "name": _display_name(family, weight, style, full_name)[:100],
            "family_name": family[:100],
            "language": language,
            "weight": weight,
            "style": style,
            "preview_text": {
                "hindi": "शुभ विवाह",
                "gujarati": "શુભ લગ્ન",
                "english": "Wedding",
            }[language],
        }
    finally:
        font.close()
