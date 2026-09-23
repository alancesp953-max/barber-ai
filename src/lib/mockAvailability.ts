import {
  computeAvailableSlots,
  firstBarberFreeForSlot,
  overlapsDailyBreak,
  shopHoursKey,
  weekdayFromYmd,
  type BarberAvailabilityInput,
} from './availability'
import { getTable } from './mockDb'

type TableRows = Record<string, Record<string, unknown>[]>

function rows(name: string, tables?: TableRows) {
  return tables?.[name] || getTable(name)
}

function serviceDuration(servicoId: unknown, tables?: TableRows) {
  const svc = rows('servicos', tables).find((row) => row.id === servicoId)
  return {
    durationMin: Number(svc?.duracao_minutos) || 30,
    bufferMin: Number(svc?.buffer_minutos) || 0,
  }
}

function shopHoursForDate(ymd: string) {
  const cfg = getTable('configuracoes')[0] || {}
  const key = shopHoursKey(weekdayFromYmd(ymd))
  return String(cfg[key] || '')
}

function inputsForDate(ymd: string, tables?: TableRows): BarberAvailabilityInput[] {
  const dow = weekdayFromYmd(ymd)
  const hours = rows('barbeiro_horarios', tables)
  const blocks = rows('barbeiro_bloqueios', tables)
  const appointments = rows('agendamentos', tables)
  const services = rows('servicos', tables)
  const durationByService = new Map(
    services.map((s) => [String(s.id), Number(s.duracao_minutos) || 30]),
  )

  return rows('barbeiros', tables).map((barber) => {
    const id = String(barber.id)
    const ownHours = hours.filter((h) => h.barbeiro_id === id)
    const dayHours = ownHours.find((h) => Number(h.dia_semana) === dow)
    return {
      id,
      ativo: barber.ativo !== false,
      ordem_rodizio: Number(barber.ordem_rodizio) || 0,
      intervalo_ativo: barber.intervalo_ativo === true,
      intervalo_inicio: barber.intervalo_inicio ? String(barber.intervalo_inicio).slice(0, 5) : null,
      intervalo_fim: barber.intervalo_fim ? String(barber.intervalo_fim).slice(0, 5) : null,
      hasCustomHours: ownHours.length > 0,
      hours: dayHours
        ? {
            fechado: Boolean(dayHours.fechado),
            abertura: (dayHours.abertura as string) || null,
            fechamento: (dayHours.fechamento as string) || null,
          }
        : null,
      blocks: blocks
        .filter((b) => b.barbeiro_id === id)
        .map((b) => ({ inicio: String(b.inicio), fim: (b.fim as string) || null })),
      appointments: appointments
        .filter((a) => a.data === ymd && (a.barbeiro_id === id || !a.barbeiro_id))
        .map((a) => ({
          horario: String(a.horario),
          status: String(a.status || ''),
          barbeiro_id: String(a.barbeiro_id || ''),
          durationMin: durationByService.get(String(a.servico_id)) || 30,
        })),
    }
  })
}

export function mockAvailableSlots(params: {
  p_data?: unknown
  p_servico_id?: unknown
  p_barbeiro_id?: unknown
  p_allow_past?: unknown
}, tables?: TableRows) {
  const date = String(params.p_data || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  const { durationMin, bufferMin } = serviceDuration(params.p_servico_id, tables)
  return computeAvailableSlots({
    date,
    durationMin,
    bufferMin,
    shopHoursRaw: shopHoursForDate(date),
    barbers: inputsForDate(date, tables),
    barbeiroId: params.p_barbeiro_id ? String(params.p_barbeiro_id) : null,
    allowPast: Boolean(params.p_allow_past),
  })
}

export function mockCreateAppointment(params: Record<string, unknown>, tables?: TableRows): {
  ok: boolean
  id?: string
  error?: string
  barbeiro_id?: string | null
} {
  const date = String(params.p_data || '')
  const horario = String(params.p_horario || '').slice(0, 5)
  const { durationMin, bufferMin } = serviceDuration(params.p_servico_id, tables)
  const blockMin = durationMin + bufferMin
  const barbers = inputsForDate(date, tables)
  const shopHoursRaw = shopHoursForDate(date)

  let barbeiroId = (params.p_barbeiro_id as string | null) || null
  if (!barbeiroId && params.p_use_rotation) {
    const free = firstBarberFreeForSlot(barbers, date, horario, blockMin, shopHoursRaw)
    barbeiroId = free?.id || null
    if (!barbeiroId) {
      return { ok: false, error: 'Nenhum barbeiro disponível nesse horário (intervalo ou agenda ocupada).' }
    }
  }

  const allowOverlap = Boolean(params.p_allow_overlap)

  if (barbeiroId && !allowOverlap) {
    const barber = barbers.find((b) => b.id === barbeiroId)
    if (overlapsDailyBreak(horario, blockMin, barber)) {
      return { ok: false, error: 'Esse horário coincide com o intervalo diário do barbeiro.' }
    }
    const slots = mockAvailableSlots({
      p_data: date,
      p_servico_id: params.p_servico_id,
      p_barbeiro_id: barbeiroId,
      p_allow_past: true,
    }, tables)
    if (!slots.includes(horario)) {
      return { ok: false, error: 'Horário indisponível na escala deste barbeiro.' }
    }
  }

  return { ok: true, barbeiro_id: barbeiroId }
}
