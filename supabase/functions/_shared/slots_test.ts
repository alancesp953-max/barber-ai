import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  extractBookingTime,
  extractBookingEntities,
  extractTimeIntent,
  filterPastSlots,
  formatDateSpoken,
  isPastYmd,
  nearbySlots,
  nextWeekdayYmd,
  resolveShopDate,
  shopClockPhase,
  tomorrowYmd,
  weekdayLongPt,
  bookingEntitiesPrompt,
} from './slots.ts'
import { isRatingInviteExpired } from './db.ts'

Deno.test('shopClockPhase — madrugada, expediente e noite', () => {
  assertEquals(shopClockPhase('00:00'), 'before_open')
  assertEquals(shopClockPhase('08:29'), 'before_open')
  assertEquals(shopClockPhase('08:30'), 'open')
  assertEquals(shopClockPhase('19:30'), 'open')
  assertEquals(shopClockPhase('19:31'), 'after_close')
  assertEquals(shopClockPhase('23:59'), 'after_close')
})

Deno.test('filterPastSlots na madrugada mantém a grade de hoje a partir das 08:30', () => {
  const slots = filterPastSlots('2026-09-01', ['07:00', '08:30', '10:00', '19:30', '20:00'], {
    dateStr: '2026-09-01',
    timeStr: '02:15',
    hour: 2,
    minute: 15,
  })
  assertEquals(slots, ['08:30', '10:00', '19:30'])
})

Deno.test('filterPastSlots no expediente remove horários já passados', () => {
  const slots = filterPastSlots('2026-09-01', ['08:30', '10:00', '14:00'], {
    dateStr: '2026-09-01',
    timeStr: '10:00',
    hour: 10,
    minute: 0,
  })
  assertEquals(slots, ['14:00'])
})

Deno.test('filterPastSlots à noite esvazia os horários de hoje', () => {
  const slots = filterPastSlots('2026-09-01', ['08:30', '19:30'], {
    dateStr: '2026-09-01',
    timeStr: '20:00',
    hour: 20,
    minute: 0,
  })
  assertEquals(slots, [])
})

Deno.test('filterPastSlots bloqueia data anterior a hoje', () => {
  const slots = filterPastSlots('2026-08-31', ['08:30', '10:00'], {
    dateStr: '2026-09-01',
    timeStr: '10:00',
    hour: 10,
    minute: 0,
  })
  assertEquals(slots, [])
})

Deno.test('isPastYmd', () => {
  assertEquals(isPastYmd('2026-08-31', '2026-09-01'), true)
  assertEquals(isPastYmd('2026-09-01', '2026-09-01'), false)
  assertEquals(isPastYmd('2026-09-02', '2026-09-01'), false)
})

Deno.test('weekdayLongPt Fortaleza/calendário', () => {
  assertEquals(weekdayLongPt('2026-09-01'), 'terça-feira')
  assertEquals(weekdayLongPt('2026-09-06'), 'domingo')
})

Deno.test('isRatingInviteExpired — 30 minutos', () => {
  const now = Date.parse('2026-09-01T13:00:00.000Z')
  assertEquals(
    isRatingInviteExpired(
      { phone: '1', step: 'rate_ask', context: { rate_asked_at: '2026-09-01T12:40:00.000Z' } },
      now,
    ),
    false,
  )
  assertEquals(
    isRatingInviteExpired(
      { phone: '1', step: 'rate_ask', context: { rate_asked_at: '2026-09-01T12:30:00.000Z' } },
      now,
    ),
    true,
  )
  assertEquals(
    isRatingInviteExpired(
      { phone: '1', step: 'chat', context: { rate_asked_at: '2026-09-01T12:00:00.000Z' } },
      now,
    ),
    false,
  )
})

Deno.test('amanhã é o dia calendário seguinte em Fortaleza (02/09 → 03/09)', () => {
  const hoje = '2026-09-02'
  assertEquals(tomorrowYmd(hoje), '2026-09-03')
  assertEquals(resolveShopDate('amanhã', hoje), '2026-09-03')
  assertEquals(resolveShopDate('amanha', hoje), '2026-09-03')
  assertEquals(resolveShopDate('hoje', hoje), '2026-09-02')
  assertEquals(
    resolveShopDate('marca um horário pra o Jeová amanhã 10 horas cabelo e barba', hoje),
    '2026-09-03',
  )
})

Deno.test('dias da semana resolvem a próxima ocorrência', () => {
  const quarta = '2026-09-02'
  assertEquals(resolveShopDate('quinta', quarta), '2026-09-03')
  assertEquals(resolveShopDate('quinta-feira', quarta), '2026-09-03')
  assertEquals(resolveShopDate('sexta', quarta), '2026-09-04')
  assertEquals(nextWeekdayYmd(quarta, 4, false), '2026-09-03')
  assertEquals(resolveShopDate('quinta', '2026-09-03'), '2026-09-03')
  assertEquals(resolveShopDate('próxima quinta', '2026-09-03'), '2026-09-10')
})

Deno.test('formatDateSpoken nunca usa ISO', () => {
  const hoje = '2026-09-02'
  assertEquals(formatDateSpoken('2026-09-02', hoje), 'hoje, quarta-feira (02/09)')
  assertEquals(formatDateSpoken('2026-09-03', hoje), 'amanhã, quinta-feira (03/09)')
  assertEquals(formatDateSpoken('2026-09-04', hoje), 'sexta-feira (04/09)')
  assertEquals(formatDateSpoken('2026-09-03', hoje).includes('2026-09'), false)
})

Deno.test('extractBookingTime e entidades da frase completa', () => {
  const frase = 'marca um horário pra o Jeová amanhã 10 horas cabelo e barba'
  assertEquals(extractBookingTime(frase), '10:00')
  assertEquals(extractBookingTime('quero às 15h30'), '15:30')
  assertEquals(extractBookingTime('10:00'), '10:00')
  const e = extractBookingEntities(frase, '2026-09-02')
  assertEquals(e.dataYmd, '2026-09-03')
  assertEquals(e.horario, '10:00')
  assertEquals(e.token, 'amanha')
  assertEquals(e.dataFalada, 'amanhã, quinta-feira (03/09)')
})

Deno.test('NLU — horários coloquiais pontuais', () => {
  assertEquals(extractBookingTime('quatro e meia'), '16:30')
  assertEquals(extractBookingTime('onze e meia'), '11:30')
  assertEquals(extractBookingTime('doze e meia'), '12:30')
  assertEquals(extractBookingTime('meio-dia'), '12:00')
  assertEquals(extractBookingTime('meio-dia e meio'), '12:30')
  assertEquals(extractBookingTime('quinze pras quatro'), '15:45')
  assertEquals(extractBookingTime('dez pras dez'), '09:50')
  assertEquals(extractBookingTime('vinte pras duas'), '13:40')
  assertEquals(extractBookingTime('às 3'), '15:00')
  assertEquals(extractBookingTime('às 10'), '10:00')
  assertEquals(extractBookingTime('8 horas'), '08:30')
})

Deno.test('NLU — janelas e pouco / lá pelas / períodos', () => {
  const pouco = extractTimeIntent('cinco e pouco')
  assertEquals(pouco?.kind, 'window')
  assertEquals(pouco?.from, '17:15')
  assertEquals(pouco?.to, '17:45')
  assertEquals(extractBookingTime('cinco e pouco'), null)

  const la = extractTimeIntent('lá pras 3')
  assertEquals(la?.kind, 'approx')
  assertEquals(la?.from, '14:30')
  assertEquals(la?.to, '15:30')

  const fim = extractTimeIntent('saindo do trabalho')
  assertEquals(fim?.from, '17:00')
  assertEquals(fim?.to, '19:00')

  const last = extractTimeIntent('último horário')
  assertEquals(last?.kind, 'last_available')

  const first = extractTimeIntent('primeira vaga livre')
  assertEquals(first?.kind, 'first_available')

  const cedo = extractTimeIntent('logo cedo')
  assertEquals(cedo?.from, '08:30')
})

Deno.test('NLU — gírias de dia', () => {
  const hoje = '2026-09-02'
  assertEquals(resolveShopDate('pra hoje', hoje), '2026-09-02')
  assertEquals(resolveShopDate('ainda hoje', hoje), '2026-09-02')
  assertEquals(resolveShopDate('sextou', hoje), '2026-09-04')
  assertEquals(resolveShopDate('sabadeiras', hoje), '2026-09-05')
  assertEquals(resolveShopDate('segundona', hoje), '2026-09-07')
  const amanhaManha = extractBookingEntities('amanhã cedinho', hoje)
  assertEquals(amanhaManha.dataYmd, '2026-09-03')
  assertEquals(amanhaManha.timeIntent?.from, '08:30')
  assertEquals(amanhaManha.timeIntent?.to, '12:00')
})

Deno.test('bookingEntitiesPrompt ancora amanhã no dia seguinte e pede slot direto', () => {
  const p = bookingEntitiesPrompt(
    'marca um horário pra o Jeová amanhã 10 horas cabelo e barba',
    '2026-09-02',
  )
  assertEquals(p.includes('2026-09-03'), true)
  assertEquals(p.includes('PROIBIDO usar a data de HOJE'), true)
  assertEquals(p.includes('10:00'), true)
  assertEquals(p.includes('NÃO liste a grade'), true)
  assertEquals(p.includes('Jeová'), true)
  assertEquals(p.includes('Combo'), true)
})

Deno.test('bookingEntitiesPrompt traduz janela coloquial em horários exatos', () => {
  const p = bookingEntitiesPrompt('cinco e pouco', '2026-09-02')
  assertEquals(p.includes('17:15'), true)
  assertEquals(p.includes('17:45'), true)
  assertEquals(p.includes('create_appointment IMEDIATAMENTE'), false)
  assertEquals(p.includes('HH:MM'), true)
})

Deno.test('nearbySlots devolve no máximo 3 horários próximos', () => {
  const slots = ['08:30', '09:00', '10:00', '11:00', '14:00', '18:00']
  assertEquals(nearbySlots('10:00', slots, 3), ['10:00', '11:00', '14:00'])
  assertEquals(nearbySlots('18:00', slots, 3).length <= 3, true)
})
