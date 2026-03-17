# Deployment — Aitri Product Graph Visualizer

## Prerequisites
- Node.js v18+ (for native `node:test`, `fetch`, ES modules)
- Docker + Docker Compose (for containerised deploy)

## Local development

```bash
node server.js
# App available at http://localhost:3000
```

Override port:
```bash
PORT=8080 node server.js
```

## Run tests

Unit + integration tests (starts server on port 3001 internally):
```bash
bash tests/run.sh
```

Unit tests only (no server required):
```bash
node --test tests/normalizer.test.js tests/config.test.js
```

## Docker deploy

Build and start:
```bash
cp .env.example .env          # review / adjust values
docker compose up -d
```

Verify health:
```bash
docker compose ps             # Status column should show "healthy"
curl http://localhost:3000/   # Should return HTML
```

Logs:
```bash
docker compose logs -f app
```

## Health check endpoint

| Endpoint | Expected | Meaning |
|----------|----------|---------|
| `GET /`  | 200 HTML | Server is up and serving the app |
| `GET /api/project?path=/valid/path` | 200 JSON | API is functional |

The Docker `HEALTHCHECK` polls `GET /` every 30 seconds with a 5-second timeout (3 retries).

## Rollback

```bash
# Restart previous image tag
docker compose down
docker compose up -d --build  # rebuild from source

# Or pin a known-good image in docker-compose.yml:
#   image: aitri-visualizer:v1.0.0
```

## Environment variables

| Variable | Type    | Required | Default | Description          |
|----------|---------|----------|---------|----------------------|
| `PORT`   | integer | false    | `3000`  | HTTP server listen port |

## Security notes

- The server rejects paths containing `..` (path traversal) with HTTP 400.
- The server rejects relative paths (non-absolute) with HTTP 400.
- The server rejects paths longer than 512 characters with HTTP 400.
- The Docker container runs as non-root user `aitri`.
- CSP, `X-Content-Type-Options`, and `X-Frame-Options` headers are set on all responses.
