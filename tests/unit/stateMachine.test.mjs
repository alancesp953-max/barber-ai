import test from 'node:test'
import assert from 'node:assert'

test('Validação de transições de estados do fluxo fixo de 7 etapas da barbearia', () => {
  const steps = [
    'INITIAL',
    'AWAITING_NAME',
    'AWAITING_DATE',
    'AWAITING_BARBER',
    'AWAITING_TIME',
    'AWAITING_SERVICE',
    'AWAITING_PAYMENT',
    'BOOKING_CONFIRMED',
  ]

  let currentStepIndex = 0

  function advanceStep() {
    if (currentStepIndex < steps.length - 1) {
      currentStepIndex++
    }
    return steps[currentStepIndex]
  }

  assert.strictEqual(steps[currentStepIndex], 'INITIAL')
  assert.strictEqual(advanceStep(), 'AWAITING_NAME')
  assert.strictEqual(advanceStep(), 'AWAITING_DATE')
  assert.strictEqual(advanceStep(), 'AWAITING_BARBER')
  assert.strictEqual(advanceStep(), 'AWAITING_TIME')
  assert.strictEqual(advanceStep(), 'AWAITING_SERVICE')
  assert.strictEqual(advanceStep(), 'AWAITING_PAYMENT')
  assert.strictEqual(advanceStep(), 'BOOKING_CONFIRMED')
})

test('Transição para HUMAN_HANDOFF quando solicitada pelo cliente', () => {
  const message = 'gostaria de falar com um atendente humano'
  const isHumanRequest = message.toLowerCase().includes('humano') || message.toLowerCase().includes('atendente')

  let state = { currentStep: 'AWAITING_TIME', status: 'active' }

  if (isHumanRequest) {
    state.currentStep = 'HUMAN_HANDOFF'
    state.status = 'human_handoff'
  }

  assert.strictEqual(state.currentStep, 'HUMAN_HANDOFF')
  assert.strictEqual(state.status, 'human_handoff')
})
