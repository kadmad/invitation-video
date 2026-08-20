from celery import Celery

from app.config import settings

# Dispatch-only client for production's Redis broker — no tasks are defined
# here (this process never executes render_video_task itself for prod jobs;
# the actual production worker, running the identical codebase against
# PROD_REDIS_URL, does). send_task by name is enough to enqueue a message
# that worker will pick up and run against ITS OWN prod DB/S3 — dispatching
# through the normal `celery_app` (bound to local Redis) would instead
# enqueue on local Redis, where no worker even knows about this job's row
# (it doesn't exist in the local DB), so the task would just fail to find it.
prod_celery_app = (
    Celery("invitation_video", broker=settings.PROD_REDIS_URL, backend=settings.PROD_REDIS_URL)
    if settings.PROD_REDIS_URL
    else None
)
