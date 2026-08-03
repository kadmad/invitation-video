from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDMixin


class Font(UUIDMixin, Base):
    __tablename__ = "fonts"

    name: Mapped[str] = mapped_column(String(100))
    family_name: Mapped[str] = mapped_column(String(100))
    language: Mapped[str] = mapped_column(String(20))  # hindi, gujarati, english
    weight: Mapped[str] = mapped_column(String(20), default="regular")
    style: Mapped[str] = mapped_column(String(20), default="normal")
    file_key: Mapped[str] = mapped_column(String(500))  # MinIO path
    preview_text: Mapped[str | None] = mapped_column(String(200), nullable=True)
