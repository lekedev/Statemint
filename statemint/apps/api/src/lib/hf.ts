/**
 * HuggingFace Inference API client
 * Handles categorization (zero-shot) and embeddings
 * Graceful degradation: returns null on rate limit / failure
 */

const HF_API_BASE = 'https://router.huggingface.co/hf-inference/models'
// Sentence-transformer models default to the sentence-similarity pipeline on
// the Hub, which expects a { source_sentence, sentences } payload rather
// than a plain embedding request — forcing the feature-extraction pipeline
// via this path is what actually returns an embedding vector.
const HF_FEATURE_EXTRACTION_BASE =
  'https://router.huggingface.co/hf-inference/pipeline/feature-extraction'
const HF_API_TOKEN = process.env.HF_API_TOKEN || ''

const CATEGORIZATION_MODEL =
  process.env.HF_CATEGORIZATION_MODEL || 'facebook/bart-large-mnli'

const EMBEDDING_MODEL =
  process.env.HF_EMBEDDING_MODEL ||
  'sentence-transformers/all-MiniLM-L6-v2'

export const TRANSACTION_CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Utilities & Bills',
  'Shopping & Retail',
  'Bank Charges & Fees',
  'Salary & Income',
  'Transfer',
  'ATM Withdrawal',
  'Entertainment',
  'Healthcare',
  'Education',
  'Airtime & Data',
  'Investment',
  'Other',
]

interface ZeroShotResult {
  labels: string[]
  scores: number[]
}

interface HFError {
  error: string
  estimated_time?: number
}

async function hfFetch<T>(
  url: string,
  payload: Record<string, unknown>,
  retries = 2
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const bodyText = await res.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(bodyText)
      } catch {
        // The API (or something in front of it, e.g. a CDN error page) sent
        // back non-JSON — retrying the identical request won't fix that, so
        // log enough of the body to diagnose it and stop immediately.
        console.error(
          `[HF] Non-JSON response (status ${res.status}):`,
          bodyText.slice(0, 300)
        )
        return null
      }

      if (!res.ok) {
        const err = parsed as HFError

        // Model loading — wait and retry
        if (res.status === 503 && err.estimated_time && attempt < retries) {
          const waitMs = Math.min(err.estimated_time * 1000, 20000)
          console.log(
            `[HF] Model loading, waiting ${waitMs}ms before retry...`
          )
          await new Promise((r) => setTimeout(r, waitMs))
          continue
        }

        console.error(`[HF] API error ${res.status}:`, err.error)
        return null
      }

      return parsed as T
    } catch (err) {
      console.error(`[HF] Fetch error (attempt ${attempt + 1}):`, err)
      if (attempt === retries) return null
    }
  }
  return null
}

export async function categorizeTransaction(
  description: string
): Promise<{ category: string; confidence: number } | null> {
  const result = await hfFetch<ZeroShotResult>(
    `${HF_API_BASE}/${CATEGORIZATION_MODEL}`,
    {
      inputs: description,
      parameters: {
        candidate_labels: TRANSACTION_CATEGORIES,
        multi_label: false,
      },
    }
  )

  if (!result || !result.labels?.length || !result.scores?.length) return null

  return {
    category: result.labels[0],
    confidence: result.scores[0],
  }
}

export async function categorizeBatch(
  descriptions: string[],
  chunkSize = 10
): Promise<Array<{ category: string; confidence: number } | null>> {
  const results: Array<{ category: string; confidence: number } | null> = []

  for (let i = 0; i < descriptions.length; i += chunkSize) {
    const chunk = descriptions.slice(i, i + chunkSize)
    const chunkResults = await Promise.all(
      chunk.map((desc) => categorizeTransaction(desc))
    )
    results.push(...chunkResults)

    if (i + chunkSize < descriptions.length) {
      await new Promise((r) => setTimeout(r, 500))
    }
  }

  return results
}

export async function generateEmbedding(
  text: string
): Promise<number[] | null> {
  const result = await hfFetch<number[]>(
    `${HF_FEATURE_EXTRACTION_BASE}/${EMBEDDING_MODEL}`,
    { inputs: text }
  )
  return result
}

export async function generateEmbeddings(
  texts: string[]
): Promise<Array<number[] | null>> {
  const results: Array<number[] | null> = []

  for (const text of texts) {
    const embedding = await generateEmbedding(text)
    results.push(embedding)
    await new Promise((r) => setTimeout(r, 200))
  }

  return results
}