import express from 'express'
import { initFirebaseAdmin, getFirebaseMode } from './lib/firebaseAdmin.mjs'
import { assertLocalIsolation } from './lib/whatsappLock.mjs'
import {
  consultar_disponibilidade,
  criar_agendamento,
  listar_servicos,
  obter_proximo_barbeiro_rodizio,
} from './tools/divaTools.mjs'
import { extractUazapiInbound, handleDivaMessage } from './agent/divaLocal.mjs'

const PORT = Number(process.env.DIVA_LOCAL_PORT || 8787)

initFirebaseAdmin()
assertLocalIsolation()

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'diva-local-backend',
    firebase: getFirebaseMode(),
    whatsappOficial: 'bloqueado',
    timezone: 'America/Fortaleza',
  })
})

app.post('/webhook/uazapi', async (req, res) => {
  try {
    const inbound = extractUazapiInbound(req.body || {})
    if (inbound.fromMe) {
      return res.json({ ok: true, ignored: true, reason: 'fromMe' })
    }
    if (!inbound.text) {
      return res.json({ ok: true, ignored: true, reason: 'sem_texto' })
    }
    const result = await handleDivaMessage({
      text: inbound.text,
      nome: inbound.nome,
      telefone: inbound.telefone,
      sessionId: inbound.telefone || 'uazapi_local',
      gravar: false,
    })
    return res.json({
      ok: true,
      inbound,
      ...result,
      uazapiSend: result.outbound,
    })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})

app.post('/test/webhook', async (req, res) => {
  try {
    const body = req.body || {}
    const text = String(body.text || body.mensagem || '').trim()
    if (!text) return res.status(400).json({ ok: false, error: 'Informe text.' })
    const result = await handleDivaMessage({
      text,
      nome: body.nome,
      telefone: body.telefone || '5585999999999',
      sessionId: body.sessionId || body.telefone || 'teste_local',
      gravar: Boolean(body.gravar),
    })
    return res.json({ ok: true, ...result })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})

app.get('/tools/servicos', async (_req, res) => {
  res.json(await listar_servicos())
})

app.get('/tools/rodizio', async (_req, res) => {
  res.json(await obter_proximo_barbeiro_rodizio())
})

app.get('/tools/disponibilidade', async (req, res) => {
  res.json(await consultar_disponibilidade(String(req.query.data || ''), req.query.barbeiroId))
})

app.post('/tools/agendamento', async (req, res) => {
  res.json(await criar_agendamento(req.body || {}))
})

app.listen(PORT, () => {
  console.info(`Diva local backend em http://localhost:${PORT}`)
  console.info('POST /webhook/uazapi  POST /test/webhook  — WhatsApp oficial bloqueado')
})
