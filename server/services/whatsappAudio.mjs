import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import { isTimeoutError, withTimeout } from '../lib/withTimeout.mjs'
import { transcribeAudioBuffer } from './geminiService.mjs'

function normalizeMime(raw) {
  const base = String(raw || 'audio/ogg').split(';')[0].trim().toLowerCase()
  if (base === 'audio/opus' || base === 'audio/ogg') return 'audio/ogg'
  if (base === 'audio/mpeg' || base === 'audio/mp3') return 'audio/mp3'
  if (base === 'audio/mp4' || base === 'audio/m4a' || base === 'audio/aac') return 'audio/mp4'
  if (base === 'audio/wav' || base === 'audio/x-wav' || base === 'audio/wave') return 'audio/wav'
  if (base === 'audio/webm') return 'audio/webm'
  return 'audio/ogg'
}

function extensionForMime(mime) {
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'mp3'
  if (mime === 'audio/mp4') return 'm4a'
  if (mime === 'audio/wav') return 'wav'
  if (mime === 'audio/webm') return 'webm'
  return 'ogg'
}

export async function convertAudioWithFfmpeg(inputBuffer, inputMime, timeoutMs = 8000) {
  const ext = extensionForMime(inputMime)
  const dir = await mkdtemp(path.join(tmpdir(), 'diva-audio-'))
  const inputPath = path.join(dir, `in.${ext}`)
  const outputPath = path.join(dir, 'out.mp3')
  await writeFile(inputPath, inputBuffer)
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        'ffmpeg',
        ['-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-f', 'mp3', outputPath],
        { windowsHide: true },
      )
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill()
        const error = new Error(`timeout_ffmpeg_${timeoutMs}ms`)
        error.code = 'ETIMEOUT'
        reject(error)
      }, timeoutMs)
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg saiu com código ${code}: ${stderr.slice(-500)}`))
      })
    })
    const output = await readFile(outputPath)
    console.log(`[WhatsApp Áudio] etapa=ffmpeg_ok bytes=${output.length} destino=audio/mp3`)
    return output
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function transcribeWhatsAppAudio({ sock, msg, content, logger }) {
  const audio = content?.audioMessage
  if (!audio) {
    console.log('[WhatsApp Áudio] etapa=parar motivo=sem_audioMessage')
    return { text: '', error: 'sem_audio' }
  }

  const mime = normalizeMime(audio.mimetype)
  console.log(
    `[WhatsApp Áudio] etapa=download_inicio mime=${audio.mimetype || 'desconhecido'} normalizado=${mime} ptt=${audio.ptt === true} segundos=${audio.seconds ?? '?'} bytesDeclarados=${audio.fileLength || '?'}`,
  )

  let buffer
  const downloadAbort = new AbortController()
  const downloadTimer = setTimeout(() => downloadAbort.abort(), 12000)
  try {
    const downloadable = content === msg.message ? msg : { ...msg, message: content }
    buffer = await withTimeout(
      downloadMediaMessage(
        downloadable,
        'buffer',
        { options: { signal: downloadAbort.signal } },
        {
          logger,
          reuploadRequest: sock.updateMediaMessage?.bind(sock),
        },
      ),
      12000,
      'download',
    )
  } catch (err) {
    const motivo = isTimeoutError(err) ? 'timeout' : 'download'
    console.error(`[WhatsApp Áudio] etapa=download_falha motivo=${motivo} ${err?.message || err}`)
    return { text: '', error: motivo }
  } finally {
    clearTimeout(downloadTimer)
  }

  if (!buffer?.length) {
    console.error('[WhatsApp Áudio] etapa=download_vazio')
    return { text: '', error: 'download_vazio' }
  }
  console.log(`[WhatsApp Áudio] etapa=download_ok bytes=${buffer.length}`)

  const direct = await transcribeAudioBuffer({ buffer, mimeType: mime, timeoutMs: 12000 })
  if (direct.text) return { text: direct.text }
  if (isTimeoutError({ message: direct.error })) {
    console.error('[WhatsApp Áudio] etapa=transcricao_timeout sem nova tentativa. A fila segue.')
    return { text: '', error: 'timeout' }
  }

  console.warn(`[WhatsApp Áudio] etapa=transcricao_direta_falhou motivo=${direct.error || 'vazio'}. Tentando ffmpeg.`)
  let mp3
  try {
    mp3 = await convertAudioWithFfmpeg(buffer, mime)
  } catch (err) {
    const missing = err?.code === 'ENOENT'
    console.error(
      missing
        ? '[WhatsApp Áudio] etapa=ffmpeg_ausente ffmpeg não está no PATH. Conversão ignorada; a transcrição direta no Gemini também falhou.'
        : `[WhatsApp Áudio] etapa=ffmpeg_falha ${err?.message || err}`,
    )
    return { text: '', error: missing ? 'ffmpeg_ausente' : 'ffmpeg' }
  }

  const converted = await transcribeAudioBuffer({ buffer: mp3, mimeType: 'audio/mp3', timeoutMs: 12000 })
  if (converted.text) return { text: converted.text }
  console.error(`[WhatsApp Áudio] etapa=transcricao_mp3_falhou motivo=${converted.error || 'vazio'}`)
  return { text: '', error: converted.error || 'transcricao' }
}
