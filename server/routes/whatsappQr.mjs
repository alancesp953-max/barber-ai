import express from 'express'
import {
  initSession,
  getSessionStatus,
  disconnectSession,
  getActiveTenantId,
} from '../services/whatsappBaileysManager.mjs'
import { adminDb } from '../lib/firebaseAdmin.mjs'

const router = express.Router()

/**
 * Validador e normalizador do tenantId
 */
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
 * POST /api/whatsapp/connect
 * Inicializa a sessão do WhatsApp Web para gerar ou reativar QR Code
 */
router.post('/connect', async (req, res) => {
  const tenantId = resolveTenantId(req)
  try {
    const session = await initSession(tenantId)
    return res.json({
      success: true,
      tenantId,
      ...session,
    })
  } catch (err) {
    console.error(`[Route /api/whatsapp/connect] Erro para ${tenantId}:`, err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/whatsapp/status
 * Retorna o status atual da conexão e dados do número/QR Code
 */
router.get('/status', async (req, res) => {
  const tenantId = resolveTenantId(req)
  try {
    const liveSession = getSessionStatus(tenantId)

    // Se a sessão em memória estiver disconnected, consulta o Firestore para obter metadados persistentes
    if (liveSession.status === 'disconnected') {
      const docSnap = await adminDb
        .collection('tenants')
        .doc(tenantId)
        .collection('whatsappConnections')
        .doc('current')
        .get()

      if (docSnap.exists) {
        const data = docSnap.data()
        return res.json({
          tenantId,
          status: data.status || 'disconnected',
          phoneNumber: data.phoneNumber || null,
          qrCode: data.qrCode || null,
          connectedAt: data.connectedAt || null,
          lastDisconnectedAt: data.lastDisconnectedAt || null,
          lastError: data.lastError || null,
        })
      }
    }

    return res.json({
      tenantId,
      ...liveSession,
    })
  } catch (err) {
    console.error(`[Route /api/whatsapp/status] Erro para ${tenantId}:`, err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/whatsapp/qr
 * Retorna o QR Code ativo
 */
router.get('/qr', (req, res) => {
  const tenantId = resolveTenantId(req)
  const session = getSessionStatus(tenantId)
  return res.json({
    tenantId,
    status: session.status,
    qrCode: session.qrCode,
  })
})

/**
 * POST /api/whatsapp/disconnect
 * Encerra a sessão e apaga as credenciais locais
 */
router.post('/disconnect', async (req, res) => {
  const tenantId = resolveTenantId(req)
  try {
    const result = await disconnectSession(tenantId)
    return res.json({
      tenantId,
      ...result,
    })
  } catch (err) {
    console.error(`[Route /api/whatsapp/disconnect] Erro para ${tenantId}:`, err)
    return res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/whatsapp/reconnect
 * Desconecta e reinicia uma nova sessão com QR Code novo
 */
router.post('/reconnect', async (req, res) => {
  const tenantId = resolveTenantId(req)
  try {
    await disconnectSession(tenantId)
    const newSession = await initSession(tenantId)
    return res.json({
      success: true,
      tenantId,
      ...newSession,
    })
  } catch (err) {
    console.error(`[Route /api/whatsapp/reconnect] Erro para ${tenantId}:`, err)
    return res.status(500).json({ error: err.message })
  }
})

export default router
