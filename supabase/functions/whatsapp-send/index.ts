import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { normalizePhone, sendText } from '../_shared/uazapi.ts'

/**
 * POST /functions/v1/whatsapp-send
 * Body: { number: string, text: string }
 *
 * Auth:
 * - service role / user JWT (Authorization: Bearer ...)
 * - or x-webhook-secret matching WEBHOOK_SECRET
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

    const token = authHeader.replace(/^Bearer\s+/i, '')
    const authorized =
      (webhookSecret && headerSecret === webhookSecret) ||
      (token && (token === serviceKey || token === anonKey || token.length > 20))

    if (!authorized) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    // If JWT user, optionally check bot toggle is available; always allow service role
    if (token && token !== serviceKey && token !== anonKey) {
      const url = Deno.env.get('SUPABASE_URL')!
      const supabase = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
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

    const result = await sendText(normalizePhone(number), text)
    if (!result.ok) {
      return jsonResponse({ error: result.error, details: result.data }, 502)
    }

    return jsonResponse({ ok: true, data: result.data })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})
