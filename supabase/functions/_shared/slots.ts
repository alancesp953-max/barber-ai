/**
 * Slot availability helpers (Brazil timezone + rodízio + recheck before booking)
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
  const hour = p.hour === '24' ? '00' : p.hour
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

/** Barbeiros ativos na ordem da fila de rodízio. */
export async function listBarbersForRotation(
  db: SupabaseClient,
): Promise<{ id: string; nome: string; ordem_rodizio: number }[]> {
  const { data } = await db
    .from('barbeiros')
    .select('id, nome, ordem_rodizio, ativo')
    .order('ordem_rodizio', { ascending: true })
    .order('nome', { ascending: true })
  return ((data || []) as { id: string; nome: string; ordem_rodizio: number | null; ativo?: boolean }[])
    .filter((b) => b.ativo !== false)
    .map((b) => ({
      id: b.id,
      nome: b.nome,
      ordem_rodizio: Number(b.ordem_rodizio) || 0,
    }))
}

/**
 * Após atribuição automática: move o barbeiro para o fim da fila.
 */
export async function rotateBarberQueue(db: SupabaseClient, barbeiroId: string): Promise<void> {
  if (!barbeiroId) return
  const list = await listBarbersForRotation(db)
  if (list.length <= 1) return
  const others = list.filter((b) => b.id !== barbeiroId)
  const rotated = [...others, ...list.filter((b) => b.id === barbeiroId)]
  for (let i = 0; i < rotated.length; i++) {
    await db.from('barbeiros').update({ ordem_rodizio: i + 1 }).eq('id', rotated[i].id)
  }
}

/**
 * True if horario is free for the given barber (or any free barber when barbeiroId is null).
 * Returns which barber to assign when "any" was requested (rodízio).
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
  | { ok: true; barbeiro_id: string | null; barbeiro_nome: string | null; from_rotation: boolean }
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

  const list = await listBarbersForRotation(db)

  if (opts.barbeiroId) {
    const { slots, error } = await fetchAvailableSlots(db, data, opts.servicoId, opts.barbeiroId)
    if (error) {
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
      from_rotation: false,
    }
  }

  // Qualquer barbeiro: topo da fila de rodízio que estiver livre
  if (!list.length) {
    const { slots } = await fetchAvailableSlots(db, data, opts.servicoId, null)
    if (!slots.includes(horario)) {
      return {
        ok: false,
        message: `O horário *${horario}* não está mais disponível em ${formatDateBR(data)}. Escolha outro.`,
      }
    }
    return { ok: true, barbeiro_id: null, barbeiro_nome: null, from_rotation: false }
  }

  for (const b of list) {
    const { slots } = await fetchAvailableSlots(db, data, opts.servicoId, b.id)
    if (slots.includes(horario)) {
      return { ok: true, barbeiro_id: b.id, barbeiro_nome: b.nome, from_rotation: true }
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

  // Bloqueios do barbeiro
  const startIso = `${data}T${horario}:00-03:00`
  const endH = Math.floor(endMin / 60)
  const endM = endMin % 60
  const endIso = `${data}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00-03:00`
  const { data: blocks } = await db
    .from('barbeiro_bloqueios')
    .select('id')
    .eq('barbeiro_id', barbeiroId)
    .lt('inicio', endIso)
    .gt('fim', startIso)
    .limit(1)
  if (blocks && blocks.length > 0) return false

  return true
}
