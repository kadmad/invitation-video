.PHONY: up down build logs shell-backend shell-frontend migrate seed

up:
	docker compose up -d

down:
	docker compose down

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
