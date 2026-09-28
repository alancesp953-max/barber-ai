import express from 'express'
import { adminDb } from '../lib/firebaseAdmin.mjs'
import { sendAttendantMessage, getActiveTenantId } from '../services/whatsappBaileysManager.mjs'

const router = express.Router()

function resolveTenantId(req) {
  const reqTenant =
    req.headers['x-tenant-id'] ||
    req.query.tenantId ||
    req.body?.tenantId

  if (reqTenant && reqTenant !== 'barbearia-principal') {
    return reqTenant
  }
  return getActiveTenantId() || reqTenant || 'barbearia-principal'
}

/**
 * GET /api/conversations
 * Lista conversas reais com filtros (todas, hoje, não lidas, atendimento humano, finalizadas)
 */
router.get('/', async (req, res) => {
  const tenantId = resolveTenantId(req)
  const { filter = 'all', search = '' } = req.query

  try {
    const convsRef = adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('conversations')

    const snap = await convsRef.get()
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))

    // Ordenação: mais recentes primeiro
    list.sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime())

    // Fuso horário local para "Hoje"
    const todayStr = new Date().toISOString().slice(0, 10)

    // Filtros aplicados
    if (filter === 'today') {
      list = list.filter((c) => c.lastInteractionDate === todayStr || (c.lastMessageAt && c.lastMessageAt.startsWith(todayStr)))
    } else if (filter === 'unread') {
      list = list.filter((c) => (c.unreadCount || 0) > 0)
    } else if (filter === 'human') {
      list = list.filter((c) => c.assignedTo === 'human')
    } else if (filter === 'completed') {
      list = list.filter((c) => c.status === 'completed')
    }

    // Busca textual por nome ou telefone
    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (c) =>
          (c.contactName && c.contactName.toLowerCase().includes(q)) ||
          (c.phoneNumber && c.phoneNumber.includes(q)) ||
          (c.lastMessage && c.lastMessage.toLowerCase().includes(q)),
      )
    }

    return res.json({
      success: true,
      tenantId,
      total: list.length,
      conversations: list,
    })
  } catch (err) {
    console.error(`[GET /api/conversations] Erro para ${tenantId}:`, err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/conversations/:conversationId
 * Retorna dados detalhados de uma conversa específica e contexto do cliente
 */
router.get('/:conversationId', async (req, res) => {
  const tenantId = resolveTenantId(req)
  const { conversationId } = req.params

  try {
    const convDoc = await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('conversations')
      .doc(conversationId)
      .get()

    if (!convDoc.exists) {
      return res.status(404).json({ error: 'Conversa não encontrada' })
    }

    const conversation = { id: convDoc.id, ...convDoc.data() }

    // Busca agendamentos do cliente pelo telefone para enriquecer a coluna 3
    const apptsSnap = await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('appointments')
      .where('clientPhone', '==', conversationId)
      .get()

    const appointments = apptsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    appointments.sort((a, b) => new Date(`${b.date || b.data}T${b.time || b.horario || '00:00'}`).getTime() - new Date(`${a.date || a.data}T${a.time || a.horario || '00:00'}`).getTime())

    return res.json({
      success: true,
      conversation,
      appointments,
    })
  } catch (err) {
    console.error(`[GET /api/conversations/:id] Erro:`, err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/conversations/:conversationId/messages
 * Retorna o histórico de mensagens da conversa em ordem cronológica
 */
router.get('/:conversationId/messages', async (req, res) => {
  const tenantId = resolveTenantId(req)
  const { conversationId } = req.params

  try {
    const msgsSnap = await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('conversations')
      .doc(conversationId)
      .collection('messages')
      .get()

    const messages = msgsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    messages.sort((a, b) => new Date(a.timestamp || a.createdAt || 0).getTime() - new Date(b.timestamp || b.createdAt || 0).getTime())

    return res.json({
      success: true,
      total: messages.length,
      messages,
    })
  } catch (err) {
    console.error(`[GET /api/conversations/:id/messages] Erro:`, err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/conversations/:conversationId/messages
 * Envia mensagem real pelo WhatsApp via atendente humano
 */
router.post('/:conversationId/messages', async (req, res) => {
  const tenantId = resolveTenantId(req)
  const { conversationId } = req.params
  const { text } = req.body

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Texto da mensagem é obrigatório' })
  }

  try {
    const result = await sendAttendantMessage(tenantId, conversationId, text.trim())
    return res.json({
      success: true,
      ...result,
    })
  } catch (err) {
    console.error(`[POST /api/conversations/:id/messages] Erro no envio:`, err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * PATCH /api/conversations/:conversationId/read
 * Marca as mensagens como lidas na central
 */
router.patch('/:conversationId/read', async (req, res) => {
  const tenantId = resolveTenantId(req)
  const { conversationId } = req.params

  try {
    await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('conversations')
      .doc(conversationId)
      .set(
        {
          unreadCount: 0,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      )

    return res.json({ success: true, conversationId, unreadCount: 0 })
  } catch (err) {
    console.error(`[PATCH /api/conversations/:id/read] Erro:`, err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * PATCH /api/conversations/:conversationId/ai
 * Ativa ou pausa a IA nesta conversa específica
 */
router.patch('/:conversationId/ai', async (req, res) => {
  const tenantId = resolveTenantId(req)
  const { conversationId } = req.params
  const { aiEnabled } = req.body

  try {
    const enabled = !!aiEnabled
    await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('conversations')
      .doc(conversationId)
      .set(
        {
          aiEnabled: enabled,
          assignedTo: enabled ? 'ai' : 'human',
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      )

    return res.json({
      success: true,
      conversationId,
      aiEnabled: enabled,
      assignedTo: enabled ? 'ai' : 'human',
    })
  } catch (err) {
    console.error(`[PATCH /api/conversations/:id/ai] Erro:`, err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * PATCH /api/conversations/:conversationId/assign
 * Altera status ou atribuição (ex: 'active', 'completed', 'human', 'ai')
 */
router.patch('/:conversationId/assign', async (req, res) => {
  const tenantId = resolveTenantId(req)
  const { conversationId } = req.params
  const { assignedTo, status } = req.body

  const updates = { updatedAt: new Date().toISOString() }
  if (assignedTo) updates.assignedTo = assignedTo
  if (status) updates.status = status

  try {
    await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('conversations')
      .doc(conversationId)
      .set(updates, { merge: true })

    return res.json({
      success: true,
      conversationId,
      ...updates,
    })
  } catch (err) {
    console.error(`[PATCH /api/conversations/:id/assign] Erro:`, err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/contacts
 * Lista contatos salvos da barbearia
 */
router.get('/contacts', async (req, res) => {
  const tenantId = resolveTenantId(req)
  try {
    const snap = await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('contacts')
      .get()

    const contacts = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    return res.json({ success: true, total: contacts.length, contacts })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

export default router
