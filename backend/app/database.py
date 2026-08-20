from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Optional second connection to production Postgres (see PROD_DATABASE_URL) —
# only ever used to read the manual-render queue for display; nothing writes
# through this session (claim/cancel/upload stay scoped to `async_session`
# above, so those actions simply can't reach production jobs by accident —
# the ids don't exist in the local DB, and the queries below never handle
# writes at all).
prod_engine = create_async_engine(settings.PROD_DATABASE_URL, echo=False) if settings.PROD_DATABASE_URL else None
prod_async_session = (
    async_sessionmaker(prod_engine, class_=AsyncSession, expire_on_commit=False) if prod_engine else None
)
