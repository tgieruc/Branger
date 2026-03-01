# Self-Hosted Migration Design

**Date:** 2026-03-01
**Status:** Approved
**Goal:** Replace Supabase with a fully self-hosted backend distributed as a single Docker image.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | Python + FastAPI | Matches work stack, excellent for APIs, async native |
| Database | SQLite | Single Docker image, simple backups, household scale |
| Auth | Built-in (bcrypt + HS256 JWT) | Standard self-hosted pattern (Jellyfin, Mealie, etc.) |
| Realtime | WebSocket (app-level broadcast) | FastAPI handles all writes, broadcasts to connected clients |
| Remote access | Cloudflare Tunnel + CF Access Service Tokens | Public API with layered security, no VPN needed on clients |
| Container | Single Docker image (s6-overlay) | Community-friendly, single `docker run` |
| AI | Mistral API (not self-hosted) | Proxied through backend, server holds API key |
| Web app | Expo web build served by FastAPI | Same codebase, replaces deep links with HTTP URLs |
| Password reset | Admin-only (panel + CLI) | No SMTP, same as Jellyfin/Mealie |
| Testing | TDD — tests first as regression spec | Known features make perfect test-first candidates |

## 1. Container & Deployment Architecture

```
┌─ Single Docker Image ─────────────────────────────┐
│  s6-overlay (process supervisor)                   │
│  └── FastAPI (uvicorn)                             │
│      ├── REST API        (/api/...)               │
│      ├── WebSocket       (/ws/...)                │
│      └── Static files    (Expo web build + photos)│
│                                                    │
│  Volumes:                                          │
│  ├── /data/branger.db    (SQLite database)         │
│  └── /data/photos/       (uploaded recipe photos)  │
└────────────────────────────────────────────────────┘
```

**Docker run:**
```bash
docker run -d \
  --name branger \
  -p 8080:8080 \
  -v /path/to/data:/data \
  -e MISTRAL_API_KEY=your-key \
  -e SECRET_KEY=your-jwt-secret \
  branger/branger:latest
```

Single volume mount (`/data`) holds everything. Backup = copy `/data`.

## 2. API Routes

```
/api/auth/
├── POST /register          (first user = admin)
├── POST /login             (email + password → JWT)
├── POST /refresh           (refresh token → new access token)
└── PUT  /change-password   (authenticated, own password)

/api/admin/
└── PUT  /users/{id}/reset-password   (admin only)

/api/recipes/
├── GET    /                (list own, cursor pagination + FTS5 search)
├── POST   /                (create with ingredients + steps)
├── GET    /{id}            (get with ingredients + steps)
├── PUT    /{id}            (update with ingredients + steps)
├── DELETE /{id}            (delete cascade)
└── POST   /{id}/share      (generate share token → URL)

/api/recipes/parse/
├── POST /text              (proxy → Mistral Large)
├── POST /url               (fetch URL → Mistral Large)
└── POST /photo             (upload → Mistral OCR → Mistral Large)

/api/lists/
├── GET    /                (user's lists with item counts)
├── POST   /                (create + add creator as member)
├── GET    /{id}            (list + items + members)
├── PUT    /{id}            (update name)
├── DELETE /{id}            (leave / delete if last member)
├── POST   /{id}/items      (add items, batch support)
├── PUT    /{id}/items/{item_id}  (toggle/rename)
├── DELETE /{id}/items/{item_id}  (delete item)
├── DELETE /{id}/items      (batch delete)
└── POST   /{id}/join       (join via invite link)

/api/photos/
└── POST /upload            (upload → returns URL)

/ws/lists/{id}              (realtime list item changes)

/share/{token}              (public shared recipe web page)
/                           (Expo web app)
```

All `/api/` routes require `Authorization: Bearer <jwt>` except auth endpoints and share routes.

## 3. Database Schema (SQLite)

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE recipes (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    photo_url TEXT,
    share_token TEXT UNIQUE,
    servings TEXT,
    prep_time TEXT,
    cook_time TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE recipes_fts USING fts5(
    title, ingredient_names,
    content='',
    tokenize='unicode61'
);

CREATE TABLE recipe_ingredients (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity TEXT,
    unit TEXT,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE recipe_steps (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    instruction TEXT NOT NULL
);

CREATE TABLE shopping_lists (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE list_members (
    list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (list_id, user_id)
);

CREATE TABLE list_items (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    checked INTEGER NOT NULL DEFAULT 0,
    recipe_id TEXT REFERENCES recipes(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0
);
```

## 4. Authentication

- **HS256 JWTs** (symmetric, we control both sides)
- **Access token**: 15 min TTL, contains `{user_id, email, is_admin}`
- **Refresh token**: 30 days, stored hashed in DB, rotated on use
- **bcrypt** for password hashing
- **First registered user** becomes admin automatically
- **Admin password reset**: via admin panel or CLI (`docker exec branger branger reset-password user@email.com`)
- FastAPI dependency: `current_user = Depends(get_current_user)`

## 5. Realtime (WebSocket)

- Client connects: `ws://server/ws/lists/{list_id}?token={jwt}`
- JWT validated on connection, membership verified
- FastAPI WebSocket manager tracks connections per list
- On any list_items mutation (add/toggle/delete), broadcast to all subscribed clients
- Message format: `{event: "INSERT"|"UPDATE"|"DELETE", record: {...}}`
- No DB triggers needed — FastAPI handles all writes and broadcasts directly

## 6. Photo Storage

- Path: `/data/photos/{user_id}/{timestamp}.{ext}`
- Served as static files at `/photos/{user_id}/{filename}`
- Upload endpoint validates auth, scopes to user's folder
- Public read (needed for shared recipes)

## 7. Recipe Parsing (Mistral Proxy)

- FastAPI proxies to Mistral API, adding `MISTRAL_API_KEY` server-side
- Three endpoints: text, url, photo (same as current edge functions)
- URL parsing includes SSRF protections (private IP blocking)
- App never sees the Mistral key

## 8. Share Links

- Old: `branger://share/abc123` (deep link, requires app)
- New: `https://your-server.com/share/abc123` (web page, works anywhere)
- `/share/{token}` serves the Expo web app, renders shared recipe
- No auth required for viewing
- "Save to my recipes" requires login

## 9. Frontend Changes

- Replace `supabase` client with generic API client (fetch wrapper + JWT handling)
- Replace `supabase.auth.*` → `/api/auth/*` calls
- Replace `supabase.from('table').*` → REST API calls
- Replace `supabase.channel()` → native WebSocket
- Replace `supabase.storage` → `/api/photos/upload` + static URLs
- Replace deep links → HTTP URLs
- Add server URL config on first launch (like Jellyfin)
- Offline queue: same concept, targets new API endpoints

## 10. Security Layers

1. **Cloudflare Tunnel** — no open ports on home network
2. **Cloudflare Access + Service Token** — only the app can reach the API
3. **HS256 JWT** — user-level authentication and authorization
4. **Application-level ownership checks** — replaces Supabase RLS

## 11. Testing Strategy (TDD)

Tests written first as regression spec, then implementation to make them pass:

- **Auth tests**: register, login, refresh, change password, admin reset, first-user-is-admin
- **Recipe CRUD tests**: create, read, update, delete, ownership isolation
- **Recipe search tests**: FTS5 search, pagination
- **Recipe parse tests**: text/url/photo proxy (mock Mistral)
- **List tests**: create, join, leave, item CRUD, batch operations, membership checks
- **Realtime tests**: WebSocket connection, auth, broadcast on mutations
- **Share tests**: generate token, public access, save-to-my-recipes
- **Photo tests**: upload, serve, user scoping
- **Admin tests**: password reset, admin-only access
