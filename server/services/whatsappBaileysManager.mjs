import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode'
import fs from 'fs'
import path from 'path'
import { adminDb } from '../lib/firebaseAdmin.mjs'
import { processConversationMessage } from './stateMachine.mjs'

// Pasta segura local para armazenamento das sessões por tenant
const SESSIONS_DIR = path.resolve(process.cwd(), 'server', 'sessions')
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

// Mapa em memória de sessões ativas: tenantId -> { sock, status, qrCode, phoneNumber, reconnectAttempts, ... }
const activeSessions = new Map()

const logger = pino({ level: 'silent' })

/**
 * Atualiza o documento de conexão do WhatsApp da barbearia no Firestore
 */
async function updateTenantConnectionDoc(tenantId, data) {
  try {
    const connRef = adminDb
      .collection('tenants')
      .doc(tenantId)
      .collection('whatsappConnections')
      .doc('current')

    await connRef.set(
      {
        tenantId,
        shopId: tenantId,
        ...data,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )
  } catch (err) {
    console.error(`[Baileys updateTenantConnectionDoc] Erro ao atualizar status para tenant ${tenantId}:`, err.message)
  }
}

/**
 * Normaliza número de telefone (remove caracteres não numéricos)
 */
function cleanPhoneNumber(phone) {
  if (!phone) return ''
  return phone.replace(/\D/g, '')
}

/**
 * Inicializa ou recupera a sessão do WhatsApp Web para um tenant específico
 */
export async function initSession(tenantId) {
  if (!tenantId) throw new Error('tenantId é obrigatório')

  // Se já existir um socket aberto para este tenant, encerra e remove listeners
  const existing = activeSessions.get(tenantId)
  if (existing?.sock) {
    try {
      existing.sock.ev.removeAllListeners()
      existing.sock.end(undefined)
    } catch (e) {}
  }

  const sessionPath = path.join(SESSIONS_DIR, tenantId)
  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true })
  }

  console.log(`[WhatsApp Baileys] Inicializando sessão para a barbearia "${tenantId}"...`)

  // Inicializa estado de autenticação multi-arquivo
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
  let version = [2, 3000, 1015901307]
  try {
    const vResult = await fetchLatestBaileysVersion()
    if (vResult?.version) version = vResult.version
  } catch (err) {}

  // Registra no mapa com status 'connecting'
  activeSessions.set(tenantId, {
    sock: null,
    status: 'connecting',
    qrCode: null,
    phoneNumber: null,
    reconnectAttempts: existing?.reconnectAttempts || 0,
    lastQrAt: null,
  })

  await updateTenantConnectionDoc(tenantId, {
    status: 'connecting',
    lastError: null,
  })

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
    browser: ['Barber AI SaaS', 'Chrome', '124.0.0.0'],
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
  })

  const currentSession = activeSessions.get(tenantId)
  if (currentSession) {
    currentSession.sock = sock
  }

  // 1. Monitor de Credenciais com verificação de diretório
  sock.ev.on('creds.update', async () => {
    try {
      if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true })
      }
      await saveCreds()
    } catch (err) {
      // Ignora erro de gravação se a pasta estiver sendo redefinida
    }
  })

  // 2. Monitor de Conexão e QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    const session = activeSessions.get(tenantId)

    // Novo QR Code gerado para autenticação
    if (qr) {
      try {
        const qrDataUrl = await qrcode.toDataURL(qr, { margin: 2, scale: 7 })
        if (session) {
          session.qrCode = qrDataUrl
          session.status = 'waiting_qr'
          session.lastQrAt = new Date().toISOString()
        }

        await updateTenantConnectionDoc(tenantId, {
          status: 'waiting_qr',
          qrCode: qrDataUrl,
          lastQrAt: new Date().toISOString(),
        })
        console.log(`[WhatsApp Baileys] QR Code gerado para barbearia "${tenantId}". Aguardando leitura...`)
      } catch (err) {
        console.error('[WhatsApp Baileys] Erro ao converter QR Code para DataURL:', err)
      }
    }

    // Conexão estabelecida com sucesso
    if (connection === 'open') {
      const rawJid = sock.user?.id || ''
      const phoneNumber = cleanPhoneNumber(rawJid.replace(/:.*@/, '@').split('@')[0])

      if (session) {
        session.status = 'connected'
        session.phoneNumber = phoneNumber
        session.qrCode = null
        session.connectedAt = new Date().toISOString()
        session.reconnectAttempts = 0
      }

      await updateTenantConnectionDoc(tenantId, {
        status: 'connected',
        phoneNumber,
        qrCode: null,
        connectedAt: new Date().toISOString(),
        lastConnectedAt: new Date().toISOString(),
        lastError: null,
      })

      console.log(`[WhatsApp Baileys] ✅ Conectado com sucesso! Barbearia: "${tenantId}", Número: ${phoneNumber}`)
    }

    // Conexão encerrada ou com falha
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      console.log(
        `[WhatsApp Baileys] Conexão encerrada para barbearia "${tenantId}". Código: ${statusCode}, Deve reconectar: ${shouldReconnect}`,
      )

      if (statusCode === DisconnectReason.loggedOut) {
        // Logout realizado no WhatsApp do celular: limpa sessão permanentemente
        try {
          sock.ev.removeAllListeners()
          sock.end(undefined)
        } catch (e) {}

        if (session) {
          session.status = 'disconnected'
          session.phoneNumber = null
          session.qrCode = null
          session.sock = null
        }
        try {
          if (fs.existsSync(sessionPath)) {
            const files = fs.readdirSync(sessionPath)
            for (const file of files) {
              try {
                fs.rmSync(path.join(sessionPath, file), { recursive: true, force: true })
              } catch (e) {}
            }
          }
        } catch (err) {}

        await updateTenantConnectionDoc(tenantId, {
          status: 'disconnected',
          phoneNumber: null,
          qrCode: null,
          lastDisconnectedAt: new Date().toISOString(),
          lastError: 'Sessão desvinculada pelo aplicativo do WhatsApp no celular (Logout).',
        })
      } else {
        // Desconexão temporária ou queda de rede
        if (session) {
          session.status = 'disconnected'
        }

        await updateTenantConnectionDoc(tenantId, {
          status: 'disconnected',
          lastDisconnectedAt: new Date().toISOString(),
          lastError: lastDisconnect?.error?.message || 'Queda temporária de rede ou reinício da sessão',
        })

        // Tentativa de reconexão automática com backoff progressivo
        const attempts = session?.reconnectAttempts || 0
        if (shouldReconnect && attempts < 5) {
          if (session) session.reconnectAttempts = attempts + 1
          const delay = Math.min(30000, 3000 * Math.pow(2, attempts))
          console.log(`[WhatsApp Baileys] Agendando reconexão (${attempts + 1}/5) em ${delay / 1000}s para "${tenantId}"...`)
          setTimeout(() => {
            initSession(tenantId).catch(console.error)
          }, delay)
        }
      }
    }
  })

  // 3. Monitor de Mensagens (Recebimento e Envio)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      try {
        if (!msg.message) continue
        const remoteJid = msg.key.remoteJid || ''

        // Ignora mensagens de grupos (@g.us) e transmissões de status para manter a central limpa
        if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
          continue
        }

        const contactPhone = cleanPhoneNumber(remoteJid.replace('@s.whatsapp.net', ''))
        if (!contactPhone) continue

        const isFromMe = !!msg.key.fromMe

        // Extrai texto da mensagem
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          (msg.message.audioMessage ? '🎵 [Mensagem de Áudio]' : '') ||
          (msg.message.imageMessage ? '📷 [Foto]' : '') ||
          (msg.message.documentMessage ? '📄 [Documento]' : '') ||
          ''

        const contactName = msg.pushName || contactPhone
        const timestamp = new Date((Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000).toISOString()
        const externalMessageId = msg.key.id || `msg_${Date.now()}`
        const direction = isFromMe ? 'outgoing' : 'incoming'
        const sender = isFromMe ? 'human' : 'client'
        const messageType = msg.message.audioMessage ? 'audio' : msg.message.imageMessage ? 'image' : 'text'

        // Executa pipeline de persistência e inteligência artificial
        await handleMessagePipeline(tenantId, {
          externalMessageId,
          contactPhone,
          contactName,
          text,
          direction,
          sender,
          timestamp,
          messageType,
          sock,
          remoteJid,
        })
      } catch (msgErr) {
        console.error(`[WhatsApp Baileys] Erro no processamento de mensagem para "${tenantId}":`, msgErr)
      }
    }
  })

  return {
    status: currentSession?.status || 'connecting',
    phoneNumber: currentSession?.phoneNumber || null,
    qrCode: currentSession?.qrCode || null,
  }
}

/**
 * Pipeline de armazenamento no Firestore e decisão de resposta da IA
 */
async function handleMessagePipeline(tenantId, data) {
  const { externalMessageId, contactPhone, contactName, text, direction, sender, timestamp, messageType, sock, remoteJid } =
    data

  // 1. Atualiza ou cria contato em tenants/{tenantId}/contacts/{contactPhone}
  const contactRef = adminDb.collection('tenants').doc(tenantId).collection('contacts').doc(contactPhone)
  await contactRef.set(
    {
      shopId: tenantId,
      tenantId,
      phoneNumber: contactPhone,
      name: contactName,
      updatedAt: timestamp,
    },
    { merge: true },
  )

  // 2. Busca ou cria documento da conversa em tenants/{tenantId}/conversations/{contactPhone}
  const convRef = adminDb.collection('tenants').doc(tenantId).collection('conversations').doc(contactPhone)
  const convSnap = await convRef.get()
  const existingConv = convSnap.exists ? convSnap.data() : null

  const isIncoming = direction === 'incoming'
  const unreadCount = isIncoming ? (existingConv?.unreadCount || 0) + 1 : 0
  const todayStr = timestamp.slice(0, 10)

  const convPayload = {
    shopId: tenantId,
    tenantId,
    contactId: contactPhone,
    phoneNumber: contactPhone,
    contactName: contactName || existingConv?.contactName || contactPhone,
    lastMessage: text,
    lastMessageAt: timestamp,
    lastMessageDirection: direction,
    lastInteractionDate: todayStr,
    unreadCount,
    status: existingConv?.status || 'active',
    assignedTo: existingConv?.assignedTo || 'ai',
    aiEnabled: existingConv?.aiEnabled !== false,
    updatedAt: timestamp,
  }

  if (!existingConv) {
    convPayload.createdAt = timestamp
  }

  await convRef.set(convPayload, { merge: true })

  // 3. Salva mensagem na subcoleção tenants/{tenantId}/conversations/{contactPhone}/messages/{externalMessageId}
  const msgRef = convRef.collection('messages').doc(externalMessageId)
  await msgRef.set(
    {
      id: externalMessageId,
      shopId: tenantId,
      tenantId,
      conversationId: contactPhone,
      externalMessageId,
      sender,
      direction,
      messageType,
      text,
      timestamp,
      deliveryStatus: 'delivered',
      createdAt: timestamp,
    },
    { merge: true },
  )

  // 4. Se a mensagem for recebida (incoming), verifica se a IA deve intervir
  if (isIncoming && convPayload.aiEnabled && convPayload.assignedTo !== 'human') {
    try {
      console.log(`[IA Barber] Processando mensagem recebida de ${contactPhone} para barbearia "${tenantId}"...`)

      // Aciona máquina de estados do Barber AI
      const aiResult = await processConversationMessage({
        tenantId,
        clientPhone: contactPhone,
        messageText: text,
        phoneNumberId: null, // indica uso local/Baileys
        accessToken: null,
      })

      if (aiResult?.replyText) {
        // Envia resposta automática pelo WhatsApp conectado
        await sock.sendMessage(remoteJid, { text: aiResult.replyText })

        const botMsgId = `bot_${Date.now()}`
        const botTimestamp = new Date().toISOString()

        // Registra a resposta da IA no histórico da conversa
        await convRef.collection('messages').doc(botMsgId).set({
          id: botMsgId,
          shopId: tenantId,
          tenantId,
          conversationId: contactPhone,
          externalMessageId: botMsgId,
          sender: 'bot',
          direction: 'outgoing',
          messageType: 'text',
          text: aiResult.replyText,
          timestamp: botTimestamp,
          deliveryStatus: 'sent',
          createdAt: botTimestamp,
        })

        // Atualiza a conversa com a última mensagem enviada pela IA
        await convRef.set(
          {
            lastMessage: aiResult.replyText,
            lastMessageAt: botTimestamp,
            lastMessageDirection: 'outgoing',
            lastInteractionDate: botTimestamp.slice(0, 10),
            updatedAt: botTimestamp,
          },
          { merge: true },
        )
      }
    } catch (aiErr) {
      console.error(`[IA Barber] Erro ao responder automaticamente para ${contactPhone}:`, aiErr)
    }
  }
}

/**
 * Retorna o status da sessão em tempo real
 */
export function getSessionStatus(tenantId) {
  const session = activeSessions.get(tenantId)
  if (!session) {
    return {
      status: 'disconnected',
      phoneNumber: null,
      qrCode: null,
    }
  }

  return {
    status: session.status,
    phoneNumber: session.phoneNumber,
    qrCode: session.qrCode,
    connectedAt: session.connectedAt || null,
    lastQrAt: session.lastQrAt || null,
  }
}

/**
 * Desconecta a sessão e limpa credenciais com segurança
 */
export async function disconnectSession(tenantId) {
  const session = activeSessions.get(tenantId)
  if (session?.sock) {
    try {
      await session.sock.logout()
    } catch (e) {
      try {
        session.sock.end(undefined)
      } catch (err) {}
    }
  }

  activeSessions.delete(tenantId)

  // Remove arquivos locais de credenciais mantendo o diretório
  const sessionPath = path.join(SESSIONS_DIR, tenantId)
  try {
    if (fs.existsSync(sessionPath)) {
      const files = fs.readdirSync(sessionPath)
      for (const file of files) {
        try {
          fs.rmSync(path.join(sessionPath, file), { recursive: true, force: true })
        } catch (e) {}
      }
    }
  } catch (err) {}

  await updateTenantConnectionDoc(tenantId, {
    status: 'disconnected',
    phoneNumber: null,
    qrCode: null,
    lastDisconnectedAt: new Date().toISOString(),
    lastError: 'Desconectado manualmente pelo usuário',
  })

  return { success: true, status: 'disconnected' }
}

/**
 * Envia uma mensagem de texto a partir da Central de Atendimento Humano
 */
export async function sendAttendantMessage(tenantId, contactPhone, text) {
  if (!text || !text.trim()) throw new Error('Mensagem não pode ser vazia')

  const session = activeSessions.get(tenantId)
  if (!session?.sock || session.status !== 'connected') {
    throw new Error('WhatsApp não está conectado para esta barbearia. Conecte via QR Code antes de enviar.')
  }

  const cleanPhone = cleanPhoneNumber(contactPhone)
  const remoteJid = `${cleanPhone}@s.whatsapp.net`

  // Dispara envio real pelo Baileys
  const sentMsg = await session.sock.sendMessage(remoteJid, { text: text.trim() })
  const messageId = sentMsg?.key?.id || `att_${Date.now()}`
  const now = new Date().toISOString()

  // Registra no Firestore como mensagem do atendente humano
  const convRef = adminDb.collection('tenants').doc(tenantId).collection('conversations').doc(cleanPhone)

  await convRef.collection('messages').doc(messageId).set({
    id: messageId,
    shopId: tenantId,
    tenantId,
    conversationId: cleanPhone,
    externalMessageId: messageId,
    sender: 'human',
    direction: 'outgoing',
    messageType: 'text',
    text: text.trim(),
    timestamp: now,
    deliveryStatus: 'sent',
    createdAt: now,
  })

  // Ao enviar uma mensagem humana, o atendente assume a conversa e a IA é pausada nesta conversa
  await convRef.set(
    {
      lastMessage: text.trim(),
      lastMessageAt: now,
      lastMessageDirection: 'outgoing',
      assignedTo: 'human', // assume atendimento humano
      unreadCount: 0,
      updatedAt: now,
    },
    { merge: true },
  )

  return { success: true, messageId, timestamp: now }
}

/**
 * Restaura sessões ativas existentes no disco após inicialização do servidor
 */
export async function restoreAllSessions() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return

    const dirs = fs.readdirSync(SESSIONS_DIR)
    for (const tenantId of dirs) {
      const fullPath = path.join(SESSIONS_DIR, tenantId)
      if (fs.statSync(fullPath).isDirectory()) {
        const credsFile = path.join(fullPath, 'creds.json')
        if (fs.existsSync(credsFile)) {
          console.log(`[WhatsApp Baileys] Restaurando sessão salva para a barbearia "${tenantId}"...`)
          initSession(tenantId).catch((err) => {
            console.error(`[WhatsApp Baileys] Falha ao restaurar sessão "${tenantId}":`, err.message)
          })
        }
      }
    }
  } catch (err) {
    console.error('[WhatsApp Baileys] Erro ao restaurar sessões existentes:', err)
  }
}

/**
 * Retorna o ID do tenant com sessão ativa ou conectada no momento
 */
export function getActiveTenantId() {
  for (const [tenantId, session] of activeSessions.entries()) {
    if (session.status === 'connected' || session.status === 'connecting' || session.status === 'qr_ready') {
      return tenantId
    }
  }
  if (activeSessions.size > 0) {
    return Array.from(activeSessions.keys())[0]
  }
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      const dirs = fs.readdirSync(SESSIONS_DIR).filter((d) => {
        try {
          const fullPath = path.join(SESSIONS_DIR, d)
          return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'creds.json'))
        } catch {
          return false
        }
      })
      if (dirs.length > 0) return dirs[0]
    }
  } catch {}
  return null
}
