const SHOP_TZ = 'America/Fortaleza'

function isBlank(value: unknown) {
  if (value == null) return true
  const raw = String(value).trim()
  if (!raw) return true
  const lower = raw.toLowerCase()
  return lower === 'null' || lower === 'undefined'
}

function shopParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHOP_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return {
    date: `${get('day')}/${get('month')}/${get('year')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

export type BlockLike = {
  inicio?: string | null
  fim?: string | null
  data_fim?: string | null
  hora_fim?: string | null
  data_inicio?: string | null
  hora_inicio?: string | null
}

export function resolveBlockStartIso(block: BlockLike): string | null {
  if (!isBlank(block.inicio)) {
    const parsed = new Date(String(block.inicio))
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  const data = String(block.data_inicio || '').trim()
  if (!data) return null
  const time = String(block.hora_inicio || '00:00').trim().slice(0, 5) || '00:00'
  const iso = `${data}T${time.length === 5 ? `${time}:00` : time}-03:00`
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/** End exists only when fim / data_fim+hora_fim are actually set and parseable. */
export function resolveBlockEndIso(block: BlockLike): string | null {
  if (!isBlank(block.fim)) {
    const parsed = new Date(String(block.fim))
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  const data = String(block.data_fim || '').trim()
  const hora = String(block.hora_fim || '').trim()
  if (!data) return null
  const time = (hora || '00:00').slice(0, 5)
  const iso = `${data}T${time.length === 5 ? `${time}:00` : time}-03:00`
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function isOpenEndedBlock(block: BlockLike | string | null | undefined): boolean {
  if (block == null) return true
  if (typeof block === 'string') return resolveBlockEndIso({ fim: block }) == null
  return resolveBlockEndIso(block) == null
}

export function formatHm(raw: string | null | undefined, fallback = '') {
  const sliced = String(raw || '').trim().slice(0, 5)
  return /^\d{2}:\d{2}$/.test(sliced) ? sliced : fallback
}

export function formatBlockRange(inicio: string | null | undefined, fim: string | null | undefined) {
  return formatBlockRangeFrom({ inicio, fim })
}

export function formatBlockRangeFrom(block: BlockLike) {
  const startIso = resolveBlockStartIso(block)
  if (!startIso) return 'Período inválido'
  const start = shopParts(new Date(startIso))
  const endIso = resolveBlockEndIso(block)
  if (!endIso) {
    return `${start.date}, ${start.time} → sem previsão de retorno`
  }
  const end = shopParts(new Date(endIso))
  if (start.date === end.date) {
    return `${start.date}, ${start.time} → ${end.time} (Retorno às ${end.time})`
  }
  return `${start.date}, ${start.time} → ${end.date}, ${end.time} (Retorno às ${end.time})`
}

export function formatRecurringBreak(inicio: string | null | undefined, fim: string | null | undefined) {
  const start = formatHm(inicio)
  const end = formatHm(fim)
  if (!start || !end) return null
  return {
    badge: `Intervalo Recorrente: ${start} às ${end}`,
    detail: `${start} → ${end} (Retorno às ${end})`,
  }
}

export function blockStatus(inicio: string | null | undefined, fim: string | null | undefined) {
  return blockStatusFrom({ inicio, fim })
}

export function blockStatusFrom(block: BlockLike) {
  const now = Date.now()
  const startIso = resolveBlockStartIso(block)
  const startMs = startIso ? new Date(startIso).getTime() : Number.NaN
  const endIso = resolveBlockEndIso(block)
  if (!endIso) {
    return now >= startMs
      ? { label: 'Afastamento ativo', color: 'red' as const }
      : { label: 'Afastamento programado', color: 'gold' as const }
  }
  const endMs = new Date(endIso).getTime()
  if (!Number.isNaN(startMs) && now >= startMs && now < endMs) {
    return { label: 'Ativo agora', color: 'orange' as const }
  }
  if (!Number.isNaN(startMs) && now < startMs) {
    return { label: 'Programado', color: 'gold' as const }
  }
  return { label: 'Encerrado', color: 'gray' as const }
}

export function blockMatchesDailyBreak(
  block: BlockLike,
  dailyStart: string,
  dailyEnd: string,
) {
  const startIso = resolveBlockStartIso(block)
  const endIso = resolveBlockEndIso(block)
  if (!startIso || !endIso) return false
  const start = shopParts(new Date(startIso))
  const end = shopParts(new Date(endIso))
  return start.date === end.date && start.time === dailyStart && end.time === dailyEnd
}
