/**
 * Disparo diário de automações WhatsApp (ausência + aniversário).
 * POST {} — auth: service role, JWT admin, ou x-webhook-secret
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { humanReply, normalizePhone } from '../_shared/uazapi.ts'
import { resolveUazConfig } from '../_shared/resolve-uaz.ts'
import { isKnownLeadName } from '../_shared/db.ts'

type ConfigRow = {
  auto_ausencia_ativo?: boolean
  auto_ausencia_dias?: number
  auto_ausencia_mensagem?: string | null
  auto_aniversario_ativo?: boolean
  auto_aniversario_mensagem?: string | null
  nome_barbearia?: string | null
}

function todaySaoPauloParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const iso = fmt.format(new Date()) // YYYY-MM-DD
  const [y, m, d] = iso.split('-')
  return { iso, year: y, month: m, day: d }
}

function daysBetween(isoPast: string, isoToday: string): number {
  const a = new Date(`${isoPast}T12:00:00Z`).getTime()
  const b = new Date(`${isoToday}T12:00:00Z`).getTime()
  return Math.floor((b - a) / 86400000)
}

function firstName(nome: string | null | undefined): string {
  if (!nome || !isKnownLeadName(nome)) return 'cliente'
  return nome.trim().split(/\s+/)[0]
}

function fillTemplate(tpl: string, vars: Record<string, string | number>): string {
  let out = tpl
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}

function defaultAusenciaMsg(nome: string, dias: number, shop: string): string {
  return [
    `Oi, ${nome}! Tudo bem?`,
    '',
    `Faz um tempo que você não aparece por aqui${shop ? ` na ${shop}` : ''} — já vão uns *${dias} dias*.`,
    'Aconteceu alguma coisa? Se quiser remarcar, é só me responder por aqui.',
  ].join('\n')
}

function defaultAniversarioMsg(nome: string, shop: string): string {
  return [
    `Feliz aniversário, ${nome}!`,
    '',
    `A galera${shop ? ` da ${shop}` : ''} mandou um abraço.`,
    'Quando quiser passar pra renovar o visual, tô por aqui.',
  ].join('\n')
}

async function alreadySent(
  db: SupabaseClient,
  clienteId: string,
  tipo: string,
  referencia: string,
): Promise<boolean> {
  const { data } = await db
    .from('automacao_envios')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('tipo', tipo)
    .eq('referencia', referencia)
    .maybeSingle()
  return !!data
}

async function markSent(
  db: SupabaseClient,
  clienteId: string,
  tipo: string,
  referencia: string,
): Promise<void> {
  await db.from('automacao_envios').insert({
    cliente_id: clienteId,
    tipo,
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

    const { data: configRaw, error: errCfg } = await db
      .from('configuracoes')
      .select(
        'auto_ausencia_ativo, auto_ausencia_dias, auto_ausencia_mensagem, auto_aniversario_ativo, auto_aniversario_mensagem, nome_barbearia',
      )
      .eq('id', 1)
      .maybeSingle()

    if (errCfg) {
      return jsonResponse({ error: errCfg.message }, 500)
    }

    const config = (configRaw || {}) as ConfigRow
    const shop = String(config.nome_barbearia || '').trim()
    const { iso: today, year, month, day } = todaySaoPauloParts()

    const resolved = await resolveUazConfig(db)
    if (!resolved.config) {
      return jsonResponse({ error: resolved.error || 'UAZAPI não configurada' }, 502)
    }
    const uaz = resolved.config

    const result = {
      ausencia: 0,
      aniversario: 0,
      skipped: 0,
      erros: [] as string[],
    }

    // ── Ausência ────────────────────────────────────────────────────────────
    if (config.auto_ausencia_ativo) {
      const diasLimite = Math.max(1, Number(config.auto_ausencia_dias) || 45)

      const { data: concluidos, error: errA } = await db
        .from('agendamentos')
        .select('cliente_id, data')
        .eq('status', 'concluido')
        .not('cliente_id', 'is', null)

      if (errA) {
        result.erros.push(`ausencia query: ${errA.message}`)
      } else {
        const lastVisit = new Map<string, string>()
        for (const row of concluidos || []) {
          const cid = row.cliente_id as string
          const d = row.data as string
          const prev = lastVisit.get(cid)
          if (!prev || d > prev) lastVisit.set(cid, d)
        }

        const inactiveIds: string[] = []
        for (const [cid, last] of lastVisit) {
          if (daysBetween(last, today) >= diasLimite) inactiveIds.push(cid)
        }

        if (inactiveIds.length) {
          const { data: clients } = await db
            .from('clientes')
            .select('id, nome, telefone, whatsapp_opt_in')
            .in('id', inactiveIds)

          for (const c of clients || []) {
            if (c.whatsapp_opt_in === false) {
              result.skipped++
              continue
            }
            const phone = String(c.telefone || '').replace(/\D/g, '')
            if (!phone) {
              result.skipped++
              continue
            }
            const last = lastVisit.get(c.id)!
            const dias = daysBetween(last, today)
            const windowRef = `visita-${last}-d${diasLimite}`
            if (await alreadySent(db, c.id, 'ausencia', windowRef)) {
              result.skipped++
              continue
            }

            const nome = firstName(c.nome)
            const tpl = String(config.auto_ausencia_mensagem || '').trim()
            const text = tpl
              ? fillTemplate(tpl, { nome, dias, barbearia: shop })
              : defaultAusenciaMsg(nome, dias, shop)

            try {
              const sent = await humanReply(normalizePhone(phone), text, uaz)
              if (!sent.ok) {
                result.erros.push(`${c.id}: ${sent.error}`)
                continue
              }
              await markSent(db, c.id, 'ausencia', windowRef)
              result.ausencia++
            } catch (e) {
              result.erros.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`)
            }
          }
        }
      }
    }

    // ── Aniversário ─────────────────────────────────────────────────────────
    if (config.auto_aniversario_ativo) {
      const yearRef = year
      const { data: birthdayClients, error: errB } = await db
        .from('clientes')
        .select('id, nome, telefone, data_nascimento, whatsapp_opt_in')
        .not('data_nascimento', 'is', null)

      if (errB) {
        result.erros.push(`aniversario query: ${errB.message}`)
      } else {
        for (const c of birthdayClients || []) {
          const dn = String(c.data_nascimento || '')
          // YYYY-MM-DD
          const parts = dn.split('-')
          if (parts.length !== 3) continue
          if (parts[1] !== month || parts[2] !== day) continue

          if (c.whatsapp_opt_in === false) {
            result.skipped++
            continue
          }
          const phone = String(c.telefone || '').replace(/\D/g, '')
          if (!phone) {
            result.skipped++
            continue
          }
          if (await alreadySent(db, c.id, 'aniversario', yearRef)) {
            result.skipped++
            continue
          }

          const nome = firstName(c.nome)
          const tpl = String(config.auto_aniversario_mensagem || '').trim()
          const text = tpl
            ? fillTemplate(tpl, { nome, barbearia: shop })
            : defaultAniversarioMsg(nome, shop)

          try {
            const sent = await humanReply(normalizePhone(phone), text, uaz)
            if (!sent.ok) {
              result.erros.push(`${c.id}: ${sent.error}`)
              continue
            }
            await markSent(db, c.id, 'aniversario', yearRef)
            result.aniversario++
          } catch (e) {
            result.erros.push(`${c.id}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }
    }

    return jsonResponse({ ok: true, ...result, today })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 500)
  }
})
