# NEXUS // Marketing Engine

An AI revenue-operations command center built with Next.js 14, strict TypeScript, Tailwind, Supabase, Vertex AI and Google Places.

## Run locally

1. Copy `.env.example` to `.env.local` and add credentials.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Install with `npm install`, then start with `npm run dev`.

For a database created from an earlier version, also run `supabase/migrations/20260806_full_functionality.sql`.

Without credentials, the UI and API routes run with safe demonstration data so the complete product can be evaluated locally.
