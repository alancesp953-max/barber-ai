/** Gravação local (getUserMedia + MediaRecorder) e conversão para Gemini. */

export function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

export function geminiAudioMime(file: Blob) {
  const raw = String(file.type || '')
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (raw === 'audio/wav' || raw === 'audio/x-wav' || raw === 'audio/wave') return 'audio/wav'
  if (raw === 'audio/webm') return 'audio/webm'
  if (raw === 'audio/mp4' || raw === 'audio/m4a' || raw === 'audio/x-m4a' || raw === 'audio/aac') return 'audio/mp4'
  if (raw === 'audio/mpeg' || raw === 'audio/mp3') return 'audio/mp3'
  if (raw === 'audio/ogg' || raw === 'audio/oga') return 'audio/ogg'
  if (raw === 'audio/flac') return 'audio/flac'
  if (raw.startsWith('audio/')) return raw
  return 'audio/webm'
}

export function micPermissionMessage(err: unknown) {
  if (!window.isSecureContext) {
    return 'O microfone só funciona em http://localhost ou HTTPS. Abra o painel em http://localhost:5173/'
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return 'Este navegador não expõe o microfone (getUserMedia indisponível). Use Chrome ou Edge.'
  }
  if (typeof MediaRecorder === 'undefined') {
    return 'Este navegador não suporta MediaRecorder. Use Chrome ou Edge atualizados.'
  }
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'O navegador bloqueou o microfone. Clique no ícone de cadeado ao lado da URL → Microfone → Permitir, recarregue e grave de novo.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Nenhum microfone foi encontrado neste computador.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'O microfone está ocupado por outro aplicativo. Feche o outro app e tente de novo.'
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'O microfone não aceitou as configurações de captura. Tente outro dispositivo de entrada.'
  }
  if (name === 'SecurityError' || name === 'AbortError') {
    return 'A captura foi bloqueada por segurança do navegador. Permita o microfone para este site e tente outra vez.'
  }
  return err instanceof Error && err.message
    ? `Não foi possível iniciar o microfone: ${err.message}`
    : 'Não foi possível iniciar o microfone neste computador.'
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

export function encodeWavMono(channel: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + channel.length * 2)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + channel.length * 2, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, channel.length * 2, true)
  let offset = 44
  for (let i = 0; i < channel.length; i++) {
    const sample = Math.max(-1, Math.min(1, channel[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export async function blobForGemini(blob: Blob) {
  const fallbackType = geminiAudioMime(blob)
  const normalized = new Blob([blob], { type: fallbackType })
  try {
    const ctx = new AudioContext()
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const mixed = new Float32Array(decoded.length)
    const channels = decoded.numberOfChannels
    for (let i = 0; i < decoded.length; i++) {
      let sum = 0
      for (let c = 0; c < channels; c++) sum += decoded.getChannelData(c)[i]
      mixed[i] = sum / channels
    }
    const wav = encodeWavMono(mixed, decoded.sampleRate)
    await ctx.close()
    if (wav.size > 44) return wav
  } catch {
    /* webm/mp4 segue se o decode não estiver disponível */
  }
  return normalized
}

export function formatRecordClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const mm = String(Math.floor(safe / 60)).padStart(2, '0')
  const ss = String(safe % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
