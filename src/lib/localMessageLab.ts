import { loadAudioSettings, speakWithElevenLabs, transcribeAudioWithGemini } from './audioSettings'
import { generateLocalDivaAudioReply } from './localDivaAudio'
import {
  appendWhatsAppLabMessage,
  guessClientName,
  loadWhatsAppLab,
  type LabChatMessage,
} from './localWhatsAppLab'

export type LabProgress = (step: string) => void

function historyForReply() {
  return loadWhatsAppLab().messages.map((msg) => ({ from: msg.from, text: msg.text }))
}

function knownClientName(latestText: string) {
  const guessed = guessClientName(latestText)
  if (guessed) return guessed
  for (const msg of [...loadWhatsAppLab().messages].reverse()) {
    if (msg.from !== 'cliente') continue
    const name = guessClientName(msg.text)
    if (name) return name
  }
  return ''
}

function shouldReplyWithAudio(inputKind: 'text' | 'audio') {
  const mode = loadAudioSettings().audio_whatsapp_mode
  if (mode === 'apenas_transcrever') return false
  if (mode === 'sempre') return inputKind === 'audio'
  return inputKind === 'audio'
}

async function replyAs(userText: string, inputKind: 'text' | 'audio', onProgress?: LabProgress) {
  onProgress?.('Consultando regras da Diva e horários locais…')
  const spokenText = await generateLocalDivaAudioReply(userText, historyForReply(), knownClientName(userText))
  const replyText = spokenText.text
  if (!shouldReplyWithAudio(inputKind)) {
    const reply = appendWhatsAppLabMessage({
      from: 'bot',
      kind: 'text',
      text: replyText,
    })
    return {
      reply,
      replyText,
      note: spokenText.note,
      messages: loadWhatsAppLab().messages,
    }
  }
  onProgress?.('Gerando voz no ElevenLabs…')
  const spoken = await speakWithElevenLabs(replyText)
  const reply = appendWhatsAppLabMessage({
    from: 'bot',
    kind: spoken.ok ? 'audio' : 'text',
    text: replyText,
    audioUrl: spoken.ok ? spoken.audioUrl : undefined,
  })
  const notes = [spokenText.note, spoken.ok ? undefined : spoken.error].filter(Boolean)
  return {
    reply,
    replyText,
    note: notes.length ? notes.join(' ') : undefined,
    messages: loadWhatsAppLab().messages,
  }
}

export async function processLocalLabText(text: string, onProgress?: LabProgress) {
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false as const, error: 'Digite uma mensagem para processar neste computador.' }
  }
  const incoming = appendWhatsAppLabMessage({ from: 'cliente', kind: 'text', text: trimmed })
  const result = await replyAs(trimmed, 'text', onProgress)
  return {
    ok: true as const,
    incoming,
    ...result,
  }
}

export async function processLocalLabAudio(file: Blob, onProgress?: LabProgress) {
  if (!file || file.size < 200) {
    return { ok: false as const, error: 'Áudio vazio. Grave de novo ou envie outro arquivo.' }
  }
  onProgress?.('Transcrevendo com Gemini…')
  const transcribed = await transcribeAudioWithGemini(file)
  if (!transcribed.ok) return transcribed
  const incoming = appendWhatsAppLabMessage({
    from: 'cliente',
    kind: 'audio',
    text: transcribed.text,
    transcript: transcribed.text,
  })
  if (loadAudioSettings().audio_whatsapp_mode === 'apenas_transcrever') {
    const replyText = `Beleza, te entendi: ${transcribed.text}`
    const reply = appendWhatsAppLabMessage({
      from: 'bot',
      kind: 'text',
      text: replyText,
    })
    return {
      ok: true as const,
      incoming,
      reply,
      transcript: transcribed.text,
      replyText,
      messages: loadWhatsAppLab().messages as LabChatMessage[],
    }
  }
  const result = await replyAs(transcribed.text, 'audio', onProgress)
  return {
    ok: true as const,
    incoming,
    transcript: transcribed.text,
    ...result,
    messages: result.messages as LabChatMessage[],
  }
}
