export interface Article {
  title: string
  url: string
  pubDate: string // ISO 8601
}

export type Locale = 'sk' | 'en'

export async function fetchNews(topic: string, locale: Locale = 'sk'): Promise<Article[]> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, locale }),
  })

  const data = (await res.json()) as { articles?: Article[]; error?: string }

  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

  return data.articles ?? []
}
