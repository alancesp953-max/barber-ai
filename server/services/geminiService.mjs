import { GoogleGenAI } from '@google/genai'
import '../lib/loadEnv.mjs'
import { isTimeoutError, withTimeout } from '../lib/withTimeout.mjs'

function geminiClient() {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim()
  if (!apiKey) return null
  try {
    return new GoogleGenAI({ apiKey })
  } catch (err) {
    console.warn('[Gemini] Falha ao inicializar cliente:', err.message)
    return null
  }
}

/**
 * Interpreta uma mensagem do cliente no contexto da máquina de estados do atendimento.
 */
export async function interpretUserIntent({
  messageText,
  currentStep,
  activeServices = [],
  activeBarbers = [],
  availableSlots = [],
}) {
  const ai = geminiClient()
  if (!ai) {
    console.warn('[Gemini] GEMINI_API_KEY ausente em .env/.env.local. Usando leitura local da mensagem.')
    return fallbackIntentParsing({ messageText, currentStep, activeServices, activeBarbers, availableSlots })
  }

  try {
    const prompt = `Você é o interpretador de linguagem natural de uma barbearia SaaS.
Etapa atual: ${currentStep}
Serviços ativos da barbearia: ${JSON.stringify(activeServices.map((s) => ({ id: s.id, nome: s.nome, preco: s.preco })))}
Barbeiros ativos: ${JSON.stringify(activeBarbers.map((b) => ({ id: b.id, nome: b.nome })))}
Horários disponíveis hoje: ${JSON.stringify(availableSlots)}

Mensagem do cliente: "${messageText}"

Responda em formato JSON estrito:
{
  "intent": "NAME | SELECT_SERVICE | SELECT_BARBER | SELECT_DATE | SELECT_TIME | CONFIRM | CANCEL | HUMAN_HANDOFF | OTHER",
  "extractedName": string or null,
  "serviceId": string or null,
  "barberId": string or null,
  "date": string or null,
  "time": string or null,
  "confirmation": boolean or null
}`

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    })

    const text = response.text
    return JSON.parse(text)
  } catch (err) {
    console.warn('Erro ao consultar Gemini, usando fallback:', err.message)
    return fallbackIntentParsing({ messageText, currentStep, activeServices, activeBarbers, availableSlots })
  }
}

function fallbackIntentParsing({ messageText, currentStep, activeServices, activeBarbers, availableSlots }) {
  const text = messageText.toLowerCase().trim()

  if (text.includes('humano') || text.includes('atendente') || text.includes('pessoa')) {
    return { intent: 'HUMAN_HANDOFF' }
  }

  if (text === 'cancelar' || text === 'cancela' || text === 'não' || text === 'nao') {
    return { intent: 'CANCEL', confirmation: false }
  }

  if (text === 'sim' || text === 'confirmo' || text === 'confirmar' || text === 'pode ser' || text === 'ok') {
    return { intent: 'CONFIRM', confirmation: true }
  }

  if (currentStep === 'AWAITING_NAME') {
    return { intent: 'NAME', extractedName: messageText.trim() }
  }

  if (currentStep === 'AWAITING_SERVICE') {
    const matched = activeServices.find((s) => text.includes(s.nome.toLowerCase())) || activeServices[0]
    return { intent: 'SELECT_SERVICE', serviceId: matched?.id || null }
  }

  if (currentStep === 'AWAITING_BARBER') {
    if (text.includes('primeiro') || text.includes('sem preferência') || text.includes('tanto faz') || text === '0') {
      return { intent: 'SELECT_BARBER', barberId: 'ANY' }
    }
    const matched = activeBarbers.find((b) => text.includes(b.nome.toLowerCase())) || activeBarbers[0]
    return { intent: 'SELECT_BARBER', barberId: matched?.id || 'ANY' }
  }

  if (currentStep === 'AWAITING_TIME') {
    const matched = availableSlots.find((slot) => text.includes(slot))
    return { intent: 'SELECT_TIME', time: matched || messageText.trim() }
  }

  return { intent: 'OTHER' }
}

const AUDIO_MODELS = [
  process.env.GEMINI_AUDIO_MODEL,
  'gemini-2.5-flash',
  'gemini-3.8-flash',
].filter(Boolean)

/**
 * Transcreve um áudio do WhatsApp. Não lança: devolve { text } ou { text: '', error }.
 */
export async function transcribeAudioBuffer({ buffer, mimeType, timeoutMs = 12000 }) {
  const ai = geminiClient()
  if (!ai) {
    console.error('[WhatsApp Áudio] etapa=transcricao_sem_chave GEMINI_API_KEY ausente em .env e .env.local')
    return { text: '', error: 'sem_chave' }
  }

  const models = [...new Set(AUDIO_MODELS)]
  let lastError = 'vazio'
  for (const model of models) {
    try {
      console.log(`[WhatsApp Áudio] etapa=transcricao_inicio modelo=${model} mime=${mimeType} bytes=${buffer.length} timeoutMs=${timeoutMs}`)
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType, data: buffer.toString('base64') } },
                {
                  text: 'Transcreva o áudio em português do Brasil. Responda apenas com as palavras ditas, sem comentário, sem aspas e sem tradução.',
                },
              ],
            },
          ],
        }),
        timeoutMs,
        `transcricao_${model}`,
      )
      const text = String(response.text || '').trim()
      if (!text) {
        lastError = `modelo_${model}_texto_vazio`
        console.warn(`[WhatsApp Áudio] etapa=transcricao_vazia modelo=${model}`)
        continue
      }
      console.log(`[WhatsApp Áudio] etapa=transcricao_ok modelo=${model} chars=${text.length} texto=${JSON.stringify(text)}`)
      return { text }
    } catch (err) {
      lastError = err?.message || String(err)
      console.error(`[WhatsApp Áudio] etapa=transcricao_erro modelo=${model} ${lastError}`)
      if (isTimeoutError(err)) break
    }
  }
  return { text: '', error: lastError }
}
