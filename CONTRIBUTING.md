# Contributing to Branger

Install dependencies with `npm ci`, copy `.env.example` to `.env.local`, and configure your own Supabase project.
Run `npm test -- --runInBand`, `npm run lint`, and `npx tsc --noEmit` before submitting changes.
Run backend regression tests with `deno test supabase/functions/_shared/`.
Run `supabase/tests/publication_security.sql` as database owner against a migrated development database; its changes roll back.

Do not commit credentials, personal deployment notes, production data, or generated builds.
Keep private agent instructions in ignored `AGENTS.md` or `CLAUDE.md` files.
Changes to database access require negative authorization tests, not only successful-request tests.
