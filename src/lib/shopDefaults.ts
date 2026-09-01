/** Defaults oficiais da unidade (admin + bot). */
export const SHOP_DEFAULTS: Record<string, string> = {
  endereco: 'Rua Castro Monte 165, Bairro Varjota, Fortaleza',
  horario_segunda: '08:30 - 19:30',
  horario_terca: '08:30 - 19:30',
  horario_quarta: '08:30 - 19:30',
  horario_quinta: '08:30 - 19:30',
  horario_sexta: '08:30 - 19:30',
  horario_sabado: '08:30 - 19:30',
  horario_domingo: 'Fechado',
}

const HOUR_KEYS = [
  'horario_segunda',
  'horario_terca',
  'horario_quarta',
  'horario_quinta',
  'horario_sexta',
  'horario_sabado',
  'horario_domingo',
] as const

function padHm(h: string, m: string): string {
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

/** Aceita 8.30, 8h30, 08:30, etc. → HH:MM (ou null). */
export function parseHmToken(raw: string): string | null {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(',', '.')
    .replace(/h/g, ':')
    .replace(/\./g, ':')
  const m = t.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh > 23 || mm > 59) return null
  return padHm(String(hh), String(mm))
}

export function isClosedHours(raw: string | null | undefined): boolean {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
  return !t || t === '-' || t === 'fechado' || t === 'closed'
}

/**
 * Normaliza "8.30 - 19.30", "08h30 às 19h30", "08:30–19:30" → "08:30 - 19:30"
 * ou "Fechado".
 */
export function normalizeShopHours(raw: string | null | undefined): string {
  const original = String(raw || '').trim()
  if (isClosedHours(original)) return 'Fechado'

  let s = original
    .replace(/[–—]/g, '-')
    .replace(/\s+às\s+/gi, '-')
    .replace(/\s+as\s+/gi, '-')
    .replace(/\s+ate\s+/gi, '-')
    .replace(/\s+até\s+/gi, '-')

  const parts = s.split('-').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) {
    // Só um horário? mantém texto original se não dá pra parsear
    const one = parseHmToken(original)
    return one || original
  }

  const open = parseHmToken(parts[0])
  const close = parseHmToken(parts[1])
  if (!open || !close) return original
  return `${open} - ${close}`
}

/** "08:30 - 19:30" → "08h30 às 19h30" */
export function shopHoursToPt(raw: string | null | undefined): string {
  const n = normalizeShopHours(raw)
  if (isClosedHours(n)) return 'fechado'
  const [a, b] = n.split(' - ')
  if (!a || !b) return n
  return `${a.replace(':', 'h')} às ${b.replace(':', 'h')}`
}

export function withShopDefaults(config: Record<string, any> | null | undefined): Record<string, any> {
  const base: Record<string, any> = { ...SHOP_DEFAULTS, ...(config || {}) }
  for (const [key, value] of Object.entries(SHOP_DEFAULTS)) {
    if (base[key] == null || String(base[key]).trim() === '') {
      base[key] = value
    }
  }
  for (const key of HOUR_KEYS) {
    if (base[key] != null) base[key] = normalizeShopHours(String(base[key]))
  }
  return base
}
