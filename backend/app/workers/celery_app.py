from celery import Celery

from app.config import settings

celery_app = Celery(
    "invitation_video",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_track_started=True,
    # Crash recovery: a task is only removed from the Redis queue after it
    # finishes successfully (acks_late). If the worker process dies mid-task
    # (container killed, machine shutdown/crash) with a clean signal, Celery
    # detects the lost worker and reject_on_worker_lost puts the task straight
    # back on the queue immediately. For dirtier deaths (power loss, network
    # partition) with no such signal, the Redis broker's visibility_timeout
    # is the backstop — the task becomes re-deliverable after this many
    # seconds even with no explicit reject. Set well above the longest
    # realistic render so a slow-but-healthy render is never redelivered out
    # from under itself. Either way the retried task re-runs render_video_task
    # from scratch (it re-fetches everything from the DB and resets
    # job.progress to 0 at the top), so redelivery is safe and idempotent.
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_transport_options={"visibility_timeout": 3600},
    worker_prefetch_multiplier=1,
    worker_concurrency=1,
)

celery_app.autodiscover_tasks(["app.workers"])
