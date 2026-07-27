import i18n from '../i18n'

function getLocale() {
  return i18n.language === 'pt-BR' ? 'pt-BR' : 'en-US'
}

function getCurrency() {
  return i18n.language === 'pt-BR' ? 'BRL' : 'USD'
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat(getLocale(), { style: 'currency', currency: getCurrency() }).format(value)
}

function toDate(data: string, horario: string) {
  return new Date(`${data}T${horario}`)
}

export function formatTime(data: string, horario: string) {
  return toDate(data, horario).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' })
}

export function formatDateTime(data: string, horario: string) {
  return toDate(data, horario).toLocaleString(getLocale())
}
