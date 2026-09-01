import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  connectInstance,
  disconnectInstance,
  extractQrFromResponse,
  getInstanceStatus,
  getUazapiConfig,
  type UazapiConfig,
} from '../_shared/uazapi.ts'

/**
 * POST /functions/v1/whatsapp-instance
 * Body: { action: "connect" | "status" | "disconnect" | "diagnose", phone?: string }
 *
 * Auth: JWT do admin, service_role, ou x-webhook-secret.
 * Base URL: secret UAZAPI_BASE_URL ou configuracoes.uazapi_base_url
 * Token: secret UAZAPI_INSTANCE_TOKEN
 */

function isUuidHost(baseUrl: string): boolean {
  try {
    const host = new URL(/^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`).hostname
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(host)
  } catch {
    return false
  }
}

function normalizeBase(url: string): string {
  let base = url.trim().replace(/\/$/, '')
  if (!base) return ''
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`
  return base
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { user: null as null, error: 'Faça login no painel (token ausente).' }
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt || jwt.length < 20) {
    return { user: null as null, error: 'Sessão inválida. Faça login novamente.' }
  }

  try {
    const payloadB64 = jwt.split('.')[1]
    if (payloadB64) {
      const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
      const payload = JSON.parse(json) as { role?: string }
      if (payload.role === 'service_role') {
        return { user: { id: 'service_role', role: 'service_role' }, error: null }
      }
    }
  } catch {
    /* continue */
  }

  const webhookSecret = Deno.env.get('WEBHOOK_SECRET') || ''
  const headerSecret = req.headers.get('x-webhook-secret') || ''
  if (webhookSecret && headerSecret && headerSecret === webhookSecret) {
    return { user: { id: 'webhook_secret', role: 'secret' }, error: null }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return { user: null as null, error: 'Supabase env ausente na Edge Function.' }
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user) {
    return {
      user: null as null,
      error: error?.message || 'Não autorizado. Saia e entre de novo no admin.',
    }
  }
  return { user: data.user, error: null }
}

async function resolveUazConfig(): Promise<{ config?: UazapiConfig; error?: string; source?: string }> {
  let envToken = (Deno.env.get('UAZAPI_INSTANCE_TOKEN') || '').trim()
  let envBase = normalizeBase(Deno.env.get('UAZAPI_BASE_URL') || '')
  let dbBase = ''
  let dbToken = ''
  let source = 'secret'

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: cfg } = await admin
      .from('configuracoes')
      .select('uazapi_base_url')
      .eq('id', 1)
      .maybeSingle()
    dbBase = normalizeBase(String(cfg?.uazapi_base_url || ''))

    // Table readable only via service role (no anon policies)
    const { data: sec } = await admin
      .from('whatsapp_secrets')
      .select('instance_token, base_url')
      .eq('id', 1)
      .maybeSingle()
    if (sec?.instance_token) dbToken = String(sec.instance_token).trim()
    if (sec?.base_url) {
      const b = normalizeBase(String(sec.base_url))
      if (b) dbBase = b
    }
  } catch {
    /* fall back to env only */
  }

  // Prefer DB base when secret looks like instance UUID used as host by mistake
  let baseUrl = envBase
  if (dbBase && (!envBase || isUuidHost(envBase) || (!envBase.includes('uazapi.com') && dbBase.includes('uazapi.com')))) {
    baseUrl = dbBase
    source = 'db'
  } else if (!baseUrl && dbBase) {
    baseUrl = dbBase
    source = 'db'
  }

  // Prefer DB token when present (CLI often can't rotate secrets)
  let token = envToken
  if (dbToken) {
    // If env token failed patterns or is empty, use DB. Prefer DB UUID instance token when env is different wrong token.
    if (!token || isUuidHost(`https://${token}`) || token.length !== dbToken.length) {
      // always prefer whatsapp_secrets when set
    }
    token = dbToken
    source = source === 'db' ? 'db' : 'db+secret'
  }

  if (!token) {
    return { error: 'UAZAPI_INSTANCE_TOKEN ausente (secret ou tabela whatsapp_secrets).' }
  }
  if (!baseUrl) {
    return {
      error:
        'UAZAPI_BASE_URL ausente. Configure secret ou Configurações / whatsapp_secrets (ex: https://barberai.uazapi.com).',
    }
  }
  if (isUuidHost(baseUrl)) {
    return {
      error: `UAZAPI_BASE_URL inválida (${baseUrl}): parece UUID. Use https://barberai.uazapi.com`,
    }
  }

  try {
    const config = getUazapiConfig({ baseUrl, token })
    return { config, source }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

function secretsDiag(source?: string, config?: UazapiConfig) {
  const base = config?.baseUrl || Deno.env.get('UAZAPI_BASE_URL') || ''
  const token = config?.token || Deno.env.get('UAZAPI_INSTANCE_TOKEN') || ''
  let host = ''
  try {
    host = new URL(normalizeBase(base)).host
  } catch {
    host = base.slice(0, 60)
  }
  return {
    uazapi_host: host || null,
    base_source: source || null,
    token_len: token.length,
    token_prefix: token ? `${token.slice(0, 4)}…` : null,
    webhook_secret_set: Boolean(Deno.env.get('WEBHOOK_SECRET')),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405)
  }

  try {
    const { user, error: authError } = await requireUser(req)
    if (!user) {
      return jsonResponse({ ok: false, error: authError || 'Unauthorized' }, 401)
    }

    const resolved = await resolveUazConfig()
    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      phone?: string
    }
    const action = (body.action || 'status').toLowerCase()

    if (action === 'diagnose') {
      return jsonResponse({
        ok: !resolved.error,
        action: 'diagnose',
        error: resolved.error || null,
        ...secretsDiag(resolved.source, resolved.config),
      })
    }

    if (resolved.error || !resolved.config) {
      return jsonResponse({ ok: false, error: resolved.error || 'Config UAZAPI inválida' })
    }

    const cfg = resolved.config

    if (action === 'connect') {
      const result = await connectInstance(body.phone, cfg)
      if (!result.ok) {
        return jsonResponse({
          ok: false,
          error: result.error || 'Falha no POST /instance/connect',
          details: result.data,
          ...secretsDiag(resolved.source, cfg),
        })
      }
      const parsed = extractQrFromResponse(result.data)
      return jsonResponse({
        ok: true,
        action: 'connect',
        qrcode: parsed.qrcode || null,
        paircode: parsed.paircode || null,
        status: parsed.status || null,
        data: result.data,
        ...secretsDiag(resolved.source, cfg),
      })
    }

    if (action === 'status') {
      const result = await getInstanceStatus(cfg)
      if (!result.ok) {
        return jsonResponse({
          ok: false,
          error: result.error || 'Falha no GET /instance/status',
          details: result.data,
          ...secretsDiag(resolved.source, cfg),
        })
      }
      const parsed = extractQrFromResponse(result.data)
      return jsonResponse({
        ok: true,
        action: 'status',
        qrcode: parsed.qrcode || null,
        paircode: parsed.paircode || null,
        status: parsed.status || null,
        data: result.data,
        ...secretsDiag(resolved.source, cfg),
      })
    }

    if (action === 'disconnect') {
      const result = await disconnectInstance(cfg)
      if (!result.ok) {
        return jsonResponse({
          ok: false,
          error: result.error || 'Falha no POST /instance/disconnect',
          details: result.data,
        })
      }
      return jsonResponse({ ok: true, action: 'disconnect', data: result.data })
    }

    return jsonResponse({
      ok: false,
      error: 'action inválida. Use: connect | status | disconnect | diagnose',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('whatsapp-instance error', message)
    return jsonResponse({ ok: false, error: message })
  }
})
