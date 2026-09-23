import { LOCAL_AUDIO_SESSION_ID } from './localDivaAudio'
import { makeLocalQrDataUrl } from './localQr'

export const WHATSAPP_LAB_KEY = 'barbearia_whatsapp_lab'

export type LabChatMessage = {
  id: string
  at: string
  from: 'cliente' | 'bot'
  kind: 'text' | 'audio'
  text: string
  transcript?: string
  audioUrl?: string
}

export type LocalWhatsAppLabState = {
  sessionId: string
  status: 'disconnected' | 'connecting' | 'connected'
  qrcode: string | null
  paircode: string | null
  profileName: string | null
  owner: string | null
  payload: string | null
  qrCreatedAt: number | null
  messages: LabChatMessage[]
}

const PROFILE_NAME = 'Laboratório local (este PC)'
const PROFILE_OWNER = 'local-pc'

function emptyState(): LocalWhatsAppLabState {
  return {
    sessionId: LOCAL_AUDIO_SESSION_ID,
    status: 'disconnected',
    qrcode: null,
    paircode: null,
    profileName: null,
    owner: null,
    payload: null,
    qrCreatedAt: null,
    messages: [],
  }
}

export function loadWhatsAppLab(): LocalWhatsAppLabState {
  if (typeof window === 'undefined') return emptyState()
  try {
    const raw = localStorage.getItem(WHATSAPP_LAB_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<LocalWhatsAppLabState>
    return {
      ...emptyState(),
      ...parsed,
      sessionId: LOCAL_AUDIO_SESSION_ID,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    }
  } catch {
    return emptyState()
  }
}

function saveWhatsAppLab(state: LocalWhatsAppLabState) {
  localStorage.setItem(WHATSAPP_LAB_KEY, JSON.stringify(state))
  return state
}

function nonce(len = 6) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)]
  return out
}

function toResult(state: LocalWhatsAppLabState, action: string) {
  return {
    ok: true as const,
    action,
    qrcode: state.qrcode,
    paircode: state.paircode,
    status: state.status,
    data: {
      instance: {
        status: state.status,
        profileName: state.profileName,
        owner: state.owner,
        connected: state.status === 'connected',
      },
    },
  }
}

export function connectWhatsAppLab() {
  const current = loadWhatsAppLab()
  if (current.status === 'connected') return toResult(current, 'connect')

  const token = nonce(8)
  const payload = `lab://w/${token}`.slice(0, 17)
  const qrcode = makeLocalQrDataUrl(payload)
  const paircode = `LAB-${token.slice(0, 4).toUpperCase()}`
  const next = saveWhatsAppLab({
    ...current,
    status: 'connecting',
    qrcode,
    paircode,
    payload,
    qrCreatedAt: Date.now(),
    profileName: null,
    owner: null,
  })
  return toResult(next, 'connect')
}

export function statusWhatsAppLab() {
  return toResult(loadWhatsAppLab(), 'status')
}

export function disconnectWhatsAppLab() {
  const current = loadWhatsAppLab()
  const next = saveWhatsAppLab({
    ...emptyState(),
    messages: current.messages,
  })
  return toResult(next, 'disconnect')
}

export function simulateWhatsAppLabScan() {
  const current = loadWhatsAppLab()
  if (current.status === 'disconnected' && !current.qrcode) {
    return {
      ok: false as const,
      action: 'simulate_scan',
      status: 'disconnected',
      error: 'Gere o QR code local antes de simular a leitura.',
    }
  }
  const next = saveWhatsAppLab({
    ...current,
    status: 'connected',
    qrcode: null,
    paircode: null,
    profileName: PROFILE_NAME,
    owner: PROFILE_OWNER,
  })
  return toResult(next, 'simulate_scan')
}

export function appendWhatsAppLabMessage(message: Omit<LabChatMessage, 'id' | 'at'> & { id?: string; at?: string }) {
  const current = loadWhatsAppLab()
  const entry: LabChatMessage = {
    id: message.id || `lab-msg-${Date.now()}-${nonce(4)}`,
    at: message.at || new Date().toISOString(),
    from: message.from,
    kind: message.kind,
    text: message.text,
    transcript: message.transcript,
    audioUrl: message.audioUrl,
  }
  const next = saveWhatsAppLab({
    ...current,
    messages: [...current.messages, entry].slice(-40),
  })
  return entry
}

export function clearWhatsAppLabMessages() {
  const current = loadWhatsAppLab()
  saveWhatsAppLab({ ...current, messages: [] })
}

export function guessClientName(text: string) {
  const match = text.match(/(?:eu sou|meu nome(?: é)?|aqui é(?: o| a)?|fala(?:,)?)\s+([A-Za-zÀ-ÿ]{2,})/i)
  return match?.[1] || ''
}
