// Multilingual model – podporuje slovenčinu, ~30 MB (q8 kvantizácia)
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipe: Promise<any> | null = null

export function loadModel(): Promise<unknown> {
  _pipe ??= import('@huggingface/transformers').then(({ pipeline }) =>
    pipeline('feature-extraction', MODEL, { dtype: 'q8' })
  )
  return _pipe
}

export async function embed(text: string): Promise<Float32Array> {
  const pipe = await loadModel() as (text: string, opts: object) => Promise<{ data: ArrayLike<number> }>
  const out = await pipe(text, { pooling: 'mean', normalize: true })
  return new Float32Array(out.data)
}

/** Kosínusová podobnosť — vektory sú už normalizované, stačí skalárny súčin */
export function cosine(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}
