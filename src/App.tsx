import { useState, useRef } from 'react'
import { fetchNews, type Article, type Locale } from './services/newsService'

function formatAge(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime()
  const h = Math.floor(diffMs / 3_600_000)
  const m = Math.floor((diffMs % 3_600_000) / 60_000)
  if (h > 0) return `pred ${h} hod.`
  if (m > 0) return `pred ${m} min.`
  return 'práve teraz'
}

interface SectionState {
  articles: Article[]
  loading: boolean
  error: string | null
}

interface TopicState {
  sk: SectionState
  en: SectionState
}

const emptySection = (): SectionState => ({ articles: [], loading: false, error: null })

export default function App() {
  const [topics, setTopics] = useState<string[]>([])
  const [topicData, setTopicData] = useState<Record<string, TopicState>>({})
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function setSectionState(topic: string, locale: Locale, patch: Partial<SectionState>) {
    setTopicData((prev) => {
      const existing = prev[topic] ?? { sk: emptySection(), en: emptySection() }
      return {
        ...prev,
        [topic]: {
          ...existing,
          [locale]: { ...existing[locale], ...patch },
        },
      }
    })
  }

  async function loadSection(topic: string, locale: Locale) {
    setSectionState(topic, locale, { loading: true, error: null, articles: [] })
    try {
      const articles = await fetchNews(topic, locale)
      setSectionState(topic, locale, { articles, loading: false })
    } catch (err) {
      setSectionState(topic, locale, { error: (err as Error).message, loading: false })
    }
  }

  function addTopic() {
    const name = input.trim()
    if (!name || topics.includes(name)) return
    setTopics((prev) => [...prev, name])
    setInput('')
    void loadSection(name, 'sk')
    void loadSection(name, 'en')
    inputRef.current?.focus()
  }

  function removeTopic(topic: string) {
    setTopics((prev) => prev.filter((t) => t !== topic))
    setTopicData((prev) => {
      const next = { ...prev }
      delete next[topic]
      return next
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') addTopic()
  }

  function renderSection(topic: string, locale: Locale, label: string) {
    const state = topicData[topic]?.[locale]
    return (
      <div className="section">
        <div className="section-header">
          <span className="section-label">{label}</span>
          <button
            className="btn-refresh"
            onClick={() => void loadSection(topic, locale)}
            disabled={state?.loading}
          >
            {state?.loading ? <span className="spinner-sm" /> : '↻'} Obnoviť
          </button>
        </div>

        <div className="section-body">
          {state?.loading && (
            <div className="loading">
              <span className="spinner" />
              Hľadám správy…
            </div>
          )}

          {!state?.loading && state?.error && (
            <p className="error">⚠ {state.error}</p>
          )}

          {!state?.loading && !state?.error && state !== undefined && state.articles.length === 0 && (
            <p className="no-news">Žiadne nové správy za posledných 24 hodín.</p>
          )}

          {!state?.loading && !state?.error && state?.articles.map((article, i) => (
            <a
              key={i}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="article-link"
            >
              <span className="article-num">{i + 1}.</span>
              <span className="article-title">{article.title}</span>
              <span className="article-meta">{formatAge(article.pubDate)}</span>
              <span className="article-arrow">→</span>
            </a>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">News Tracker</h1>
      </header>

      <div className="input-row">
        <input
          ref={inputRef}
          className="topic-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Zadaj tému (napr. AI, Svet…)"
          autoComplete="off"
        />
        <button className="btn-add" onClick={addTopic} disabled={!input.trim()}>
          + Pridať
        </button>
      </div>

      {topics.length === 0 && (
        <p className="empty-hint">Pridaj tému pre zobrazenie správ.</p>
      )}

      <main className="topics">
        {topics.map((topic) => (
          <section key={topic} className="topic-card">
            <div className="topic-header">
              <span className="topic-name">{topic}</span>
              <button
                className="btn-icon btn-remove"
                title="Odstrániť"
                onClick={() => removeTopic(topic)}
              >
                ✕
              </button>
            </div>

            {renderSection(topic, 'sk', '🇸🇰 Slovenské správy')}
            {renderSection(topic, 'en', '🌍 Zahraničné správy')}
          </section>
        ))}
      </main>
    </div>
  )
}
