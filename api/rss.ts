import type { VercelRequest, VercelResponse } from '@vercel/node'

const MAX_AGE_MS = 24 * 60 * 60 * 1000

function getFeedUrl(q: string, lang: string): string {
  if (lang === 'en') {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en&gl=US&ceid=US:en`
  }
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=sk&gl=SK&ceid=SK:sk`
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

function parseRSS(xml: string): { title: string; url: string; pubDate: string }[] {
  const items: { title: string; url: string; pubDate: string }[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  const now = Date.now()
  let m: RegExpExecArray | null

  while ((m = itemRe.exec(xml)) !== null) {
    const item = m[1]

    const rawTitle = item
      .match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]
      ?.trim()

    const url =
      item.match(/<link>(https?:\/\/[^<\s]+)<\/link>/)?.[1]?.trim() ??
      item.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/)?.[1]?.trim()

    const pubDateStr = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim()

    if (!rawTitle || !url) continue
    if (pubDateStr && now - new Date(pubDateStr).getTime() > MAX_AGE_MS) continue

    if (items.length < 20) {
      items.push({
        title: decodeEntities(rawTitle),
        url,
        pubDate: pubDateStr ? new Date(pubDateStr).toISOString() : new Date().toISOString(),
      })
    }
  }

  return items
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Always respond with JSON — never let an unhandled error return HTML
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Content-Type', 'application/json')

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : ''
    const lang = typeof req.query['lang'] === 'string' ? req.query['lang'] : 'sk'

    console.log(`[rss] q="${q}" lang="${lang}"`)

    if (!q) {
      res.status(400).json({ error: 'Missing query parameter: q' })
      return
    }

    const feedUrl = getFeedUrl(q, lang)
    console.log(`[rss] fetching ${feedUrl}`)

    const rssRes = await fetch(feedUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsTracker/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    })

    console.log(`[rss] status=${rssRes.status} type=${rssRes.headers.get('content-type')}`)

    if (!rssRes.ok) {
      res.status(502).json({ error: `RSS feed returned HTTP ${rssRes.status}` })
      return
    }

    const xml = await rssRes.text()
    console.log(`[rss] xml length=${xml.length}`)

    if (!xml.includes('<item>')) {
      console.log(`[rss] no <item> tags found, first 200 chars: ${xml.slice(0, 200)}`)
      res.status(502).json({ error: 'RSS feed returned invalid content' })
      return
    }

    const articles = parseRSS(xml)
    console.log(`[rss] parsed articles=${articles.length}`)

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    res.json({ articles })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[rss] unhandled error: ${message}`)
    res.status(500).json({ error: message })
  }
}
