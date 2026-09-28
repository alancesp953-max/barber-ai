import { GoogleGenAI } from '@google/genai'
import dotenv from 'dotenv'

dotenv.config()

const apiKey = process.env.GEMINI_API_KEY

let ai = null
if (apiKey) {
  try {
    ai = new GoogleGenAI({ apiKey })
  } catch (err) {
    console.warn('Falha ao inicializar GoogleGenAI:', err.message)
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
  if (!ai || !apiKey) {
    // Fallback heurístico inteligente sem API externa
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
