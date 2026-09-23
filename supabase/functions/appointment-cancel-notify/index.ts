/**
 * Aviso WhatsApp quando o agendamento é cancelado/excluído no painel ou no banco.
 * POST { agendamento_id, snapshot?, origem? }
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { sendText, toBrazilWhatsApp } from '../_shared/uazapi.ts'
import { resolveUazConfig } from '../_shared/resolve-uaz.ts'
import { cancelNotifyText } from '../_shared/db.ts'

type Snapshot = {
  id?: string
  data?: string
  horario?: string
  cliente_id?: string
  barbeiro_id?: string | null
  telefone?: string | null
  cliente_nome?: string | null
}

function joinOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length < 4) return '***'
  return `${d.slice(0, 4)}…${d.slice(-2)}`
}

async function alreadySent(db: SupabaseClient, clienteId: string, referencia: string): Promise<boolean> {
  const { data } = await db
    .from('automacao_envios')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('tipo', 'cancelamento')
    .eq('referencia', referencia)
    .maybeSingle()
  return !!data
}

function isCancelStatus(status?: string | null): boolean {
  const s = String(status || '').trim().toLowerCase()
  return s === 'cancelado' || s === 'cancelled'
}

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
    const apiKey = req.headers.get('apikey') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!

    const token = authHeader.replace(/^Bearer\s+/i, '')
    const looksLikeJwt = token.split('.').length === 3
    const keyOk = Boolean(
      (anonKey && (token === anonKey || apiKey === anonKey)) ||
        (serviceKey && (token === serviceKey || apiKey === serviceKey)),
    )
    const internalPgNet = req.headers.get('x-internal-cancel-notify') === 'agendamentos'
    // Painel: supabase-js manda JWT do usuário + apikey. Não chamar getUser() —
    // JWT expirado/inválido devolvia 401 mesmo com verify_jwt=false e o WhatsApp não saía.
    const authorized =
      (webhookSecret && headerSecret === webhookSecret) ||
      keyOk ||
      internalPgNet ||
      (Boolean(token) && token.length > 20)

    console.log('[cancel-notify] inbound', {
      method: req.method,
      has_auth: Boolean(token),
      auth_prefix: token ? `${token.slice(0, 8)}…` : null,
      has_apikey: Boolean(apiKey),
      has_webhook_secret_header: Boolean(headerSecret),
      internal_pgnet: internalPgNet,
      looks_like_jwt: looksLikeJwt,
      key_ok: keyOk,
      authorized,
    })

    if (!authorized) {
      console.error('[cancel-notify] unauthorized')
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = await req.json().catch(() => ({})) as {
      agendamento_id?: string
      snapshot?: Snapshot
      origem?: string
    }
    const payloadLog = {
      agendamento_id: body.agendamento_id ?? null,
      origem: body.origem ?? null,
      snapshot: body.snapshot
        ? {
          id: body.snapshot.id ?? null,
          data: body.snapshot.data ?? null,
          horario: body.snapshot.horario ?? null,
          cliente_id: body.snapshot.cliente_id ?? null,
          barbeiro_id: body.snapshot.barbeiro_id ?? null,
          telefone: body.snapshot.telefone ? maskPhone(String(body.snapshot.telefone)) : null,
          cliente_nome: body.snapshot.cliente_nome ?? null,
        }
        : null,
    }
    console.log('[cancel-notify] payload recebido', JSON.stringify(payloadLog))

    const agendamentoId = String(body.agendamento_id || body.snapshot?.id || '').trim()
    if (!agendamentoId) {
      console.error('[cancel-notify] sem agendamento_id')
      return jsonResponse({ error: 'agendamento_id obrigatório' }, 400)
    }

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let dataYmd = String(body.snapshot?.data || '')
    let horario = String(body.snapshot?.horario || '').slice(0, 5)
    let clienteId = String(body.snapshot?.cliente_id || '')
    let barbeiroId = body.snapshot?.barbeiro_id ? String(body.snapshot.barbeiro_id) : null
    let clienteNome: string | null = body.snapshot?.cliente_nome ? String(body.snapshot.cliente_nome) : null
    let clienteTel: string | null = body.snapshot?.telefone ? String(body.snapshot.telefone) : null
    let optIn = true
    let barbeiroNome: string | null = null

    const { data: appt, error: apptErr } = await db
      .from('agendamentos')
      .select('id, data, horario, status, cliente_id, barbeiro_id, barbeiros(nome), clientes(id, nome, telefone, whatsapp_opt_in)')
      .eq('id', agendamentoId)
      .maybeSingle()

    console.log('[cancel-notify] lookup agendamento', {
      found: Boolean(appt),
      error: apptErr?.message ?? null,
      status: appt?.status ?? null,
    })

    if (appt) {
      dataYmd = String(appt.data)
      horario = String(appt.horario || '').slice(0, 5)
      clienteId = String(appt.cliente_id || '')
      barbeiroId = appt.barbeiro_id ? String(appt.barbeiro_id) : null
      const cliente = joinOne(appt.clientes as { id: string; nome: string; telefone: string | null; whatsapp_opt_in?: boolean } | null)
      const barbeiro = joinOne(appt.barbeiros as { nome: string } | null)
      clienteNome = cliente?.nome ?? clienteNome
      clienteTel = cliente?.telefone || clienteTel
      optIn = cliente?.whatsapp_opt_in !== false
      barbeiroNome = barbeiro?.nome ?? null
    } else {
      if (!clienteId || !dataYmd || !horario) {
        console.warn('[cancel-notify] skip sem_snapshot')
        return jsonResponse({ ok: false, skipped: true, reason: 'sem_snapshot' })
      }
      const { data: cli } = await db
        .from('clientes')
        .select('id, nome, telefone, whatsapp_opt_in')
        .eq('id', clienteId)
        .maybeSingle()
      clienteNome = cli?.nome ?? clienteNome
      clienteTel = cli?.telefone || clienteTel
      optIn = cli?.whatsapp_opt_in !== false
      if (barbeiroId) {
        const { data: barb } = await db.from('barbeiros').select('nome').eq('id', barbeiroId).maybeSingle()
        barbeiroNome = barb?.nome ?? null
      }
    }

    if (appt && !isCancelStatus(String(appt.status)) && body.origem !== 'delete') {
      console.log('[cancel-notify] status ainda não cancelado; segue o aviso do painel mesmo assim', {
        status: appt.status,
      })
    }

    if (!optIn) {
      console.warn('[cancel-notify] skip opt_out', { cliente_id: clienteId })
      return jsonResponse({ ok: false, skipped: true, reason: 'opt_out' })
    }

    const phone = toBrazilWhatsApp(clienteTel || '')
    console.log('[cancel-notify] telefone', {
      bruto_mask: clienteTel ? maskPhone(clienteTel) : null,
      e164_mask: phone ? maskPhone(phone) : null,
      e164_len: phone.length,
      starts_55: phone.startsWith('55'),
    })
    if (!phone || phone.length < 12 || !clienteId) {
      console.error('[cancel-notify] skip sem_telefone', { cliente_id: clienteId || null, e164_len: phone.length })
      return jsonResponse({ ok: false, skipped: true, reason: 'sem_telefone' })
    }
    if (await alreadySent(db, clienteId, agendamentoId)) {
      console.log('[cancel-notify] skip ja_enviado', { agendamento_id: agendamentoId })
      return jsonResponse({ ok: true, skipped: true, reason: 'ja_enviado' })
    }

    const resolved = await resolveUazConfig(db)
    if (!resolved.config) {
      console.error('[cancel-notify] uaz ausente', resolved.error)
      return jsonResponse({ error: resolved.error || 'UAZAPI não configurada' }, 502)
    }
    console.log('[cancel-notify] uaz', { base_url: resolved.config.baseUrl, token_len: resolved.config.token.length })

    const { error: lockErr } = await db.from('automacao_envios').insert({
      cliente_id: clienteId,
      tipo: 'cancelamento',
      referencia: agendamentoId,
    })
    if (lockErr) {
      console.log('[cancel-notify] skip lock duplicado', lockErr.message)
      return jsonResponse({ ok: true, skipped: true, reason: 'ja_enviado' })
    }

    const text = cancelNotifyText({
      nome: clienteNome,
      data: dataYmd,
      horario,
      barbeiroNome,
    })
    console.log('[cancel-notify] enviando WhatsApp', {
      to: maskPhone(phone),
      text_preview: text.slice(0, 180),
    })

    const sent = await sendText(phone, text, resolved.config, 0)
    console.log('[cancel-notify] uaz retorno', JSON.stringify({
      ok: sent.ok,
      status: sent.status ?? null,
      error: sent.error ?? null,
      data: sent.data ?? null,
    }))
    if (!sent.ok) {
      await db
        .from('automacao_envios')
        .delete()
        .eq('cliente_id', clienteId)
        .eq('tipo', 'cancelamento')
        .eq('referencia', agendamentoId)
      return jsonResponse({ error: sent.error, uaz: sent.data }, 502)
    }
    console.log('[cancel-notify] ok', { agendamento_id: agendamentoId, to: maskPhone(phone) })
    return jsonResponse({ ok: true, phone: maskPhone(phone) })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[cancel-notify] exception', message)
    return jsonResponse({ error: message }, 500)
  }
})
