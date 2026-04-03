import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetchRSS, type Locale } from '../lib/rss'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = req.body as { topic?: string; locale?: string }
  const topic = body?.topic?.trim()
  const locale: Locale = body?.locale === 'en' ? 'en' : 'sk'

  if (!topic) return res.status(400).json({ error: 'Topic is required' })

  try {
    const { items, totalParsed } = await fetchRSS(topic, locale)

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    return res.json({ articles: items })
  } catch (err) {
    return res.status(502).json({ error: (err as Error).message })
  }
}
