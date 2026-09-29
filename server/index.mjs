import './lib/loadEnv.mjs'
import express from 'express'
import cors from 'cors'
import webhookRoutes from './routes/webhook.mjs'
import whatsappQrRoutes from './routes/whatsappQr.mjs'
import conversationRoutes from './routes/conversations.mjs'
import healthRoutes from './routes/health.mjs'
import { restoreAllSessions } from './services/whatsappBaileysManager.mjs'
import { processConversationMessage } from './services/stateMachine.mjs'
import { calculateAvailableSlots } from './services/availability.mjs'
import { adminDb } from './lib/firebaseAdmin.mjs'

process.on('unhandledRejection', (reason) => {
  console.warn('[Process Server Warning] Unhandled Rejection:', reason?.message || reason)
})
process.on('uncaughtException', (err) => {
  console.warn('[Process Server Warning] Uncaught Exception:', err.message)
})

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Diagnóstico completo do sistema (Firebase, Gemini, WhatsApp, dados reais)
app.use('/api/health', healthRoutes)

// Webhook WhatsApp (Meta Cloud API)
app.use('/api/webhook', webhookRoutes)

// Rotas de Conexão WhatsApp Web via QR Code (Baileys)
app.use('/api/whatsapp', whatsappQrRoutes)

// Central de Conversas Reais (WhatsApp Web Chat)
app.use('/api/conversations', conversationRoutes)

// Endpoint do Simulador do Painel (Tempo Real)
app.post('/api/simulator/message', async (req, res) => {
  const { tenantId = 'barbearia-principal', clientPhone = '5511999998888', messageText } = req.body

  if (!messageText) {
    return res.status(400).json({ error: 'messageText é obrigatório' })
  }

  try {
    const result = await processConversationMessage({
      tenantId,
      clientPhone,
      messageText,
      phoneNumberId: null, // modo simulação
      accessToken: null,
    })

    return res.json(result)
  } catch (err) {
    console.error('Erro no simulador:', err)
    return res.status(500).json({ error: err.message })
  }
})

// Endpoint de sincronização de dados reais da barbearia (Barbeiros, Serviços, Configurações)
app.post('/api/sync/tenant-data', async (req, res) => {
  const { tenantId, name, barbers = [], services = [] } = req.body

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId é obrigatório' })
  }

  try {
    console.log(`[Sync] Sincronizando dados reais para barbearia "${tenantId}"...`)

    // Atualiza documento do tenant
    if (name) {
      await adminDb.collection('tenants').doc(tenantId).set(
        {
          name,
          nome: name,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      )
    }

    // Atualiza barbeiros reais
    for (const barber of barbers) {
      const bId = barber.id || `barb_${Date.now()}`
      await adminDb.collection('tenants').doc(tenantId).collection('barbers').doc(bId).set(
        {
          ...barber,
          name: barber.nome || barber.name,
          nome: barber.nome || barber.name,
          active: barber.active ?? barber.ativo ?? true,
          ativo: barber.ativo ?? barber.active ?? true,
          startHour: barber.startHour || '08:00',
          endHour: barber.endHour || '19:00',
          workingDays: barber.workingDays || [1, 2, 3, 4, 5, 6],
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      )
    }

    // Atualiza serviços reais
    for (const service of services) {
      const sId = service.id || `serv_${Date.now()}`
      await adminDb.collection('tenants').doc(tenantId).collection('services').doc(sId).set(
        {
          ...service,
          name: service.nome || service.name,
          nome: service.nome || service.name,
          preco: service.preco || service.price || 35,
          active: service.active ?? service.ativo ?? true,
          ativo: service.ativo ?? service.active ?? true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      )
    }

    console.log(`[Sync] ✅ Sincronização concluída com sucesso para "${tenantId}"! Barbeiros: ${barbers.length}, Serviços: ${services.length}`)
    return res.json({ success: true, tenantId, barbersCount: barbers.length, servicesCount: services.length })
  } catch (err) {
    console.error('[Sync] Erro ao sincronizar dados:', err)
    return res.status(500).json({ error: err.message })
  }
})

// Endpoint de cálculo de horários livres
app.post('/api/availability/slots', async (req, res) => {
  const { tenantId, barberId, dateStr, durationMinutes = 30 } = req.body

  try {
    let barberData = {
      startHour: '09:00',
      endHour: '19:00',
      workingDays: [1, 2, 3, 4, 5, 6],
      daysOff: [],
    }

    if (tenantId && barberId) {
      const bSnap = await adminDb.collection('tenants').doc(tenantId).collection('barbers').doc(barberId).get()
      if (bSnap.exists) {
        barberData = { ...barberData, ...bSnap.data() }
      }
    }

    const apptsSnap = await adminDb
      .collection('tenants')
      .doc(tenantId || 'barbearia-principal')
      .collection('appointments')
      .where('date', '==', dateStr)
      .get()

    const existingAppointments = apptsSnap.docs.map((d) => d.data())

    const slots = calculateAvailableSlots({
      dateStr,
      durationMinutes,
      barber: barberData,
      existingAppointments,
    })

    return res.json({ slots })
  } catch (err) {
    console.error('Erro ao calcular horários:', err)
    return res.status(500).json({ error: err.message })
  }
})

// Retorna novos agendamentos confirmados via WhatsApp que ainda não foram sincronizados
app.get('/api/appointments/pending-sync', async (req, res) => {
  const tenantId = req.query.tenantId || 'I13A9nw5T4IsaojMPLl6'
  try {
    const snap = await adminDb.collection('tenants').doc(tenantId).collection('appointments').get()
    const pending = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => a.cloudSynced === false && a.origin === 'whatsapp')
    return res.json({ appointments: pending })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// Marca agendamento como sincronizado com sucesso
app.post('/api/appointments/mark-synced', async (req, res) => {
  const { tenantId = 'I13A9nw5T4IsaojMPLl6', appointmentId } = req.body
  try {
    if (appointmentId) {
      await adminDb.collection('tenants').doc(tenantId).collection('appointments').doc(appointmentId).set(
        { cloudSynced: true, syncedAt: new Date().toISOString() },
        { merge: true },
      )
    }
    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`💈 Servidor Barber AI Backend ativo na porta ${PORT}`)
  console.log(`📡 Webhook WhatsApp disponível em: http://localhost:${PORT}/api/webhook/whatsapp`)
  console.log(`📱 Conexão WhatsApp QR Code disponível em: http://localhost:${PORT}/api/whatsapp/qr`)

  // Restaura sessões ativas existentes
  restoreAllSessions().catch((err) => {
    console.error('Falha ao restaurar sessões do WhatsApp:', err)
  })
})

export default app
