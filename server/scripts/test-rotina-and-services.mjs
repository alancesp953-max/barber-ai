import { processConversationMessage } from '../services/stateMachine.mjs'
import { adminDb } from '../lib/firebaseAdmin.mjs'

async function runTest() {
  const tenantId = 'I13A9nw5T4IsaojMPLl6'
  const clientPhone = '5511999990099'

  console.log('=== TESTE 1: Início da Conversa ===')
  let res = await processConversationMessage({ tenantId, clientPhone, messageText: 'Olá' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n=== TESTE 2: Nome do Cliente ===')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: 'Roberto' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n=== TESTE 3: Data Válida ("amanhã") ===')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: 'amanhã' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n=== TESTE 4: Escolha de Barbeiro Real ("feliciano") ===')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: 'feliciano' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n=== TESTE 5: Escolha de Horário ("10:00") ===')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: '10:00' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n=== TESTE 6: Escolha de MÚLTIPLOS SERVIÇOS: "corte e barba" (ou "1 e 2") ===')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: '1 e 2' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n=== TESTE 7: Pagamento com Pix e Fechamento ===')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: 'pix' })
  console.log('🤖 BOT:\n' + res.replyText)

  // Agora vamos testar a FOLGA:
  console.log('\n======================================================')
  console.log('=== TESTE 8: Barbeiro com FOLGA lançada no dia ===')
  console.log('======================================================')

  // Marcamos dia 2026-09-30 como folga do feliciano
  const barberRef = adminDb.collection('tenants').doc(tenantId).collection('barbers').doc('Ks5ZcF7XWx0jOQJWR3Xu')
  const bSnap = await barberRef.get()
  const bData = bSnap.data()
  await barberRef.set({ ...bData, daysOff: ['2026-09-30'] }, { merge: true })

  // Novo cliente tenta agendar para o dia da folga (dia 30)
  const clientPhone2 = '5511999990088'
  await processConversationMessage({ tenantId, clientPhone: clientPhone2, messageText: 'Olá' })
  await processConversationMessage({ tenantId, clientPhone: clientPhone2, messageText: 'Marcos' })
  console.log('\nCliente solicita dia 30 (onde o barbeiro está de folga):')
  const folgaRes = await processConversationMessage({ tenantId, clientPhone: clientPhone2, messageText: 'dia 30' })
  console.log('🤖 BOT:\n' + folgaRes.replyText)
}

runTest().catch(console.error)
