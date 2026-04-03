import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fetchRSS, type Locale } from './lib/rss'

async function apiHandler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  let body = ''
  for await (const chunk of req) body += chunk.toString()

  const parsed = JSON.parse(body || '{}') as { topic?: string; locale?: string }
  const topic = parsed.topic?.trim()
  const locale: Locale = parsed.locale === 'en' ? 'en' : 'sk'

  if (!topic) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'Topic is required' }))
    return
  }

  try {
    const { items } = await fetchRSS(topic, locale)
    res.end(JSON.stringify({ articles: items }))
  } catch (err) {
    res.statusCode = 502
    res.end(JSON.stringify({ error: (err as Error).message }))
  }
}

export default defineConfig({
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
        server.middlewares.use('/api/search', apiHandler)
      },
    },
  ],
})
