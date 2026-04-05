export interface Article {
  title: string
  url: string
  pubDate: string // ISO 8601
}

export type Locale = 'sk' | 'en'

export async function fetchNews(
  topic: string,
  locale: Locale = 'sk',
): Promise<{ articles: Article[]; withinHours: number }> {
  const params = new URLSearchParams({ q: topic, lang: locale })
  const res = await fetch(`/api/rss?${params.toString()}`)

  const data = (await res.json()) as { articles?: Article[]; withinHours?: number; error?: string }

  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

  return { articles: data.articles ?? [], withinHours: data.withinHours ?? 24 }
}
