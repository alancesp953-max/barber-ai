/**
 * Rota de diagnóstico do sistema — verifica a saúde de todas as integrações
 * GET /api/health  — retorna o status de: Firebase, Gemini API, WhatsApp, dados do tenant
 */
import express from 'express'
import { adminDb } from '../lib/firebaseAdmin.mjs'
import { getActiveTenantId, getSessionStatus } from '../services/whatsappBaileysManager.mjs'

const router = express.Router()

router.get('/', async (req, res) => {
  const tenantId = req.query.tenantId || getActiveTenantId() || 'barbearia-principal'
  const checks = {
    timestamp: new Date().toISOString(),
    tenantId,
    firebase: { status: 'error', detail: '' },
    gemini: { status: 'error', detail: '', model: '' },
    whatsapp: { status: 'error', detail: '', phoneNumber: '' },
    dados: {
      servicos: { total: 0, lista: [] },
      barbeiros: { total: 0, lista: [] },
      agendamentos_hoje: 0,
      ai_settings: false,
      settings: false,
    },
  }

  // 1. Firebase — verifica se consegue ler o tenant
  try {
    const tDoc = await adminDb.collection('tenants').doc(tenantId).get()
    if (tDoc.exists) {
      checks.firebase = { status: 'ok', detail: `Tenant "${tDoc.data().nome || tenantId}" encontrado` }
    } else {
      // Tenta verificar se ao menos subcoleções existem
      const convSnap = await adminDb.collection('tenants').doc(tenantId).collection('whatsappConnections').get()
      if (convSnap.size > 0) {
        checks.firebase = { status: 'warning', detail: 'Documento raiz do tenant não existe, mas subcoleções existem. Execute o seed.' }
      } else {
        checks.firebase = { status: 'error', detail: 'Tenant não encontrado no Firebase' }
      }
    }
  } catch (err) {
    checks.firebase = { status: 'error', detail: err.message }
  }

  // 2. Dados: Serviços e Barbeiros
  try {
    const [svcsSnap, barbsSnap, settSnap, aiSnap] = await Promise.all([
      adminDb.collection('tenants').doc(tenantId).collection('services').where('ativo', '==', true).get(),
      adminDb.collection('tenants').doc(tenantId).collection('barbers').where('ativo', '==', true).get(),
      adminDb.collection('tenants').doc(tenantId).collection('settings').doc('general').get(),
      adminDb.collection('tenants').doc(tenantId).collection('aiSettings').doc('primary').get(),
    ])

    checks.dados.servicos.total = svcsSnap.size
    checks.dados.servicos.lista = svcsSnap.docs.map((d) => {
      const s = d.data()
      return { id: d.id, nome: s.nome || s.name, preco: s.preco || s.price, duracao: s.duracao_minutos }
    })

    checks.dados.barbeiros.total = barbsSnap.size
    checks.dados.barbeiros.lista = barbsSnap.docs.map((d) => {
      const b = d.data()
      return { id: d.id, nome: b.nome || b.name, horario: `${b.startHour || '?'} - ${b.endHour || '?'}` }
    })

    checks.dados.settings = settSnap.exists
    checks.dados.ai_settings = aiSnap.exists

    // Conta agendamentos de hoje
    const todayStr = new Date().toISOString().slice(0, 10)
    const todaySnap = await adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('appointments')
      .where('date', '==', todayStr)
      .get()
    checks.dados.agendamentos_hoje = todaySnap.size

    if (svcsSnap.size === 0) {
      checks.dados.servicos.alerta = '⚠️ NENHUM serviço cadastrado — a IA usará dados fictícios!'
    }
    if (barbsSnap.size === 0) {
      checks.dados.barbeiros.alerta = '⚠️ NENHUM barbeiro cadastrado — a IA usará dados fictícios!'
    }
  } catch (err) {
    checks.dados = { ...checks.dados, error: err.message }
  }

  // 3. Gemini API — testa chamada real
  try {
    let apiKey = process.env.GEMINI_API_KEY || ''

    // Tenta também buscar do aiSettings do tenant
    if (!apiKey) {
      const aiDoc = await adminDb.collection('tenants').doc(tenantId).collection('aiSettings').doc('primary').get()
      if (aiDoc.exists) apiKey = aiDoc.data().geminiApiKey || ''
    }

    if (!apiKey) {
      checks.gemini = { status: 'error', detail: 'Nenhuma chave de API do Gemini configurada', model: '' }
    } else {
      const model = 'gemini-3.8-flash'
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Responda apenas: OK' }] }],
          }),
        },
      )
      const data = await response.json()

      if (data.error) {
        checks.gemini = { status: 'error', detail: data.error.message, model }
      } else {
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        checks.gemini = { status: 'ok', detail: `Resposta recebida: "${reply.trim()}"`, model }
      }
    }
  } catch (err) {
    checks.gemini = { status: 'error', detail: err.message, model: '' }
  }

  // 4. WhatsApp — verifica sessão ativa do Baileys
  try {
    const session = getSessionStatus(tenantId)
    checks.whatsapp = {
      status: session.status === 'connected' ? 'ok' : session.status === 'qr_ready' ? 'warning' : 'error',
      detail:
        session.status === 'connected'
          ? `Conectado ao número ${session.phoneNumber}`
          : session.status === 'qr_ready'
            ? 'QR Code aguardando leitura'
            : 'Desconectado',
      phoneNumber: session.phoneNumber || '',
    }
  } catch (err) {
    checks.whatsapp = { status: 'error', detail: err.message, phoneNumber: '' }
  }

  // Resumo geral
  const allOk = checks.firebase.status === 'ok' && checks.gemini.status === 'ok' && checks.whatsapp.status === 'ok'
  const overall = allOk ? 'healthy' : 'degraded'

  return res.json({ overall, ...checks })
})

export default router
