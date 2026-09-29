import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  normalizeMessageContent,
  getContentType,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode'
import fs from 'fs'
import path from 'path'
import { adminDb } from '../lib/firebaseAdmin.mjs'
import { handleDivaMessage } from '../agent/divaLocal.mjs'
import { readBotActive } from '../routes/settings.mjs'
import { generateAudioMessage } from './elevenlabsService.mjs'
import { transcribeWhatsAppAudio } from './whatsappAudio.mjs'

// Pasta segura local para armazenamento das sessões por tenant
const SESSIONS_DIR = path.resolve(process.cwd(), 'server', 'sessions')
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

// Mapa em memória de sessões ativas: tenantId -> { sock, status, qrCode, phoneNumber, reconnectAttempts, ... }
const activeSessions = new Map()

const logger = pino({ level: 'silent' })
const chatLanes = new Map()
const seenMessageIds = new Set()
const AUDIO_FAIL_REPLY = 'Não consegui ouvir o seu áudio, poderia escrever?'

function enqueueChat(jid, task) {
  const previous = chatLanes.get(jid) || Promise.resolve()
  const run = previous
    .catch((err) => {
      console.error(`[WhatsApp] fila liberada após erro em ${jid}: ${err?.message || err}`)
    })
    .then(task)
  chatLanes.set(jid, run)
  return run
}

function rememberMessage(id) {
  if (!id || seenMessageIds.has(id)) return false
  seenMessageIds.add(id)
  if (seenMessageIds.size > 500) seenMessageIds.delete(seenMessageIds.values().next().value)
  return true
}

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

function expectedBusinessPhone() {
  return cleanPhoneNumber(process.env.WHATSAPP_BUSINESS_NUMBER || '')
}

function phoneFromCredsFile(credsFile) {
  try {
    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'))
    return cleanPhoneNumber(String(creds?.me?.id || '').split(':')[0].split('@')[0])
  } catch {
    return ''
  }
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
      const expectedPhone = expectedBusinessPhone()
      if (expectedPhone && session && !session.pairingRequested) {
        session.pairingRequested = true
        try {
          const pairingCode = await sock.requestPairingCode(expectedPhone)
          session.pairingCode = pairingCode
          console.log(
            `[WhatsApp Baileys] Código para parear ${expectedPhone}: ${pairingCode}. No celular: Aparelhos conectados > Conectar aparelho > Conectar com número de telefone.`,
          )
        } catch (pairErr) {
          session.pairingRequested = false
          console.error(`[WhatsApp Baileys] Falha ao pedir código de pareamento para ${expectedPhone}: ${pairErr.message}`)
        }
      }
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
      const expectedPhone = expectedBusinessPhone()

      if (expectedPhone && phoneNumber && phoneNumber !== expectedPhone) {
        console.warn(
          `[WhatsApp Baileys] Sessão do número ${phoneNumber} descartada. O número ativo deve ser ${expectedPhone}.`,
        )
        try {
          await sock.logout()
        } catch (err) {
          try {
            sock.end(undefined)
          } catch (e) {}
        }
        return
      }

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
      console.log(`[WhatsApp] listener ativo para texto e audioMessage no número ${phoneNumber}`)
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
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    const batch = Array.isArray(messages) ? messages : []
    console.log(`[WhatsApp] upsert type=${type} mensagens=${batch.length} tenant=${tenantId}`)

    for (const msg of batch) {
      const remoteJid = msg.key?.remoteJid || ''
      const messageId = msg.key?.id || ''
      const content = msg.message ? normalizeMessageContent(msg.message) || msg.message : null
      const contentType = content ? getContentType(content) || 'desconhecido' : 'sem_message'
      const isAudio = contentType === 'audioMessage' || Boolean(content?.audioMessage)
      const ageSec = msg.messageTimestamp
        ? Math.floor(Date.now() / 1000) - Number(msg.messageTimestamp)
        : 0
      const preview =
        content?.conversation ||
        content?.extendedTextMessage?.text ||
        (isAudio ? '[audio]' : '')
      console.log(
        `[WhatsApp] item id=${messageId || '?'} type=${type} conteudo=${contentType} fromMe=${!!msg.key?.fromMe} idade=${ageSec}s jid=${remoteJid} texto=${JSON.stringify(String(preview).slice(0, 80))}`,
      )

      if (!content) continue
      if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') continue
      if (msg.key?.fromMe) continue
      if (type !== 'notify' && ageSec > 180) {
        console.log(`[WhatsApp] ignorada id=${messageId || '?'} motivo=historico type=${type} idade=${ageSec}s`)
        continue
      }
      if (messageId && !rememberMessage(messageId)) {
        console.log(`[WhatsApp] ignorada id=${messageId} motivo=duplicada`)
        continue
      }

      const contactPhone = cleanPhoneNumber(remoteJid.replace(/@.*/, '').replace(/:\d+$/, ''))
      if (!contactPhone) {
        console.log(`[WhatsApp] ignorada id=${messageId || '?'} motivo=jid_sem_telefone jid=${remoteJid}`)
        continue
      }

      void enqueueChat(remoteJid, async () => {
        try {
          let text =
            content.conversation ||
            content.extendedTextMessage?.text ||
            content.imageMessage?.caption ||
            content.videoMessage?.caption ||
            ''
          let transcriptionFailed = false

          if (isAudio) {
            console.log(`[WhatsApp Áudio] etapa=fila id=${messageId || '?'} a transcrição não bloqueia as próximas mensagens além do timeout`)
            const heard = await transcribeWhatsAppAudio({ sock, msg, content, logger })
            if (heard.text) {
              text = heard.text
              console.log(`[WhatsApp Áudio] etapa=texto_para_diva chars=${text.length}`)
            } else {
              transcriptionFailed = true
              text = '[áudio não transcrito]'
              console.error(`[WhatsApp Áudio] etapa=transcricao_encerrada motivo=${heard.error || 'desconhecido'}`)
            }
          } else if (!text) {
            text = content.imageMessage ? '📷 [Foto]' : content.documentMessage ? '📄 [Documento]' : ''
          }

          await handleMessagePipeline(tenantId, {
            externalMessageId: messageId || `msg_${Date.now()}`,
            contactPhone,
            contactName: msg.pushName || contactPhone,
            text,
            direction: 'incoming',
            sender: 'client',
            timestamp: new Date((Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
            messageType: isAudio ? 'audio' : content.imageMessage ? 'image' : 'text',
            sock,
            remoteJid,
            transcriptionFailed,
            incomingAudio: isAudio,
          })
        } catch (msgErr) {
          console.error(`[WhatsApp Baileys] Erro no processamento de mensagem para "${tenantId}":`, msgErr)
          if (isAudio) {
            try {
              await sock.sendMessage(remoteJid, { text: AUDIO_FAIL_REPLY })
              console.log('[WhatsApp Áudio] etapa=resposta_fallback_erro fila liberada')
            } catch (sendErr) {
              console.error(`[WhatsApp Áudio] etapa=fallback_envio_falha ${sendErr.message}`)
            }
          }
        }
      })
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
  const {
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
    transcriptionFailed = false,
    incomingAudio = false,
  } = data

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

  // 4. Mensagens do Baileys são respondidas só pela Diva. A UAZAPI não é chamada neste processo.
  if (isIncoming && convPayload.assignedTo !== 'human') {
    try {
      const { botAtivo } = await readBotActive(tenantId)
      if (!botAtivo) {
        console.log(`[Diva] bot desligado tenant=${tenantId} telefone=${contactPhone}. Nenhuma resposta automática.`)
        return
      }
      console.log(`[Diva] mensagem exclusiva para divaLocal tenant=${tenantId} telefone=${contactPhone}. UAZAPI não é encaminhada.`)
      let replyText = ''
      if (transcriptionFailed) {
        replyText = AUDIO_FAIL_REPLY
        console.log(`[WhatsApp Áudio] etapa=resposta_fallback telefone=${contactPhone}`)
      } else if (!String(text || '').trim()) {
        console.log(`[WhatsApp Áudio] etapa=parar motivo=texto_vazio telefone=${contactPhone}`)
        return
      } else {
        if (incomingAudio) {
          console.log(`[WhatsApp Áudio] etapa=texto_entregue_a_diva chars=${String(text).length} texto=${JSON.stringify(String(text).slice(0, 180))}`)
        }
        const aiResult = await handleDivaMessage({
          tenantId,
          sessionId: `${tenantId}:${contactPhone}`,
          telefone: contactPhone,
          nome: existingConv?.divaMemory?.nome || contactName,
          text,
          memory: existingConv?.divaMemory || null,
        })
        replyText = aiResult?.replyText || aiResult?.reply || ''
        await convRef.set(
          {
            divaMemory: {
              nome: aiResult?.nome || existingConv?.divaMemory?.nome || '',
              pedido: aiResult?.pedido || {},
              history: aiResult?.history || [],
            },
          },
          { merge: true },
        )
      }

      if (replyText) {
        await sock.sendMessage(remoteJid, { text: replyText })
        if (incomingAudio) {
          console.log(`[WhatsApp Áudio] etapa=resposta_texto enviada chars=${replyText.length}`)
          await maybeSendVoiceReply({ tenantId, sock, remoteJid, replyText })
        }

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
          text: replyText,
          timestamp: botTimestamp,
          deliveryStatus: 'sent',
          createdAt: botTimestamp,
        })

        // Atualiza a conversa com a última mensagem enviada pela IA
        await convRef.set(
          {
            lastMessage: replyText,
            lastMessageAt: botTimestamp,
            lastMessageDirection: 'outgoing',
            lastInteractionDate: botTimestamp.slice(0, 10),
            updatedAt: botTimestamp,
          },
          { merge: true },
        )
      } else if (incomingAudio) {
        console.warn('[WhatsApp Áudio] etapa=parar motivo=diva_sem_replyText')
      }
    } catch (aiErr) {
      console.error(`[IA Barber] Erro ao responder automaticamente para ${contactPhone}:`, aiErr)
    }
  }
}

async function maybeSendVoiceReply({ tenantId, sock, remoteJid, replyText }) {
  let audioEnabled = false
  let voiceId = String(process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM').trim() || '21m00Tcm4TlvDq8ikWAM'
  let tenantKey = ''
  try {
    const snap = await adminDb.collection('tenants').doc(tenantId).collection('aiSettings').doc('primary').get()
    const data = snap.exists ? snap.data() : {}
    audioEnabled = data.audioEnabled === true
    voiceId = data.elevenlabsVoiceId || voiceId
    tenantKey = String(data.elevenlabsApiKey || '').trim()
  } catch (err) {
    console.error(`[WhatsApp Áudio] etapa=voz_config_erro ${err.message}`)
  }

  const envKey = Boolean(String(process.env.ELEVENLABS_API_KEY || '').trim())
  if (!audioEnabled) {
    console.log(
      `[WhatsApp Áudio] etapa=voz_condicionada audioEnabled=false. Resposta falada não enviada. Texto já foi enviado. ELEVENLABS_API_KEY ${envKey || tenantKey ? 'presente' : 'ausente'}.`,
    )
    return
  }

  console.log(`[WhatsApp Áudio] etapa=voz_inicio voiceId=${voiceId} chaveTenant=${tenantKey ? 'sim' : 'nao'} chaveEnv=${envKey ? 'sim' : 'nao'}`)
  const audio = await generateAudioMessage({
    text: replyText,
    voiceId,
    apiKey: tenantKey || undefined,
    tenantId,
  })
  if (!audio?.buffer) {
    console.error('[WhatsApp Áudio] etapa=voz_falha ElevenLabs não devolveu áudio. A resposta em texto permanece.')
    return
  }

  try {
    await sock.sendMessage(remoteJid, {
      audio: audio.buffer,
      mimetype: 'audio/mpeg',
      ptt: true,
    })
    console.log(`[WhatsApp Áudio] etapa=voz_enviada bytes=${audio.buffer.length}`)
  } catch (err) {
    console.error(`[WhatsApp Áudio] etapa=voz_envio_falha ${err.message}. A resposta em texto permanece.`)
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
          const savedPhone = phoneFromCredsFile(credsFile)
          const expectedPhone = expectedBusinessPhone()
          if (expectedPhone && savedPhone && savedPhone !== expectedPhone) {
            console.warn(
              `[WhatsApp Baileys] Removendo sessão salva do número ${savedPhone}. A conexão ativa fica só com ${expectedPhone}.`,
            )
            fs.rmSync(fullPath, { recursive: true, force: true })
            initSession(tenantId).catch((err) => {
              console.error(`[WhatsApp Baileys] Falha ao abrir sessão nova para "${tenantId}":`, err.message)
            })
            continue
          }
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
