const HOUR_MS = 60 * 60 * 1000
const SEARCH_WINDOWS = [24, 48, 72] as const

export type Locale = 'sk' | 'en'

export interface RSSItem {
  title: string
  url: string
  pubDate: string // ISO 8601
}

function getFeedUrl(topic: string, locale: Locale): string {
  if (locale === 'en') {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en&gl=US&ceid=US:en`
  }
  return `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=sk&gl=SK&ceid=SK:sk`
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

export function parseRSS(xml: string, now: number, maxAgeMs: number): { items: RSSItem[]; totalParsed: number } {
  const items: RSSItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  let totalParsed = 0

  while ((m = itemRe.exec(xml)) !== null) {
    const item = m[1]

    const rawTitle = item
      .match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]
      ?.trim()

    const url =
      item.match(/<link>(https?:\/\/[^<\s]+)<\/link>/)?.[1]?.trim() ??
      item.match(/<guid[^>]*isPermaLink="true"[^>]*>(https?:\/\/[^<]+)<\/guid>/)?.[1]?.trim()

    const pubDateStr = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim()

    if (!rawTitle || !url) continue
    totalParsed++

    if (pubDateStr && now - new Date(pubDateStr).getTime() > maxAgeMs) continue

    if (items.length < 20) {
      items.push({
        title: decodeEntities(rawTitle),
        url,
        pubDate: pubDateStr ? new Date(pubDateStr).toISOString() : new Date().toISOString(),
      })
    }
  }

  return { items, totalParsed }
}

export async function fetchRSS(
  topic: string,
  locale: Locale = 'sk',
): Promise<{ items: RSSItem[]; totalParsed: number; withinHours: number }> {
  const feedUrl = getFeedUrl(topic, locale)

  const rssRes = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsTracker/1.0)' },
  })

  if (!rssRes.ok) throw new Error(`RSS feed returned ${rssRes.status}`)

  const xml = await rssRes.text()
  const now = Date.now()

  for (const hours of SEARCH_WINDOWS) {
    const { items, totalParsed } = parseRSS(xml, now, hours * HOUR_MS)
    if (items.length > 0) return { items, totalParsed, withinHours: hours }
  }

  return { items: [], totalParsed: 0, withinHours: SEARCH_WINDOWS[SEARCH_WINDOWS.length - 1] }
}
