import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  connectInstance,
  disconnectInstance,
  extractQrFromResponse,
  getInstanceStatus,
} from '../_shared/uazapi.ts'

/**
 * POST /functions/v1/whatsapp-instance
 * Body: { action: "connect" | "status" | "disconnect", phone?: string }
 *
 * Requer Authorization Bearer (JWT do admin no painel).
 * Secrets: UAZAPI_BASE_URL, UAZAPI_INSTANCE_TOKEN
 */
async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Faça login no painel (token ausente).' }
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt || jwt.length < 20) {
    return { user: null, error: 'Sessão inválida. Faça login novamente.' }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return { user: null, error: 'Supabase env ausente na Edge Function.' }
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user) {
    return {
      user: null,
      error: error?.message || 'Não autorizado. Saia e entre de novo no admin.',
    }
  }
  return { user: data.user, error: null }
}

function uazSecretsOk(): string | null {
  const base = Deno.env.get('UAZAPI_BASE_URL')
  const token = Deno.env.get('UAZAPI_INSTANCE_TOKEN')
  if (!base || !token) {
    return 'Secrets UAZAPI_BASE_URL e UAZAPI_INSTANCE_TOKEN não configurados no Supabase.'
  }
  return null
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

    const secretErr = uazSecretsOk()
    if (secretErr) {
      // 200 so functions.invoke delivers body to the client
      return jsonResponse({ ok: false, error: secretErr })
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      phone?: string
    }
    const action = (body.action || 'status').toLowerCase()

    if (action === 'connect') {
      const result = await connectInstance(body.phone)
      if (!result.ok) {
        return jsonResponse({
          ok: false,
          error: result.error || 'Falha no POST /instance/connect',
          details: result.data,
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
      })
    }

    if (action === 'status') {
      const result = await getInstanceStatus()
      if (!result.ok) {
        return jsonResponse({
          ok: false,
          error: result.error || 'Falha no GET /instance/status',
          details: result.data,
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
      })
    }

    if (action === 'disconnect') {
      const result = await disconnectInstance()
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
      error: 'action inválida. Use: connect | status | disconnect',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('whatsapp-instance error', message)
    return jsonResponse({ ok: false, error: message })
  }
})
