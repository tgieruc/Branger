# Branger

A recipe and collaborative shopping list app with AI-powered recipe import. Built with React Native (Expo) and Supabase.

## Features

- **AI Recipe Import** -- paste text, enter a URL, or take a photo to auto-parse recipes
- **Manual Recipe Creation** -- full form with ingredients and step-by-step instructions
- **Recipe Sharing** -- generate shareable links for any recipe
- **Collaborative Shopping Lists** -- create lists, invite others, real-time sync
- **Add to List** -- add recipe ingredients to any shopping list in one tap
- **Cross-Platform** -- iOS, Android, and web

## Tech Stack

- React Native 0.81 + Expo SDK 54
- Expo Router v6 (file-based routing)
- Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- OpenAI GPT-4o + Mistral (AI recipe parsing)
- TypeScript

## Prerequisites

- Node.js 18+
- npm or yarn
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- [Supabase account](https://supabase.com) (or self-hosted instance)
- OpenAI API key (for AI features)
- Mistral API key (for photo OCR)

## Setup

1. **Clone and install:**
   ```bash
   git clone <repo-url>
   cd branger
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase URL and anon key
   ```

3. **Set up Supabase:**
   - Create a new Supabase project
   - Run migrations in order from `supabase/migrations/`
   - Set edge function secrets in the Supabase dashboard:
     - `OPENAI_API_KEY`
     - `MISTRAL_API_KEY`

4. **Deploy edge functions:**
   ```bash
   npx supabase functions deploy parse-recipe-text --no-verify-jwt
   npx supabase functions deploy parse-recipe-url --no-verify-jwt
   npx supabase functions deploy parse-recipe-photo --no-verify-jwt
   ```

5. **Start the app:**
   ```bash
   npm start
   ```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |
| `OPENAI_API_KEY` | OpenAI API key (set in Supabase dashboard) |
| `MISTRAL_API_KEY` | Mistral API key (set in Supabase dashboard) |

## Testing

```bash
npm test           # Run all tests
npm run test:watch # Watch mode
```

## Project Structure

```
src/
  app/              # Screens (Expo Router file-based routing)
  components/       # Reusable UI components
  hooks/            # Custom React hooks
  lib/              # Business logic, Supabase client, types
supabase/
  functions/        # Edge Functions (Deno)
  migrations/       # PostgreSQL migrations
```

## License

Private
