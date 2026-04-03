# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install dependencies
npm run dev          # local dev via Vercel CLI (frontend + serverless function)
npm run build        # production build (tsc + vite build)
npm run preview      # preview production build locally
```

> `npm run dev` requires Vercel CLI: `npm install -g vercel`. On first run it will ask you to log in and link the project.

## Architecture

**PWA** built with React + Vite + TypeScript, deployed on Vercel. No API key required — uses free Google News RSS.

### Why a serverless function?

Browsers cannot fetch `news.google.com` directly (CORS). All RSS requests go through:

```
Browser → POST /api/search  →  api/search.ts (Vercel function)  →  Google News RSS
```

### Key files

| File | Role |
|---|---|
| `api/search.ts` | Vercel serverless function — fetches Google News RSS, parses XML, returns `{ articles }` |
| `src/services/newsService.ts` | Frontend — calls `POST /api/search`, typed interface |
| `src/App.tsx` | All UI state and logic (topics, per-topic loading/error/articles) |
| `vite.config.ts` | Vite + PWA manifest (icon, theme, standalone display) |

### RSS feed

```
https://news.google.com/rss/search?q=TOPIC&hl=sk&gl=SK&ceid=SK:sk
```

The function fetches this URL server-side, extracts the first 3 `<item>` elements (title + link), decodes HTML entities, and returns them as JSON. Responses are cached 5 minutes on Vercel Edge (`Cache-Control: s-maxage=300`).

## Deployment to Vercel

```bash
vercel deploy --prod
```

No environment variables needed. Connect the GitHub repo in the Vercel dashboard for automatic deploys.
