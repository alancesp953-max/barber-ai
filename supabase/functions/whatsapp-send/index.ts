import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { humanReply, normalizePhone } from '../_shared/uazapi.ts'

/**
 * POST /functions/v1/whatsapp-send
 * Body: { number: string, text: string }
 *
 * Auth:
 * - service role
 * - x-webhook-secret matching WEBHOOK_SECRET
 * - JWT de usuário admin (não barbeiro)
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET') || ''
    const authHeader = req.headers.get('Authorization') || ''
    const headerSecret = req.headers.get('x-webhook-secret') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    const token = authHeader.replace(/^Bearer\s+/i, '')
    const isService = Boolean(token && token === serviceKey)
    const isWebhook = Boolean(webhookSecret && headerSecret === webhookSecret)

    let authorized = isService || isWebhook

    if (!authorized && token && token !== anonKey) {
      const admin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data: userData, error } = await admin.auth.getUser(token)
      if (!error && userData.user) {
        const { data: barb } = await admin
          .from('barbeiros')
          .select('id')
          .eq('user_id', userData.user.id)
          .maybeSingle()
        if (!barb) authorized = true
      }
    }

    if (!authorized) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = await req.json().catch(() => ({})) as {
      number?: string
      text?: string
      phone?: string
      message?: string
    }

    const number = body.number || body.phone
    const text = body.text || body.message

    if (!number || !text) {
      return jsonResponse({ error: 'number e text são obrigatórios' }, 400)
    }

    const result = await humanReply(normalizePhone(number), text)
    if (!result.ok) {
      return jsonResponse({ error: result.error, details: result.data }, 502)
    }

    return jsonResponse({ ok: true, data: result.data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})
