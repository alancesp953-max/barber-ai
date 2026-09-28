import { Router } from 'express'
import { adminDb } from '../lib/firebaseAdmin.mjs'
import { processConversationMessage } from '../services/stateMachine.mjs'

const router = Router()

// Cache em memória para garantir idempotência e evitar duplicação de mensagens da Meta
const processedMessageIds = new Set()

/**
 * Validação do Webhook pela Meta (WhatsApp Business Platform)
 */
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'barberai_webhook_verify_2026'

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook do WhatsApp validado com sucesso pela Meta!')
      return res.status(200).send(challenge)
    } else {
      console.warn('❌ Token de verificação do Webhook incorreto.')
      return res.sendStatus(403)
    }
  }

  return res.sendStatus(400)
})

/**
 * Recebimento de eventos e mensagens do WhatsApp
 */
router.post('/whatsapp', async (req, res) => {
  const body = req.body

  // Responde imediatamente 200 OK para a Meta
  res.status(200).send('EVENT_RECEIVED')

  if (body.object !== 'whatsapp_business_account') {
    return
  }

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue

        const value = change.value
        const metadata = value.metadata
        const phoneNumberId = metadata?.phone_number_id
        const messages = value.messages || []

        for (const msg of messages) {
          const messageId = msg.id

          // Proteção de Idempotência: impede reprocessamento da mesma mensagem
          if (processedMessageIds.has(messageId)) {
            console.log(`[Idempotência] Mensagem duplicada ignorada: ${messageId}`)
            continue
          }
          processedMessageIds.add(messageId)
          if (processedMessageIds.size > 5000) {
            // Limpa mensagens antigas do cache
            const firstItem = processedMessageIds.values().next().value
            processedMessageIds.delete(firstItem)
          }

          // Apenas processa mensagens de texto
          if (msg.type !== 'text') {
            continue
          }

          const clientPhone = msg.from
          const messageText = msg.text.body

          console.log(`[WhatsApp Webhook] Mensagem de ${clientPhone} para phone_id ${phoneNumberId}: "${messageText}"`)

          // Localiza o tenantId a partir do phoneNumberId cadastrado
          let targetTenantId = 'barbearia-principal'

          if (phoneNumberId) {
            const snap = await adminDb
              .collectionGroup('whatsappConnections')
              .where('phoneNumberId', '==', phoneNumberId)
              .get()

            if (!snap.empty) {
              const docPath = snap.docs[0].ref.path
              // docPath: tenants/{tenantId}/whatsappConnections/primary
              const parts = docPath.split('/')
              if (parts[0] === 'tenants' && parts[1]) {
                targetTenantId = parts[1]
              }
            }
          }

          // Executa a máquina de estados
          await processConversationMessage({
            tenantId: targetTenantId,
            clientPhone,
            messageText,
            phoneNumberId,
            accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
          })
        }
      }
    }
  } catch (err) {
    console.error('Erro ao processar webhook do WhatsApp:', err)
  }
})

export default router
