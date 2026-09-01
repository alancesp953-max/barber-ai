/**
 * Campanha WhatsApp em massa (admin autenticado).
 * POST { mensagem: string, cliente_ids: string[] }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { humanReply, normalizePhone } from '../_shared/uazapi.ts'
import { resolveUazConfig } from '../_shared/resolve-uaz.ts'
import { isKnownLeadName } from '../_shared/db.ts'

const MAX_BATCH = 200
const DELAY_MS = 1200

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v)
  }
  return out
}

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
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: errUser } = await admin.auth.getUser(jwt)
    if (errUser || !userData.user) {
      return jsonResponse({ error: 'Sessão inválida' }, 401)
    }

    // Bloqueia conta de barbeiro
    const { data: barb } = await admin
      .from('barbeiros')
      .select('id')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (barb) {
      return jsonResponse({ error: 'Acesso só para administrador' }, 403)
    }

    const body = await req.json().catch(() => ({})) as {
      mensagem?: string
      cliente_ids?: string[]
    }
    const mensagem = String(body.mensagem || '').trim()
    const ids = Array.isArray(body.cliente_ids)
      ? body.cliente_ids.map(String).filter(Boolean)
      : []

    if (!mensagem) return jsonResponse({ error: 'mensagem obrigatória' }, 400)
    if (!ids.length) return jsonResponse({ error: 'cliente_ids vazio' }, 400)
    if (ids.length > MAX_BATCH) {
      return jsonResponse({ error: `Máximo ${MAX_BATCH} destinatários por campanha` }, 400)
    }

    const { data: config } = await admin
      .from('configuracoes')
      .select('nome_barbearia')
      .eq('id', 1)
      .maybeSingle()
    const shop = String(config?.nome_barbearia || 'barbearia').trim()

    const { data: clients, error: errC } = await admin
      .from('clientes')
      .select('id, nome, telefone, whatsapp_opt_in')
      .in('id', ids)
    if (errC) return jsonResponse({ error: errC.message }, 500)

    const resolved = await resolveUazConfig(admin)
    if (!resolved.config) {
      return jsonResponse({ error: resolved.error || 'UAZAPI não configurada' }, 502)
    }

    const { data: campanha, error: errCamp } = await admin
      .from('campanhas')
      .insert({
        mensagem,
        created_by: userData.user.id,
        total_destinatarios: (clients || []).length,
        status: 'enviando',
      })
      .select('id')
      .single()
    if (errCamp || !campanha) {
      return jsonResponse({ error: errCamp?.message || 'Falha ao criar campanha' }, 500)
    }

    let enviados = 0
    let erros = 0

    for (const c of clients || []) {
      const phone = String(c.telefone || '').replace(/\D/g, '')
      if (!phone) {
        await admin.from('campanha_envios').insert({
          campanha_id: campanha.id,
          cliente_id: c.id,
          telefone: null,
          status: 'erro',
          erro: 'sem_telefone',
        })
        erros++
        continue
      }

      const nome =
        c.nome && isKnownLeadName(c.nome) ? String(c.nome).trim().split(/\s+/)[0] : 'cliente'
      const text = fillTemplate(mensagem, { nome, barbearia: shop })

      try {
        const sent = await humanReply(normalizePhone(phone), text, resolved.config)
        if (!sent.ok) {
          await admin.from('campanha_envios').insert({
            campanha_id: campanha.id,
            cliente_id: c.id,
            telefone: phone,
            status: 'erro',
            erro: sent.error || 'falha_envio',
          })
          erros++
        } else {
          await admin.from('campanha_envios').insert({
            campanha_id: campanha.id,
            cliente_id: c.id,
            telefone: phone,
            status: 'enviado',
            enviado_em: new Date().toISOString(),
          })
          enviados++
        }
      } catch (e) {
        await admin.from('campanha_envios').insert({
          campanha_id: campanha.id,
          cliente_id: c.id,
          telefone: phone,
          status: 'erro',
          erro: e instanceof Error ? e.message : String(e),
        })
        erros++
      }

      await sleep(DELAY_MS)
    }

    await admin
      .from('campanhas')
      .update({
        total_enviados: enviados,
        total_erros: erros,
        status: 'concluida',
        finished_at: new Date().toISOString(),
      })
      .eq('id', campanha.id)

    return jsonResponse({
      ok: true,
      campanha_id: campanha.id,
      enviados,
      erros,
      total: (clients || []).length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})
