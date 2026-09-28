import { processConversationMessage } from '../services/stateMachine.mjs'
import { adminDb } from '../lib/firebaseAdmin.mjs'

async function runRigorousDiagnostic() {
  const tenantId = 'I13A9nw5T4IsaojMPLl6'
  const phone = '5511988887777'

  console.log('=== TESTE 1: Saudação inicial ===')
  let res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'Olá' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 2: Tentativa de nome que é saudação (ex: "Oi") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'Oi' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 3: Nome válido (ex: "Heric") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'Heric' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 4: Tentativa de data no passado (ex: "ontem") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'ontem' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 5: Tentativa de data passada explícita (ex: "20/09/2026") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: '20/09/2026' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 6: Data válida futura (ex: "amanhã") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'amanhã' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 7: Tentativa de barbeiro inexistente (ex: "Carlos") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'Carlos' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 8: Barbeiro válido do banco (ex: "Felipe") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'Felipe' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 9: Horário inválido (ex: "03:00 da madrugada") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: '03:00' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 10: Horário válido dos disponíveis (ex: "10:00") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: '10:00' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 11: Serviço que NÃO existe no banco (ex: "Luzes no cabelo") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'Luzes no cabelo' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 12: Serviço real do banco (ex: "Corte Tradicional") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'Corte Tradicional' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 13: Forma de pagamento inválida (ex: "no fiado") ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'vou pagar no fiado' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 14: Fechamento de carrinho com Pix ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'Pix' })
  console.log('Bot:', res.replyText)

  console.log('\n=== TESTE 15: Cancelamento universal em nova conversa ===')
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'Olá' })
  res = await processConversationMessage({ tenantId, clientPhone: phone, messageText: 'Cancelar atendimento' })
  console.log('Bot:', res.replyText)

  // Verifica agendamento no Firestore
  const snap = await adminDb.collection('tenants').doc(tenantId).collection('appointments').where('clientPhone', '==', phone).get()
  console.log('\n=== VERIFICAÇÃO NO BANCO DE DADOS ===')
  console.log('Agendamentos persistidos para o telefone de teste:', snap.size)
  if (snap.size > 0) {
    const appt = snap.docs[0].data()
    console.log('Dados do agendamento gravado:')
    console.log('- Cliente:', appt.clientName)
    console.log('- Profissional:', appt.barberName)
    console.log('- Serviço:', appt.serviceName, 'R$', appt.price)
    console.log('- Data/Hora:', appt.date, appt.time)
    console.log('- Pagamento:', appt.paymentMethod)
    console.log('- Status:', appt.status)
  }
}

runRigorousDiagnostic()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
