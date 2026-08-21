.PHONY: up down build logs shell-backend shell-frontend migrate seed up-worker down-worker logs-worker-stack ps-worker

up:
	docker compose up -d

down:
	docker compose down

# No `docker compose down` here any more: the worker stack now has its own
# project name (see docker-compose.local-worker.yml), so it coexists with the
# dev stack instead of replacing it.
up-worker:
	docker compose -f docker-compose.local-worker.yml --env-file .env.production-worker up -d --build

down-worker:
	docker compose -f docker-compose.local-worker.yml --env-file .env.production-worker down

logs-worker-stack:
	docker compose -f docker-compose.local-worker.yml logs -f

ps-worker:
	docker compose -f docker-compose.local-worker.yml ps

build:
	docker compose build

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend

logs-worker:
	docker compose logs -f worker

shell-backend:
	docker compose exec backend bash

shell-frontend:
	docker compose exec frontend sh

migrate:
	docker compose exec backend alembic upgrade head

migration:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

seed:
	docker compose exec backend python -m app.seed

restart-backend:
	docker compose restart backend worker

restart-frontend:
	docker compose restart frontend

ps:
	docker compose ps

clean:
	docker compose down -v --remove-orphans
