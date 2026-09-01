/**
 * Lembrete WhatsApp ~1h antes do horário (pendente/confirmado).
 * POST {} — auth: service role, JWT admin, ou x-webhook-secret
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { humanReply, normalizePhone } from '../_shared/uazapi.ts'
import { resolveUazConfig } from '../_shared/resolve-uaz.ts'
import { isKnownLeadName } from '../_shared/db.ts'

function brtParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const hour = map.hour === '24' ? '00' : map.hour
  return {
    ymd: `${map.year}-${map.month}-${map.day}`,
    hm: `${hour}:${map.minute}`,
    minutes: Number(hour) * 60 + Number(map.minute),
  }
}

function addMinutesYmdHm(ymd: string, minutes: number): { ymd: string; hm: string } {
  const [y, m, d] = ymd.split('-').map(Number)
  const start = Date.UTC(y, m - 1, d) + minutes * 60_000
  const dt = new Date(start)
  const y2 = dt.getUTCFullYear()
  const m2 = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d2 = String(dt.getUTCDate()).padStart(2, '0')
  const hh = String(dt.getUTCHours()).padStart(2, '0')
  const mm = String(dt.getUTCMinutes()).padStart(2, '0')
  return { ymd: `${y2}-${m2}-${d2}`, hm: `${hh}:${mm}` }
}

async function alreadySent(
  db: SupabaseClient,
  clienteId: string,
  referencia: string,
): Promise<boolean> {
  const { data } = await db
    .from('automacao_envios')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('tipo', 'lembrete_1h')
    .eq('referencia', referencia)
    .maybeSingle()
  return !!data
}

async function markSent(
  db: SupabaseClient,
  clienteId: string,
  referencia: string,
): Promise<void> {
  await db.from('automacao_envios').insert({
    cliente_id: clienteId,
    tipo: 'lembrete_1h',
    referencia,
  })
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

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const resolved = await resolveUazConfig(db)
    if (!resolved.config) {
      return jsonResponse({ error: resolved.error || 'UAZAPI não configurada' }, 502)
    }
    const uaz = resolved.config

    const now = brtParts()
    const windowStart = addMinutesYmdHm(now.ymd, now.minutes + 50)
    const windowEnd = addMinutesYmdHm(now.ymd, now.minutes + 70)

    const dates = [...new Set([now.ymd, windowStart.ymd, windowEnd.ymd])]

    const { data: rows, error } = await db
      .from('agendamentos')
      .select('id, data, horario, cliente_id, barbeiros(nome), clientes(id, nome, telefone, whatsapp_opt_in)')
      .in('status', ['pendente', 'confirmado'])
      .in('data', dates)

    if (error) return jsonResponse({ error: error.message }, 500)

    const startKey = `${windowStart.ymd}T${windowStart.hm}`
    const endKey = `${windowEnd.ymd}T${windowEnd.hm}`

    const result = { sent: 0, skipped: 0, erros: [] as string[] }

    for (const a of rows || []) {
      const hm = String(a.horario || '').slice(0, 5)
      const key = `${a.data}T${hm}`
      if (key < startKey || key > endKey) continue

      const cliente = Array.isArray(a.clientes) ? a.clientes[0] : a.clientes
      const barbeiro = Array.isArray(a.barbeiros) ? a.barbeiros[0] : a.barbeiros
      const cid = (cliente?.id || a.cliente_id) as string | undefined
      if (!cid || cliente?.whatsapp_opt_in === false) {
        result.skipped++
        continue
      }
      const phone = String(cliente?.telefone || '').replace(/\D/g, '')
      if (!phone) {
        result.skipped++
        continue
      }
      if (await alreadySent(db, cid, a.id)) {
        result.skipped++
        continue
      }

      const [yy, mm, dd] = String(a.data).split('-')
      const dateBr = `${dd}/${mm}/${yy}`
      const isToday = String(a.data) === now.ymd
      const quando = isToday ? `hoje às ${hm}` : `no dia ${dateBr} às ${hm}`
      const nome = isKnownLeadName(cliente?.nome) ? String(cliente.nome).trim().split(/\s+/)[0] : ''
      const barb = barbeiro?.nome ? ` com ${barbeiro.nome}` : ''
      const hi = nome ? `Oi, ${nome}!` : 'Oi!'
      const text = [
        hi,
        `Lembrete: seu horário é ${quando}${barb}.`,
        'Pedimos pontualidade. Se precisar remarcar, é só responder aqui.',
      ].join('\n')

      try {
        const sent = await humanReply(normalizePhone(phone), text, uaz)
        if (!sent.ok) {
          result.erros.push(`${a.id}: ${sent.error}`)
          continue
        }
        await markSent(db, cid, a.id)
        result.sent++
      } catch (e) {
        result.erros.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return jsonResponse({ ok: true, ...result })
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
