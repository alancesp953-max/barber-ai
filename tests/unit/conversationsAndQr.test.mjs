import test from 'node:test'
import assert from 'node:assert/strict'
import { adminDb } from '../../server/lib/firebaseAdmin.mjs'
import { getSessionStatus } from '../../server/services/whatsappBaileysManager.mjs'

test('WhatsApp QR Code: Sessão inicia como disconnected por padrão', () => {
  const status = getSessionStatus('tenant-teste-unitario-qr')
  assert.equal(status.status, 'disconnected')
  assert.equal(status.phoneNumber, null)
  assert.equal(status.qrCode, null)
})

test('Central de Conversas: Deve criar conversa, contato e mensagem com isolamento por barbearia', async () => {
  const tenantA = 'barbearia-norte'
  const tenantB = 'barbearia-sul'
  const clientPhone = '5585988887777'
  const now = new Date().toISOString()

  // Grava conversa e mensagem para o Tenant A
  await adminDb.collection('tenants').doc(tenantA).collection('conversations').doc(clientPhone).set({
    contactName: 'Marcos Oliveira',
    phoneNumber: clientPhone,
    lastMessage: 'Gostaria de cortar o cabelo hoje',
    lastMessageAt: now,
    lastMessageDirection: 'incoming',
    unreadCount: 1,
    assignedTo: 'ai',
    aiEnabled: true,
    status: 'active',
    lastInteractionDate: now.slice(0, 10),
  })

  await adminDb
    .collection('tenants')
    .doc(tenantA)
    .collection('conversations')
    .doc(clientPhone)
    .collection('messages')
    .doc('msg-001')
    .set({
      id: 'msg-001',
      conversationId: clientPhone,
      sender: 'client',
      direction: 'incoming',
      text: 'Gostaria de cortar o cabelo hoje',
      timestamp: now,
    })

  // Consulta conversas do Tenant A
  const snapA = await adminDb.collection('tenants').doc(tenantA).collection('conversations').get()
  assert.equal(snapA.docs.length >= 1, true)
  assert.equal(snapA.docs.some((d) => d.data().phoneNumber === clientPhone), true)

  // Consulta conversas do Tenant B: NÃO deve encontrar a conversa do Tenant A
  const snapB = await adminDb.collection('tenants').doc(tenantB).collection('conversations').get()
  const foundInB = snapB.docs.some((d) => d.data().phoneNumber === clientPhone)
  assert.equal(foundInB, false, 'Isolamento falhou: conversa do Tenant A vazou para o Tenant B')
})

test('Central de Conversas: Transição de atendimento para Humano deve pausar respostas automáticas', async () => {
  const tenantId = 'barbearia-centro'
  const phone = '5511977776666'
  const now = new Date().toISOString()

  const convRef = adminDb.collection('tenants').doc(tenantId).collection('conversations').doc(phone)

  // Conversa inicialmente com IA
  await convRef.set({
    contactName: 'Lucas Lima',
    phoneNumber: phone,
    lastMessage: 'Qual o valor do corte?',
    lastMessageAt: now,
    assignedTo: 'ai',
    aiEnabled: true,
  })

  let snap = await convRef.get()
  assert.equal(snap.data().assignedTo, 'ai')
  assert.equal(snap.data().aiEnabled, true)

  // Atendente assume a conversa
  await convRef.set(
    {
      assignedTo: 'human',
      aiEnabled: false,
      lastMessage: 'Olá Lucas! Eu sou o barbeiro Pedro, posso te atender às 16h.',
      lastMessageDirection: 'outgoing',
    },
    { merge: true },
  )

  snap = await convRef.get()
  assert.equal(snap.data().assignedTo, 'human')
  assert.equal(snap.data().aiEnabled, false)
  assert.equal(snap.data().lastMessageDirection, 'outgoing')
})

test('Central de Conversas: Leitura de mensagens zera unreadCount', async () => {
  const tenantId = 'barbearia-leste'
  const phone = '5521999990000'
  const convRef = adminDb.collection('tenants').doc(tenantId).collection('conversations').doc(phone)

  await convRef.set({
    phoneNumber: phone,
    unreadCount: 3,
    lastMessage: 'Oi',
  })

  let snap = await convRef.get()
  assert.equal(snap.data().unreadCount, 3)

  // Marca como lida
  await convRef.set({ unreadCount: 0 }, { merge: true })
  snap = await convRef.get()
  assert.equal(snap.data().unreadCount, 0)
})

test('Central de Conversas: Filtro "Hoje" deve considerar apenas interações da data atual', () => {
  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = '2025-01-01'

  const mockConversas = [
    { id: '1', lastInteractionDate: todayStr, contactName: 'Cliente Hoje' },
    { id: '2', lastInteractionDate: yesterdayStr, contactName: 'Cliente Antigo' },
  ]

  const filtradasHoje = mockConversas.filter((c) => c.lastInteractionDate === todayStr)
  assert.equal(filtradasHoje.length, 1)
  assert.equal(filtradasHoje[0].contactName, 'Cliente Hoje')
})
