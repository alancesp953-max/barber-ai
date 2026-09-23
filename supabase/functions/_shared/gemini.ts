export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash'

export type GeminiJson = {
  error?: { message?: string; status?: string }
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}

function geminiModelId(model?: string | null) {
  return String(model || '').trim().replace(/^models\//, '')
}

function isTtsOnlyModel(id: string, description = '') {
  const blob = `${id} ${description}`.toLowerCase()
  return /(?:^|[-_])tts$/.test(id) || /-tts(?:-|$)/i.test(id) || /text-to-speech/.test(blob)
}

function isRetiredGeminiModel(id: string) {
  return /^gemini-2\.5-flash/i.test(id)
}

export function resolveGeminiModel(_model?: string | null) {
  const used = geminiModelId(_model)
  if (isRetiredGeminiModel(used) || isTtsOnlyModel(used) || !used || used === 'auto') {
    return GEMINI_DEFAULT_MODEL
  }
  if (used === GEMINI_DEFAULT_MODEL) return used
  return GEMINI_DEFAULT_MODEL
}

export function geminiGenerateContentUrl(_model: string, apiKey: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DEFAULT_MODEL}:generateContent?key=${apiKey}`
}

function isGeminiOverloaded(status: number, message: string) {
  return (
    status === 503 ||
    status === 429 ||
    /high demand|try again later|unavailable|overloaded|resource exhausted|aborted/i.test(message)
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function geminiRetryDelayMs() {
  return 2000 + Math.floor(Math.random() * 1000)
}

async function geminiGenerateOnce(apiKey: string, body: unknown) {
  const model = GEMINI_DEFAULT_MODEL
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    },
  )
  const json = (await res.json().catch(() => ({}))) as GeminiJson
  return { res, json, model }
}

export async function geminiGenerateWithRetry(apiKey: string, _primaryModel: string, body: unknown) {
  const model = GEMINI_DEFAULT_MODEL
  let lastError = 'Falha no Gemini.'
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { res, json } = await geminiGenerateOnce(apiKey, body)
      const message = json?.error?.message || `Erro HTTP ${res.status} no Gemini.`
      if (res.ok) return { ok: true as const, json, model, attempt }
      lastError = message
      const overloaded = isGeminiOverloaded(res.status, message)
      if (!overloaded) {
        return { ok: false as const, error: message, model }
      }
      if (attempt < 3) await sleep(geminiRetryDelayMs())
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
      if (attempt < 3) await sleep(geminiRetryDelayMs())
    }
  }
  return { ok: false as const, error: lastError, model }
}
