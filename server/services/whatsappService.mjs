import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Envia uma mensagem de texto pelo WhatsApp Cloud API da Meta.
 */
export async function sendWhatsAppTextMessage({
  phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID,
  accessToken = process.env.WHATSAPP_ACCESS_TOKEN,
  to,
  text,
}) {
  if (!phoneNumberId || !accessToken) {
    console.warn(`[WhatsApp] phoneNumberId ou accessToken ausentes. Mensagem para ${to} registrada apenas localmente:\n"${text}"`)
    return { success: false, reason: 'credentials_missing', simulated: true }
  }

  // Limpa número de telefone (remove caracteres especiais)
  const recipientPhone = to.replace(/\D/g, '')

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: text,
      },
    }

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    return { success: true, data: response.data }
  } catch (err) {
    console.error('[WhatsApp Cloud API] Erro ao enviar mensagem:', err.response?.data || err.message)
    return { success: false, error: err.response?.data || err.message }
  }
}

/**
 * Envia uma mensagem de áudio pelo WhatsApp Cloud API.
 */
export async function sendWhatsAppAudioMessage({
  phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID,
  accessToken = process.env.WHATSAPP_ACCESS_TOKEN,
  to,
  audioUrl,
}) {
  if (!phoneNumberId || !accessToken || !audioUrl) {
    return { success: false, reason: 'missing_parameters' }
  }

  const recipientPhone = to.replace(/\D/g, '')

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'audio',
      audio: {
        link: audioUrl,
      },
    }

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    return { success: true, data: response.data }
  } catch (err) {
    console.error('[WhatsApp Cloud API] Erro ao enviar áudio:', err.response?.data || err.message)
    return { success: false, error: err.response?.data || err.message }
  }
}
