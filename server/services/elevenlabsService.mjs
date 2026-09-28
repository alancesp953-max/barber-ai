import axios from 'axios'
import dotenv from 'dotenv'
import { adminStorage } from '../lib/firebaseAdmin.mjs'

dotenv.config()

const defaultApiKey = process.env.ELEVENLABS_API_KEY

/**
 * Gera arquivo de áudio a partir de um texto utilizando a API do ElevenLabs.
 * Retorna o buffer do áudio ou faz upload no Firebase Storage e retorna URL pública.
 */
export async function generateAudioMessage({
  text,
  voiceId = '21m00Tcm4TlvDq8ikWAM',
  apiKey = defaultApiKey,
  tenantId = 'default',
}) {
  if (!apiKey) {
    console.warn('⚠️ ELEVENLABS_API_KEY não configurada no backend. Geração de áudio ignorada.')
    return null
  }

  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`
    const response = await axios.post(
      url,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
        },
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        responseType: 'arraybuffer',
      },
    )

    const buffer = Buffer.from(response.data)

    // Se Firebase Storage estiver configurado, salva o arquivo de áudio
    try {
      const bucket = adminStorage.bucket()
      const filename = `tenants/${tenantId}/audios/${Date.now()}.mp3`
      const file = bucket.file(filename)
      await file.save(buffer, {
        metadata: { contentType: 'audio/mpeg' },
        public: true,
      })
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`
      return { publicUrl, buffer }
    } catch (storageErr) {
      console.warn('Não foi possível salvar áudio no Firebase Storage, retornando buffer local:', storageErr.message)
      return { buffer }
    }
  } catch (err) {
    console.error('Erro na API do ElevenLabs:', err.response?.data?.toString() || err.message)
    return null
  }
}
