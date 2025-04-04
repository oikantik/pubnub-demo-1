dev:
	docker compose up -d

dev-down:
	docker compose down -v

dev-burn:
	docker compose down -v --rmi=local

dev-burn-all:
	docker compose down -v --rmi=all