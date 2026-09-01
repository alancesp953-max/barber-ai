import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  humanizeOutbound,
  isPlausiblePersonName,
  looksLikeBookingUtterance,
  looksLikeRobotMenu,
  punctualityConfirmText,
} from './db.ts'

Deno.test('isPlausiblePersonName aceita nomes reais', () => {
  assertEquals(isPlausiblePersonName('Ana'), true)
  assertEquals(isPlausiblePersonName('João Silva'), true)
  assertEquals(isPlausiblePersonName('Me chamo Pedro'), true)
})

Deno.test('isPlausiblePersonName recusa intenção e ruído', () => {
  assertEquals(isPlausiblePersonName('agendamento'), false)
  assertEquals(isPlausiblePersonName('corte'), false)
  assertEquals(isPlausiblePersonName('Pode ser'), false)
  assertEquals(isPlausiblePersonName('Obg'), false)
  assertEquals(isPlausiblePersonName('Domingo'), false)
  assertEquals(isPlausiblePersonName('oi'), false)
  assertEquals(isPlausiblePersonName('09h30'), false)
  assertEquals(isPlausiblePersonName('sim'), false)
})

Deno.test('looksLikeBookingUtterance', () => {
  assertEquals(looksLikeBookingUtterance('sábado 09h30'), true)
  assertEquals(looksLikeBookingUtterance('Domingo'), true)
  assertEquals(looksLikeBookingUtterance('quero corte'), true)
  assertEquals(looksLikeBookingUtterance('Marcos às 09h30'), true)
  assertEquals(looksLikeBookingUtterance('Ana Paula'), false)
})

Deno.test('humanizeOutbound não come confirmação nem tabela', () => {
  const tabela = 'Opções de serviço:\nCorte de cabelo: R$ 40,00'
  assertEquals(humanizeOutbound(tabela).startsWith('Opções de serviço'), true)

  const pont = punctualityConfirmText()
  assertEquals(humanizeOutbound(pont), pont)

  const confirm = [
    'Posso fechar assim?',
    '',
    'Serviço: Corte de cabelo',
    'Barbeiro: Marcos Correia',
    'Data: 22/08/2026',
    'Horário: 09:30',
    '',
    'Se tiver certo, me confirma com um sim.',
  ].join('\n')
  const out = humanizeOutbound(confirm)
  assertEquals(out.includes('Me conta o que você precisa'), false)
  assertEquals(out.includes('Marcos Correia'), true)

  const slots = 'Em *22/08* ainda rola:\n09:30, 10:00\n\nQual horário fica melhor pra você?'
  assertEquals(humanizeOutbound(slots).includes('ainda rola'), true)
})

Deno.test('looksLikeRobotMenu só pega menu de capacidades', () => {
  const menu = [
    'Sou a assistente virtual.',
    'O que deseja fazer:',
    '1. Agendar',
    '2. Cancelar',
    '3. Serviços',
  ].join('\n')
  assertEquals(looksLikeRobotMenu(menu), true)

  const booking = [
    'Posso agendar assim?',
    'Serviço: Corte',
    'Barbeiro: Marcos',
    'Data: sábado',
    'Horário: 09:30',
  ].join('\n')
  assertEquals(looksLikeRobotMenu(booking), false)
})
