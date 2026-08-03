"""Seed script for initial data."""
import os
import uuid
import urllib.request

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models.base import Base
from app.models.category import Category
from app.models.font import Font
from app.models.template import Template
from app.models.text_block import TextBlock
from app.models.user import User
from app.services.storage_service import storage_service
from app.utils.security import hash_password

sync_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("postgresql+asyncpg", "postgresql")
engine = create_engine(sync_url)
SessionLocal = sessionmaker(engine)


def seed():
    with SessionLocal() as db:
        # Admin user
        existing = db.execute(select(User).where(User.email == "admin@example.com")).scalar_one_or_none()
        if not existing:
            admin = User(
                email="admin@example.com",
                hashed_password=hash_password("admin123"),
                full_name="Admin User",
                is_admin=True,
            )
            db.add(admin)
            print("Created admin user: admin@example.com / admin123")

        # Categories
        categories_data = [
            {"name": "Wedding", "slug": "wedding", "description": "Wedding invitation templates", "sort_order": 1},
            {"name": "Birthday", "slug": "birthday", "description": "Birthday invitation templates", "sort_order": 2},
            {"name": "Engagement", "slug": "engagement", "description": "Engagement ceremony templates", "sort_order": 3},
        ]

        for cat_data in categories_data:
            existing = db.execute(select(Category).where(Category.slug == cat_data["slug"])).scalar_one_or_none()
            if not existing:
                db.add(Category(**cat_data))
                print(f"Created category: {cat_data['name']}")

        db.commit()

        # Fonts - download from Google Fonts and upload to MinIO
        fonts_data = [
            {
                "name": "Noto Sans Devanagari",
                "family_name": "Noto Sans Devanagari",
                "language": "hindi",
                "preview_text": "नमस्ते",
                "url": "https://github.com/google/fonts/raw/main/ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf",
                "filename": "NotoSansDevanagari.ttf",
            },
            {
                "name": "Noto Sans Gujarati",
                "family_name": "Noto Sans Gujarati",
                "language": "gujarati",
                "preview_text": "નમસ્તે",
                "url": "https://github.com/google/fonts/raw/main/ofl/notosansgujarati/NotoSansGujarati%5Bwdth%2Cwght%5D.ttf",
                "filename": "NotoSansGujarati.ttf",
            },
            {
                "name": "Poppins",
                "family_name": "Poppins",
                "language": "english",
                "preview_text": "Hello World",
                "url": "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Regular.ttf",
                "filename": "Poppins-Regular.ttf",
            },
            {
                "name": "Great Vibes",
                "family_name": "Great Vibes",
                "language": "english",
                "preview_text": "Elegant Script",
                "url": "https://github.com/google/fonts/raw/main/ofl/greatvibes/GreatVibes-Regular.ttf",
                "filename": "GreatVibes-Regular.ttf",
            },
        ]

        for font_data in fonts_data:
            existing = db.execute(
                select(Font).where(Font.name == font_data["name"])
            ).scalar_one_or_none()
            if existing:
                continue

            file_key = f"fonts/{font_data['filename']}"
            try:
                print(f"Downloading {font_data['name']}...")
                tmp_path = f"/tmp/{font_data['filename']}"
                urllib.request.urlretrieve(font_data["url"], tmp_path)
                with open(tmp_path, "rb") as f:
                    font_bytes = f.read()
                storage_service.upload(file_key, font_bytes, content_type="font/ttf")
                os.remove(tmp_path)

                font = Font(
                    name=font_data["name"],
                    family_name=font_data["family_name"],
                    language=font_data["language"],
                    weight="regular",
                    style="normal",
                    file_key=file_key,
                    preview_text=font_data["preview_text"],
                )
                db.add(font)
                db.commit()
                print(f"Created font: {font_data['name']}")
            except Exception as e:
                print(f"Failed to seed font {font_data['name']}: {e}")
                db.rollback()

        # Sample template (no video yet - admin uploads via API)
        wedding_cat = db.execute(select(Category).where(Category.slug == "wedding")).scalar_one()
        existing_template = db.execute(select(Template).where(Template.slug == "royal-wedding")).scalar_one_or_none()
        if not existing_template:
            template = Template(
                name="Royal Wedding",
                slug="royal-wedding",
                category_id=wedding_cat.id,
                duration_frames=300,
                fps=30,
                width=1080,
                height=1920,
            )
            db.add(template)
            db.flush()

            blocks = [
                TextBlock(
                    template_id=template.id,
                    content="{bride_name}",
                    sort_order=0,
                    position_x=0.5, position_y=0.35,
                    font_size_ratio=0.04,
                    text_color="#FFD700",
                    animation_type="fade_in",
                    start_time=1.0, end_time=1.667,
                    tag_config={"bride_name": {"label": "Bride's Name"}},
                ),
                TextBlock(
                    template_id=template.id,
                    content="{groom_name}",
                    sort_order=1,
                    position_x=0.5, position_y=0.45,
                    font_size_ratio=0.04,
                    text_color="#FFD700",
                    animation_type="fade_in",
                    start_time=2.0, end_time=2.667,
                    tag_config={"groom_name": {"label": "Groom's Name"}},
                ),
                TextBlock(
                    template_id=template.id,
                    content="{wedding_date}",
                    sort_order=2,
                    position_x=0.5, position_y=0.60,
                    font_size_ratio=0.03,
                    text_color="#FFFFFF",
                    animation_type="slide_up",
                    start_time=3.0, end_time=3.667,
                    tag_config={"wedding_date": {"label": "Wedding Date"}},
                ),
                TextBlock(
                    template_id=template.id,
                    content="{venue}",
                    sort_order=3,
                    position_x=0.5, position_y=0.70,
                    font_size_ratio=0.025,
                    text_color="#FFFFFF",
                    animation_type="slide_up",
                    start_time=4.0, end_time=4.667,
                    tag_config={"venue": {"label": "Venue"}},
                ),
            ]
            for b in blocks:
                db.add(b)

            db.commit()
            print("Created sample template: Royal Wedding")

    print("Seed complete.")


if __name__ == "__main__":
    seed()
