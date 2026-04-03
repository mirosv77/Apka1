export interface Article {
  title: string
  url: string
}

export async function fetchNews(topic: string): Promise<Article[]> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  })

  const data = (await res.json()) as { articles?: Article[]; error?: string }

  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }

  return data.articles ?? []
}
