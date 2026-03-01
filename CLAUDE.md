# Branger

Recipe & collaborative shopping list app with AI-powered recipe import.

## Tech Stack

- **Frontend:** React Native 0.81.5, Expo SDK 54, Expo Router v6, TypeScript 5.9
- **Backend:** Python 3.12, FastAPI, SQLAlchemy (async), SQLite via aiosqlite
- **AI:** Mistral Large (recipe parsing), Mistral OCR (photo text extraction) — external API, not self-hosted
- **Auth:** HS256 JWT (access 15min, refresh 30 days), bcrypt passwords
- **Testing:** Jest 29 + React Native Testing Library (frontend), pytest + httpx (backend)
- **Deployment:** Single Docker image (server + SPA static files)

## Project Structure

```
src/
  app/           # Expo Router file-based routes
    (tabs)/      # Authenticated tab navigation (recipes, lists)
    share/       # Public shared recipe viewer
  components/    # Reusable UI components
  hooks/         # Custom React hooks
  lib/           # Business logic (api client, auth, types, cache)
  constants/     # Theme constants
server/
  app/           # FastAPI application
    auth/        # Authentication (JWT, bcrypt, refresh tokens)
    recipes/     # Recipe CRUD + sharing
    lists/       # Shopping list CRUD + membership
    parse/       # AI recipe parsing (text, URL, photo)
    photos/      # Photo upload endpoint
    share/       # Public shared recipe endpoint
    ws/          # WebSocket for real-time list updates
    admin/       # Admin endpoints
    models.py    # SQLAlchemy models
    database.py  # DB engine, session, init
    config.py    # Pydantic settings
  tests/         # pytest tests
  cli.py         # CLI tool (password reset)
  Dockerfile     # Single-image build
```

## Key Patterns

### API Client (Frontend)
- `src/lib/api.ts` provides `apiCall()` and `apiJson<T>()` helpers
- Server URL stored in AsyncStorage, configured at first launch
- Auto token refresh on expiry or 401
- `apiJson` returns `{ data, error, status }` — always check `data` before use
- FormData bodies skip Content-Type header (browser sets multipart boundary)

### Authentication
- Auth context in `src/lib/auth.tsx` provides `useAuth()` hook
- HS256 JWT tokens — `SECRET_KEY` env var on server
- Access tokens: 15 min, refresh tokens: 30 days (rotated on use)
- First registered user becomes admin
- Frontend stores tokens in AsyncStorage via `storeTokens()`

### Backend API
- All endpoints under `/api/` prefix
- Auth via `Authorization: Bearer <access_token>` header
- `get_current_user` FastAPI dependency for protected routes
- SQLAlchemy async sessions, committed in router layer
- SQLite with foreign keys enabled via PRAGMA

### Real-time
- WebSocket at `/ws/lists/{list_id}?token={jwt}` for collaborative list editing
- Messages: `{ event: "INSERT"|"UPDATE"|"DELETE", record: {...} }`
- Frontend `useListWebSocket` hook handles reconnection

### Database
- SQLAlchemy models in `server/app/models.py`
- Tables: users, recipes, recipe_ingredients, recipe_steps, shopping_lists, list_members, list_items, refresh_tokens
- Foreign keys with CASCADE deletes
- No migrations — tables created via `Base.metadata.create_all` on startup
- Data stored in `/data/branger.db` (Docker volume)

### Photos
- Upload: `POST /api/photos/upload` (multipart form, 10MB limit)
- Served as static files at `/photos/{user_id}/{filename}`
- Stored in `{data_dir}/photos/`

### UI Conventions
- `maxWidth: 600, width: '100%', alignSelf: 'center'` on all screen containers
- `StyleSheet.create()` at bottom of each file
- Ionicons for all icons
- `#007AFF` primary color, `#ff3b30` destructive color, `#34c759` success color
- `Alert.alert()` for user-facing errors
- Accessibility labels on all interactive elements

### State Management
- No global state library — React Context for auth, component-level useState for UI
- `useFocusEffect` for screen-level data fetching
- `RefreshControl` for pull-to-refresh
- WebSocket for collaborative list updates

## Commands

```bash
# Frontend
npm start          # Start Expo dev server
npm test           # Run Jest tests (frontend)
npm run lint       # Run ESLint
npx tsc --noEmit   # TypeScript check

# Backend
cd server
.venv/bin/python -m pytest tests/ -v  # Run backend tests
.venv/bin/python -m cli reset-password <email>  # Reset user password

# Docker
docker compose up --build  # Build and run
```

## Environment Variables

```
SECRET_KEY=          # JWT signing key (required, change from default)
MISTRAL_API_KEY=     # Mistral API key for recipe parsing
DATA_DIR=/data       # Data directory (default: data/)
```
