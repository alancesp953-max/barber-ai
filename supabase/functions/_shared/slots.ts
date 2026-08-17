/**
 * Slot availability helpers (Brazil timezone + rodízio + reserva atômica)
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

function ymdDow(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
}

function shopHoursKey(dow: number): string {
  return [
    'horario_domingo',
    'horario_segunda',
    'horario_terca',
    'horario_quarta',
    'horario_quinta',
    'horario_sexta',
    'horario_sabado',
  ][dow]
}

function parseHoursRange(raw: string | null | undefined): { open: string; close: string } | null {
  const t = String(raw || '').trim().toLowerCase()
  if (!t || t === 'fechado' || t === 'closed' || t === '-') return null
  let s = t.replace(/[–—]/g, '-').replace(/\s+às\s+/g, '-').replace(/\s+as\s+/g, '-')
  const parts = s.split('-').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const norm = (tok: string) => {
    const x = tok.replace(/h/g, ':').replace(/\./g, ':').replace(',', ':')
    const m = x.match(/^(\d{1,2}):(\d{1,2})/)
    if (!m) return null
    return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}`
  }
  const open = norm(parts[0])
  const close = norm(parts[1])
  if (!open || !close) return null
  return { open, close }
}

function toBrtMs(ymd: string, hm: string): number {
  return new Date(`${ymd}T${hm.length === 5 ? `${hm}:00` : hm}-03:00`).getTime()
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

export type BookableBarber = { id: string; nome: string }

/**
 * Barbeiros ativos que NÃO estão de folga/bloqueio cobrindo o expediente na data.
 * dataYmd padrão: hoje (America/Sao_Paulo).
 */
export async function listBookableBarbers(
  db: SupabaseClient,
  dataYmd?: string | null,
): Promise<BookableBarber[]> {
  const ymd = dataYmd && /^\d{4}-\d{2}-\d{2}$/.test(dataYmd) ? dataYmd : todaySaoPaulo()
  const all = await listBarbersForRotation(db)
  if (!all.length) return []

  const dow = ymdDow(ymd)
  const dayStart = toBrtMs(ymd, '00:00')
  const dayEnd = toBrtMs(ymd, '23:59')

  const [{ data: cfg }, { data: hoursRows }, { data: blocks }] = await Promise.all([
    db.from('configuracoes').select('*').eq('id', 1).maybeSingle(),
    db.from('barbeiro_horarios').select('barbeiro_id, dia_semana, abertura, fechamento, fechado').eq('dia_semana', dow),
    db
      .from('barbeiro_bloqueios')
      .select('barbeiro_id, inicio, fim')
      .in('barbeiro_id', all.map((b) => b.id))
      .lt('inicio', new Date(dayEnd + 60_000).toISOString()),
  ])

  const shopRange = parseHoursRange((cfg as Record<string, unknown> | null)?.[shopHoursKey(dow)] as string)

  const hoursByBarber = new Map<
    string,
    { fechado: boolean; abertura: string | null; fechamento: string | null }
  >()
  for (const h of (hoursRows || []) as {
    barbeiro_id: string
    fechado: boolean
    abertura: string | null
    fechamento: string | null
  }[]) {
    hoursByBarber.set(h.barbeiro_id, h)
  }

  const blocksByBarber = new Map<string, { inicio: string; fim: string | null }[]>()
  for (const bl of (blocks || []) as { barbeiro_id: string; inicio: string; fim: string | null }[]) {
    const start = new Date(bl.inicio).getTime()
    const end = bl.fim ? new Date(bl.fim).getTime() : Number.POSITIVE_INFINITY
    if (end <= dayStart || start >= dayEnd + 60_000) continue
    const list = blocksByBarber.get(bl.barbeiro_id) || []
    list.push(bl)
    blocksByBarber.set(bl.barbeiro_id, list)
  }

  const out: BookableBarber[] = []
  for (const b of all) {
    const bh = hoursByBarber.get(b.id)
    let work: { open: string; close: string } | null = shopRange
    if (bh) {
      if (bh.fechado || !bh.abertura || !bh.fechamento) continue
      work = { open: String(bh.abertura).slice(0, 5), close: String(bh.fechamento).slice(0, 5) }
    }
    if (!work) continue

    const workStart = toBrtMs(ymd, work.open)
    const workEnd = toBrtMs(ymd, work.close)
    const fullDayOff = (blocksByBarber.get(b.id) || []).some((bl) => {
      const start = new Date(bl.inicio).getTime()
      const end = bl.fim ? new Date(bl.fim).getTime() : Number.POSITIVE_INFINITY
      return start <= workStart && end >= workEnd
    })
    if (fullDayOff) continue
    out.push({ id: b.id, nome: b.nome })
  }
  return out
}

/**
 * Após atribuição automática: move o barbeiro para o fim da fila.
 * Preferir create_appointment_atomic (já rotaciona). Mantido para compat.
 */
export async function rotateBarberQueue(db: SupabaseClient, barbeiroId: string): Promise<void> {
  if (!barbeiroId) return
  const list = await listBarbersForRotation(db)
  if (list.length <= 1) return
  const others = list.filter((b) => b.id !== barbeiroId)
  const rotated = [...others, ...list.filter((b) => b.id === barbeiroId)]
  for (let i = 0; i < rotated.length; i++) {
    await db.from('barbeiros').update({ ordem_rodizio: i + 1 + 10000 }).eq('id', rotated[i].id)
  }
  for (let i = 0; i < rotated.length; i++) {
    await db.from('barbeiros').update({ ordem_rodizio: i + 1 }).eq('id', rotated[i].id)
  }
}

export type AtomicBookingResult =
  | {
      ok: true
      id: string
      barbeiro_id: string | null
      barbeiro_nome: string | null
      from_rotation: boolean
      horario: string
      data: string
    }
  | { ok: false; error: string }

/** Reserva atômica no banco (rodízio + buffer + conflitos). */
export async function createAppointmentAtomic(
  db: SupabaseClient,
  opts: {
    clienteId: string
    servicoId: string
    data: string
    horario: string
    barbeiroId?: string | null
    status?: string
    valor?: number | null
    useRotation?: boolean
  },
): Promise<AtomicBookingResult> {
  const horario = normalizeHorario(opts.horario)
  const { data, error } = await db.rpc('create_appointment_atomic', {
    p_cliente_id: opts.clienteId,
    p_servico_id: opts.servicoId,
    p_data: opts.data,
    p_horario: horario.length === 5 ? `${horario}:00` : horario,
    p_barbeiro_id: opts.barbeiroId || null,
    p_status: opts.status || 'pendente',
    p_valor: opts.valor ?? null,
    p_use_rotation: opts.useRotation !== false,
  })
  if (error) return { ok: false, error: error.message }
  const row = data as Record<string, unknown>
  if (!row?.ok) {
    return { ok: false, error: String(row?.error || 'Falha ao reservar horário') }
  }
  return {
    ok: true,
    id: String(row.id),
    barbeiro_id: (row.barbeiro_id as string) || null,
    barbeiro_nome: (row.barbeiro_nome as string) || null,
    from_rotation: Boolean(row.from_rotation),
    horario: String(row.horario || horario),
    data: String(row.data || opts.data),
  }
}

/**
 * True if horario is free for the given barber (or any free barber when barbeiroId is null).
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
      return {
        ok: false,
        message:
          'Não consegui consultar a agenda agora. Tenta de novo em instantes, por favor.',
      }
    }
    if (!slots.includes(horario)) {
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

  if (!list.length) {
    const { slots, error } = await fetchAvailableSlots(db, data, opts.servicoId, null)
    if (error) {
      return {
        ok: false,
        message:
          'Não consegui consultar a agenda agora. Tenta de novo em instantes, por favor.',
      }
    }
    if (!slots.includes(horario)) {
      return {
        ok: false,
        message: `O horário *${horario}* não está mais disponível em ${formatDateBR(data)}. Escolha outro.`,
      }
    }
    return { ok: true, barbeiro_id: null, barbeiro_nome: null, from_rotation: false }
  }

  for (const b of list) {
    const { slots, error } = await fetchAvailableSlots(db, data, opts.servicoId, b.id)
    if (error) continue
    if (slots.includes(horario)) {
      return { ok: true, barbeiro_id: b.id, barbeiro_nome: b.nome, from_rotation: true }
    }
  }

  return {
    ok: false,
    message: `Nenhum barbeiro tem o horário *${horario}* livre em ${formatDateBR(data)}. Escolha outro horário.`,
  }
}
