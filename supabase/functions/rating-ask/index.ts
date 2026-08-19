/**
 * Dispara pedido de avaliação no WhatsApp após agendamento concluído.
 * POST { agendamento_id: string }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { normalizePhone, humanReply } from '../_shared/uazapi.ts'
import { resolveUazConfig } from '../_shared/resolve-uaz.ts'
import { saveSession, isKnownLeadName, getSession, isBookingStep } from '../_shared/db.ts'

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
    const authorized =
      (webhookSecret && headerSecret === webhookSecret) ||
      (token && (token === serviceKey || token === anonKey || token.length > 20))

    if (!authorized) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    if (token && token !== serviceKey && token !== anonKey) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = await req.json().catch(() => ({})) as { agendamento_id?: string }
    const agendamentoId = String(body.agendamento_id || '').trim()
    if (!agendamentoId) {
      return jsonResponse({ error: 'agendamento_id obrigatório' }, 400)
    }

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: appt, error: errA } = await db
      .from('agendamentos')
      .select(
        'id, status, barbeiro_id, cliente_id, rating_asked_at, barbeiros(id, nome), clientes(id, nome, telefone)',
      )
      .eq('id', agendamentoId)
      .maybeSingle()

    if (errA || !appt) {
      return jsonResponse({ error: errA?.message || 'Agendamento não encontrado' }, 404)
    }
    if (appt.status !== 'concluido') {
      return jsonResponse({ ok: false, skipped: true, reason: 'status_nao_concluido' })
    }
    if (appt.rating_asked_at) {
      return jsonResponse({ ok: false, skipped: true, reason: 'ja_pedido' })
    }
    if (!appt.barbeiro_id) {
      return jsonResponse({ ok: false, skipped: true, reason: 'sem_barbeiro' })
    }

    const { data: already } = await db
      .from('avaliacoes')
      .select('id')
      .eq('agendamento_id', agendamentoId)
      .maybeSingle()
    if (already) {
      return jsonResponse({ ok: false, skipped: true, reason: 'ja_avaliado' })
    }

    const cliente = Array.isArray(appt.clientes) ? appt.clientes[0] : appt.clientes
    const barbeiro = Array.isArray(appt.barbeiros) ? appt.barbeiros[0] : appt.barbeiros
    const phoneRaw = cliente?.telefone as string | undefined
    if (!phoneRaw) {
      return jsonResponse({ ok: false, skipped: true, reason: 'sem_telefone' })
    }

    const phone = normalizePhone(phoneRaw)
    const sess = await getSession(db, phone)
    if (isBookingStep(sess.step)) {
      return jsonResponse({ ok: false, skipped: true, reason: 'agendamento_em_andamento' })
    }
    const barberName = (barbeiro?.nome as string) || 'seu barbeiro'
    const clientName = cliente?.nome as string | undefined
    const firstName =
      clientName && isKnownLeadName(clientName)
        ? String(clientName).trim().split(/\s+/)[0]
        : null

    const ask = [
      firstName ? `Oi, ${firstName}!` : 'Oi!',
      `Passando rapidinho depois do seu atendimento com o *${barberName}*.`,
      '',
      'Se topasse, eu adoraria saber como foi — uma nota bem rápida, sem enrolação.',
      'Topa avaliar? Pode responder *sim* ou *não*, sem pressão nenhuma.',
    ].join('\n')

    const resolved = await resolveUazConfig(db)
    if (!resolved.config) {
      return jsonResponse({ error: resolved.error || 'UAZAPI não configurada' }, 502)
    }

    const sent = await humanReply(phone, ask, resolved.config)
    if (!sent.ok) {
      return jsonResponse({ error: sent.error, details: sent.data }, 502)
    }

    await saveSession(db, phone, 'rate_ask', {
      agendamento_id: agendamentoId,
      barbeiro_id: appt.barbeiro_id,
      barbeiro_nome: barberName,
      cliente_id: appt.cliente_id || cliente?.id || null,
      lead_name: firstName,
      mode: 'rating',
    })

    await db
      .from('agendamentos')
      .update({ rating_asked_at: new Date().toISOString() })
      .eq('id', agendamentoId)

    return jsonResponse({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})
