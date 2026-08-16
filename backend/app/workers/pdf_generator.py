"""Generate a PDF invitation card from rendered video frames and optional location map."""

import os
import re
import subprocess
import tempfile
from urllib.parse import quote

import httpx
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PAGE_WIDTH = 5 * inch
PAGE_HEIGHT = 7 * inch

_registered_fonts: set[str] = set()

# Fallback font keys in S3 for regional text
REGIONAL_FONT_FALLBACKS = {
    "gujarati": "fonts/NotoSansGujarati.ttf",
    "hindi": "fonts/NotoSansDevanagari.ttf",
}

CATEGORY_STYLES = {
    "wedding": {
        "accent": "#D4A574",
        "accent_light": "#F5E6D3",
        "border_radius": 0,
        "border_width": 2,
        "corner_style": "ornament",
        "map_marker_color": "0xD4A574",
        "location_emoji": "\U0001F492",
    },
    "birthday": {
        "accent": "#7C3AED",
        "accent_light": "#EDE9FE",
        "border_radius": 12,
        "border_width": 2.5,
        "corner_style": "confetti",
        "map_marker_color": "0x7C3AED",
        "location_emoji": "\U0001F389",
    },
    "engagement": {
        "accent": "#E11D48",
        "accent_light": "#FFE4E6",
        "border_radius": 0,
        "border_width": 2,
        "corner_style": "heart",
        "map_marker_color": "0xE11D48",
        "location_emoji": "\U0001F48D",
    },
}

DEFAULT_STYLE = {
    "accent": "#475569",
    "accent_light": "#F1F5F9",
    "border_radius": 0,
    "border_width": 1.5,
    "corner_style": "minimal",
    "map_marker_color": "0x475569",
    "location_emoji": "\U0001F4CD",
}


def _detect_script(text: str) -> str | None:
    """Detect if text contains Gujarati or Devanagari script."""
    for ch in text:
        cp = ord(ch)
        if 0x0A80 <= cp <= 0x0AFF:
            return "gujarati"
        if 0x0900 <= cp <= 0x097F:
            return "hindi"
    return None


def _register_font(font_path: str) -> str | None:
    if not font_path or not os.path.exists(font_path):
        return None
    if font_path in _registered_fonts:
        basename = os.path.splitext(os.path.basename(font_path))[0]
        return f"Custom-{basename}"
    try:
        basename = os.path.splitext(os.path.basename(font_path))[0]
        font_name = f"Custom-{basename}"
        pdfmetrics.registerFont(TTFont(font_name, font_path))
        _registered_fonts.add(font_path)
        return font_name
    except Exception as e:
        print(f"[PDF] Font registration failed for {font_path}: {e}")
        return None


def _ensure_regional_font(text: str, custom_font: str | None, tmp_dir: str) -> str | None:
    """If custom_font is None and text has regional chars, download a fallback from S3."""
    if custom_font:
        return custom_font

    script = _detect_script(text)
    if not script:
        return None

    s3_key = REGIONAL_FONT_FALLBACKS.get(script)
    if not s3_key:
        return None

    try:
        from app.services.storage_service import storage_service
        font_path = os.path.join(tmp_dir, f"fallback_{script}.ttf")
        if not os.path.exists(font_path):
            storage_service.download_to_file(s3_key, font_path)
        return _register_font(font_path)
    except Exception as e:
        print(f"[PDF] Fallback font download failed for {script}: {e}")
        return None


def _get_font(custom_font: str | None, bold: bool = False) -> str:
    if custom_font:
        return custom_font
    return "Helvetica-Bold" if bold else "Helvetica"


def _render_text_image(
    text: str,
    font_path: str,
    font_size: int = 36,
    color: tuple = (30, 41, 59),
    max_width_px: int = 800,
    line_spacing: int = 12,
    tmp_dir: str = "/tmp",
) -> str | None:
    """Render text as a transparent PNG using Pillow with raqm layout for proper Indic shaping."""
    try:
        pil_font = ImageFont.truetype(font_path, font_size)
    except Exception as e:
        print(f"[PDF] Pillow font load failed: {e}")
        return None

    layout_engine = "raqm"
    try:
        ImageFont.truetype(font_path, font_size, layout_engine="raqm")
    except Exception:
        layout_engine = "basic"
        print("[PDF] raqm not available, falling back to basic layout")

    if layout_engine == "raqm":
        pil_font = ImageFont.truetype(font_path, font_size, layout_engine="raqm")

    # Word-wrap
    words = text.split()
    lines: list[str] = []
    current = ""
    dummy = Image.new("RGBA", (1, 1))
    draw = ImageDraw.Draw(dummy)
    for word in words:
        test = f"{current} {word}".strip() if current else word
        bbox = draw.textbbox((0, 0), test, font=pil_font)
        if bbox[2] - bbox[0] <= max_width_px:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    lines = lines[:6]

    if not lines:
        return None

    # Measure each line
    line_heights = []
    line_widths = []
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=pil_font)
        line_widths.append(bbox[2] - bbox[0])
        line_heights.append(bbox[3] - bbox[1])

    img_w = max(line_widths) + 20
    img_h = sum(line_heights) + line_spacing * (len(lines) - 1) + 20

    img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    y = 10
    for i, line in enumerate(lines):
        draw.text((10, y), line, font=pil_font, fill=(*color, 255))
        y += line_heights[i] + line_spacing

    out_path = os.path.join(tmp_dir, "text_rendered.png")
    img.save(out_path, "PNG")
    return out_path


def _resolve_short_url(url: str) -> str:
    """Follow redirects on shortened Google Maps URLs (goo.gl, maps.app.goo.gl)."""
    if "goo.gl" not in url and "maps.app" not in url:
        return url
    try:
        resp = httpx.head(url, follow_redirects=True, timeout=10)
        resolved = str(resp.url)
        print(f"[PDF] Resolved short URL: {url} -> {resolved}")
        return resolved
    except Exception as e:
        print(f"[PDF] Short URL resolve failed: {e}")
        return url


def _parse_maps_url(url: str) -> tuple[float | None, float | None, str | None]:
    """Extract lat/lng and place_id from a Google Maps URL.
    Resolves short URLs first. Returns (lat, lng, place_id)."""
    url = _resolve_short_url(url)

    # Pattern: @lat,lng or /place/.../@lat,lng
    coords = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if coords:
        lat, lng = float(coords.group(1)), float(coords.group(2))
        pid = re.search(r"place_id[=:]([A-Za-z0-9_-]+)", url)
        return lat, lng, pid.group(1) if pid else None

    # Pattern: ?q=lat,lng or destination=lat,lng
    coords2 = re.search(r"(?:destination|q|center|query)=(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if coords2:
        lat, lng = float(coords2.group(1)), float(coords2.group(2))
        pid = re.search(r"destination_place_id=([A-Za-z0-9_-]+)", url)
        return lat, lng, pid.group(1) if pid else None

    # Pattern: place/Name/data=... with 3d=lat!4d=lng
    data_coords = re.search(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)", url)
    if data_coords:
        return float(data_coords.group(1)), float(data_coords.group(2)), None

    # Pattern: ftid embedded in URL (Google internal) - extract via place_id param
    pid_match = re.search(r"(?:place_id|ftid)=([A-Za-z0-9_:.-]+)", url)

    return None, None, pid_match.group(1) if pid_match else None


def _translate_to_english(text: str) -> str | None:
    """Translate regional text to English using Google Translate for better geocoding."""
    has_non_latin = any(ord(ch) > 0x024F for ch in text if not ch.isspace() and not ch.isdigit())
    if not has_non_latin:
        return None
    try:
        resp = httpx.get(
            "https://translate.googleapis.com/translate_a/single",
            params={"client": "gtx", "sl": "auto", "tl": "en", "dt": "t", "q": text},
            timeout=10,
        )
        data = resp.json()
        if data and data[0]:
            translated = "".join(part[0] for part in data[0] if part[0])
            if translated and translated.strip() != text.strip():
                print(f"[PDF] Translated for geocoding: '{text}' -> '{translated}'")
                return translated.strip()
    except Exception as e:
        print(f"[PDF] Translation failed: {e}")
    return None


def _geocode_location(location_text: str, api_key: str | None) -> tuple[float | None, float | None, str | None, str | None]:
    """Returns (lat, lng, place_name, directions_url).
    Translates regional text to English for better geocoding accuracy.
    Keeps original text for display."""
    if not location_text or not location_text.strip():
        return None, None, None, None

    encoded = quote(location_text, safe="")
    fallback_url = f"https://www.google.com/maps/dir/?api=1&destination={encoded}"

    if not api_key:
        return None, None, location_text, fallback_url

    # Translate regional text to English for geocoding
    english_text = _translate_to_english(location_text)
    search_text = english_text or location_text

    # Places API — exact venue match (search in English for accuracy)
    try:
        resp = httpx.get(
            "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
            params={
                "input": search_text,
                "inputtype": "textquery",
                "fields": "geometry,name,formatted_address,place_id",
                "language": "en",
                "key": api_key,
            },
            timeout=10,
        )
        data = resp.json()
        if data.get("status") == "OK" and data.get("candidates"):
            place = data["candidates"][0]
            loc = place["geometry"]["location"]
            lat, lng = loc["lat"], loc["lng"]
            place_id = place.get("place_id", "")
            dirs_url = f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"
            if place_id:
                dirs_url += f"&destination_place_id={place_id}"
            return lat, lng, location_text, dirs_url
    except Exception as e:
        print(f"[PDF] Places API failed, trying Geocoding: {e}")

    # Fallback Geocoding (also in English)
    try:
        resp = httpx.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": search_text, "language": "en", "key": api_key},
            timeout=10,
        )
        data = resp.json()
        if data.get("status") == "OK" and data.get("results"):
            loc = data["results"][0]["geometry"]["location"]
            lat, lng = loc["lat"], loc["lng"]
            place_id = data["results"][0].get("place_id", "")
            dirs_url = f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"
            if place_id:
                dirs_url += f"&destination_place_id={place_id}"
            return lat, lng, location_text, dirs_url
    except Exception as e:
        print(f"[PDF] Geocoding failed: {e}")

    return None, None, location_text, fallback_url


def _geocode_nominatim(location_text: str) -> tuple[float | None, float | None]:
    try:
        resp = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": location_text, "format": "json", "limit": 1},
            headers={"User-Agent": "BringMyMatterPDF/1.0"},
            timeout=10,
        )
        results = resp.json()
        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        print(f"[PDF] Nominatim geocoding failed: {e}")
    return None, None


def _fetch_map_image(lat: float, lng: float, google_api_key: str | None, marker_color: str, tmp_dir: str) -> str | None:
    map_path = os.path.join(tmp_dir, "map.png")

    if google_api_key:
        style_params = (
            "&style=feature:water|element:geometry|color:0xc9d1d9"
            "&style=feature:landscape|element:geometry|color:0xf0f3f5"
            "&style=feature:road|element:geometry|color:0xdfe3e8"
            "&style=feature:road|element:labels.text.fill|color:0x9ca3af"
            "&style=feature:road.highway|element:geometry|color:0xcbd5e1"
            "&style=feature:poi|visibility:off"
            "&style=feature:poi.park|visibility:on|element:geometry|color:0xd1e7dd"
            "&style=feature:transit|visibility:off"
            "&style=feature:administrative|element:labels.text.fill|color:0x6b7280"
        )
        # Zoom 18 for building-level precision, square aspect for side layout
        map_url = (
            f"https://maps.googleapis.com/maps/api/staticmap"
            f"?center={lat},{lng}&zoom=18&size=400x400&scale=2"
            f"&markers=color:{marker_color}|{lat},{lng}"
            f"{style_params}"
            f"&key={google_api_key}"
        )
        try:
            resp = httpx.get(map_url, timeout=15)
            if resp.status_code == 200 and len(resp.content) > 1000:
                with open(map_path, "wb") as f:
                    f.write(resp.content)
                return map_path
            else:
                print(f"[PDF] Google Static Maps status={resp.status_code}, len={len(resp.content)}")
        except Exception as e:
            print(f"[PDF] Google Static Maps failed: {e}")

    osm_url = (
        f"https://staticmap.openstreetmap.de/staticmap.php"
        f"?center={lat},{lng}&zoom=18&size=400x400"
        f"&markers={lat},{lng},red-pushpin"
    )
    try:
        resp = httpx.get(osm_url, timeout=15, headers={"User-Agent": "BringMyMatterPDF/1.0"})
        if resp.status_code == 200 and len(resp.content) > 1000:
            with open(map_path, "wb") as f:
                f.write(resp.content)
            return map_path
    except Exception as e:
        print(f"[PDF] OSM static map failed: {e}")

    return None


def _extract_frames(video_path: str, timestamps: list[float], tmp_dir: str) -> list[str]:
    frame_paths = []
    for i, ts in enumerate(timestamps):
        out_path = os.path.join(tmp_dir, f"frame_{i}.jpg")
        cmd = [
            "ffmpeg", "-y",
            "-ss", str(ts),
            "-i", video_path,
            "-frames:v", "1",
            "-q:v", "2",
            out_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and os.path.exists(out_path):
            frame_paths.append(out_path)
        else:
            print(f"[PDF] Frame extraction failed at {ts}s: {result.stderr[:200]}")
    return frame_paths


def _draw_border(c: canvas.Canvas, style: dict):
    accent = HexColor(style["accent"])
    lw = style["border_width"]
    margin = 12
    c.setStrokeColor(accent)
    c.setLineWidth(lw)

    x0, y0 = margin, margin
    x1, y1 = PAGE_WIDTH - margin, PAGE_HEIGHT - margin

    if style["border_radius"] > 0:
        c.roundRect(x0, y0, x1 - x0, y1 - y0, style["border_radius"], stroke=1, fill=0)
    else:
        c.rect(x0, y0, x1 - x0, y1 - y0, stroke=1, fill=0)

    corner_style = style["corner_style"]
    if corner_style == "ornament":
        _draw_ornament_corners(c, accent, margin)
    elif corner_style == "confetti":
        _draw_confetti_dots(c, accent, margin)
    elif corner_style == "heart":
        _draw_heart_corners(c, accent, margin)


def _draw_ornament_corners(c: canvas.Canvas, accent: Color, margin: float):
    size = 20
    c.setStrokeColor(accent)
    c.setLineWidth(1.5)
    corners = [
        (margin, PAGE_HEIGHT - margin, 1, -1),
        (PAGE_WIDTH - margin, PAGE_HEIGHT - margin, -1, -1),
        (margin, margin, 1, 1),
        (PAGE_WIDTH - margin, margin, -1, 1),
    ]
    for cx, cy, dx, dy in corners:
        p = c.beginPath()
        p.moveTo(cx + dx * size, cy)
        p.curveTo(cx + dx * size * 0.5, cy, cx, cy + dy * size * 0.5, cx, cy + dy * size)
        c.drawPath(p, stroke=1, fill=0)
        p2 = c.beginPath()
        p2.moveTo(cx + dx * (size * 0.6), cy)
        p2.curveTo(cx + dx * size * 0.3, cy, cx, cy + dy * size * 0.3, cx, cy + dy * (size * 0.6))
        c.drawPath(p2, stroke=1, fill=0)


def _draw_confetti_dots(c: canvas.Canvas, accent: Color, margin: float):
    import random
    rng = random.Random(42)
    c.setFillColor(accent)
    for _ in range(24):
        x = rng.uniform(margin + 4, PAGE_WIDTH - margin - 4)
        y = rng.uniform(margin + 4, PAGE_HEIGHT - margin - 4)
        if (x > margin + 25 and x < PAGE_WIDTH - margin - 25 and
                y > margin + 25 and y < PAGE_HEIGHT - margin - 25):
            continue
        r = rng.uniform(1.5, 3.5)
        c.circle(x, y, r, stroke=0, fill=1)


def _draw_heart_corners(c: canvas.Canvas, accent: Color, margin: float):
    c.setFillColor(accent)
    positions = [
        (margin + 14, PAGE_HEIGHT - margin - 14),
        (PAGE_WIDTH - margin - 14, PAGE_HEIGHT - margin - 14),
        (margin + 14, margin + 14),
        (PAGE_WIDTH - margin - 14, margin + 14),
    ]
    for hx, hy in positions:
        _draw_small_heart(c, hx, hy, 5)


def _draw_small_heart(c: canvas.Canvas, cx: float, cy: float, size: float):
    p = c.beginPath()
    p.moveTo(cx, cy - size * 0.4)
    p.curveTo(cx - size, cy + size * 0.6, cx - size * 0.5, cy + size, cx, cy + size * 0.5)
    p.curveTo(cx + size * 0.5, cy + size, cx + size, cy + size * 0.6, cx, cy - size * 0.4)
    c.drawPath(p, stroke=0, fill=1)


def _draw_frame_page(c: canvas.Canvas, frame_path: str, style: dict):
    _draw_border(c, style)

    margin = 20
    img = ImageReader(frame_path)
    iw, ih = img.getSize()
    avail_w = PAGE_WIDTH - 2 * margin
    avail_h = PAGE_HEIGHT - 2 * margin

    scale = min(avail_w / iw, avail_h / ih)
    draw_w = iw * scale
    draw_h = ih * scale

    x = (PAGE_WIDTH - draw_w) / 2
    y = (PAGE_HEIGHT - draw_h) / 2

    c.drawImage(frame_path, x, y, draw_w, draw_h, preserveAspectRatio=True)


def _draw_location_page(
    c: canvas.Canvas,
    style: dict,
    directions_url: str,
    lat: float | None,
    lng: float | None,
    place_name: str | None,
    google_maps_api_key: str | None,
    tmp_dir: str,
    custom_font: str | None = None,
    font_file_path: str | None = None,
):
    _draw_border(c, style)
    accent = HexColor(style["accent"])
    accent_light = HexColor(style.get("accent_light", "#F1F5F9"))
    marker_color = style.get("map_marker_color", "0xFF0000")

    # Auto-detect regional font if none provided
    regional_font_path = font_file_path
    if place_name and not regional_font_path:
        custom_font = _ensure_regional_font(place_name, custom_font, tmp_dir)

    # --- Top section: header ---
    top_y = PAGE_HEIGHT - 35
    bar_h = 3
    c.setFillColor(accent)
    c.rect(PAGE_WIDTH / 2 - 40, top_y, 80, bar_h, stroke=0, fill=1)

    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(HexColor("#94A3B8"))
    c.drawCentredString(PAGE_WIDTH / 2, top_y - 18, "VENUE LOCATION")

    content_y = top_y - 38

    # Geocode if no coords
    map_lat, map_lng = lat, lng
    if map_lat is None and place_name:
        map_lat, map_lng = _geocode_nominatim(place_name)

    map_path = None
    if map_lat is not None and map_lng is not None:
        map_path = _fetch_map_image(map_lat, map_lng, google_maps_api_key, marker_color, tmp_dir)

    # Place name / address block
    if place_name:
        is_regional = _detect_script(place_name) is not None
        text_rendered_via_pillow = False

        # Use Pillow for regional text (proper conjunct/half-letter shaping)
        if is_regional and regional_font_path and os.path.exists(regional_font_path):
            max_px = int((PAGE_WIDTH - 56) * 2.5)
            text_img = _render_text_image(
                place_name,
                regional_font_path,
                font_size=36,
                color=(30, 41, 59),
                max_width_px=max_px,
                line_spacing=10,
                tmp_dir=tmp_dir,
            )
            if text_img:
                pil_img = Image.open(text_img)
                img_w_px, img_h_px = pil_img.size
                # Scale to fit card width
                card_w = PAGE_WIDTH - 48
                scale = (card_w - 32) / img_w_px
                draw_w = img_w_px * scale
                draw_h = img_h_px * scale

                card_h = draw_h + 24
                card_x = 24
                card_y = content_y - card_h

                c.setFillColor(accent_light)
                c.roundRect(card_x, card_y, card_w, card_h, 10, stroke=0, fill=1)

                c.setFillColor(accent)
                c.rect(card_x, card_y + 6, 3, card_h - 12, stroke=0, fill=1)

                img_x = card_x + 16
                img_y = card_y + 12
                c.drawImage(text_img, img_x, img_y, draw_w, draw_h, mask="auto")

                c.linkURL(directions_url, (card_x, card_y, card_x + card_w, card_y + card_h), relative=0)
                content_y = card_y - 14
                text_rendered_via_pillow = True

        if not text_rendered_via_pillow:
            # Fallback: reportlab drawString (fine for Latin text)
            text_font = _get_font(custom_font)
            font_size = 13
            c.setFont(text_font, font_size)
            max_text_w = PAGE_WIDTH - 56

            words = place_name.split()
            lines: list[str] = []
            current_line = ""
            for word in words:
                test = f"{current_line} {word}".strip() if current_line else word
                if c.stringWidth(test, text_font, font_size) <= max_text_w:
                    current_line = test
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
            if current_line:
                lines.append(current_line)
            lines = lines[:5]

            line_h = 18
            card_h = len(lines) * line_h + 24
            card_x = 24
            card_w = PAGE_WIDTH - 48
            card_y = content_y - card_h

            c.setFillColor(accent_light)
            c.roundRect(card_x, card_y, card_w, card_h, 10, stroke=0, fill=1)

            c.setFillColor(accent)
            c.rect(card_x, card_y + 6, 3, card_h - 12, stroke=0, fill=1)

            c.setFillColor(HexColor("#1E293B"))
            c.setFont(text_font, font_size)
            text_y = card_y + card_h - 16
            for line in lines:
                c.drawString(card_x + 16, text_y, line)
                text_y -= line_h

            c.linkURL(directions_url, (card_x, card_y, card_x + card_w, card_y + card_h), relative=0)
            content_y = card_y - 14

    # Map image — centered, moderate size
    if map_path:
        map_size = PAGE_WIDTH - 60
        map_x = 30
        map_y = content_y - map_size

        c.drawImage(map_path, map_x, map_y, map_size, map_size)

        # Accent border
        c.setStrokeColor(accent)
        c.setLineWidth(1.5)
        c.roundRect(map_x, map_y, map_size, map_size, 8, stroke=1, fill=0)

        # Map tappable — opens directions
        c.linkURL(directions_url, (map_x, map_y, map_x + map_size, map_y + map_size), relative=0)

        content_y = map_y - 16

    # "Get Directions" button
    btn_font = "Helvetica-Bold"
    btn_size = 11
    btn_text = "Get Directions"
    c.setFont(btn_font, btn_size)
    btn_text_w = c.stringWidth(btn_text, btn_font, btn_size)
    pad_x = 22
    pad_y = 10
    btn_w = btn_text_w + 2 * pad_x + 14
    btn_h = btn_size + 2 * pad_y
    btn_x = (PAGE_WIDTH - btn_w) / 2
    btn_y = max(content_y - btn_h, 50)

    # Button background
    c.setFillColor(accent)
    c.roundRect(btn_x, btn_y, btn_w, btn_h, btn_h / 2, stroke=0, fill=1)

    # Navigation arrow
    arr_x = btn_x + 14
    arr_cy = btn_y + btn_h / 2
    c.setFillColor(white)
    p = c.beginPath()
    p.moveTo(arr_x, arr_cy + 4)
    p.lineTo(arr_x + 7, arr_cy)
    p.lineTo(arr_x, arr_cy - 4)
    p.close()
    c.drawPath(p, stroke=0, fill=1)

    # Button text
    c.setFont(btn_font, btn_size)
    c.drawCentredString(PAGE_WIDTH / 2 + 5, btn_y + pad_y, btn_text)
    c.linkURL(directions_url, (btn_x, btn_y, btn_x + btn_w, btn_y + btn_h), relative=0)

    # Helper text
    c.setFont("Helvetica", 7)
    c.setFillColor(HexColor("#94A3B8"))
    c.drawCentredString(PAGE_WIDTH / 2, btn_y - 12, "Tap map or button to navigate from your location")

    # Bottom accent bar
    c.setFillColor(accent)
    c.rect(PAGE_WIDTH / 2 - 40, 28, 80, bar_h, stroke=0, fill=1)


def generate_invitation_pdf(
    video_path: str,
    snapshot_timestamps: list[float],
    location_text: str | None,
    category_slug: str,
    field_values: dict[str, str],
    output_path: str,
    google_maps_api_key: str | None = None,
    font_path: str | None = None,
    location_url: str | None = None,
) -> str:
    style = CATEGORY_STYLES.get(category_slug, DEFAULT_STYLE)
    custom_font = _register_font(font_path) if font_path else None

    with tempfile.TemporaryDirectory() as tmp_dir:
        frame_paths = _extract_frames(video_path, snapshot_timestamps, tmp_dir)
        if not frame_paths and not location_text:
            raise ValueError("No frames extracted and no location provided")

        c = canvas.Canvas(output_path, pagesize=(PAGE_WIDTH, PAGE_HEIGHT))

        for i, frame_path in enumerate(frame_paths):
            if i > 0:
                c.showPage()
            _draw_frame_page(c, frame_path, style)

        if location_text and location_text.strip():
            if frame_paths:
                c.showPage()

            lat, lng, place_name, directions_url = None, None, location_text, None
            user_provided_url = False

            if location_url and location_url.strip():
                # User provided exact Google Maps link — always use as directions URL
                user_provided_url = True
                directions_url = location_url.strip()
                lat, lng, place_id = _parse_maps_url(location_url)
                if lat and lng:
                    print(f"[PDF] Parsed user Maps link: lat={lat}, lng={lng}")
                else:
                    print(f"[PDF] Could not parse coords from user link, will geocode for map image only")

            if lat is None:
                # Geocode for map coords (and directions URL if user didn't provide link)
                geo_lat, geo_lng, _, geo_url = _geocode_location(location_text, google_maps_api_key)
                lat, lng = geo_lat, geo_lng
                if not user_provided_url:
                    directions_url = geo_url

            _draw_location_page(
                c, style,
                directions_url or f"https://www.google.com/maps/dir/?api=1&destination={quote(location_text)}",
                lat, lng, place_name,
                google_maps_api_key, tmp_dir,
                custom_font=custom_font,
                font_file_path=font_path,
            )

        c.save()

    return output_path
