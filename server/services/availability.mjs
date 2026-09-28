/**
 * Utilitário de cálculo de horários disponíveis respeitando:
 * - Horário de funcionamento da barbearia / barbeiro
 * - Intervalo de almoço / pausa do barbeiro
 * - Dias da semana em que o barbeiro atende
 * - Dias de folga cadastrados
 * - Bloqueios de agenda
 * - Agendamentos existentes
 * - Duração total do serviço
 */

// Converte "HH:mm" para minutos desde 00:00
export function timeToMinutes(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

// Converte minutos para "HH:mm"
export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Verifica se um barbeiro específico está disponível para atendimento em uma data ("YYYY-MM-DD")
 * Respeita:
 * - Se o barbeiro está ativo
 * - Dias de funcionamento da barbearia (se informado)
 * - Escala semanal do barbeiro (workingDays)
 * - Folgas pontuais cadastradas na rotina (daysOff)
 */
export function isBarberAvailableOnDate(barber, dateStr, shopOperatingDays = null) {
  if (!barber || barber.ativo === false || barber.active === false) return false
  if (!dateStr || !dateStr.includes('-')) return false

  const [y, m, d] = dateStr.split('-').map(Number)
  const targetDate = new Date(y, m - 1, d, 12, 0, 0)
  const dayOfWeek = targetDate.getDay() // 0 = Domingo, 1 = Segunda...

  // 1. Barbearia abre nesse dia da semana?
  if (Array.isArray(shopOperatingDays) && shopOperatingDays.length > 0) {
    if (!shopOperatingDays.includes(dayOfWeek)) {
      return false
    }
  }

  // 2. Barbeiro atende nesse dia da semana?
  const workingDays = Array.isArray(barber.workingDays) && barber.workingDays.length > 0
    ? barber.workingDays
    : (Array.isArray(shopOperatingDays) && shopOperatingDays.length > 0 ? shopOperatingDays : [1, 2, 3, 4, 5, 6])

  if (!workingDays.includes(dayOfWeek)) {
    return false // Folga da escala semanal
  }

  // 3. Data está na lista de folgas pontuais do barbeiro?
  const daysOff = Array.isArray(barber.daysOff) ? barber.daysOff : []
  if (daysOff.includes(dateStr)) {
    return false // Folga pontual lançada na rotina
  }

  return true
}

/**
 * Calcula os horários livres para uma data específica.
 */
export function calculateAvailableSlots({
  dateStr, // "YYYY-MM-DD"
  durationMinutes = 30,
  barber = {
    startHour: '09:00',
    endHour: '19:00',
    breakStart: '12:00',
    breakEnd: '13:00',
    workingDays: [1, 2, 3, 4, 5, 6],
    daysOff: [],
  },
  existingAppointments = [], // [{ time: "10:00", durationMinutes: 30, status: "confirmado" }]
  blockedTimes = [], // [{ startTime: "14:00", endTime: "15:00" }]
  slotIntervalMinutes = 30,
  shopOperatingDays = null,
}) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const targetDate = new Date(y, m - 1, d, 12, 0, 0)
  const dayOfWeek = targetDate.getDay() // 0 = Domingo, 1 = Segunda...

  // 0. Verifica se a barbearia abre nesse dia da semana
  if (Array.isArray(shopOperatingDays) && shopOperatingDays.length > 0) {
    if (!shopOperatingDays.includes(dayOfWeek)) {
      return []
    }
  }

  // 1. Verifica se o barbeiro trabalha nesse dia da semana
  const workingDays = Array.isArray(barber.workingDays) && barber.workingDays.length > 0
    ? barber.workingDays
    : (Array.isArray(shopOperatingDays) && shopOperatingDays.length > 0 ? shopOperatingDays : [1, 2, 3, 4, 5, 6])
  if (!workingDays.includes(dayOfWeek)) {
    return []
  }

  // 2. Verifica se a data é dia de folga lançada
  const daysOff = Array.isArray(barber.daysOff) ? barber.daysOff : []
  if (daysOff.includes(dateStr)) {
    return []
  }

  const startMin = timeToMinutes(barber.startHour || '09:00')
  const endMin = timeToMinutes(barber.endHour || '19:00')
  const breakStartMin = barber.breakStart ? timeToMinutes(barber.breakStart) : null
  const breakEndMin = barber.breakEnd ? timeToMinutes(barber.breakEnd) : null

  // Mapeia ocupações (compromissos confirmados/pendentes)
  const occupiedIntervals = []

  // Almoço / Intervalo
  if (breakStartMin !== null && breakEndMin !== null && breakEndMin > breakStartMin) {
    occupiedIntervals.push({ start: breakStartMin, end: breakEndMin })
  }

  // Bloqueios
  for (const block of blockedTimes) {
    occupiedIntervals.push({
      start: timeToMinutes(block.startTime),
      end: timeToMinutes(block.endTime),
    })
  }

  // Agendamentos ativos
  for (const appt of existingAppointments) {
    if (appt.status === 'cancelled' || appt.status === 'cancelado') continue
    const apptStart = timeToMinutes(appt.time || appt.horario)
    const apptDur = Number(appt.durationMinutes || appt.duracao_minutos || 30)
    occupiedIntervals.push({
      start: apptStart,
      end: apptStart + apptDur,
    })
  }

  // Gera slots potenciais
  const availableSlots = []

  for (let current = startMin; current + durationMinutes <= endMin; current += slotIntervalMinutes) {
    const slotEnd = current + durationMinutes

    // Verifica sobreposição com intervalos ocupados
    const hasConflict = occupiedIntervals.some((occ) => {
      // Sobreposição se: max(current, occ.start) < min(slotEnd, occ.end)
      return Math.max(current, occ.start) < Math.min(slotEnd, occ.end)
    })

    if (!hasConflict) {
      availableSlots.push(minutesToTime(current))
    }
  }

  // Se a data solicitada for anterior a hoje, retorna vazio
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (dateStr < todayStr) {
    return []
  }

  // Se a data solicitada for hoje, remove horários que já passaram (com margem de 15 minutos)
  if (dateStr === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    return availableSlots.filter((slot) => timeToMinutes(slot) >= currentMinutes + 15)
  }

  return availableSlots
}

/**
 * Valida se um horário específico está estritamente livre para agendamento
 */
export function isSlotAvailable(params) {
  const { desiredTime, ...rest } = params
  const slots = calculateAvailableSlots(rest)
  return slots.includes(desiredTime)
}
