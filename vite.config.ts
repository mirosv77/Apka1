import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fetchRSS, type Locale } from './lib/rss'

async function rssHandler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  const url = new URL(req.url ?? '', 'http://localhost')
  const q = url.searchParams.get('q')?.trim() ?? ''
  const lang = url.searchParams.get('lang')
  const locale: Locale = lang === 'en' ? 'en' : 'sk'

  if (!q) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'Query parameter q is required' }))
    return
  }

  try {
    const { items, withinHours } = await fetchRSS(q, locale)
    res.end(JSON.stringify({ articles: items, withinHours }))
  } catch (err) {
    res.statusCode = 502
    res.end(JSON.stringify({ error: (err as Error).message }))
  }
}

export default defineConfig({
  optimizeDeps: {
    // @huggingface/transformers uses WASM — Vite nesmie prebundlovať
    exclude: ['@huggingface/transformers'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'News Tracker',
        short_name: 'NewsTracker',
        description: 'Sleduj najnovšie správy podľa tém',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
    {
      name: 'dev-api',
      configureServer(server) {
        server.middlewares.use('/api/rss', rssHandler)
      },
    },
  ],
})
