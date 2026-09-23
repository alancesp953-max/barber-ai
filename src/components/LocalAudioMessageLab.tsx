import { Alert, Button, FileButton, Group, Stack, Text, Textarea } from '@mantine/core'
import { Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { clearWhatsAppLabMessages, loadWhatsAppLab, type LabChatMessage } from '../lib/localWhatsAppLab'
import { processLocalLabAudio, processLocalLabText } from '../lib/localMessageLab'
import {
  blobForGemini,
  formatRecordClock,
  geminiAudioMime,
  micPermissionMessage,
  pickRecorderMime,
} from '../lib/micRecorder'

export function LocalAudioMessageLab() {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<LabChatMessage[]>([])
  const [busyKind, setBusyKind] = useState<'text' | 'audio' | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const playerRef = useRef<HTMLAudioElement | null>(null)
  const recordingRef = useRef(false)

  useEffect(() => {
    setMessages(loadWhatsAppLab().messages)
    return () => stopTracks()
  }, [])

  useEffect(() => {
    if (!recording) {
      setElapsed(0)
      return
    }
    setElapsed(0)
    const id = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [recording])

  useEffect(() => {
    const last = [...messages].reverse().find((msg) => msg.from === 'bot' && msg.audioUrl)
    if (!last?.audioUrl || !playerRef.current) return
    playerRef.current.src = last.audioUrl
    void playerRef.current.play().catch(() => undefined)
  }, [messages])

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  async function sendText() {
    setBusyKind('text')
    setFeedback({ tipo: 'sucesso', texto: 'Processando texto neste computador…' })
    try {
      const result = await processLocalLabText(text, (step) => setFeedback({ tipo: 'sucesso', texto: step }))
      if (!result.ok) {
        setFeedback({ tipo: 'erro', texto: result.error })
        return
      }
      setText('')
      setMessages(result.messages)
      setFeedback({
        tipo: result.note ? 'erro' : 'sucesso',
        texto: result.note
          ? `Resposta em texto gerada, com aviso: ${result.note}`
          : 'Resposta em texto gerada. Sem áudio, porque a entrada foi texto.',
      })
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Falha no laboratório local.' })
    } finally {
      setBusyKind(null)
    }
  }

  async function sendAudio(file: File | Blob | null) {
    if (!file) return
    setBusyKind('audio')
    setFeedback({ tipo: 'sucesso', texto: 'Processando áudio…' })
    try {
      const prepared = file instanceof File ? file : await blobForGemini(file)
      const result = await processLocalLabAudio(prepared, (step) => setFeedback({ tipo: 'sucesso', texto: step }))
      if (!result.ok) {
        setFeedback({ tipo: 'erro', texto: result.error })
        return
      }
      setMessages(result.messages)
      setFeedback({
        tipo: result.note ? 'erro' : 'sucesso',
        texto: result.note
          ? `Gemini transcreveu: "${result.transcript}". ElevenLabs: ${result.note}`
          : `Gemini transcreveu: "${result.transcript}". A voz do ElevenLabs deve tocar abaixo.`,
      })
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Falha ao processar áudio local.' })
    } finally {
      setBusyKind(null)
    }
  }

  async function startRecording() {
    setFeedback(null)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setFeedback({ tipo: 'erro', texto: micPermissionMessage(new DOMException('', 'SecurityError')) })
      return
    }
    if (typeof MediaRecorder === 'undefined') {
      setFeedback({ tipo: 'erro', texto: micPermissionMessage(new DOMException('', 'NotSupportedError')) })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      const mimeType = pickRecorderMime()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        stopTracks()
        recordingRef.current = false
        setRecording(false)
        setFeedback({ tipo: 'erro', texto: 'A gravação do microfone falhou no meio do caminho. Tente de novo.' })
      }
      recorderRef.current = recorder
      recorder.start()
      recordingRef.current = true
      setRecording(true)
      setFeedback({
        tipo: 'sucesso',
        texto: 'Gravando… Fale agora e clique de novo no botão vermelho para parar e transcrever.',
      })
    } catch (err) {
      stopTracks()
      recordingRef.current = false
      setRecording(false)
      setFeedback({ tipo: 'erro', texto: micPermissionMessage(err) })
    }
  }

  async function stopRecording() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      stopTracks()
      recordingRef.current = false
      setRecording(false)
      return
    }
    const mime = geminiAudioMime({ type: recorder.mimeType || pickRecorderMime() || 'audio/webm' } as Blob)
    const blob = await new Promise<Blob>((resolve, reject) => {
      const finish = () => {
        const parts = chunksRef.current.length ? chunksRef.current : []
        resolve(new Blob(parts, { type: mime || 'audio/webm' }))
      }
      recorder.addEventListener('stop', finish, { once: true })
      try {
        recorder.stop()
      } catch (err) {
        reject(err)
      }
    })
    stopTracks()
    recorderRef.current = null
    recordingRef.current = false
    setRecording(false)
    if (blob.size < 800) {
      setFeedback({
        tipo: 'erro',
        texto: 'A gravação ficou vazia ou curta demais. Segure uns 2 segundos falando e depois clique para parar.',
      })
      return
    }
    await sendAudio(blob)
  }

  async function toggleRecording() {
    if (recordingRef.current) {
      setFeedback({ tipo: 'sucesso', texto: 'Processando áudio…' })
      try {
        await stopRecording()
      } catch (err) {
        stopTracks()
        recordingRef.current = false
        setRecording(false)
        setFeedback({ tipo: 'erro', texto: micPermissionMessage(err) })
      }
      return
    }
    await startRecording()
  }

  const busy = Boolean(busyKind)
  const processing = busy && !recording
  const lastBotAudio = [...messages].reverse().find((msg) => msg.from === 'bot' && msg.audioUrl)

  return (
    <Stack gap="sm">
      <Alert color="teal" variant="light" title="Laboratório isolado (teste_local_audio)">
        Texto responde só em texto. Áudio é transcrito pelo Gemini e a Diva responde com voz do ElevenLabs.
        Session teste_local_audio: WhatsApp oficial e produção não são chamados.
      </Alert>
      {recording && (
        <Alert color="red" variant="filled" title="Gravando...">
          <Group gap="sm" align="center">
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: '#fff',
                display: 'inline-block',
                animation: 'lab-mic-pulse 1s ease-in-out infinite',
              }}
            />
            <Text fw={700}>
              Microfone ativo {formatRecordClock(elapsed)} — clique em “Parar gravação” para enviar ao Gemini.
            </Text>
          </Group>
        </Alert>
      )}
      {processing && busyKind === 'audio' && (
        <Alert color="orange" variant="light" title="Processando áudio...">
          Transcrevendo com Gemini e gerando a voz no ElevenLabs. Aguarde a resposta completa.
        </Alert>
      )}
      {processing && busyKind === 'text' && (
        <Alert color="orange" variant="light" title="Processando texto...">
          A Diva está montando a resposta em texto. Sem síntese de voz.
        </Alert>
      )}
      {feedback && (
        <Alert color={feedback.tipo === 'sucesso' ? 'teal' : 'red'} variant="light">
          {feedback.texto}
        </Alert>
      )}
      <style>{`@keyframes lab-mic-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
      {lastBotAudio?.audioUrl ? (
        <audio ref={playerRef} controls src={lastBotAudio.audioUrl} style={{ width: '100%' }} />
      ) : null}
      <div
        style={{
          maxHeight: 240,
          overflowY: 'auto',
          border: '1px solid rgba(197,160,89,0.2)',
          borderRadius: 8,
          padding: 12,
          background: '#0d0d0d',
        }}
      >
        {messages.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nenhuma mensagem local ainda. Grave um áudio ou envie um arquivo para testar.
          </Text>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} style={{ marginBottom: 10 }}>
              <Text size="xs" c="dimmed">
                {msg.from === 'cliente' ? 'Cliente (local)' : 'Bot (local)'} · {msg.kind === 'audio' ? 'áudio' : 'texto'}
              </Text>
              <Text size="sm">{msg.text}</Text>
              {msg.audioUrl && <audio controls src={msg.audioUrl} style={{ width: '100%', marginTop: 6 }} />}
            </div>
          ))
        )}
      </div>
      <Textarea
        placeholder="Opcional: teste só em texto, ex. Quero agendar um corte"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        minRows={2}
        disabled={busy || recording}
      />
      <Group gap="sm" wrap="wrap">
        <Button type="button" color="gold" c="#0A0A0A" onClick={() => void sendText()} loading={processing} disabled={!text.trim() || recording}>
          Processar texto local
        </Button>
        <Button
          type="button"
          variant="filled"
          color={recording ? 'red' : 'gold'}
          c="#0A0A0A"
          onClick={() => void toggleRecording()}
          loading={processing}
          disabled={processing}
          leftSection={recording ? <Square size={16} /> : <Mic size={16} />}
        >
          {recording
            ? `Parar gravação ${formatRecordClock(elapsed)}`
            : processing
              ? 'Processando áudio...'
              : 'Gravar áudio no microfone'}
        </Button>
        <FileButton onChange={(file) => void sendAudio(file)} accept="audio/*" disabled={busy || recording}>
          {(props) => (
            <Button {...props} type="button" variant="outline" color="gold" disabled={busy || recording}>
              Enviar arquivo de áudio
            </Button>
          )}
        </FileButton>
        <Button
          type="button"
          variant="subtle"
          color="gray"
          disabled={busy || recording || messages.length === 0}
          onClick={() => {
            clearWhatsAppLabMessages()
            setMessages([])
            setFeedback(null)
          }}
        >
          Limpar histórico local
        </Button>
      </Group>
    </Stack>
  )
}
