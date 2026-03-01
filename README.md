# Branger

A self-hosted recipe and collaborative shopping list app with AI-powered recipe import. Built with React Native (Expo) and a Python/FastAPI backend.

## Features

- **AI Recipe Import** -- paste text, enter a URL, or take a photo to auto-parse recipes
- **Manual Recipe Creation** -- full form with ingredients and step-by-step instructions
- **Recipe Sharing** -- generate shareable links for any recipe
- **Collaborative Shopping Lists** -- create lists, invite others, real-time sync via WebSocket
- **Add to List** -- add recipe ingredients to any shopping list in one tap
- **Cross-Platform** -- iOS, Android, and web
- **Self-Hosted** -- single Docker image, SQLite database, no external dependencies except Mistral AI

## Tech Stack

- **Frontend:** React Native 0.81 + Expo SDK 54, Expo Router v6, TypeScript
- **Backend:** Python 3.12, FastAPI, SQLAlchemy (async), SQLite
- **AI:** Mistral Large (recipe structuring) + Mistral OCR (photo text extraction)
- **Auth:** HS256 JWT with refresh token rotation

## Quick Start

### Docker (recommended)

```bash
git clone <repo-url>
cd branger
cp .env.example .env
# Edit .env with your SECRET_KEY and MISTRAL_API_KEY

docker compose up -d
```

The server starts on `http://localhost:8080`. The first user to register becomes admin.

### Development

**Backend:**
```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**
```bash
npm install
npm start
```

On first launch, the app prompts for the server URL (e.g., `http://localhost:8080`).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key | `change-me-in-production` |
| `MISTRAL_API_KEY` | Mistral API key for AI features | (empty) |
| `DATA_DIR` | Data directory for DB and photos | `data/` |

## CLI

```bash
# Reset a user's password (inside Docker or venv)
python -m cli reset-password user@example.com
```

## Testing

```bash
# Frontend tests
npm test

# Backend tests
cd server
.venv/bin/python -m pytest tests/ -v
```

## Project Structure

```
src/                  # React Native / Expo frontend
  app/                # Screens (file-based routing)
  components/         # Reusable UI components
  hooks/              # Custom React hooks
  lib/                # API client, auth, types, cache
server/               # Python / FastAPI backend
  app/                # Application code
    auth/             # JWT auth, refresh tokens
    recipes/          # Recipe CRUD + sharing
    lists/            # Shopping lists + membership
    parse/            # AI recipe parsing
    photos/           # Photo uploads
    ws/               # WebSocket real-time sync
  tests/              # Backend tests
  Dockerfile          # Single-image build
docker-compose.yml    # Production deployment
```

## License

Private
