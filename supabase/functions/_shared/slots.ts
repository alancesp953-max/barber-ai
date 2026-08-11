/**
 * Slot availability helpers (Brazil timezone + recheck before booking)
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { formatDateBR } from './db.ts'

const TZ = 'America/Sao_Paulo'

function spParts(): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const out: Record<string, string> = {}
  for (const p of parts) {
    if (p.type !== 'literal') out[p.type] = p.value
  }
  return out
}

export function todaySaoPaulo(): string {
  const p = spParts()
  return `${p.year}-${p.month}-${p.day}`
}

export function nowTimeSaoPaulo(): string {
  const p = spParts()
  // en-CA can use 24:00 edge; clamp hour to 00-23 display
  let hour = p.hour === '24' ? '00' : p.hour
  return `${hour}:${p.minute}`
}

export function normalizeHorario(h: string): string {
  return String(h || '').trim().slice(0, 5)
}

/** Remove past slots when date is today (SP). */
export function filterPastSlots(data: string, slots: string[]): string[] {
  const today = todaySaoPaulo()
  if (data < today) return []
  if (data > today) return slots.map(normalizeHorario)
  const now = nowTimeSaoPaulo()
  return slots.map(normalizeHorario).filter((h) => h > now)
}

export async function fetchAvailableSlots(
  db: SupabaseClient,
  data: string,
  servicoId: string,
  barbeiroId?: string | null,
): Promise<{ slots: string[]; error?: string }> {
  const { data: rows, error } = await db.rpc('get_available_slots', {
    p_data: data,
    p_servico_id: servicoId,
    p_barbeiro_id: barbeiroId || null,
  })
  if (error) return { slots: [], error: error.message }
  const slots = filterPastSlots(
    data,
    ((rows as { horario: string }[]) || []).map((s) => String(s.horario)),
  )
  return { slots }
}

/**
 * True if horario is free for the given barber (or any free barber when barbeiroId is null).
 * Returns which barber to assign when "any" was requested.
 */
export async function checkSlotAvailability(
  db: SupabaseClient,
  opts: {
    data: string
    servicoId: string
    horario: string
    barbeiroId?: string | null
    barbeiroNome?: string | null
  },
): Promise<
  | { ok: true; barbeiro_id: string | null; barbeiro_nome: string | null }
  | { ok: false; message: string }
> {
  const data = opts.data
  const horario = normalizeHorario(opts.horario)
  const today = todaySaoPaulo()
  const nowT = nowTimeSaoPaulo()

  if (data < today) {
    return { ok: false, message: 'Essa data já passou. Escolha outra data.' }
  }
  if (data === today && horario <= nowT) {
    return {
      ok: false,
      message: `O horário *${horario}* já passou (agora são ~${nowT}). Escolha um horário futuro.`,
    }
  }

  const { data: barbers } = await db.from('barbeiros').select('id, nome').order('nome')
  const list = barbers || []

  if (opts.barbeiroId) {
    const { slots, error } = await fetchAvailableSlots(db, data, opts.servicoId, opts.barbeiroId)
    if (error) {
      // fallback conflict check
      const free = await isBarberFreeAt(db, data, opts.servicoId, opts.barbeiroId, horario)
      if (!free) {
        const nome = opts.barbeiroNome || 'Esse barbeiro'
        return {
          ok: false,
          message: `*${nome}* não tem o horário *${horario}* disponível em ${formatDateBR(data)} (já está ocupado). Escolha outro horário ou barbeiro.`,
        }
      }
    } else if (!slots.includes(horario)) {
      const nome = opts.barbeiroNome || 'Esse barbeiro'
      return {
        ok: false,
        message: `*${nome}* não tem o horário *${horario}* disponível em ${formatDateBR(data)}. Escolha outro horário.`,
      }
    }
    return {
      ok: true,
      barbeiro_id: opts.barbeiroId,
      barbeiro_nome: opts.barbeiroNome || list.find((b) => b.id === opts.barbeiroId)?.nome || null,
    }
  }

  // Qualquer barbeiro: achar o primeiro livre naquele horário
  if (!list.length) {
    const { slots } = await fetchAvailableSlots(db, data, opts.servicoId, null)
    if (!slots.includes(horario)) {
      return {
        ok: false,
        message: `O horário *${horario}* não está mais disponível em ${formatDateBR(data)}. Escolha outro.`,
      }
    }
    return { ok: true, barbeiro_id: null, barbeiro_nome: null }
  }

  for (const b of list) {
    const { slots } = await fetchAvailableSlots(db, data, opts.servicoId, b.id)
    if (slots.includes(horario)) {
      return { ok: true, barbeiro_id: b.id, barbeiro_nome: b.nome }
    }
  }

  return {
    ok: false,
    message: `Nenhum barbeiro tem o horário *${horario}* livre em ${formatDateBR(data)}. Escolha outro horário.`,
  }
}

async function isBarberFreeAt(
  db: SupabaseClient,
  data: string,
  servicoId: string,
  barbeiroId: string,
  horario: string,
): Promise<boolean> {
  const { data: svc } = await db.from('servicos').select('duracao_minutos').eq('id', servicoId).maybeSingle()
  const dur = Number(svc?.duracao_minutos) || 30
  const [hh, mm] = horario.split(':').map(Number)
  const startMin = hh * 60 + mm
  const endMin = startMin + dur

  const { data: busy } = await db
    .from('agendamentos')
    .select('horario, barbeiro_id, servicos(duracao_minutos)')
    .eq('data', data)
    .in('status', ['pendente', 'confirmado'])

  for (const a of busy || []) {
    if (a.barbeiro_id && a.barbeiro_id !== barbeiroId) continue
    const ah = String(a.horario).slice(0, 5)
    const [ahH, ahM] = ah.split(':').map(Number)
    const aStart = ahH * 60 + ahM
    const aServ = Array.isArray(a.servicos) ? a.servicos[0] : a.servicos
    const aDur = Number(aServ?.duracao_minutos) || 30
    const aEnd = aStart + aDur
    if (aStart < endMin && aEnd > startMin) return false
  }
  return true
}
