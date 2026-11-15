# Syncly

**Your entire world. One intelligent workspace.**

Syncly is an AI-powered workspace for planning, learning, research, documents and career growth. This repository is being built module by module.

## Status

| Area | Status |
| --- | --- |
| Design system (light/dark), app shell, grouped sidebar (15 sections), command palette (⌘K), notifications | ✅ Built |
| Authentication: sign up, login, logout, email verification, forgot/reset password, sessions, rate limiting | ✅ Built |
| My Profile, Settings (theme, password, active sessions, account deletion) | ✅ Built |
| **My Files / Digital Locker**: Upload Centre, Everything Inbox, folders, search, previews, duplicates, trash, WhatsApp imports | ✅ Built (phase 1) |
| **Camera scanner**: capture or photo, edge detection, perspective correction, enhance/B&W, multi-page PDF, on-device OCR | ✅ Built |
| Google Drive, OneDrive, Dropbox and Gmail imports | 🚧 Next phase (needs OAuth apps registered by you) |
| **AI Assistant (Syncly Brain)**: chat with saved conversations, answers grounded in your files with [n] citations to file + page, "Ask about this file", knows your tasks and calendar, proposes tasks you add with one click | ✅ Built |
| **Tasks & Projects**: natural-language quick add, list and Kanban board (drag and drop), projects, priorities, repeats, reminders, "Find tasks & deadlines" in any file (AI, confirmed before adding) | ✅ Built |
| **Scheduler**: month and week calendar, events (timed or all-day) with reminders, task due dates, day agenda, Today card on Home | ✅ Built |
| Knowledge, Learn, Career, Automation, Create, Finance, Collaboration, Analytics | 🚧 In development (honest placeholder pages) |
| Online deployment (Render + Supabase + Brevo) | 🟡 Code ready (`render.yaml`, S3 storage driver); waiting on account setup |

### AI Assistant (Syncly Brain)

- `/assistant`: chat with history; each answer says which AI provider produced it.
- **Answer from my files** (off until you turn it on): relevant passages from your files are retrieved by keyword search over indexed passages (`file_chunks`) and sent with your question; answers cite them as [1], [2] linking to the file and page/slide. Sensitive, trashed and pending-duplicate files are never retrieved.
- **Ask about this file** on any non-sensitive file with text: the conversation is scoped to that file.
- Not yet: semantic (embedding) search, streaming replies, and taking actions (creating tasks/events) — those modules don't exist yet, and the assistant says so.

### Tasks & Scheduler

- **Quick add** understands `tomorrow 5pm`, `fri`, `next friday`, `25/11`, `20 nov`, `in 3 days`, `tonight`, `!high` / `p1`, `#project` (created if new) and `every day` / `every week` / `every monday` / `monthly`, with a live preview before saving.
- **Repeating tasks**: completing one creates the next occurrence (skipping past dates).
- **Reminders** become in-app notifications (and system notifications if allowed). The app shell polls `/api/reminders` once a minute while a tab is open; each reminder is claimed atomically so it is sent once. Without an open tab, reminders appear the next time you visit (no background push yet).
- **Timezones**: dates are stored as calendar dates, times in the user's timezone (profile setting, else the browser's, sent as the `syncly_tz` cookie).

### Digital Locker (phase 1)

- **Upload Centre**: drag and drop files or whole folders, multi-select, parallel uploads with progress, cancel, retry (for retryable failures), upload history. Server-side size, type and quota limits.
- **Safe ingestion**: extension allowlist plus magic-byte sniffing (executables are rejected even when renamed), SHA-256 fingerprint, private storage with server-generated keys, files never executed.
- **ZIP import** with limits on entry count, total expanded size and compression ratio; path-traversal entries are skipped and reported.
- **WhatsApp**: PWA Web Share Target (Android/Chromium after installing), WhatsApp filename detection, and **chat export import** (Android and iOS formats; ZIP with media or TXT only). It builds a searchable archive, links attachments to messages, and flags attachments the export didn't include. Nothing connects to a WhatsApp account.
- **Everything Inbox**: Unorganized, Suggestions, All, Recent, by source, Processing, Duplicates, Failed, Processed, Starred, Archived.
- **Duplicates**: identical files wait for a decision (skip, keep both, or replace after confirmation).
- **Organization**: folders (nested, drag-and-drop moves), user rules (run before AI), custom categories, and AI suggestions via Claude with three modes: ask first, auto when confident (uncertain ones still wait), or Inbox only. AI sees only metadata unless you allow content.
- **Search**: Postgres full-text search over names, tags, metadata, descriptions and extracted text (PDF, DOCX, PPTX, XLSX, TXT/CSV), with page/slide references; optional AI "smart search" that turns natural language into filters.
- **Files**: preview (PDF, images, video, audio, text, CSV, DOCX, PPTX text, ZIP listing), rename, details, description, star, archive, copy, move, trash with 30-day restore, delete forever.
- **Security**: short-lived HMAC-signed download URLs that also require the owner's session, sandboxing CSP on served files, sensitive files that need a password re-check, per-user access checks on every action, upload rate limits.
- **Storage dashboard**: usage vs quota, by type/folder/category, recent and largest files.
- **Development email shortcut**: on a local dev server without SMTP, the verify page shows "Verify my email now" and forgot-password shows the reset link on screen. Disabled automatically in production.
- **Camera scanner** (`/locker/scan`): live camera (HTTPS or localhost) or photo picker; automatic page-edge detection with draggable corners; perspective correction; Original / Enhanced / B&W; reorder, rotate and recrop pages; saves one PDF as a "Camera scan". OCR runs in the browser with Tesseract (the engine downloads from a CDN on first use; images never leave the device for OCR). "Identity or financial document" marks the scan sensitive, and its contents are never sent to AI.

**Known limits**: uploads can be cancelled and retried but not paused and resumed. Virus scanning isn't configured, and file pages say so. iOS can't show web apps in the share sheet, so iPhone users go through the Files app. AI features need at least one provider key. Gemini has been tested end to end with a real free-tier key; Groq, Cloudflare and Anthropic were checked with invalid keys only (endpoint and auth format confirmed). Free-tier Gemini can take 15–40 seconds per file when Google is busy. Background processing runs in-process after each upload (and resumes when the Inbox is opened), not in a separate job queue.

## Stack

- Next.js 15 (App Router, Server Actions), TypeScript, Tailwind CSS v4
- PostgreSQL + Prisma 6
- Custom session auth: bcrypt password hashes, opaque session tokens stored as SHA-256 hashes, httpOnly cookies
- Nodemailer for email (SMTP)
- Pluggable AI (`src/lib/ai/providers.ts`): Google Gemini, Groq, Cloudflare Workers AI and Anthropic Claude, tried in `AI_PROVIDERS` order with automatic fallback; every answer is schema-validated
- Local-disk object storage behind a driver interface (`src/lib/locker/storage.ts`), ready for an S3/R2 driver

## Getting started

```bash
npm install
npx prisma generate

# Local database: either point DATABASE_URL at your own Postgres,
# or start a zero-install local Prisma Postgres server:
npx prisma dev -d -n syncly      # prints a postgres:// URL; put it in .env as DATABASE_URL
                                  # and append &pgbouncer=true&connection_limit=1 (the dev server rejects prepared statements)

cp .env.example .env              # then fill in DATABASE_URL
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000.

### Locker configuration

| Variable | Purpose |
| --- | --- |
| `FILE_URL_SECRET` | **Required.** 32+ random characters used to sign download URLs (`openssl rand -hex 32`). |
| `STORAGE_DIR` | Where file bytes are stored (default `./storage`, git-ignored). |
| `MAX_UPLOAD_MB` / `STORAGE_QUOTA_MB` | Per-file limit (default 200) and per-user quota (default 5120). |
| `AI_PROVIDERS` | Order to try AI providers (default `gemini,groq,cloudflare,anthropic`). Unconfigured ones are skipped. |
| `GEMINI_API_KEY` | Google Gemini (recommended primary: best quality here, reads images). Key from aistudio.google.com/apikey. |
| `GROQ_API_KEY` | Groq (fast backup, text only, strict JSON). Key from console.groq.com/keys. |
| `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI (last fallback, text only). Token needs the Workers AI permission. |
| `ANTHROPIC_API_KEY` | Optional Claude provider. |
| `GEMINI_MODEL`, `GROQ_MODEL`, `CLOUDFLARE_AI_MODEL`, `ANTHROPIC_MODEL` | Optional model overrides. |

With no provider configured, AI organization and Smart search are off and the UI says so.

### Email in development

If `SMTP_HOST` is empty and `NODE_ENV` is not `production`, verification and password-reset emails are **printed to the dev server console** instead of being sent. In production, SMTP must be configured or sending fails loudly.

## Project layout

```
prisma/schema.prisma          Database schema
src/middleware.ts             Redirects visitors without a session cookie
src/lib/auth/                 Sessions, tokens, password hashing, auth server actions
src/lib/actions/              Profile/settings/notification server actions
src/lib/navigation.ts         Sidebar + command palette config (marks which modules are available)
src/app/(auth)/               Login, signup, verify email, forgot/reset password
src/app/(app)/                Authenticated app (overview, profile, settings, module pages)
src/lib/locker/               Storage, ingestion, ZIP + WhatsApp import, extraction, AI, search, jobs, actions
src/app/api/locker/           Upload, batch and signed download endpoints
src/app/share-target/         PWA Web Share Target endpoint
src/app/(app)/locker/         My Files: overview, Upload Centre, Inbox, Files, chat archives, organization
src/components/               UI primitives, app shell, account forms, locker components
```
