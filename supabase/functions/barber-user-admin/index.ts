/**
 * Admin de contas de barbeiro (reset de senha com service role).
 * POST { action: "reset_password", barbeiro_id: string, senha?: string }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

function genPassword(): string {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `Barber${n}!`
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Faça login no painel.' }
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user) return { error: 'Sessão inválida.' }

  // Bloqueia se for conta de barbeiro (tem user_id em barbeiros)
  const { data: barb } = await admin
    .from('barbeiros')
    .select('id')
    .eq('user_id', data.user.id)
    .maybeSingle()
  if (barb) return { error: 'Acesso só para administrador.' }

  return { admin, user: data.user }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const auth = await requireAdmin(req)
    if ('error' in auth && auth.error) {
      return jsonResponse({ ok: false, error: auth.error }, 401)
    }
    const { admin } = auth as {
      admin: ReturnType<typeof createClient>
      user: { id: string }
    }

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    if (action === 'reset_password') {
      const barbeiroId = String(body.barbeiro_id || '')
      if (!barbeiroId) {
        return jsonResponse({ ok: false, error: 'barbeiro_id obrigatório' }, 400)
      }
      const { data: barbeiro, error: errB } = await admin
        .from('barbeiros')
        .select('id, nome, email, user_id')
        .eq('id', barbeiroId)
        .single()
      if (errB || !barbeiro) {
        return jsonResponse({ ok: false, error: 'Barbeiro não encontrado' }, 404)
      }
      if (!barbeiro.user_id) {
        return jsonResponse({ ok: false, error: 'Barbeiro sem conta de login' }, 400)
      }

      const senha = String(body.senha || '').trim() || genPassword()
      if (senha.length < 6) {
        return jsonResponse({ ok: false, error: 'Senha mínima 6 caracteres' }, 400)
      }

      const { error: errAuth } = await admin.auth.admin.updateUserById(barbeiro.user_id, {
        password: senha,
        email_confirm: true,
      })
      if (errAuth) {
        return jsonResponse({ ok: false, error: errAuth.message }, 400)
      }

      await admin
        .from('barbeiros')
        .update({ senha_temporaria: senha })
        .eq('id', barbeiro.id)

      return jsonResponse({
        ok: true,
        senha,
        email: barbeiro.email,
        nome: barbeiro.nome,
      })
    }

    return jsonResponse({ ok: false, error: `action desconhecida: ${action}` }, 400)
  } catch (e) {
    return jsonResponse(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    )
  }
})
