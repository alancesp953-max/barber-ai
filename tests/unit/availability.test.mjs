import test from 'node:test'
import assert from 'node:assert'
import { calculateAvailableSlots, isSlotAvailable } from '../../server/services/availability.mjs'

test('Deve calcular slots disponíveis respeitando expediente e intervalos', () => {
  const slots = calculateAvailableSlots({
    dateStr: '2026-10-14', // Quarta-feira
    durationMinutes: 30,
    barber: {
      startHour: '09:00',
      endHour: '12:00', // Manhã
      breakStart: '10:00',
      breakEnd: '10:30', // Almoço/pausa de 30m
      workingDays: [1, 2, 3, 4, 5, 6],
    },
    existingAppointments: [
      { time: '11:00', durationMinutes: 30, status: 'confirmado' },
    ],
  })

  // Esperado: 09:00, 09:30, [10:00-10:30 pausa], 10:30, [11:00-11:30 ocupado], 11:30
  assert.ok(slots.includes('09:00'), 'Deve conter 09:00')
  assert.ok(slots.includes('09:30'), 'Deve conter 09:30')
  assert.ok(!slots.includes('10:00'), 'Não deve conter horário da pausa (10:00)')
  assert.ok(slots.includes('10:30'), 'Deve conter 10:30 após a pausa')
  assert.ok(!slots.includes('11:00'), 'Não deve conter 11:00 pois já está agendado')
  assert.ok(slots.includes('11:30'), 'Deve conter 11:30')
})

test('Não deve disponibilizar horários em dias de folga do barbeiro', () => {
  const slots = calculateAvailableSlots({
    dateStr: '2026-10-18', // Domingo
    durationMinutes: 30,
    barber: {
      startHour: '09:00',
      endHour: '19:00',
      workingDays: [1, 2, 3, 4, 5, 6], // Apenas seg a sab
    },
  })

  assert.strictEqual(slots.length, 0, 'No domingo deve retornar zero slots disponíveis')
})

test('Deve impedir agendamento em horário com conflito de duração prolongada', () => {
  // Serviço de 60 minutos agendado às 14:00 ocupa 14:00 até 15:00
  const available = isSlotAvailable({
    desiredTime: '14:30',
    dateStr: '2026-10-14',
    durationMinutes: 30,
    barber: {
      startHour: '09:00',
      endHour: '19:00',
      workingDays: [1, 2, 3, 4, 5],
    },
    existingAppointments: [
      { time: '14:00', durationMinutes: 60, status: 'confirmado' },
    ],
  })

  assert.strictEqual(available, false, 'Horário 14:30 não deve estar disponível pois o serviço anterior vai até 15:00')
})
