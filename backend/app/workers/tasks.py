import json
import os
import re
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.font import Font
from app.models.render_job import RenderJob
from app.models.template import Template
from app.models.text_block import TextBlock
from app.models.user import User
from app.services.storage_service import storage_service
from app.services.whatsapp_service import send_render_ready
from app.workers.celery_app import celery_app
from app.workers.ffmpeg_renderer import FFmpegRenderer

LANGUAGE_TO_ITC = {
    "hindi": "hi-t-i0-und",
    "gujarati": "gu-t-i0-und",
}
GOOGLE_URL = "https://inputtools.google.com/request"


def _transliterate_sync(text: str, itc: str) -> str:
    """Sync transliteration using Google Input Tools."""
    if not text.strip():
        return text
    lines = text.split("\n")
    result_lines = []
    with httpx.Client(timeout=10) as client:
        for line in lines:
            words = line.strip().split()
            if not words:
                result_lines.append(line)
                continue
            line_results = []
            for word in words:
                try:
                    resp = client.get(GOOGLE_URL, params={"text": word, "itc": itc, "num": 1})
                    data = resp.json()
                    if data[0] == "SUCCESS" and data[1] and data[1][0][1]:
                        line_results.append(data[1][0][1][0])
                    else:
                        line_results.append(word)
                except Exception:
                    line_results.append(word)
            result_lines.append(" ".join(line_results))
    return "\n".join(result_lines)


def _probe_video_dimensions(video_path: str) -> tuple[int, int]:
    """Get actual video width/height via ffprobe."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", video_path],
        capture_output=True, text=True,
    )
    info = json.loads(result.stdout)
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "video":
            return int(stream["width"]), int(stream["height"])
    raise RuntimeError("No video stream found")

sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2").replace("postgresql+psycopg2", "postgresql")
sync_engine = create_engine(sync_url)
SyncSession = sessionmaker(sync_engine)


def _transliterate_block_content(content: str, itc: str):
    """Transliterate static parts of block content, preserving {tags}.
    Returns (new_content, char_map) where char_map maps old char indices to new ones.
    """
    parts = re.split(r"(\{\w+\})", content)
    orig_offset = 0
    new_offset = 0
    char_map: list[int] = []
    new_parts = []

    for i, part in enumerate(parts):
        if re.match(r"^\{\w+\}$", part):
            # Tag — keep as-is, 1:1 mapping
            for c in range(len(part)):
                char_map.append(new_offset + c)  # char_map[orig_offset + c]
            orig_offset += len(part)
            new_offset += len(part)
            new_parts.append(part)
        else:
            # Static text — transliterate if Latin
            if part.strip() and re.search(r"[a-zA-Z]", part):
                translated = _transliterate_sync(part, itc)
                # Preserve leading/trailing whitespace from original
                lead = len(part) - len(part.lstrip())
                trail = len(part) - len(part.rstrip())
                final_part = part[:lead] + translated.strip() + part[len(part) - trail:] if trail else part[:lead] + translated.strip()
            else:
                final_part = part

            orig_len = len(part)
            new_len = len(final_part)
            for c in range(orig_len):
                mapped = new_offset + round((c / max(1, orig_len)) * new_len)
                char_map.append(mapped)
            orig_offset += orig_len
            new_offset += new_len
            new_parts.append(final_part)

    # Map for the end position (exclusive end of ranges)
    char_map.append(new_offset)
    return "".join(new_parts), char_map


def _remap_format_ranges(format_ranges, char_map):
    """Remap format_ranges using char_map from transliteration."""
    if not format_ranges or not char_map:
        return format_ranges
    remapped = []
    for r in format_ranges:
        new_start = char_map[r["start"]] if r["start"] < len(char_map) else r["start"]
        new_end = char_map[r["end"]] if r["end"] < len(char_map) else r["end"]
        if new_end > new_start:
            remapped.append({**r, "start": new_start, "end": new_end})
    return remapped if remapped else None


def _block_to_dict(b, content_override: str | None = None, format_ranges_override=None) -> dict:
    """Serialize TextBlock to dict matching frontend TextBlock interface exactly."""
    return {
        "id": str(b.id),
        "content": content_override if content_override is not None else b.content,
        "sort_order": b.sort_order,
        "position_x": b.position_x,
        "position_y": b.position_y,
        "max_width": b.max_width,
        "font_id": str(b.font_id) if b.font_id else None,
        "font_size_ratio": b.font_size_ratio,
        "text_color": b.text_color,
        "text_align": b.text_align,
        "animation_type": b.animation_type,
        "animation_out": b.animation_out,
        "anim_in_direction": b.anim_in_direction,
        "anim_out_direction": b.anim_out_direction,
        "anim_in_duration": b.anim_in_duration,
        "anim_out_duration": b.anim_out_duration,
        "start_time": b.start_time,
        "end_time": b.end_time,
        "tag_config": b.tag_config,
        "format_ranges": format_ranges_override if format_ranges_override is not None else b.format_ranges,
    }


@celery_app.task(bind=True, name="render_video")
def render_video_task(self, job_id: str):
    with SyncSession() as db:
        job = db.execute(select(RenderJob).where(RenderJob.id == uuid.UUID(job_id))).scalar_one()
        job.status = "processing"
        job.progress = 0
        db.commit()

        try:
            template = db.execute(select(Template).where(Template.id == job.template_id)).scalar_one()
            text_blocks = db.execute(
                select(TextBlock)
                .where(TextBlock.template_id == template.id)
            ).scalars().all()

            with tempfile.TemporaryDirectory() as tmp_dir:
                source_path = os.path.join(tmp_dir, "source.mp4")
                storage_service.download_to_file(template.video_key, source_path)
                job.progress = 10
                db.commit()

                font_paths = {}
                default_font_path = None
                fallback_font_path = None

                unique_font_ids = {block.font_id for block in text_blocks if block.font_id}
                if job.font_id:
                    unique_font_ids.add(job.font_id)
                if template.default_font_id:
                    unique_font_ids.add(template.default_font_id)

                for font_id in unique_font_ids:
                    font = db.execute(select(Font).where(Font.id == font_id)).scalar_one()
                    ext = os.path.splitext(font.file_key)[1] or ".ttf"
                    fpath = os.path.join(tmp_dir, f"font_{font_id}{ext}")
                    storage_service.download_to_file(font.file_key, fpath)
                    font_paths[str(font_id)] = fpath

                if job.font_id:
                    default_font_path = font_paths[str(job.font_id)]
                if template.default_font_id:
                    fallback_font_path = font_paths.get(str(template.default_font_id))

                job.progress = 20
                db.commit()

                job.progress = 30
                db.commit()

                # Build Remotion inputProps (same as preview render)
                font_families: dict[str, str] = {}
                font_urls: dict[str, str] = {}
                font_lang_cache: dict[str, str] = {}
                for fid in unique_font_ids:
                    f = db.execute(select(Font).where(Font.id == fid)).scalar_one_or_none()
                    if f:
                        font_families[str(fid)] = f.family_name
                        font_urls[str(fid)] = storage_service.internal_presigned_url(f.file_key, expires=600)
                        font_lang_cache[str(fid)] = f.language

                # Transliterate static content + tag values, remap format_ranges
                default_lang = font_lang_cache.get(str(template.default_font_id), "english") if template.default_font_id else "english"
                tag_values = dict(job.field_values) if job.field_values else {}
                block_overrides = dict(job.block_overrides) if job.block_overrides else {}
                already_transliterated: set[str] = set()
                transliterated_content: dict[str, str] = {}
                transliterated_charmaps: dict[str, list[int]] = {}

                for block in text_blocks:
                    block_lang = "english"
                    if block.font_id and str(block.font_id) in font_lang_cache:
                        block_lang = font_lang_cache[str(block.font_id)]
                    elif default_lang != "english":
                        block_lang = default_lang

                    if block_lang == "english":
                        continue
                    itc = LANGUAGE_TO_ITC.get(block_lang)
                    if not itc:
                        continue

                    # Transliterate user-provided tag values
                    block_tags = re.findall(r"\{(\w+)\}", block.content)
                    for tag in block_tags:
                        if tag in already_transliterated or tag not in tag_values:
                            continue
                        value = tag_values[tag]
                        if value and value.strip() and re.search(r"[a-zA-Z]", value):
                            tag_values[tag] = _transliterate_sync(value, itc)
                            already_transliterated.add(tag)

                    # Transliterate static parts + build charmap for format_ranges
                    new_content, char_map = _transliterate_block_content(block.content, itc)
                    transliterated_content[str(block.id)] = new_content
                    transliterated_charmaps[str(block.id)] = char_map

                    # Transliterate block_overrides text for regional fonts
                    bid = str(block.id)
                    if bid in block_overrides and block_overrides[bid]:
                        val = block_overrides[bid]
                        if val.strip() and re.search(r"[a-zA-Z]", val):
                            block_overrides[bid] = _transliterate_sync(val, itc)

                blocks_json = []
                for b in text_blocks:
                    bid = str(b.id)
                    content_ovr = transliterated_content.get(bid)
                    ranges_ovr = None
                    if content_ovr is not None and bid in transliterated_charmaps:
                        ranges_ovr = _remap_format_ranges(b.format_ranges, transliterated_charmaps[bid])
                    blocks_json.append(_block_to_dict(b, content_ovr, ranges_ovr))

                video_url = storage_service.internal_presigned_url(template.video_key, expires=600)

                default_font_family = None
                if template.default_font_id and str(template.default_font_id) in font_families:
                    default_font_family = font_families[str(template.default_font_id)]

                # User override font family
                override_font_family = None
                if job.font_id and str(job.font_id) in font_families:
                    override_font_family = font_families[str(job.font_id)]

                # Build text color overrides
                text_color_overrides = job.text_color_override if job.text_color_override else None

                block_format_overrides = dict(job.block_format_overrides) if job.block_format_overrides else None

                input_props = {
                    "videoUrl": video_url,
                    "width": template.width,
                    "height": template.height,
                    "textBlocks": blocks_json,
                    "tagValues": tag_values,
                    "fontFamilies": font_families,
                    "fontUrls": font_urls,
                    "defaultTextColor": template.default_text_color,
                    "defaultFontFamily": default_font_family,
                    "overrideFontFamily": override_font_family,
                    "textColorOverrides": text_color_overrides,
                    "blockOverrides": block_overrides if block_overrides else None,
                    "blockFormatOverrides": block_format_overrides,
                }

                renderer_url = os.environ.get("RENDERER_URL", "http://renderer:3100")
                output_path = os.path.join(tmp_dir, "output.mp4")
                rendered = False
                render_id = str(uuid.uuid4())

                try:
                    # Non-blocking: start render, get renderId back
                    start_resp = httpx.post(
                        f"{renderer_url}/render",
                        json={
                            "compositionId": "GenericTemplate",
                            "durationInFrames": template.duration_frames,
                            "fps": template.fps,
                            "width": template.width,
                            "height": template.height,
                            "inputProps": input_props,
                            "renderId": render_id,
                        },
                        timeout=30,
                    )
                    start_resp.raise_for_status()

                    # Poll progress until done/failed
                    while True:
                        time.sleep(2)
                        prog_resp = httpx.get(f"{renderer_url}/progress/{render_id}", timeout=5)
                        data = prog_resp.json()
                        status = data.get("status", "unknown")
                        renderer_pct = data.get("progress", 0)

                        # Map renderer 0-100 to job 30-90
                        job_pct = 30 + int(renderer_pct * 0.6)
                        if job.progress < job_pct:
                            job.progress = job_pct
                            db.commit()

                        if status == "done":
                            # Download rendered file
                            dl_resp = httpx.get(
                                f"{renderer_url}/download/{render_id}",
                                timeout=120,
                            )
                            dl_resp.raise_for_status()
                            with open(output_path, "wb") as f:
                                f.write(dl_resp.content)
                            rendered = True
                            break
                        elif status == "failed":
                            raise RuntimeError(data.get("error", "Renderer failed"))
                        elif status == "unknown":
                            raise RuntimeError("Render job lost by renderer")

                except Exception as e:
                    print(f"Remotion render failed for job {job_id}, falling back to FFmpeg: {e}")

                if not rendered:
                    # FFmpeg fallback
                    actual_width, actual_height = _probe_video_dimensions(source_path)
                    ffmpeg = FFmpegRenderer(
                        source_path=source_path,
                        output_path=output_path,
                        default_font_path=default_font_path,
                        font_paths=font_paths,
                        text_blocks=text_blocks,
                        tag_values=job.field_values,
                        width=actual_width,
                        height=actual_height,
                        text_color_override=job.text_color_override,
                        default_text_color=template.default_text_color,
                        fallback_font_path=fallback_font_path,
                        block_overrides=block_overrides if block_overrides else None,
                    )
                    ffmpeg.render()

                job.progress = 90
                db.commit()

                output_key = f"renders/{job.user_id}/{job.id}/output.mp4"
                storage_service.upload_file(output_key, output_path, content_type="video/mp4")

                job.output_key = output_key
                job.status = "completed"
                job.progress = 100
                db.commit()

                # Send WhatsApp notification
                try:
                    user = db.execute(select(User).where(User.id == job.user_id)).scalar_one_or_none()
                    if user and user.phone_number:
                        send_render_ready(user.phone_number, user.full_name, str(job.id))
                    else:
                        print(f"[WhatsApp] Skipped for job {job_id}: user has no phone number")
                except Exception as notify_err:
                    print(f"[WhatsApp] Notification failed for job {job_id}: {notify_err}")

        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            db.commit()
            raise


@celery_app.task(bind=True, name="render_preview")
def render_preview_task(self, template_id: str):
    """Render preview video via Remotion SSR — pixel-perfect match with admin preview."""
    with SyncSession() as db:
        template = db.execute(
            select(Template).where(Template.id == uuid.UUID(template_id))
        ).scalar_one()

        if not template.video_key:
            return

        template.preview_status = "processing"
        db.commit()

        text_blocks = db.execute(
            select(TextBlock).where(TextBlock.template_id == template.id)
        ).scalars().all()

        # Build font info: language cache + presigned font URLs for Remotion
        font_families: dict[str, str] = {}
        font_lang_cache: dict[str, str] = {}
        all_font_ids = {b.font_id for b in text_blocks if b.font_id}
        if template.default_font_id:
            all_font_ids.add(template.default_font_id)

        font_urls: dict[str, str] = {}  # font_id -> presigned URL for Remotion
        for fid in all_font_ids:
            f = db.execute(select(Font).where(Font.id == fid)).scalar_one_or_none()
            if f:
                font_lang_cache[str(fid)] = f.language
                font_families[str(fid)] = f.family_name
                font_urls[str(fid)] = storage_service.internal_presigned_url(f.file_key, expires=600)

        default_lang = font_lang_cache.get(str(template.default_font_id), "english") if template.default_font_id else "english"

        # Build placeholder tag values from tag_config
        tag_values: dict[str, str] = {}
        for block in text_blocks:
            if not block.tag_config:
                continue
            for tag, cfg in block.tag_config.items():
                if tag not in tag_values:
                    placeholder = cfg.get("placeholder", "") if isinstance(cfg, dict) else ""
                    tag_values[tag] = placeholder or tag.replace("_", " ").title()

        # Transliterate per-block: both tag values AND static content, remap format_ranges
        already_transliterated: set[str] = set()
        transliterated_content: dict[str, str] = {}
        transliterated_charmaps: dict[str, list[int]] = {}
        for block in text_blocks:
            block_lang = "english"
            if block.font_id and str(block.font_id) in font_lang_cache:
                block_lang = font_lang_cache[str(block.font_id)]
            elif default_lang != "english":
                block_lang = default_lang

            if block_lang == "english":
                continue
            itc = LANGUAGE_TO_ITC.get(block_lang)
            if not itc:
                continue

            # Transliterate tag placeholder values
            block_tags = re.findall(r"\{(\w+)\}", block.content)
            for tag in block_tags:
                if tag in already_transliterated or tag not in tag_values:
                    continue
                value = tag_values[tag]
                if value.strip():
                    tag_values[tag] = _transliterate_sync(value, itc)
                    already_transliterated.add(tag)

            # Transliterate static parts + build charmap for format_ranges
            new_content, char_map = _transliterate_block_content(block.content, itc)
            transliterated_content[str(block.id)] = new_content
            transliterated_charmaps[str(block.id)] = char_map

        # Build text blocks as JSON for Remotion inputProps
        blocks_json = []
        for b in text_blocks:
            bid = str(b.id)
            content_ovr = transliterated_content.get(bid)
            ranges_ovr = None
            if content_ovr is not None and bid in transliterated_charmaps:
                ranges_ovr = _remap_format_ranges(b.format_ranges, transliterated_charmaps[bid])
            blocks_json.append(_block_to_dict(b, content_ovr, ranges_ovr))

        # Video URL for Remotion (internal Docker URL)
        video_url = storage_service.internal_presigned_url(template.video_key, expires=600)

        # Default font family name
        default_font_family = None
        if template.default_font_id and str(template.default_font_id) in font_families:
            default_font_family = font_families[str(template.default_font_id)]

        # Call Remotion renderer service
        renderer_url = os.environ.get("RENDERER_URL", "http://renderer:3100")
        input_props = {
            "videoUrl": video_url,
            "width": template.width,
            "height": template.height,
            "textBlocks": blocks_json,
            "tagValues": tag_values,
            "fontFamilies": font_families,
            "fontUrls": font_urls,
            "defaultTextColor": template.default_text_color,
            "defaultFontFamily": default_font_family,
        }

        try:
            render_id = str(uuid.uuid4())
            start_resp = httpx.post(
                f"{renderer_url}/render",
                json={
                    "compositionId": "GenericTemplate",
                    "durationInFrames": template.duration_frames,
                    "fps": template.fps,
                    "width": template.width,
                    "height": template.height,
                    "inputProps": input_props,
                    "renderId": render_id,
                },
                timeout=30,
            )
            start_resp.raise_for_status()

            # Poll until done
            while True:
                time.sleep(2)
                prog_resp = httpx.get(f"{renderer_url}/progress/{render_id}", timeout=5)
                data = prog_resp.json()
                status = data.get("status", "unknown")
                if status == "done":
                    break
                elif status in ("failed", "unknown"):
                    raise RuntimeError(data.get("error", f"Renderer status: {status}"))

            # Download rendered file
            dl_resp = httpx.get(f"{renderer_url}/download/{render_id}", timeout=120)
            dl_resp.raise_for_status()

            # Unique key per render to bust browser/CDN cache
            ts = int(datetime.now(timezone.utc).timestamp())
            preview_key = f"templates/{template.slug}/preview_{ts}.mp4"

            # Delete old preview if different key
            old_key = template.preview_key
            if old_key and old_key != preview_key:
                try:
                    storage_service.delete(old_key)
                except Exception:
                    pass

            storage_service.upload(preview_key, dl_resp.content, content_type="video/mp4")
            template.preview_key = preview_key
            template.preview_status = "completed"
            db.commit()
        except Exception as e:
            print(f"Remotion render failed, falling back to FFmpeg: {e}")
            try:
                # Fallback to FFmpeg render
                _ffmpeg_preview_fallback(db, template, text_blocks, tag_values)
            except Exception as ffmpeg_err:
                print(f"FFmpeg preview fallback failed: {ffmpeg_err}")
                template.preview_status = "failed"
                db.commit()


def _ffmpeg_preview_fallback(db, template, text_blocks, tag_values):
    """Fallback preview render using FFmpeg when Remotion is unavailable."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        source_path = os.path.join(tmp_dir, "source.mp4")
        storage_service.download_to_file(template.video_key, source_path)

        font_paths = {}
        unique_font_ids = {b.font_id for b in text_blocks if b.font_id}
        if template.default_font_id:
            unique_font_ids.add(template.default_font_id)
        for font_id in unique_font_ids:
            font = db.execute(select(Font).where(Font.id == font_id)).scalar_one()
            ext = os.path.splitext(font.file_key)[1] or ".ttf"
            fpath = os.path.join(tmp_dir, f"font_{font_id}{ext}")
            storage_service.download_to_file(font.file_key, fpath)
            font_paths[str(font_id)] = fpath

        fallback_font_path = None
        if template.default_font_id:
            fallback_font_path = font_paths.get(str(template.default_font_id))

        actual_width, actual_height = _probe_video_dimensions(source_path)
        output_path = os.path.join(tmp_dir, "preview.mp4")
        renderer = FFmpegRenderer(
            source_path=source_path,
            output_path=output_path,
            default_font_path=None,
            font_paths=font_paths,
            text_blocks=text_blocks,
            tag_values=tag_values,
            width=actual_width,
            height=actual_height,
            default_text_color=template.default_text_color,
            fallback_font_path=fallback_font_path,
        )
        renderer.render(preset="veryfast")

        ts = int(datetime.now(timezone.utc).timestamp())
        preview_key = f"templates/{template.slug}/preview_{ts}.mp4"
        old_key = template.preview_key
        if old_key and old_key != preview_key:
            try:
                storage_service.delete(old_key)
            except Exception:
                pass
        storage_service.upload_file(preview_key, output_path, content_type="video/mp4")
        template.preview_key = preview_key
        template.preview_status = "completed"
        db.commit()
