# artifact-cards — Deployment Guide

The artifact-cards feature ships as pure frontend files added to the existing
Aitri Graph Visualizer project. No new server endpoints, no npm dependencies,
no database migrations.

## Added files
| File | Purpose |
|---|---|
| `js/cards.js` | CardManager ES module — toggle, open, close, render |
| `css/cards.css` | Card overlay styles — fixed-position, scrollable body, status badges |

## Prerequisites
- Node.js ≥ 20 (project uses ES Modules)
- No additional packages required

## Development setup
```bash
cd /path/to/AITRI-GRAPH
node server.js          # serves on PORT (default 3000)
```

Open `http://localhost:3000` — click any graph node to open an artifact card.

## Production deploy (Docker)
```bash
# Build from project root
docker build -t aitri-graph:artifact-cards .

# Run
docker run -d -p 3000:3000 --name aitri-graph aitri-graph:artifact-cards
```

Or via Compose (from this directory):
```bash
docker compose up -d
```

## Health check
```
GET http://localhost:3000/
Expected: 200 OK — returns index.html
```

## Rollback
The feature adds two files (`js/cards.js`, `css/cards.css`) and modifies three
(`js/graph.js`, `js/normalizer.js`, `index.html`). To roll back:
```bash
git revert <merge-commit>
# or
git checkout <previous-sha> -- js/graph.js js/normalizer.js index.html
rm js/cards.js css/cards.css
```

The server requires no restart for a git-only rollback on a static-file server.
For Docker, rebuild the image after the revert.

## Environment variables
| Name | Type | Required | Default | Example |
|---|---|---|---|---|
| `PORT` | integer | optional | `3000` | `3000` |
