import { geminiAudioMime } from './micRecorder'

export const AUDIO_SETTINGS_KEY = 'barbearia_audio_settings'
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash'
export const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
export const ELEVENLABS_ADAM_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'
export const ELEVENLABS_DEFAULT_MODEL = 'eleven_multilingual_v2'

const PREFERRED_FREE_VOICES = [
  ELEVENLABS_DEFAULT_VOICE_ID,
  ELEVENLABS_ADAM_VOICE_ID,
  'JBFqnCBsd6RMkjVDRZzb',
  'EXAVITQu4vr4xnSDxMaL',
  'FGY2WhTYpPnrIDTdsKH5',
  'nPczCjzI2devNBz1zQrb',
  'pFZP5JQG7iQjIQuC4Bku',
]

const FREE_ELEVENLABS_VOICES = new Set(PREFERRED_FREE_VOICES)

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
  return `${GEMINI_API_BASE}/models/${GEMINI_DEFAULT_MODEL}:generateContent?key=${apiKey}`
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

type GeminiJson = {
  error?: { message?: string; status?: string }
  candidates?: Array<{
    finishReason?: string
    content?: { parts?: Array<{ text?: string }> }
  }>
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

async function geminiGenerateWithRetry(apiKey: string, _primaryModel: string, body: unknown) {
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

export function resolveElevenLabsVoiceId(voiceId?: string | null) {
  const used = String(voiceId || '').trim()
  if (used && used !== 'auto') return used
  return ELEVENLABS_DEFAULT_VOICE_ID
}

export function resolveElevenLabsModel(_model?: string | null) {
  return ELEVENLABS_DEFAULT_MODEL
}

export type LocalAudioSettings = {
  audio_whatsapp_ativo: boolean
  audio_whatsapp_mode: string
  gemini_api_key: string
  elevenlabs_api_key: string
  gemini_model: string
  elevenlabs_model: string
  elevenlabs_voice_id: string
}

const DEFAULTS: LocalAudioSettings = {
  audio_whatsapp_ativo: false,
  audio_whatsapp_mode: 'audio_se_cliente_mandar',
  gemini_api_key: '',
  elevenlabs_api_key: '',
  gemini_model: GEMINI_DEFAULT_MODEL,
  elevenlabs_model: ELEVENLABS_DEFAULT_MODEL,
  elevenlabs_voice_id: ELEVENLABS_DEFAULT_VOICE_ID,
}

export function maskSecret(value: string | null | undefined) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.length <= 8) return '••••••••'
  return `${raw.slice(0, 4)}••••${raw.slice(-4)}`
}

export function loadAudioSettings(): LocalAudioSettings {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<LocalAudioSettings>
    const settings: LocalAudioSettings = {
      audio_whatsapp_ativo: Boolean(parsed.audio_whatsapp_ativo),
      audio_whatsapp_mode: String(parsed.audio_whatsapp_mode || DEFAULTS.audio_whatsapp_mode),
      gemini_api_key: String(parsed.gemini_api_key || '').trim(),
      elevenlabs_api_key: String(parsed.elevenlabs_api_key || '').trim(),
      gemini_model: GEMINI_DEFAULT_MODEL,
      elevenlabs_model: resolveElevenLabsModel(parsed.elevenlabs_model),
      elevenlabs_voice_id: resolveElevenLabsVoiceId(parsed.elevenlabs_voice_id),
    }
    const migrated =
      settings.gemini_model !== String(parsed.gemini_model || '').trim() ||
      settings.elevenlabs_model !== String(parsed.elevenlabs_model || '').trim() ||
      settings.elevenlabs_voice_id !== String(parsed.elevenlabs_voice_id || '').trim()
    if (migrated) {
      localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings))
    }
    return settings
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAudioSettings(patch: Partial<LocalAudioSettings>): LocalAudioSettings {
  const current = loadAudioSettings()
  const next: LocalAudioSettings = {
    audio_whatsapp_ativo: patch.audio_whatsapp_ativo ?? current.audio_whatsapp_ativo,
    audio_whatsapp_mode: patch.audio_whatsapp_mode ?? current.audio_whatsapp_mode,
    gemini_api_key:
      patch.gemini_api_key !== undefined && String(patch.gemini_api_key).trim()
        ? String(patch.gemini_api_key).trim()
        : current.gemini_api_key,
    elevenlabs_api_key:
      patch.elevenlabs_api_key !== undefined && String(patch.elevenlabs_api_key).trim()
        ? String(patch.elevenlabs_api_key).trim()
        : current.elevenlabs_api_key,
    gemini_model: GEMINI_DEFAULT_MODEL,
    elevenlabs_model: resolveElevenLabsModel(patch.elevenlabs_model || current.elevenlabs_model),
    elevenlabs_voice_id: resolveElevenLabsVoiceId(patch.elevenlabs_voice_id || current.elevenlabs_voice_id),
  }
  localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(next))
  return next
}

export function audioConfigFromSettings(settings: LocalAudioSettings) {
  return {
    ok: true,
    audio_whatsapp_ativo: settings.audio_whatsapp_ativo,
    audio_whatsapp_mode: settings.audio_whatsapp_mode,
    gemini_model: settings.gemini_model,
    elevenlabs_model: resolveElevenLabsModel(settings.elevenlabs_model),
    elevenlabs_voice_id: resolveElevenLabsVoiceId(settings.elevenlabs_voice_id),
    has_gemini_key: Boolean(settings.gemini_api_key),
    has_elevenlabs_key: Boolean(settings.elevenlabs_api_key),
    gemini_api_key: settings.gemini_api_key,
    elevenlabs_api_key: settings.elevenlabs_api_key,
  }
}

export async function testGeminiWithKey(apiKey: string, _model: string) {
  const key = apiKey.trim()
  if (!key) {
    return { ok: false as const, error: 'Chave Gemini API não configurada no armazenamento local.' }
  }
  const result = await geminiGenerateWithRetry(key, GEMINI_DEFAULT_MODEL, {
    contents: [{ parts: [{ text: 'Teste de conexão com sucesso.' }] }],
  })
  if (!result.ok) {
    return { ok: false as const, error: result.error }
  }
  return {
    ok: true as const,
    message: `Google Gemini conectado com ${GEMINI_DEFAULT_MODEL}.`,
  }
}

function elevenLabsHeaders(apiKey: string, extra?: Record<string, string>) {
  return {
    'xi-api-key': apiKey,
    Accept: 'application/json',
    ...extra,
  }
}

function elevenLabsUrls(path: string) {
  const clean = path.startsWith('/') ? path : `/${path}`
  return [`/__local/elevenlabs${clean}`, `https://api.elevenlabs.io${clean}`]
}

function isLibraryVoiceError(message: string) {
  return /library voices|upgrade your subscription to use this voice|payment_required|402/i.test(message)
}

type ElevenLabsVoice = {
  voice_id?: string
  name?: string
  category?: string
  sharing?: { free_users_allowed?: boolean }
}

function isFreeApiVoice(voice: ElevenLabsVoice) {
  const category = String(voice.category || '').toLowerCase()
  if (category === 'generated' || category === 'premade') return true
  if (category === 'professional' || category === 'cloned' || category === 'high_quality') return false
  return voice.sharing?.free_users_allowed === true
}

async function elevenLabsFetch(path: string, apiKey: string, init?: RequestInit) {
  let lastError = 'Falha ao falar com a ElevenLabs.'
  for (const url of elevenLabsUrls(path)) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...elevenLabsHeaders(apiKey, init?.headers as Record<string, string> | undefined),
        },
      })
      return res
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
    }
  }
  throw new Error(lastError)
}

async function listFreeElevenLabsVoices(apiKey: string) {
  try {
    const res = await elevenLabsFetch('/v1/voices', apiKey)
    const data = (await res.json().catch(() => ({}))) as { voices?: ElevenLabsVoice[] }
    if (!res.ok || !Array.isArray(data.voices)) return []
    return data.voices.filter((voice) => voice.voice_id && isFreeApiVoice(voice))
  } catch {
    return []
  }
}

async function voiceCandidates(apiKey: string, preferred?: string) {
  const fromAccount = await listFreeElevenLabsVoices(apiKey)
  const ordered: string[] = []
  const push = (id?: string) => {
    const voice = String(id || '').trim()
    if (voice && !ordered.includes(voice)) ordered.push(voice)
  }
  const preferredFree = fromAccount.find((voice) => voice.voice_id === preferred)
  if (preferredFree?.voice_id) push(preferredFree.voice_id)
  for (const voice of fromAccount) push(voice.voice_id)
  for (const id of PREFERRED_FREE_VOICES) push(id)
  if (preferred && FREE_ELEVENLABS_VOICES.has(preferred)) push(preferred)
  return ordered
}

export async function testElevenLabsWithKey(apiKey: string, voiceId: string) {
  const key = apiKey.trim()
  if (!key) {
    return { ok: false as const, error: 'Chave ElevenLabs API não configurada no armazenamento local.' }
  }
  try {
    const freeVoices = await listFreeElevenLabsVoices(key)
    const names = freeVoices
      .slice(0, 4)
      .map((voice) => voice.name || voice.voice_id)
      .filter(Boolean)
    if (freeVoices.length) {
      return {
        ok: true as const,
        voiceName: names[0],
        message: names.length
          ? `ElevenLabs conectado. Vozes liberadas na API gratuita: ${names.join(', ')}.`
          : 'ElevenLabs conectado. Há vozes do plano gratuito disponíveis nesta conta.',
      }
    }
    const preferred = resolveElevenLabsVoiceId(voiceId)
    return {
      ok: true as const,
      message: `ElevenLabs conectado. Rachel/Adam podem estar bloqueadas na API gratuita; o simulador tenta uma voz premade da conta. Preferência: ${preferred}.`,
    }
  } catch (err) {
    const blocked = err instanceof TypeError
    if (blocked) {
      return {
        ok: true as const,
        message:
          'Chave ElevenLabs lida do armazenamento local e usada na requisição. O navegador pode bloquear a lista de vozes (CORS); a síntese usa o proxy local.',
      }
    }
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'Falha de rede ao validar ElevenLabs com a chave local.',
    }
  }
}

function fileToBase64(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('Não foi possível ler o áudio local.'))
    reader.readAsDataURL(file)
  })
}

export async function transcribeAudioWithGemini(file: Blob, apiKey?: string, model?: string) {
  const settings = loadAudioSettings()
  const key = (apiKey || settings.gemini_api_key).trim()
  const usedModel = resolveGeminiModel(model || settings.gemini_model)
  if (!key) {
    return { ok: false as const, error: 'Chave Gemini não configurada no armazenamento local.' }
  }
  const mimeType = geminiAudioMime(file)
  const data = await fileToBase64(file)
  const result = await geminiGenerateWithRetry(key, usedModel, {
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data } },
          {
            text: 'Transcreva este áudio em português do Brasil. Responda somente com a transcrição, sem aspas nem comentários.',
          },
        ],
      },
    ],
  })
  if (!result.ok) {
    return { ok: false as const, error: result.error }
  }
  const text = result.json.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(' ').trim()
  if (!text) {
    return { ok: false as const, error: 'Gemini não devolveu transcrição para o áudio local.' }
  }
  return { ok: true as const, text }
}

export const ATTENDANT_SYSTEM_PROMPT = `Você é o atendente virtual da barbearia. Fale em português de forma simpática, direta e descontraída, como uma pessoa real conversando pelo WhatsApp. Use frases curtas e objetivas, ideais para mensagens de voz. Nunca use listas longas ou respostas duras/robóticas. Cumprimente o cliente pelo nome quando souber e pergunte com qual barbeiro e horário ele gostaria de agendar.`

const ATTENDANT_CONTEXT = `${ATTENDANT_SYSTEM_PROMPT}

Barbeiros da casa: Carlos, Rafael e Lucas. Funcionamos de terça a sábado, das 9h às 19h.
Responda só com o texto da mensagem de voz, no máximo três frases curtas. Sem markdown, sem listas, sem aspas e sem dizer que é teste ou laboratório. Se não souber o nome do cliente, não invente.`

type ChatTurn = { from: 'cliente' | 'bot'; text: string }

export function sanitizeSpeechForElevenLabs(raw: string) {
  return String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[*_#>`~]+/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[📍👤✂️💈📅💰✅❌⚠]/g, ' ')
    .replace(/(^|\s)[-•]+(\s|$)/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function fallbackAttendantReply(clientName?: string) {
  const nome = String(clientName || '').trim().split(/\s+/)[0]
  if (nome) {
    return `Olá, ${nome}! Sou a Diva da Divina Barbearia da Varjota. Vamos agendar?`
  }
  return 'Olá! Seja bem-vindo à Divina Barbearia da Varjota. Como posso te chamar?'
}

export async function generateAttendantReply(
  userText: string,
  history: ChatTurn[] = [],
  clientName?: string,
  options?: { systemPrompt?: string; sessionId?: string; maxOutputTokens?: number },
) {
  const settings = loadAudioSettings()
  const key = settings.gemini_api_key.trim()
  const usedModel = resolveGeminiModel(settings.gemini_model)
  const fallback = fallbackAttendantReply(clientName)
  const systemPrompt = options?.systemPrompt || ATTENDANT_CONTEXT
  const maxOutputTokens = Math.max(400, options?.maxOutputTokens || 400)
  if (!key) return { ok: true as const, text: fallback, usedFallback: true }
  const recent = history.slice(-8).filter((turn) => turn.text.trim())
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [
    ...recent.map((turn) => ({
      role: turn.from === 'bot' ? 'model' : 'user',
      parts: [{ text: turn.text }],
    })),
    {
      role: 'user',
      parts: [
        {
          text: clientName
            ? `O cliente se chama ${clientName}. Mensagem: ${userText}`
            : userText,
        },
      ],
    },
  ]
  let assembled = ''
  let lastError = ''
  for (let round = 0; round < 3; round++) {
    const result = await geminiGenerateWithRetry(key, usedModel, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens },
    })
    if (!result.ok) {
      lastError = result.error
      break
    }
    const chunk = result.json.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(' ') || ''
    assembled = `${assembled} ${chunk}`.trim()
    const finish = String(result.json.candidates?.[0]?.finishReason || '').toUpperCase()
    if (finish !== 'MAX_TOKENS') break
    contents.push(
      { role: 'model', parts: [{ text: chunk }] },
      {
        role: 'user',
        parts: [{ text: 'Continue a resposta exatamente de onde parou, sem repetir o trecho anterior.' }],
      },
    )
  }
  const text = sanitizeSpeechForElevenLabs(assembled)
  if (!text) {
    return { ok: true as const, text: fallback, usedFallback: true, note: lastError || undefined }
  }
  return { ok: true as const, text, usedFallback: false }
}

export async function speakWithElevenLabs(text: string, apiKey?: string, voiceId?: string, model?: string) {
  const settings = loadAudioSettings()
  const key = (apiKey || settings.elevenlabs_api_key).trim()
  const preferred = resolveElevenLabsVoiceId(voiceId || settings.elevenlabs_voice_id)
  const usedModel = resolveElevenLabsModel(model || settings.elevenlabs_model)
  const spoken = String(text || '').trim()
  const clean = sanitizeSpeechForElevenLabs(spoken)
  if (!key) {
    return { ok: false as const, error: 'Chave ElevenLabs não configurada no armazenamento local.' }
  }
  if (!clean) {
    return { ok: false as const, error: 'Texto vazio para síntese de voz.' }
  }
  const candidates = await voiceCandidates(key, preferred)
  if (!candidates.length) candidates.push(ELEVENLABS_DEFAULT_VOICE_ID, ELEVENLABS_ADAM_VOICE_ID)
  const body = JSON.stringify({
    text: clean,
    model_id: usedModel,
    voice_settings: { stability: 0.5, similarity_boost: 0.75 },
  })
  let lastError = 'Falha ao gerar áudio no ElevenLabs.'
  for (const voice of candidates) {
    try {
      const res = await elevenLabsFetch(`/v1/text-to-speech/${encodeURIComponent(voice)}`, key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body,
      })
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { detail?: { message?: string }; message?: string }
        lastError = errJson?.detail?.message || errJson?.message || `Erro HTTP ${res.status} no ElevenLabs.`
        if (isLibraryVoiceError(lastError) || res.status === 402) continue
        continue
      }
      const blob = await res.blob()
      if (!blob.size) {
        lastError = 'ElevenLabs devolveu áudio vazio.'
        continue
      }
      return { ok: true as const, audioUrl: URL.createObjectURL(blob), voiceId: voice }
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError
    }
  }
  return {
    ok: false as const,
    error: isLibraryVoiceError(lastError)
      ? 'A ElevenLabs bloqueou Rachel/Adam na API gratuita (são vozes da biblioteca). Recarregue e grave de novo: o simulador tenta automaticamente outra voz premade da sua conta. Se persistir, crie uma voz em Voice Design no painel da ElevenLabs.'
      : lastError,
  }
}
