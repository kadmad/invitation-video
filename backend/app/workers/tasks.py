import json
import os
import subprocess
import tempfile
import uuid

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models.font import Font
from app.models.render_job import RenderJob
from app.models.template import Template
from app.models.text_block import TextBlock
from app.services.storage_service import storage_service
from app.workers.celery_app import celery_app
from app.workers.ffmpeg_renderer import FFmpegRenderer


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

                unique_font_ids = {block.font_id for block in text_blocks if block.font_id}
                if job.font_id:
                    unique_font_ids.add(job.font_id)

                for font_id in unique_font_ids:
                    font = db.execute(select(Font).where(Font.id == font_id)).scalar_one()
                    ext = os.path.splitext(font.file_key)[1] or ".ttf"
                    fpath = os.path.join(tmp_dir, f"font_{font_id}{ext}")
                    storage_service.download_to_file(font.file_key, fpath)
                    font_paths[str(font_id)] = fpath

                if job.font_id:
                    default_font_path = font_paths[str(job.font_id)]

                job.progress = 20
                db.commit()

                # Use actual video dimensions, not template metadata
                actual_width, actual_height = _probe_video_dimensions(source_path)

                output_path = os.path.join(tmp_dir, "output.mp4")
                renderer = FFmpegRenderer(
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
                )

                job.progress = 30
                db.commit()

                renderer.render()

                job.progress = 90
                db.commit()

                output_key = f"renders/{job.user_id}/{job.id}/output.mp4"
                storage_service.upload_file(output_key, output_path, content_type="video/mp4")

                job.output_key = output_key
                job.status = "completed"
                job.progress = 100
                db.commit()

        except Exception as e:
            job.status = "failed"
            job.error_message = str(e)
            db.commit()
            raise
