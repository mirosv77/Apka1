const MAX_AGE_MS = 24 * 60 * 60 * 1000

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

export function parseRSS(xml: string, now: number): { items: RSSItem[]; totalParsed: number } {
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

    if (pubDateStr && now - new Date(pubDateStr).getTime() > MAX_AGE_MS) continue

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
): Promise<{ items: RSSItem[]; totalParsed: number }> {
  const feedUrl = getFeedUrl(topic, locale)

  const rssRes = await fetch(feedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsTracker/1.0)' },
  })

  if (!rssRes.ok) throw new Error(`RSS feed returned ${rssRes.status}`)

  return parseRSS(await rssRes.text(), Date.now())
}
