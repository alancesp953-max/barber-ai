import { isClosedHours, parseHmToken } from './shopDefaults'

export const DEFAULT_BREAK_START = '12:00'
export const DEFAULT_BREAK_END = '14:00'

export type DailyBreakFields = {
  id?: string | null
  intervalo_ativo?: boolean | null
  intervalo_inicio?: string | null
  intervalo_fim?: string | null
}

export function parseBreakHm(raw: string | null | undefined): string | null {
  const sliced = String(raw || '').trim().slice(0, 5)
  return /^\d{2}:\d{2}$/.test(sliced) ? sliced : null
}

/** Only the interval saved on this barber — never a global 12:00–14:00 fallback. */
export function readConfiguredDailyBreak(
  barber: DailyBreakFields | null | undefined,
): { inicio: string; fim: string } | null {
  if (!barber || barber.intervalo_ativo !== true) return null
  const inicio = parseBreakHm(barber.intervalo_inicio)
  const fim = parseBreakHm(barber.intervalo_fim)
  if (!inicio || !fim) return null
  if (hmToMin(fim) <= hmToMin(inicio)) return null
  return { inicio, fim }
}

export function normalizeHm(raw: string | null | undefined, fallback = '00:00'): string {
  const parsed = parseHmToken(String(raw || ''))
  if (parsed) return parsed
  const sliced = String(raw || '').trim().slice(0, 5)
  return /^\d{2}:\d{2}$/.test(sliced) ? sliced : fallback
}

export function hmToMin(hm: string): number {
  const [h, m] = normalizeHm(hm).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function minToHm(min: number): string {
  const safe = ((min % 1440) + 1440) % 1440
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function getDailyBreakRange(barber: DailyBreakFields | null | undefined): { start: number; end: number } | null {
  const configured = readConfiguredDailyBreak(barber)
  if (!configured) return null
  return { start: hmToMin(configured.inicio), end: hmToMin(configured.fim) }
}

export function overlapsDailyBreak(
  horario: string,
  durationMin: number,
  barber: DailyBreakFields | null | undefined,
): boolean {
  const br = getDailyBreakRange(barber)
  if (!br) return false
  const a0 = hmToMin(horario)
  const a1 = a0 + Math.max(Number(durationMin) || 0, 1)
  return a0 < br.end && a1 > br.start
}

export function weekdayFromYmd(ymd: string): number {
  return new Date(`${ymd}T12:00:00-03:00`).getDay()
}

const SHOP_KEYS = [
  'horario_domingo',
  'horario_segunda',
  'horario_terca',
  'horario_quarta',
  'horario_quinta',
  'horario_sexta',
  'horario_sabado',
] as const

export function shopHoursKey(dow: number): (typeof SHOP_KEYS)[number] {
  return SHOP_KEYS[dow] || 'horario_domingo'
}

export function parseOpenClose(raw: string | null | undefined): { open: string; close: string } | null {
  if (isClosedHours(raw)) return null
  const parts = String(raw || '')
    .replace(/[–—]/g, '-')
    .replace(/\s+às\s+/gi, '-')
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  const open = parseHmToken(parts[0])
  const close = parseHmToken(parts[1])
  if (!open || !close) return null
  return { open, close }
}

type DayHours = {
  fechado?: boolean | null
  abertura?: string | null
  fechamento?: string | null
}

type Block = { inicio: string; fim: string | null }
type BusyAppt = {
  horario: string
  status?: string | null
  barbeiro_id?: string | null
  durationMin?: number
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 && a1 > b0
}

function workWindow(
  ymd: string,
  shopRange: { open: string; close: string } | null,
  hours: DayHours | null | undefined,
  hasCustomHours: boolean,
): { open: number; close: number } | null {
  if (hasCustomHours) {
    if (!hours || hours.fechado || !hours.abertura || !hours.fechamento) return null
    return { open: hmToMin(hours.abertura), close: hmToMin(hours.fechamento) }
  }
  if (hours) {
    if (hours.fechado || !hours.abertura || !hours.fechamento) return null
    return { open: hmToMin(hours.abertura), close: hmToMin(hours.fechamento) }
  }
  if (!shopRange) return null
  return { open: hmToMin(shopRange.open), close: hmToMin(shopRange.close) }
}

function blockCoversSlot(ymd: string, slotStart: number, slotEnd: number, blocks: Block[]) {
  const dayStart = new Date(`${ymd}T00:00:00-03:00`).getTime()
  return blocks.some((bl) => {
    const start = new Date(bl.inicio).getTime()
    const end = bl.fim ? new Date(bl.fim).getTime() : Number.POSITIVE_INFINITY
    const slot0 = dayStart + slotStart * 60_000
    const slot1 = dayStart + slotEnd * 60_000
    return start < slot1 && end > slot0
  })
}

function busyCoversSlot(slotStart: number, slotEnd: number, appointments: BusyAppt[]) {
  return appointments.some((a) => {
    const status = String(a.status || '').toLowerCase()
    if (status.includes('cancel') || status.includes('conclu')) return false
    const a0 = hmToMin(a.horario)
    const a1 = a0 + Math.max(Number(a.durationMin) || 30, 1)
    return rangesOverlap(slotStart, slotEnd, a0, a1)
  })
}

export function generateDaySlots(openMin: number, closeMin: number, blockMin: number, step = 15): string[] {
  const out: string[] = []
  for (let t = openMin; t + blockMin <= closeMin; t += step) {
    out.push(minToHm(t))
  }
  return out
}

export function isPastSlotToday(ymd: string, hm: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  const today = `${get('year')}-${get('month')}-${get('day')}`
  if (ymd < today) return true
  if (ymd > today) return false
  const hour = get('hour') === '24' ? '00' : get('hour')
  return hm <= `${hour}:${get('minute')}`
}

export type BarberAvailabilityInput = DailyBreakFields & {
  id: string
  ativo?: boolean | null
  ordem_rodizio?: number | null
  hours?: DayHours | null
  hasCustomHours?: boolean
  blocks?: Block[]
  appointments?: BusyAppt[]
}

export function computeAvailableSlots(opts: {
  date: string
  durationMin: number
  bufferMin?: number
  shopHoursRaw?: string | null
  barbers: BarberAvailabilityInput[]
  barbeiroId?: string | null
  allowPast?: boolean
}): string[] {
  const blockMin = Math.max((opts.durationMin || 30) + (opts.bufferMin || 0), 15)
  const shopRange = parseOpenClose(opts.shopHoursRaw)
  const wanted = opts.barbeiroId ? opts.barbers.filter((b) => b.id === opts.barbeiroId) : opts.barbers
  const active = wanted.filter((b) => b.ativo !== false)
  if (!active.length) return []

  const union = new Set<string>()
  for (const barber of active) {
    const win = workWindow(opts.date, shopRange, barber.hours, Boolean(barber.hasCustomHours))
    if (!win) continue
    for (const hm of generateDaySlots(win.open, win.close, blockMin)) {
      const start = hmToMin(hm)
      const end = start + blockMin
      if (overlapsDailyBreak(hm, blockMin, barber)) continue
      if (blockCoversSlot(opts.date, start, end, barber.blocks || [])) continue
      if (busyCoversSlot(start, end, barber.appointments || [])) continue
      if (!opts.allowPast && isPastSlotToday(opts.date, hm)) continue
      union.add(hm)
    }
  }
  return [...union].sort()
}

export function firstBarberFreeForSlot(
  barbers: BarberAvailabilityInput[],
  date: string,
  horario: string,
  durationMin: number,
  shopHoursRaw?: string | null,
): BarberAvailabilityInput | null {
  const blockMin = Math.max(durationMin, 1)
  const shopRange = parseOpenClose(shopHoursRaw)
  const start = hmToMin(horario)
  const end = start + blockMin
  const sorted = [...barbers]
    .filter((b) => b.ativo !== false)
    .sort((a, b) => (a.ordem_rodizio ?? 9999) - (b.ordem_rodizio ?? 9999))
  for (const barber of sorted) {
    const win = workWindow(date, shopRange, barber.hours, Boolean(barber.hasCustomHours))
    if (!win || start < win.open || end > win.close) continue
    if (overlapsDailyBreak(horario, blockMin, barber)) continue
    if (blockCoversSlot(date, start, end, barber.blocks || [])) continue
    if (busyCoversSlot(start, end, barber.appointments || [])) continue
    return barber
  }
  return null
}
