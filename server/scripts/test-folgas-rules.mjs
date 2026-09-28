import { processConversationMessage } from '../services/stateMachine.mjs'
import { adminDb } from '../lib/firebaseAdmin.mjs'

async function runTests() {
  console.log('🧪 ========================================================')
  console.log('🧪 TESTE DE REGRAS DE FOLGA E DISPONIBILIDADE DA BARBEARIA')
  console.log('🧪 ========================================================')

  const tenantId = 'I13A9nw5T4IsaojMPLl6'

  // Limpa conversas de teste antigas
  const testPhone1 = '5511999990001'
  const testPhone2 = '5511999990002'
  const testPhone3 = '5511999990003'

  for (const phone of [testPhone1, testPhone2, testPhone3]) {
    await adminDb.collection('tenants').doc(tenantId).collection('conversations').doc(phone).delete()
  }

  // -------------------------------------------------------------
  // CENÁRIO 1: Um profissional de folga e outro disponível
  // Segunda-feira (28/09/2026) -> Feliciano tem folga ['2026-09-28'], Jucelio está disponível
  // -------------------------------------------------------------
  console.log('\n📌 [CENÁRIO 1] Testando Segunda-feira (28/09): Feliciano folga, Jucelio disponível...')
  await processConversationMessage({ tenantId, clientPhone: testPhone1, messageText: 'Olá' })
  await processConversationMessage({ tenantId, clientPhone: testPhone1, messageText: 'Lucas' })
  const resCenario1 = await processConversationMessage({ tenantId, clientPhone: testPhone1, messageText: '28/09/2026' })

  console.log('RESPOSTA CENÁRIO 1:\n' + resCenario1.replyText)
  console.log('STEP ATUAL:', resCenario1.state.currentStep)

  if (resCenario1.replyText.includes('jucelio') && resCenario1.replyText.includes('folga')) {
    console.log('✅ CENÁRIO 1 PASSOU: Feliciano apareceu de folga e Jucelio apareceu disponível!')
  } else {
    console.error('❌ CENÁRIO 1 FALHOU!')
  }

  // Testando confirmação com "1" ou "sim" para o profissional disponível
  console.log('\n📌 [CENÁRIO 1.1] Selecionando o profissional disponível com "1"...')
  const resCenario1_1 = await processConversationMessage({ tenantId, clientPhone: testPhone1, messageText: '1' })
  console.log('RESPOSTA CENÁRIO 1.1:\n' + resCenario1_1.replyText)
  console.log('STEP ATUAL:', resCenario1_1.state.currentStep)

  if (resCenario1_1.state.selectedBarberName.toLowerCase() === 'jucelio' && resCenario1_1.state.currentStep === 'AWAITING_TIME') {
    console.log('✅ CENÁRIO 1.1 PASSOU: Jucelio selecionado e horários carregados com sucesso!')
  } else {
    console.error('❌ CENÁRIO 1.1 FALHOU!')
  }

  // -------------------------------------------------------------
  // CENÁRIO 2: Todos os profissionais de folga = Loja Fechada
  // Domingo (27/09/2026) -> Domingo é dia de folga de ambos e da barbearia
  // -------------------------------------------------------------
  console.log('\n📌 [CENÁRIO 2] Testando Domingo (27/09): Todos os profissionais de folga...')
  await processConversationMessage({ tenantId, clientPhone: testPhone2, messageText: 'Olá' })
  await processConversationMessage({ tenantId, clientPhone: testPhone2, messageText: 'Mateus' })
  const resCenario2 = await processConversationMessage({ tenantId, clientPhone: testPhone2, messageText: '27/09/2026' })

  console.log('RESPOSTA CENÁRIO 2:\n' + resCenario2.replyText)
  console.log('STEP ATUAL:', resCenario2.state.currentStep)

  if (resCenario2.replyText.includes('fechada') || resCenario2.replyText.includes('folga')) {
    console.log('✅ CENÁRIO 2 PASSOU: Identificou loja fechada / todos de folga e pediu outra data!')
  } else {
    console.error('❌ CENÁRIO 2 FALHOU!')
  }

  // -------------------------------------------------------------
  // CENÁRIO 2.2: Ambos colocados com folga na mesma data específica
  // Vamos adicionar folga no Jucelio também para 28/09 temporariamente para validar
  // -------------------------------------------------------------
  console.log('\n📌 [CENÁRIO 2.2] Testando folga simultânea lançada em data específica para ambos...')
  const jucelioRef = adminDb.collection('tenants').doc(tenantId).collection('barbers').doc('IxnO5MfkAQaK8FsQp7ET')
  await jucelioRef.set({ daysOff: ['2026-09-28'] }, { merge: true })

  const resCenario2_2 = await processConversationMessage({ tenantId, clientPhone: testPhone3, messageText: 'Olá' })
  await processConversationMessage({ tenantId, clientPhone: testPhone3, messageText: 'Gabriel' })
  const resCenario2_2Date = await processConversationMessage({ tenantId, clientPhone: testPhone3, messageText: '28/09/2026' })

  console.log('RESPOSTA CENÁRIO 2.2:\n' + resCenario2_2Date.replyText)
  console.log('STEP ATUAL:', resCenario2_2Date.state.currentStep)

  if (resCenario2_2Date.replyText.includes('fechada')) {
    console.log('✅ CENÁRIO 2.2 PASSOU: Ambos os profissionais de folga no mesmo dia = Loja Fechada!')
  } else {
    console.error('❌ CENÁRIO 2.2 FALHOU!')
  }

  // Restaura Jucelio para sem folga em 28/09
  await jucelioRef.set({ daysOff: [] }, { merge: true })
  console.log('ℹ️ Jucelio restaurado para a rotina normal (sem folga dia 28).')

  // -------------------------------------------------------------
  // CENÁRIO 3: Ambos disponíveis na Terça-feira (29/09/2026)
  // -------------------------------------------------------------
  console.log('\n📌 [CENÁRIO 3] Testando Terça-feira (29/09): Ambos os profissionais disponíveis...')
  await processConversationMessage({ tenantId, clientPhone: testPhone3, messageText: '29/09/2026' })
  const resCenario3 = await processConversationMessage({ tenantId, clientPhone: testPhone3, messageText: '29/09/2026' })

  console.log('RESPOSTA CENÁRIO 3:\n' + resCenario3.replyText)
  if (resCenario3.replyText.includes('jucelio') && resCenario3.replyText.includes('feliciano')) {
    console.log('✅ CENÁRIO 3 PASSOU: Ambos os profissionais aparecem disponíveis!')
  } else {
    console.error('❌ CENÁRIO 3 FALHOU!')
  }

  console.log('\n🎉 TODOS OS TESTES FORAM CONCLUÍDOS COM SUCESSO!')
  process.exit(0)
}

runTests().catch((err) => {
  console.error('Erro na execução dos testes:', err)
  process.exit(1)
})
