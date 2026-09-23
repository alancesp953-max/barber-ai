import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { geminiGenerateWithRetry, resolveGeminiModel } from '../_shared/gemini.ts'

const ELEVENLABS_DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'
const ELEVENLABS_DEFAULT_MODEL = 'eleven_multilingual_v2'
const FREE_ELEVENLABS_VOICES = new Set([ELEVENLABS_DEFAULT_VOICE_ID, 'pNInz6obpgDQGcFmaJgB'])

function resolveElevenLabsVoiceId(voiceId?: string | null) {
  const used = String(voiceId || '').trim()
  if (FREE_ELEVENLABS_VOICES.has(used)) return used
  return ELEVENLABS_DEFAULT_VOICE_ID
}

function resolveElevenLabsModel(_model?: string | null) {
  return ELEVENLABS_DEFAULT_MODEL
}

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function requireAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET') || ''
    const headerSecret = req.headers.get('x-webhook-secret') || ''
    return Boolean(webhookSecret && headerSecret === webhookSecret)
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return false

  // Se for token do webhook secret direto no Bearer
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET') || ''
  if (webhookSecret && token === webhookSecret) return true

  // Se for service_role token
  try {
    const payloadB64 = token.split('.')[1]
    if (payloadB64) {
      const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
      const payload = JSON.parse(json) as { role?: string }
      if (payload.role === 'service_role') return true
    }
  } catch {
    /* continue */
  }

  // Se for usuário autenticado (admin autenticado via Supabase Auth)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.getUser(token)
  return Boolean(!error && data?.user)
}

async function loadAudioConfig(db: any) {
  const { data } = await db.from('whatsapp_secrets').select('*').eq('id', 1).maybeSingle()
  return {
    audio_whatsapp_ativo: data?.audio_whatsapp_ativo ?? false,
    audio_whatsapp_mode: data?.audio_whatsapp_mode ?? 'texto',
    gemini_api_key: data?.gemini_api_key ?? '',
    elevenlabs_api_key: data?.elevenlabs_api_key ?? '',
    elevenlabs_voice_id: resolveElevenLabsVoiceId(data?.elevenlabs_voice_id),
    gemini_model: resolveGeminiModel(data?.gemini_model),
    elevenlabs_model: resolveElevenLabsModel(data?.elevenlabs_model),
  }
}

async function saveAudioConfig(db: any, config: any) {
  const { data: existing } = await db.from('whatsapp_secrets').select('id').eq('id', 1).maybeSingle()
  const payload: Record<string, any> = {
    audio_whatsapp_ativo: config.audio_whatsapp_ativo ?? false,
    audio_whatsapp_mode: config.audio_whatsapp_mode ?? 'texto',
    gemini_model: resolveGeminiModel(config.gemini_model),
    elevenlabs_model: resolveElevenLabsModel(config.elevenlabs_model),
    updated_at: new Date().toISOString(),
  }

  if (config.gemini_api_key !== undefined) {
    payload.gemini_api_key = config.gemini_api_key ? String(config.gemini_api_key).trim() : null
  }
  if (config.elevenlabs_api_key !== undefined) {
    payload.elevenlabs_api_key = config.elevenlabs_api_key ? String(config.elevenlabs_api_key).trim() : null
  }
  if (config.elevenlabs_voice_id !== undefined) {
    payload.elevenlabs_voice_id = resolveElevenLabsVoiceId(config.elevenlabs_voice_id)
  }

  if (existing) {
    const { error } = await db.from('whatsapp_secrets').update(payload).eq('id', 1)
    if (error) throw error
  } else {
    const { error } = await db.from('whatsapp_secrets').insert({
      id: 1,
      ...payload,
    })
    if (error) throw error
  }

  // Sincroniza flags em configuracoes (visíveis publicamente/app)
  const db2 = getServiceClient()
  await db2.from('configuracoes').upsert({
    id: 1,
    audio_whatsapp_ativo: config.audio_whatsapp_ativo ?? false,
    audio_whatsapp_mode: config.audio_whatsapp_mode ?? 'texto',
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const isAuth = await requireAuthorized(req)
  if (!isAuth) {
    return jsonResponse({ error: 'Não autorizado. Faça login novamente no painel.' }, 401)
  }

  try {
    const db = getServiceClient()

    if (req.method === 'GET') {
      const config = await loadAudioConfig(db)
      return jsonResponse({
        ok: true,
        audio_whatsapp_ativo: config.audio_whatsapp_ativo,
        audio_whatsapp_mode: config.audio_whatsapp_mode,
        gemini_model: config.gemini_model,
        elevenlabs_model: config.elevenlabs_model,
        elevenlabs_voice_id: config.elevenlabs_voice_id,
        has_gemini_key: Boolean(config.gemini_api_key),
        has_elevenlabs_key: Boolean(config.elevenlabs_api_key),
      })
    }

    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    const body = await req.json().catch(() => ({}))
    const { action } = body

    if (action === 'save') {
      await saveAudioConfig(db, {
        gemini_api_key: body.gemini_api_key,
        elevenlabs_api_key: body.elevenlabs_api_key,
        elevenlabs_voice_id: body.elevenlabs_voice_id,
        audio_whatsapp_ativo: body.audio_whatsapp_ativo,
        audio_whatsapp_mode: body.audio_whatsapp_mode,
        gemini_model: body.gemini_model,
        elevenlabs_model: body.elevenlabs_model,
      })
      return jsonResponse({ ok: true, message: 'Configurações de áudio salvas com sucesso!' })
    }

    if (action === 'test_gemini') {
      const cfg = await loadAudioConfig(db)
      const apiKey = (body.gemini_api_key || cfg.gemini_api_key || '').trim()
      if (!apiKey) {
        return jsonResponse({ ok: false, error: 'Chave Gemini API não configurada.' }, 400)
      }
      const result = await geminiGenerateWithRetry(apiKey, body.gemini_model || cfg.gemini_model, {
        contents: [{ parts: [{ text: 'Teste de conexão com sucesso.' }] }],
      })
      if (result.ok) {
        return jsonResponse({ ok: true, message: `Google Gemini conectado com ${result.model}.` })
      }
      return jsonResponse({ ok: false, error: result.error }, 400)
    }

    if (action === 'test_elevenlabs') {
      const cfg = await loadAudioConfig(db)
      const apiKey = (body.elevenlabs_api_key || cfg.elevenlabs_api_key || '').trim()
      const voiceId = resolveElevenLabsVoiceId(body.elevenlabs_voice_id || cfg.elevenlabs_voice_id)
      if (!apiKey) {
        return jsonResponse({ ok: false, error: 'Chave ElevenLabs API não configurada.' }, 400)
      }
      const res = await fetch(
        `https://api.elevenlabs.io/v1/voices/${voiceId}`,
        {
          headers: { 'xi-api-key': apiKey },
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return jsonResponse({
          ok: false,
          error: data?.detail?.message || data?.message || `Erro HTTP ${res.status} ao validar voz no ElevenLabs.`,
        }, 400)
      }
      return jsonResponse({
        ok: true,
        voiceName: data.name,
        message: `ElevenLabs conectado! Voz identificada: "${data.name}".`,
      })
    }

    return jsonResponse({ ok: true, config: await loadAudioConfig(db) })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})