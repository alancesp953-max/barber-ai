import { processConversationMessage } from '../services/stateMachine.mjs'

async function testRealFlow() {
  const tenantId = 'I13A9nw5T4IsaojMPLl6'
  const clientPhone = '5511999990001'

  console.log('\n--- PASSO 1: Início ---')
  let res = await processConversationMessage({ tenantId, clientPhone, messageText: 'Olá' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n--- PASSO 2: Nome ---')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: 'Carlos' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n--- PASSO 3: Data ---')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: 'amanhã' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n--- PASSO 4 (Teste de barbeiro que NÃO existe no banco): "João" ---')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: 'João' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n--- PASSO 5 (Barbeiro REAL do banco): "feliciano" ---')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: 'feliciano' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n--- PASSO 6: Horário ---')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: '09:00' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n--- PASSO 7: Serviço ---')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: 'Corte Tradicional' })
  console.log('🤖 BOT:\n' + res.replyText)

  console.log('\n--- PASSO 8: Pagamento ---')
  res = await processConversationMessage({ tenantId, clientPhone, messageText: 'pix' })
  console.log('🤖 BOT:\n' + res.replyText)
}

testRealFlow().catch(console.error)
