export const SHOP_TZ = 'America/Fortaleza'
export const SHOP_OPEN = '08:30'
export const SHOP_CLOSE = '19:30'

export function todayYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type)?.value || '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function shiftYmd(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

export function weekdayFromYmd(ymd) {
  return new Date(`${ymd}T12:00:00-03:00`).getDay()
}

export function isSunday(ymd) {
  return weekdayFromYmd(ymd) === 0
}

export function hmToMin(hm) {
  const [h, m] = String(hm || '').slice(0, 5).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function minToHm(min) {
  const safe = ((min % 1440) + 1440) % 1440
  const h = Math.floor(safe / 60)
  const mm = safe % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function rangesOverlap(a0, a1, b0, b1) {
  return a0 < b1 && a1 > b0
}

export function isPastSlotToday(ymd, hm, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type) => parts.find((part) => part.type === type)?.value || '00'
  const today = `${get('year')}-${get('month')}-${get('day')}`
  if (ymd < today) return true
  if (ymd > today) return false
  const hour = get('hour') === '24' ? '00' : get('hour')
  return hm <= `${hour}:${get('minute')}`
}

export function generateDaySlots(openHm = SHOP_OPEN, closeHm = SHOP_CLOSE, blockMin = 25, step = 15) {
  const out = []
  const open = hmToMin(openHm)
  const close = hmToMin(closeHm)
  for (let t = open; t + blockMin <= close; t += step) out.push(minToHm(t))
  return out
}
