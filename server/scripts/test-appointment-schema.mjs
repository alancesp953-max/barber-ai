import { processConversationMessage } from '../services/stateMachine.mjs'
import { adminDb } from '../lib/firebaseAdmin.mjs'

async function run() {
  const tenantId = 'I13A9nw5T4IsaojMPLl6'
  const testPhone = '5511999990055'

  console.log('--- TESTANDO FLUXO COMPLETO E GRAVAÇÃO COM SCHEMA DO FIREBASE ---')

  // 1. Início
  let r = await processConversationMessage({
    tenantId,
    clientPhone: testPhone,
    messageText: 'cancelar',
  })

  // 2. Saudação
  r = await processConversationMessage({
    tenantId,
    clientPhone: testPhone,
    messageText: 'Olá',
  })
  console.log('\n[Passo 1] Cliente: Olá')
  console.log('Bot:', r.replyText)

  // 3. Nome
  r = await processConversationMessage({
    tenantId,
    clientPhone: testPhone,
    messageText: 'Heric ferro cabral',
  })
  console.log('\n[Passo 2] Cliente: Heric ferro cabral')
  console.log('Bot:', r.replyText)

  // 4. Data
  r = await processConversationMessage({
    tenantId,
    clientPhone: testPhone,
    messageText: 'amanhã',
  })
  console.log('\n[Passo 3] Cliente: amanhã')
  console.log('Bot:', r.replyText)

  // 5. Barbeiro
  r = await processConversationMessage({
    tenantId,
    clientPhone: testPhone,
    messageText: 'feliciano',
  })
  console.log('\n[Passo 4] Cliente: feliciano')
  console.log('Bot:', r.replyText)

  // 6. Horário
  r = await processConversationMessage({
    tenantId,
    clientPhone: testPhone,
    messageText: '09:00',
  })
  console.log('\n[Passo 5] Cliente: 09:00')
  console.log('Bot:', r.replyText)

  // 7. Serviço
  r = await processConversationMessage({
    tenantId,
    clientPhone: testPhone,
    messageText: 'barba',
  })
  console.log('\n[Passo 6] Cliente: barba')
  console.log('Bot:', r.replyText)

  // 8. Pagamento
  r = await processConversationMessage({
    tenantId,
    clientPhone: testPhone,
    messageText: 'pix',
  })
  console.log('\n[Passo 7] Cliente: pix')
  console.log('Bot:', r.replyText)

  // 9. Verifica o documento gravado
  const apptsSnap = await adminDb.collection('tenants').doc(tenantId).collection('appointments').get()
  const myAppt = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() })).find(a => a.clientPhone === testPhone)

  console.log('\n========================================')
  console.log('DOCUMENTO SALVO NO SISTEMA:')
  console.log(JSON.stringify(myAppt, null, 2))
  console.log('========================================')

  const expectedFields = [
    'barbeiro_id',
    'barbeiros',
    'barberId',
    'barberName',
    'clientId',
    'clientName',
    'cliente_id',
    'clientes',
    'created_at',
    'data',
    'date',
    'horario',
    'origin',
    'price',
    'serviceId',
    'serviceName',
    'servico_id',
    'servicos',
    'status',
    'time',
    'valor',
  ]

  let allOk = true
  for (const f of expectedFields) {
    if (myAppt[f] === undefined) {
      console.error(`❌ Campo ausente: ${f}`)
      allOk = false
    } else {
      console.log(`✅ ${f}:`, typeof myAppt[f] === 'object' ? JSON.stringify(myAppt[f]) : myAppt[f])
    }
  }

  if (allOk) {
    console.log('\n🎯 SUCESSO TOTAL! O documento bate 100% com o schema do Firebase fornecido!')
  }
}

run().catch(console.error)
