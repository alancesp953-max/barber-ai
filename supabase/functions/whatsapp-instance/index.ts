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
 * Requer JWT de usuário autenticado (painel admin).
 * Usa UAZAPI_BASE_URL + UAZAPI_INSTANCE_TOKEN dos secrets.
 *
 * connect → POST /instance/connect (sem phone = QR code)
 * status  → GET  /instance/status
 * disconnect → POST /instance/disconnect
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || ''
    const supabase = createClient(supabaseUrl, anonKey || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      phone?: string
    }
    const action = (body.action || 'status').toLowerCase()

    if (action === 'connect') {
      const result = await connectInstance(body.phone)
      if (!result.ok) {
        return jsonResponse({ error: result.error, details: result.data }, 502)
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
        return jsonResponse({ error: result.error, details: result.data }, 502)
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
        return jsonResponse({ error: result.error, details: result.data }, 502)
      }
      return jsonResponse({ ok: true, action: 'disconnect', data: result.data })
    }

    return jsonResponse({ error: 'action inválida. Use: connect | status | disconnect' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})
