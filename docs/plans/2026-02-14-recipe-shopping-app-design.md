# Recipe & Shopping List App — Design Document

**Date**: 2026-02-14
**Status**: Approved

## Overview

A mobile-first app for managing recipes and shopping lists, with AI-powered recipe creation and collaborative list sharing. Built with Expo (React Native) and Supabase.

## Architecture

```
┌──────────────────────────────────────────┐
│            Expo App                       │
│       (iOS / Android / Web)              │
│                                          │
│   Recipes    Shopping Lists   Recipe     │
│   Screen     Screen           Creator   │
│                                          │
│           Supabase JS SDK                │
└──────────────────┬───────────────────────┘
                   │ HTTPS
┌──────────────────┴───────────────────────┐
│         Self-hosted Supabase             │
│         (Docker Compose)                 │
│                                          │
│  GoTrue    PostgREST    Postgres        │
│  (Auth)    (REST API)   (Database)      │
│                                          │
│  Realtime  Storage      Edge Functions  │
│  (WS)      (files)      (AI pipeline)  │
└──────────────────┬───────────────────────┘
                   │
        ┌──────────┼──────────┐
   OpenAI API   Mistral API   Web Scraping
```

**Hosting strategy**: Supabase Cloud for development (free tier), self-hosted via Docker Compose on home server for production. App code is identical — only the Supabase URL/key changes.

## Data Model

### recipes

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| user_id | uuid (FK → auth.users) | |
| title | text | |
| photo_url | text? | Supabase Storage URL |
| source_type | text | 'manual', 'text_ai', 'url_ai', 'photo_ai' |
| source_url | text? | If created from URL |
| share_token | text? (unique) | If set, recipe is publicly accessible via this token |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### recipe_ingredients

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| recipe_id | uuid (FK → recipes) | ON DELETE CASCADE |
| name | text | The item: "tomato", "cucumber", "spaghetti" |
| description | text | The amount/qualifier: "1 can", "2 large", "400g" |
| position | integer | Display order |

### recipe_steps

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| recipe_id | uuid (FK → recipes) | ON DELETE CASCADE |
| step_number | integer | |
| instruction | text | |

### shopping_lists

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| name | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

No `user_id` — lists are collaborative. Membership is tracked via `list_members`.

### list_members

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| list_id | uuid (FK → shopping_lists) | ON DELETE CASCADE |
| user_id | uuid (FK → auth.users) | |
| joined_at | timestamptz | |

All members are equal — any member can add/remove items, add/remove members, or leave. When the last member leaves, the list is deleted.

### list_items

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| list_id | uuid (FK → shopping_lists) | ON DELETE CASCADE |
| name | text | The item: "tomato", "pasta" |
| description | text? | Optional amount: "1 can", "400g" |
| checked | boolean | Default false |
| recipe_id | uuid? (FK → recipes) | Traceability: which recipe added this item |
| position | integer | Display order |

## Sharing

### Shopping Lists — Collaborative Membership

- Created by a user → creator becomes first member
- Any member can add other members (by email or invite link)
- All members have equal permissions (add/edit/check items, manage members)
- Any member can leave
- Last member leaving → list is auto-deleted

### Recipes — Read-only Link Sharing

- Recipe owner can generate a `share_token`
- Anyone with the link (`/share/{token}`) can view the recipe
- Viewers can "Save to my recipes" (creates a copy in their account)
- Owner can revoke sharing by clearing the `share_token`

## AI Recipe Pipeline

Three input paths, one output format. User always reviews/edits before saving.

### Path 1: Text → Recipe

1. User pastes free-form text
2. Edge Function sends to OpenAI with structuring prompt
3. Returns structured recipe → user reviews → save

### Path 2: URL → Recipe

1. User pastes a recipe URL
2. Edge Function scrapes the page HTML (cheerio or similar)
3. Extracted text sent to OpenAI with structuring prompt
4. Returns structured recipe → user reviews → save

### Path 3: Photo → Recipe

1. User takes/picks a photo
2. Photo uploaded to Supabase Storage (temp)
3. Edge Function sends image to Mistral OCR → extracts text
4. Extracted text sent to OpenAI for structuring
5. Returns structured recipe → user reviews → save

### Structured Output Format

```json
{
  "title": "Pasta Carbonara",
  "ingredients": [
    { "name": "spaghetti", "description": "400g" },
    { "name": "guanciale", "description": "200g, diced" },
    { "name": "eggs", "description": "4 yolks + 2 whole" },
    { "name": "pecorino", "description": "100g, finely grated" }
  ],
  "steps": [
    "Boil pasta in salted water until al dente",
    "Cook guanciale in a cold pan over medium heat until crispy",
    "Mix eggs with grated pecorino",
    "Toss drained pasta with guanciale, then add egg mixture off heat"
  ]
}
```

## App Screens

### Navigation

Bottom tab bar with 2 tabs: **Recipes** and **Lists**.

### Recipes Tab

- **Recipe list**: Cards with title + photo thumbnail
- **+ button** → Recipe Creator
- Tap recipe → Recipe Detail

### Recipe Detail

- Title, photo, ingredients, steps
- Actions: Edit, Share (generate link), Delete
- **"Add to list"** → pick existing list or create new → copies all ingredients as list items

### Recipe Creator

- Three input modes (segmented control): Text, URL, Photo
- After AI processing → Review screen (editable title, ingredients, steps)
- User edits → "Save Recipe"

### Lists Tab

- List cards: name + item count + unchecked count
- **+ button** → create new list (name only)
- Tap list → List Detail

### List Detail

- Checklist items (tap to check/uncheck)
- Add item manually (name + optional description)
- Swipe to delete
- Members section (view members, add people, leave)
- Checked items sink to bottom / "Clear checked" action

### Auth Screens

- Login: email + password fields, Google/Apple OAuth buttons
- Register: email + password + confirm

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile + Web | Expo (React Native) |
| Language | TypeScript |
| Navigation | Expo Router |
| State | React Context + Supabase Realtime |
| Backend | Supabase (Cloud → Self-hosted) |
| Database | PostgreSQL |
| AI (LLM) | OpenAI API (GPT-4o) |
| AI (OCR) | Mistral API |
| Auth | Supabase Auth (email/password + OAuth) |

## Security

- **Row Level Security (RLS)** on all tables — users only see own data + shared data
- **API keys** (OpenAI, Mistral) stored as Supabase secrets, never in client code
- **Auth tokens** managed by Supabase SDK automatically

## Deployment

- **Development**: Supabase Cloud (free tier) + Expo Go on phone
- **Production**: Self-hosted Supabase via Docker Compose on home server
- **Mobile builds**: EAS (Expo Application Services)
- **Web** (optional): Expo web export, served via nginx on home server
