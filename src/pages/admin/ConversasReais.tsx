import { useState, useEffect, useRef } from 'react'
import {
  Search,
  Bot,
  User,
  Send,
  Phone,
  Calendar,
  Clock,
  CheckCheck,
  CheckCircle,
  MessageSquare,
  Scissors,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import { useAuth } from '../../lib/firebaseAuth'
import { resolveTenantId } from '../../lib/api'
import { Link } from '@tanstack/react-router'

interface Conversation {
  id: string
  contactName: string
  phoneNumber: string
  lastMessage: string
  lastMessageAt: string
  lastMessageDirection: 'incoming' | 'outgoing'
  lastInteractionDate?: string
  unreadCount?: number
  status: 'active' | 'completed'
  assignedTo: 'ai' | 'human'
  aiEnabled: boolean
}

interface Message {
  id: string
  conversationId: string
  sender: 'client' | 'bot' | 'human'
  direction: 'incoming' | 'outgoing'
  text: string
  timestamp: string
  messageType?: 'text' | 'audio' | 'image'
  deliveryStatus?: 'sent' | 'delivered' | 'read'
}

interface ClientAppointment {
  id: string
  date: string
  data?: string
  time: string
  horario?: string
  serviceName?: string
  barberName?: string
  price?: number
  valor?: number
  status: string
}

export default function ConversasReais() {
  const { tenant } = useAuth()
  const [resolvedTId, setResolvedTId] = useState<string>(tenant?.id || 'barbearia-principal')

  // Estados de navegação e filtros
  const [filter, setFilter] = useState<'all' | 'today' | 'unread' | 'human' | 'completed'>('all')
  const [search, setSearch] = useState('')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)

  // Estados da conversa selecionada
  const [messages, setMessages] = useState<Message[]>([])
  const [appointments, setAppointments] = useState<ClientAppointment[]>([])
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)

  // Input de envio e estados de carregamento
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [showScrollDown, setShowScrollDown] = useState(false)

  // Referências para controle fino do scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const listPollRef = useRef<any>(null)
  const msgPollRef = useRef<any>(null)

  // Inicializa resolução robusta de tenantId
  useEffect(() => {
    let active = true
    async function init() {
      const tId = await resolveTenantId(tenant?.id)
      if (active) setResolvedTId(tId)
    }
    init()
    return () => {
      active = false
    }
  }, [tenant?.id])

  // 1. Carrega lista de conversas
  const loadConversations = async (showLoading = false) => {
    if (showLoading) setLoadingList(true)
    try {
      const res = await fetch(
        `/api/conversations?tenantId=${resolvedTId}&filter=${filter}&search=${encodeURIComponent(search)}`
      )
      if (!res.ok) throw new Error('Falha ao buscar conversas')
      const data = await res.json()
      const list: Conversation[] = data.conversations || []
      setConversations(list)

      // Se não tiver conversa selecionada mas houver itens, seleciona a primeira
      if (!selectedConvId && list.length > 0) {
        setSelectedConvId(list[0].phoneNumber)
        setSelectedConv(list[0])
      }
    } catch (err) {
      console.warn('Erro ao carregar lista de conversas:', err)
    } finally {
      if (showLoading) setLoadingList(false)
    }
  }

  useEffect(() => {
    loadConversations(true)
    listPollRef.current = setInterval(() => loadConversations(false), 3000)
    return () => {
      if (listPollRef.current) clearInterval(listPollRef.current)
    }
  }, [resolvedTId, filter, search])

  // 2. Carrega mensagens da conversa selecionada
  const loadMessages = async (convId: string, initialLoad = false) => {
    try {
      const [msgRes, convRes] = await Promise.all([
        fetch(`/api/conversations/${convId}/messages?tenantId=${resolvedTId}`),
        fetch(`/api/conversations/${convId}?tenantId=${resolvedTId}`),
      ])

      if (msgRes.ok) {
        const msgData = await msgRes.json()
        const incomingMsgs: Message[] = msgData.messages || []

        setMessages((prev) => {
          // Evita recriar estado se nada mudou
          if (
            prev.length === incomingMsgs.length &&
            prev[prev.length - 1]?.id === incomingMsgs[incomingMsgs.length - 1]?.id &&
            prev[prev.length - 1]?.deliveryStatus === incomingMsgs[incomingMsgs.length - 1]?.deliveryStatus
          ) {
            return prev
          }
          return incomingMsgs
        })

        if (initialLoad) {
          isNearBottomRef.current = true
          setShowScrollDown(false)
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
          }, 80)
        }
      }

      if (convRes.ok) {
        const convData = await convRes.json()
        setSelectedConv(convData.conversation || null)
        setAppointments(convData.appointments || [])
      }

      // Marca como lida no backend
      fetch(`/api/conversations/${convId}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: resolvedTId }),
      }).catch(() => {})
    } catch (err) {
      console.warn('Erro ao carregar mensagens:', err)
    } finally {
      if (initialLoad) setLoadingMessages(false)
    }
  }

  useEffect(() => {
    if (!selectedConvId) return
    setLoadingMessages(true)
    loadMessages(selectedConvId, true)

    if (msgPollRef.current) clearInterval(msgPollRef.current)
    msgPollRef.current = setInterval(() => {
      loadMessages(selectedConvId, false)
    }, 2000)

    return () => {
      if (msgPollRef.current) clearInterval(msgPollRef.current)
    }
  }, [selectedConvId, resolvedTId])

  // Monitora rolagem manual do usuário na caixa de chat
  const handleScroll = () => {
    if (!scrollContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)
    // O usuário é considerado "no final" se estiver a menos de 100px do fundo
    const isNear = distanceFromBottom < 100
    isNearBottomRef.current = isNear
    setShowScrollDown(!isNear)
  }

  // Scroll automático APENAS se o usuário estiver acompanhando o final do chat
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    isNearBottomRef.current = true
    setShowScrollDown(false)
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  // Seleciona conversa da lista lateral
  const handleSelectConversation = (conv: Conversation) => {
    if (selectedConvId === conv.phoneNumber) return
    setSelectedConvId(conv.phoneNumber)
    setSelectedConv(conv)
    isNearBottomRef.current = true
    setShowScrollDown(false)
  }

  // Envio de mensagem pelo atendente humano
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || !selectedConvId || sending) return

    const textToSend = inputText.trim()
    setInputText('')
    setSending(true)

    // Atualização otimista imediata na interface
    const tempMsg: Message = {
      id: `temp_${Date.now()}`,
      conversationId: selectedConvId,
      sender: 'human',
      direction: 'outgoing',
      text: textToSend,
      timestamp: new Date().toISOString(),
      deliveryStatus: 'sent',
    }
    setMessages((prev) => [...prev, tempMsg])
    scrollToBottom('smooth')

    try {
      const res = await fetch(`/api/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: resolvedTId, text: textToSend }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha no envio da mensagem')
      // Recarrega mensagens reais confirmadas
      loadMessages(selectedConvId, false)
    } catch (err: any) {
      alert(`Erro no envio: ${err.message}`)
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id))
      setInputText(textToSend)
    } finally {
      setSending(false)
    }
  }

  // Alterna o estado da IA na conversa (Ativar / Pausar)
  const handleToggleAI = async () => {
    if (!selectedConvId || !selectedConv) return
    const nextState = !selectedConv.aiEnabled

    try {
      await fetch(`/api/conversations/${selectedConvId}/ai`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: resolvedTId, aiEnabled: nextState }),
      })
      setSelectedConv((prev) =>
        prev ? { ...prev, aiEnabled: nextState, assignedTo: nextState ? 'ai' : 'human' } : null
      )
    } catch (err: any) {
      alert('Erro ao alterar modo da IA: ' + err.message)
    }
  }

  // Conclui / Finaliza atendimento
  const handleCompleteConversation = async () => {
    if (!selectedConvId || !selectedConv) return
    const nextStatus = selectedConv.status === 'completed' ? 'active' : 'completed'
    try {
      await fetch(`/api/conversations/${selectedConvId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: resolvedTId, status: nextStatus }),
      })
      setSelectedConv((prev) => (prev ? { ...prev, status: nextStatus } : null))
      loadConversations(false)
    } catch (err: any) {
      alert('Erro ao alterar status: ' + err.message)
    }
  }

  // Agrupamento por data para cabeçalhos limpos
  const formatMessageDate = (isoStr: string) => {
    if (!isoStr) return ''
    try {
      const d = new Date(isoStr)
      const today = new Date().toDateString()
      if (d.toDateString() === today) return 'Hoje'
      const yesterday = new Date(Date.now() - 86400000).toDateString()
      if (d.toDateString() === yesterday) return 'Ontem'
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch {
      return ''
    }
  }

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col space-y-4">
      {/* Barra de Título Superior */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold font-serif text-barber-gold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-barber-gold" />
            Central de Conversas Reais
          </h2>
          <p className="text-xs text-barber-white/60">
            Caixa de entrada integrada ao WhatsApp conectado para atendimento humano e acompanhamento da IA em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadConversations(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-barber-gold/30 text-barber-gold text-xs hover:bg-barber-gold/10 transition cursor-pointer"
            title="Atualizar lista de conversas"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>

          <Link
            to="/admin/whatsapp-qr"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-barber-gold/30 text-barber-gold text-xs hover:bg-barber-gold/10 transition"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Status do WhatsApp</span>
          </Link>
        </div>
      </div>

      {/* Grid Principal de 3 Colunas */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 overflow-hidden rounded-2xl border border-barber-gold/20 bg-barber-black/60 shadow-2xl">
        {/* ========================================================
            COLUNA 1: LISTA DE CLIENTES E CONVERSAS (md:col-span-4 lg:col-span-3)
           ======================================================== */}
        <div className="md:col-span-4 lg:col-span-3 border-r border-barber-gold/15 flex flex-col h-full bg-barber-gray/20">
          {/* Campo de Busca e Filtros */}
          <div className="p-3 border-b border-barber-gold/10 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-barber-white/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente ou telefone..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-barber-black/80 border border-barber-gold/20 text-xs text-barber-white placeholder:text-barber-white/40 focus:outline-none focus:border-barber-gold"
              />
            </div>

            {/* Filtros de Conversas */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] scrollbar-none">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'today', label: 'Hoje' },
                  { id: 'unread', label: 'Não lidas' },
                  { id: 'human', label: 'Humano' },
                  { id: 'completed', label: 'Finalizadas' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-2.5 py-1 rounded-md shrink-0 font-medium transition cursor-pointer ${
                    filter === f.id
                      ? 'bg-barber-gold text-barber-black font-semibold'
                      : 'text-barber-white/60 hover:bg-barber-gold/10 hover:text-barber-gold'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Contatos */}
          <div className="flex-1 overflow-y-auto divide-y divide-barber-gold/5">
            {loadingList && conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-barber-white/40">
                <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-barber-gold" />
                Carregando clientes...
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-barber-white/50 space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto text-barber-white/20" />
                <p>Nenhuma conversa encontrada.</p>
                <p className="text-[11px] text-barber-white/30">
                  Assim que um cliente enviar uma mensagem para o WhatsApp conectado, o chat aparecerá aqui automaticamente.
                </p>
              </div>
            ) : (
              conversations.map((c) => {
                const isSelected = selectedConvId === c.phoneNumber
                const timeFormatted = c.lastMessageAt
                  ? new Date(c.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                  : ''

                return (
                  <button
                    key={c.id || c.phoneNumber}
                    onClick={() => handleSelectConversation(c)}
                    className={`w-full text-left p-3.5 flex items-start gap-3 transition cursor-pointer ${
                      isSelected
                        ? 'bg-barber-gold/15 border-l-4 border-barber-gold'
                        : 'hover:bg-barber-white/5'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-barber-gold/30 to-barber-gold/10 border border-barber-gold/30 flex items-center justify-center shrink-0 text-barber-gold font-bold text-xs uppercase">
                      {c.contactName ? c.contactName.slice(0, 2) : 'CL'}
                    </div>

                    {/* Informações da Conversa */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-semibold text-barber-white truncate">
                          {c.contactName || c.phoneNumber}
                        </span>
                        <span className="text-[10px] text-barber-white/40 shrink-0">{timeFormatted}</span>
                      </div>

                      <p className="text-[11px] text-barber-white/60 truncate mb-1.5">
                        {c.lastMessage || 'Conversa iniciada'}
                      </p>

                      {/* Badges de Atendimento e Não Lidas */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          {c.assignedTo === 'human' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-medium">
                              <User className="w-2.5 h-2.5" />
                              Humano
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-[10px] text-cyan-400 font-medium">
                              <Bot className="w-2.5 h-2.5" />
                              IA Barber
                            </span>
                          )}

                          {c.status === 'completed' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/10 text-[10px] text-emerald-400">
                              Finalizada
                            </span>
                          )}
                        </div>

                        {(c.unreadCount || 0) > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-barber-gold text-barber-black font-bold text-[10px]">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ========================================================
            COLUNA 2: HISTÓRICO DA CONVERSA (md:col-span-8 lg:col-span-6)
           ======================================================== */}
        <div className="md:col-span-8 lg:col-span-6 flex flex-col h-full bg-barber-black/40 relative">
          {selectedConv ? (
            <>
              {/* Header do Chat */}
              <div className="p-3.5 border-b border-barber-gold/15 flex items-center justify-between bg-barber-gray/30 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-barber-gold/20 border border-barber-gold/40 flex items-center justify-center text-barber-gold font-bold text-xs uppercase">
                    {selectedConv.contactName ? selectedConv.contactName.slice(0, 2) : 'CL'}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-barber-white">{selectedConv.contactName || 'Cliente'}</h3>
                    <p className="text-[11px] text-barber-gold font-mono">+{selectedConv.phoneNumber}</p>
                  </div>
                </div>

                {/* Controles do Chat: IA e Conclusão */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleAI}
                    title={selectedConv.aiEnabled ? 'Pausar respostas automáticas da IA' : 'Reativar IA para agendar'}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      selectedConv.aiEnabled
                        ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                    }`}
                  >
                    {selectedConv.aiEnabled ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    <span>{selectedConv.aiEnabled ? 'IA Ativa' : 'Humano'}</span>
                  </button>

                  <button
                    onClick={handleCompleteConversation}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      selectedConv.status === 'completed'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'border-barber-white/20 text-barber-white/60 hover:text-barber-white hover:bg-barber-white/10'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{selectedConv.status === 'completed' ? 'Reabrir' : 'Finalizar'}</span>
                  </button>
                </div>
              </div>

              {/* Área de Mensagens com Rolagem Independente */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-3.5 relative"
              >
                {loadingMessages && messages.length === 0 ? (
                  <div className="p-8 text-center text-xs text-barber-white/40">
                    <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-barber-gold" />
                    Carregando mensagens...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="p-8 text-center text-xs text-barber-white/40">
                    Nenhuma mensagem registrada nesta conversa ainda.
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const isClient = m.sender === 'client' || m.direction === 'incoming'
                    const isBot = m.sender === 'bot'
                    const isHuman = m.sender === 'human'

                    const timeStr = m.timestamp
                      ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      : ''

                    const currentDate = formatMessageDate(m.timestamp)
                    const prevDate = idx > 0 ? formatMessageDate(messages[idx - 1].timestamp) : ''
                    const showDateSeparator = currentDate && currentDate !== prevDate

                    return (
                      <div key={m.id || idx} className="w-full space-y-2">
                        {/* Separador de Data */}
                        {showDateSeparator && (
                          <div className="flex justify-center my-3">
                            <span className="px-3 py-1 rounded-full bg-barber-gold/10 border border-barber-gold/20 text-[10px] text-barber-gold font-medium">
                              {currentDate}
                            </span>
                          </div>
                        )}

                        {/* Linha da Mensagem - Alinhada rigidamente à esquerda para cliente e à direita para barbearia */}
                        <div className={`w-full flex flex-col ${isClient ? 'items-start' : 'items-end'} space-y-1`}>
                          {/* Identificador do emissor */}
                          <span className="text-[10px] text-barber-white/40 px-1">
                            {isClient && (selectedConv.contactName || 'Cliente')}
                            {isBot && '🤖 IA Barber'}
                            {isHuman && '👤 Atendente'}
                          </span>

                          {/* Balão da Mensagem */}
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-md whitespace-pre-wrap ${
                              isClient
                                ? 'bg-barber-gray/80 text-barber-white border border-barber-gold/20 rounded-tl-none'
                                : isBot
                                  ? 'bg-gradient-to-r from-cyan-950/70 to-slate-900 border border-cyan-500/30 text-cyan-100 rounded-tr-none'
                                  : 'bg-gradient-to-r from-barber-gold to-amber-500 text-barber-black font-medium rounded-tr-none'
                            }`}
                          >
                            {m.text}

                            {/* Rodapé com Horário e Status */}
                            <div
                              className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                                isHuman ? 'text-barber-black/70' : 'text-barber-white/50'
                              }`}
                            >
                              <span>{timeStr}</span>
                              {!isClient && <CheckCheck className="w-3 h-3 text-current" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Botão Flutuante de Scroll para o Fundo (visível apenas quando o usuário subiu para ler) */}
              {showScrollDown && (
                <button
                  onClick={() => scrollToBottom('smooth')}
                  className="absolute bottom-16 right-6 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-barber-gold text-barber-black text-xs font-semibold shadow-xl border border-barber-black/30 hover:bg-barber-gold/90 transition cursor-pointer"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Novas mensagens</span>
                </button>
              )}

              {/* Caixa de Envio de Mensagem */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-barber-gold/15 bg-barber-gray/20 flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Digite uma mensagem para responder pelo WhatsApp..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-barber-black/80 border border-barber-gold/25 text-xs text-barber-white placeholder:text-barber-white/40 focus:outline-none focus:border-barber-gold"
                />
                <button
                  type="submit"
                  disabled={sending || !inputText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-barber-gold text-barber-black font-semibold hover:bg-barber-gold/90 transition flex items-center justify-center gap-1.5 text-xs disabled:opacity-50 cursor-pointer"
                >
                  {sending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Enviar</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-barber-white/40 space-y-3">
              <div className="w-16 h-16 rounded-full bg-barber-gold/10 border border-barber-gold/20 flex items-center justify-center text-barber-gold">
                <MessageSquare className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-barber-white">Nenhuma conversa selecionada</h4>
                <p className="text-xs text-barber-white/50 max-w-xs mt-1">
                  Selecione um cliente na lista à esquerda para acompanhar e responder as mensagens em tempo real.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================
            COLUNA 3: INFORMAÇÕES DO CLIENTE (lg:col-span-3 hidden lg:flex)
           ======================================================== */}
        <div className="hidden lg:flex lg:col-span-3 border-l border-barber-gold/15 flex-col h-full bg-barber-gray/20 p-4 space-y-5 overflow-y-auto">
          {selectedConv ? (
            <>
              {/* Card Perfil do Cliente */}
              <div className="text-center p-4 rounded-xl bg-barber-black/60 border border-barber-gold/15 space-y-2">
                <div className="w-16 h-16 rounded-full bg-barber-gold/20 border-2 border-barber-gold/50 mx-auto flex items-center justify-center text-barber-gold font-bold text-lg uppercase">
                  {selectedConv.contactName ? selectedConv.contactName.slice(0, 2) : 'CL'}
                </div>
                <h4 className="text-sm font-bold text-barber-white">{selectedConv.contactName || 'Cliente'}</h4>
                <p className="text-xs text-barber-gold font-mono">+{selectedConv.phoneNumber}</p>
                <div className="pt-2">
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium">
                    Cliente Ativo
                  </span>
                </div>
              </div>

              {/* Próximo Agendamento */}
              <div className="space-y-2">
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-barber-gold flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Próximo Agendamento
                </h5>

                {appointments.length > 0 ? (
                  <div className="p-3 rounded-xl bg-barber-black/60 border border-barber-gold/20 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-barber-white font-semibold">
                      <span>{appointments[0].serviceName || 'Corte & Barba'}</span>
                      <span className="text-barber-gold">
                        R$ {Number(appointments[0].price || appointments[0].valor || 35).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-barber-white/60 text-[11px]">
                      <Calendar className="w-3 h-3 text-barber-gold" />
                      <span>{appointments[0].date || appointments[0].data}</span>
                      <Clock className="w-3 h-3 text-barber-gold ml-1" />
                      <span>{appointments[0].time || appointments[0].horario}</span>
                    </div>
                    <div className="text-[11px] text-barber-white/50">
                      Barbeiro: {appointments[0].barberName || 'Barbeiro'}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-barber-black/40 border border-barber-gold/10 text-center text-xs text-barber-white/50">
                    Nenhum agendamento futuro encontrado.
                  </div>
                )}
              </div>

              {/* Histórico Recente de Agendamentos */}
              <div className="space-y-2 flex-1">
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-barber-gold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Histórico de Atendimentos
                </h5>

                <div className="space-y-2">
                  {appointments.slice(0, 4).map((a) => (
                    <div
                      key={a.id}
                      className="p-2.5 rounded-lg bg-barber-black/40 border border-barber-gold/10 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-medium text-barber-white">{a.serviceName || 'Serviço'}</div>
                        <div className="text-[10px] text-barber-white/40">
                          {a.date || a.data} · {a.time || a.horario}
                        </div>
                      </div>
                      <span className="text-barber-gold font-mono text-[11px]">
                        R$ {Number(a.price || a.valor || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}

                  {appointments.length === 0 && (
                    <p className="text-xs text-barber-white/40 text-center py-2">Sem histórico anterior.</p>
                  )}
                </div>
              </div>

              {/* Atalho Novo Agendamento */}
              <div className="pt-2">
                <Link
                  to="/admin/appointments"
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-barber-gold/15 border border-barber-gold/30 text-barber-gold hover:bg-barber-gold/25 transition text-xs font-semibold"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Novo Agendamento na Agenda</span>
                </Link>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-xs text-barber-white/30 space-y-2">
              <User className="w-8 h-8 opacity-20" />
              <p>Selecione um contato para ver detalhes cadastrais e histórico de agendamentos.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
