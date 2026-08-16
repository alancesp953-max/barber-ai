/** Limites do mês-calendário em America/Sao_Paulo (YYYY-MM-DD). */
export function monthBoundsBRT(ref: Date = new Date()): { dataInicio: string; dataFim: string; label: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ref)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '01'
  const y = get('year')
  const m = get('month')
  const d = get('day')
  const dataInicio = `${y}-${m}-01`
  const dataFim = `${y}-${m}-${d}`
  const labelDate = new Date(`${dataInicio}T12:00:00`)
  const mesNome = labelDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return { dataInicio, dataFim, label: mesNome }
}

/** ms até a próxima meia-noite em America/Sao_Paulo (aprox.). */
export function msUntilNextMidnightBRT(): number {
  // Formata "agora" em SP e calcula diferença até 00:00 do dia seguinte
  const spNow = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }),
  )
  const next = new Date(spNow)
  next.setHours(24, 0, 0, 0)
  return Math.max(1000, next.getTime() - spNow.getTime())
}
