import { useState, useRef, useMemo, useEffect } from 'react'
import Fuse from 'fuse.js'
import { fetchNews, type Article, type Locale } from './services/newsService'
import { loadModel, embed, cosine } from './services/semanticSearch'

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
  withinHours: number | null
}

interface TopicState {
  sk: SectionState
  en: SectionState
}

interface FlatArticle extends Article {
  topic: string
  locale: Locale
  _normalized: string
}

const emptySection = (): SectionState => ({ articles: [], loading: false, error: null, withinHours: null })

function normalizeTopic(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const DIACRITIC_VARIANTS: Record<string, string> = {
  a: '[aáä]', c: '[cč]', d: '[dď]', e: '[eéě]',
  i: '[ií]',  l: '[lľĺ]', n: '[nň]', o: '[oóô]',
  r: '[rŕ]',  s: '[sš]',  t: '[tť]', u: '[uú]',
  y: '[yý]',  z: '[zž]',
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildDiacriticPattern(word: string): string {
  return normalizeTopic(word)
    .split('')
    .map(c => DIACRITIC_VARIANTS[c] ?? escapeRegex(c))
    .join('')
}

function highlightText(text: string, query: string): React.ReactNode {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return text

  const pattern = words.map(buildDiacriticPattern).join('|')
  let regex: RegExp
  try { regex = new RegExp(pattern, 'gi') } catch { return text }

  const parts: Array<{ text: string; highlight: boolean }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) break
    if (match.index > lastIndex) parts.push({ text: text.slice(lastIndex, match.index), highlight: false })
    parts.push({ text: text.slice(match.index, match.index + match[0].length), highlight: true })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), highlight: false })

  if (parts.every(p => !p.highlight)) return text
  return <>{parts.map((p, i) => p.highlight ? <mark key={i}>{p.text}</mark> : p.text)}</>
}

type ModelStatus = 'loading' | 'ready' | 'error'

export default function App() {
  const [topics, setTopics] = useState<string[]>([])
  const [topicData, setTopicData] = useState<Record<string, TopicState>>({})
  const [input, setInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Semantic search state ──
  const [modelStatus, setModelStatus] = useState<ModelStatus>('loading')
  const [embeddedCount, setEmbeddedCount] = useState(0)
  const [queryEmbedding, setQueryEmbedding] = useState<Float32Array | null>(null)
  const embeddingsRef = useRef(new Map<string, Float32Array>())

  // Načítaj model na pozadí ihneď pri štarte
  useEffect(() => {
    loadModel()
      .then(() => setModelStatus('ready'))
      .catch(() => setModelStatus('error'))
  }, [])

  function setSectionState(topic: string, locale: Locale, patch: Partial<SectionState>) {
    setTopicData((prev) => {
      const existing = prev[topic] ?? { sk: emptySection(), en: emptySection() }
      return { ...prev, [topic]: { ...existing, [locale]: { ...existing[locale], ...patch } } }
    })
  }

  async function loadSection(topic: string, locale: Locale) {
    setSectionState(topic, locale, { loading: true, error: null, articles: [] })
    try {
      const { articles, withinHours } = await fetchNews(topic, locale)
      setSectionState(topic, locale, { articles, loading: false, withinHours })
    } catch (err) {
      setSectionState(topic, locale, { error: (err as Error).message, loading: false })
    }
  }

  function addTopic() {
    const name = input.trim()
    if (!name || topics.some((t) => normalizeTopic(t) === normalizeTopic(name))) return
    setTopics((prev) => [name, ...prev])
    setInput('')
    void loadSection(name, 'sk')
    void loadSection(name, 'en')
    inputRef.current?.focus()
  }

  function removeTopic(topic: string) {
    setTopics((prev) => prev.filter((t) => t !== topic))
    setTopicData((prev) => { const next = { ...prev }; delete next[topic]; return next })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') addTopic()
  }

  // ── Plochý zoznam všetkých načítaných článkov ──
  const allArticles = useMemo<FlatArticle[]>(() => {
    const list: FlatArticle[] = []
    for (const topic of topics) {
      for (const locale of ['sk', 'en'] as const) {
        for (const article of topicData[topic]?.[locale]?.articles ?? []) {
          list.push({ ...article, topic, locale, _normalized: normalizeTopic(article.title) })
        }
      }
    }
    return list
  }, [topics, topicData])

  // ── Vypočítaj embeddingy pre nové články keď je model pripravený ──
  useEffect(() => {
    if (modelStatus !== 'ready') return
    const pending = allArticles.filter(a => !embeddingsRef.current.has(a.url))
    if (!pending.length) return

    let active = true
    ;(async () => {
      for (const article of pending) {
        if (!active) break
        const vec = await embed(article._normalized)
        if (active) {
          embeddingsRef.current.set(article.url, vec)
          setEmbeddedCount(embeddingsRef.current.size)
        }
      }
    })()
    return () => { active = false }
  }, [modelStatus, allArticles])

  // ── Debounced embedding pre query (300 ms) ──
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q || modelStatus !== 'ready') { setQueryEmbedding(null); return }

    const timer = setTimeout(() => {
      embed(normalizeTopic(q)).then(setQueryEmbedding).catch(() => setQueryEmbedding(null))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, modelStatus])

  // ── Sémantické výsledky (kosínusová podobnosť, prah 0.25) ──
  const semanticResults = useMemo(() => {
    if (!queryEmbedding || !searchQuery.trim()) return null

    return allArticles
      .flatMap(article => {
        const aEmb = embeddingsRef.current.get(article.url)
        if (!aEmb) return []
        const score = cosine(queryEmbedding, aEmb)
        return score >= 0.25 ? [{ article, score }] : []
      })
      .sort((a, b) => b.score - a.score)
      .map(x => x.article)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryEmbedding, allArticles, embeddedCount, searchQuery])

  // ── Fuzzy fallback (Fuse.js) kým sa model načítava ──
  const fuse = useMemo(() => new Fuse(allArticles, {
    keys: ['_normalized'],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  }), [allArticles])

  const fuseResults = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) return null
    return fuse.search(normalizeTopic(q)).map(r => r.item)
  }, [fuse, searchQuery])

  // Priorita: 1. keyword/fuzzy zhoda  2. sémantické (ak keyword nič nenašlo)
  const keywordFound = fuseResults !== null && fuseResults.length > 0
  const activeResults = searchQuery.trim()
    ? (keywordFound ? fuseResults : semanticResults)
    : null
  // searchMode: 'computing' = keyword nenašiel nič a čakáme na embedding
  const searchMode: 'semantic' | 'fuzzy' | 'computing' | null = (() => {
    if (!searchQuery.trim()) return null
    if (keywordFound) return 'fuzzy'
    if (semanticResults !== null) return 'semantic'
    if (modelStatus === 'ready') return 'computing'
    return null
  })()

  function renderSection(topic: string, locale: Locale, label: string) {
    const state = topicData[topic]?.[locale]
    return (
      <div className="section">
        <div className="section-header">
          <span className="section-label">{label}</span>
          <button className="btn-refresh" onClick={() => void loadSection(topic, locale)} disabled={state?.loading}>
            {state?.loading ? <span className="spinner-sm" /> : '↻'} Obnoviť
          </button>
        </div>
        <div className="section-body">
          {state?.loading && <div className="loading"><span className="spinner" />Hľadám správy…</div>}
          {!state?.loading && state?.error && <p className="error">⚠ {state.error}</p>}
          {!state?.loading && !state?.error && state !== undefined && state.articles.length === 0 && (
            <p className="no-news">Žiadne správy za posledných 72 hodín.</p>
          )}
          {!state?.loading && !state?.error && state?.withinHours != null && state.withinHours > 24 && (
            <p className="time-expanded">⏱ Rozšírené na {state.withinHours} hod. — za 24 hod. nič nenašlo</p>
          )}
          {!state?.loading && !state?.error && state?.articles.map((article, i) => (
            <a key={i} href={article.url} target="_blank" rel="noopener noreferrer" className="article-link">
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
        <button className="btn-add" onClick={addTopic} disabled={!input.trim()}>+ Pridať</button>
      </div>

      {allArticles.length > 0 && (
        <div className="search-row">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Hľadaj sémanticky… (napr. dopravná nehoda, ekonomická kríza)"
            autoComplete="off"
          />
          {searchQuery
            ? <button className="btn-search-clear" onClick={() => setSearchQuery('')} title="Zmazať">✕</button>
            : <span className={`model-badge model-badge--${modelStatus}`}>
                {modelStatus === 'loading' ? '⏳ AI' : modelStatus === 'ready' ? '✨ AI' : '⚠ AI'}
              </span>
          }
        </div>
      )}

      {/* Výsledky vyhľadávania */}
      {(activeResults !== null || searchMode === 'computing') && (
        <main className="topics">
          {searchMode === 'computing' ? (
            <div className="loading" style={{ padding: '24px 20px' }}>
              <span className="spinner" />
              Hľadám sémanticky…
            </div>
          ) : activeResults!.length === 0 ? (
            <p className="empty-hint">Nič sa nenašlo pre „{searchQuery}".</p>
          ) : (
            <section className="topic-card">
              <div className="topic-header">
                <span className="topic-name">{activeResults.length} výsledkov</span>
                <span className={`search-mode-badge search-mode-badge--${searchMode}`}>
                  {searchMode === 'semantic' ? '✨ sémantické'
                    : searchMode === 'computing' ? '⏳ hľadám…'
                    : '🔤 fuzzy'}
                </span>
              </div>
              <div className="section-body">
                {activeResults.map((item, i) => (
                  <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="article-link">
                    <span className="article-num">{i + 1}.</span>
                    <span className="article-title">{highlightText(item.title, searchQuery)}</span>
                    <span className="article-meta search-result-meta">
                      {item.topic} · {item.locale === 'sk' ? '🇸🇰' : '🌍'} · {formatAge(item.pubDate)}
                    </span>
                    <span className="article-arrow">→</span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {/* Normálny pohľad tém */}
      {activeResults === null && searchMode !== 'computing' && (
        <>
          {topics.length === 0 && <p className="empty-hint">Pridaj tému pre zobrazenie správ.</p>}
          <main className="topics">
            {topics.map((topic) => (
              <section key={topic} className="topic-card">
                <div className="topic-header">
                  <span className="topic-name">{topic}</span>
                  <button className="btn-icon btn-remove" title="Odstrániť" onClick={() => removeTopic(topic)}>✕</button>
                </div>
                {renderSection(topic, 'sk', '🇸🇰 Slovenské správy')}
                {renderSection(topic, 'en', '🌍 Zahraničné správy')}
              </section>
            ))}
          </main>
        </>
      )}
    </div>
  )
}
