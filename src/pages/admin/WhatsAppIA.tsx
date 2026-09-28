import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Bot,
  Volume2,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Smartphone,
  Sparkles,
  Activity,
  Database,
  Zap,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { PageHeader } from '../../components/PageHeader'
import {
  getWhatsAppConnection,
  saveWhatsAppConnection,
  getAISettings,
  saveAISettings,
  getConversations,
  simulateIncomingWhatsAppMessage,
  resolveTenantId,
} from '../../lib/api'
import type { WhatsAppConnection, AISettings, ConversationState } from '../../types/database'
import { useAuth } from '../../lib/firebaseAuth'

export default function WhatsAppIA() {
  const { tenant } = useAuth()
  const [resolvedTId, setResolvedTId] = useState<string>(tenant?.id || 'barbearia-principal')

  const [activeTab, setActiveTab] = useState<'connection' | 'ai' | 'audio' | 'simulator' | 'history' | 'diagnostico'>('diagnostico')
  const [healthData, setHealthData] = useState<any>(null)
  const [loadingHealth, setLoadingHealth] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Dados da Conexão WhatsApp
  const [waConfig, setWaConfig] = useState<Partial<WhatsAppConnection>>({
    phoneNumberId: '',
    wabaId: '',
    businessPhoneNumber: '',
    webhookVerifyToken: 'barberai_webhook_verify_2026',
    status: 'disconnected',
  })

  // Dados da Configuração de IA
  const [aiConfig, setAiConfig] = useState<Partial<AISettings>>({
    enabled: true,
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    geminiApiKey: '',
    elevenlabsApiKey: '',
    greetingMessage: 'Olá bem-vindo à barbearia, para começarmos qual seu nome?',
    humanHandoffKeyword: 'humano',
    audioEnabled: false,
    elevenlabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
    language: 'pt-BR',
  })

  // Conversas e Simulador
  const [conversas, setConversas] = useState<ConversationState[]>([])
  const [simMessages, setSimMessages] = useState<Array<{ sender: 'client' | 'bot'; text: string; time: string }>>([
    {
      sender: 'bot',
      text: 'Olá bem-vindo à barbearia, para começarmos qual seu nome?',
      time: 'Agora',
    },
  ])
  const [simInput, setSimInput] = useState('')
  const [simStep, setSimStep] = useState<string>('AWAITING_NAME')
  const [simLoading, setSimLoading] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function initTenant() {
      const tId = await resolveTenantId(tenant?.id)
      setResolvedTId(tId)
    }
    initTenant()
  }, [tenant?.id])

  useEffect(() => {
    loadData()
    loadHealthData()
  }, [resolvedTId])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [simMessages])

  async function loadHealthData() {
    setLoadingHealth(true)
    try {
      const res = await fetch('/api/health')
      if (res.ok) {
        const data = await res.json()
        setHealthData(data)
      }
    } catch (e) {
      console.error('Erro ao carregar diagnóstico:', e)
    } finally {
      setLoadingHealth(false)
    }
  }

  async function loadData() {
    try {
      const [wa, ai, convs] = await Promise.all([
        getWhatsAppConnection(resolvedTId),
        getAISettings(resolvedTId),
        getConversations(resolvedTId),
      ])
      if (wa) setWaConfig(wa)
      if (ai) {
        setAiConfig((prev) => ({
          ...prev,
          ...ai,
          geminiApiKey: ai.geminiApiKey || prev.geminiApiKey || '',
        }))
      }
      setConversas(convs)
    } catch (e) {
      console.error('Erro ao carregar dados do WhatsApp/IA:', e)
    }
  }

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const isConnected = !!(waConfig.phoneNumberId && waConfig.wabaId)
      await saveWhatsAppConnection(
        {
          ...waConfig,
          status: isConnected ? 'connected' : 'disconnected',
          lastVerifiedAt: new Date().toISOString(),
        },
        resolvedTId,
      )
      setWaConfig((prev) => ({ ...prev, status: isConnected ? 'connected' : 'disconnected' }))
      setFeedback({ text: 'Configurações de conexão salvas com sucesso!', type: 'success' })
    } catch (err: any) {
      setFeedback({ text: err.message || 'Erro ao salvar conexão.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAI = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      await saveAISettings(aiConfig, resolvedTId)
      setFeedback({ text: 'Chaves de API e configurações de IA salvas com sucesso no banco de dados!', type: 'success' })
    } catch (err: any) {
      setFeedback({ text: err.message || 'Erro ao salvar IA.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleSendSimulator = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!simInput.trim() || simLoading) return

    const userText = simInput.trim()
    setSimInput('')
    setSimMessages((prev) => [...prev, { sender: 'client', text: userText, time: 'Agora' }])
    setSimLoading(true)

    try {
      const res = await simulateIncomingWhatsAppMessage(resolvedTId, '5511999998888', userText)
      setSimStep(res.state.currentStep)
      setSimMessages((prev) => [...prev, { sender: 'bot', text: res.replyText, time: 'Agora' }])
    } catch (err) {
      setSimMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: 'Desculpe, ocorreu uma instabilidade momentânea na conexão. Por favor, tente novamente.',
          time: 'Agora',
        },
      ])
    } finally {
      setSimLoading(false)
    }
  }

  const handleCopyWebhookUrl = () => {
    const url = `${window.location.origin}/api/webhook/whatsapp`
    navigator.clipboard.writeText(url)
    setFeedback({ text: 'URL do Webhook copiada para a área de transferência!', type: 'success' })
  }

  const handleResetSimulator = () => {
    setSimMessages([
      {
        sender: 'bot',
        text: aiConfig.greetingMessage || 'Olá bem-vindo à barbearia, para começarmos qual seu nome?',
        time: 'Agora',
      },
    ])
    setSimStep('AWAITING_NAME')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp e Atendimento por IA"
        description="Conecte seu WhatsApp Business oficial, configure o motor de IA (Gemini), respostas por áudio (ElevenLabs) e acompanhe os atendimentos."
      />

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-4 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-barber-gold/20 pb-4">
        <button
          onClick={() => { setActiveTab('diagnostico'); loadHealthData(); }}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'diagnostico'
              ? 'bg-barber-gold text-barber-black font-semibold'
              : 'text-barber-white/70 hover:bg-barber-gold/10 hover:text-barber-gold'
          }`}
        >
          <Activity className="h-4 w-4" />
          {healthData?.overall === 'healthy' ? '🟢' : '🔴'} Diagnóstico do Sistema
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'simulator'
              ? 'bg-barber-gold text-barber-black font-semibold'
              : 'text-barber-white/70 hover:bg-barber-gold/10 hover:text-barber-gold'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Simulador do Bot (Tempo Real)
        </button>

        <button
          onClick={() => setActiveTab('connection')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'connection'
              ? 'bg-barber-gold text-barber-black font-semibold'
              : 'text-barber-white/70 hover:bg-barber-gold/10 hover:text-barber-gold'
          }`}
        >
          <Smartphone className="h-4 w-4" />
          Conexão WhatsApp Cloud API
        </button>

        <button
          onClick={() => setActiveTab('ai')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'ai'
              ? 'bg-barber-gold text-barber-black font-semibold'
              : 'text-barber-white/70 hover:bg-barber-gold/10 hover:text-barber-gold'
          }`}
        >
          <Bot className="h-4 w-4" />
          Roteiro & Motor IA (Gemini)
        </button>

        <button
          onClick={() => setActiveTab('audio')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'audio'
              ? 'bg-barber-gold text-barber-black font-semibold'
              : 'text-barber-white/70 hover:bg-barber-gold/10 hover:text-barber-gold'
          }`}
        >
          <Volume2 className="h-4 w-4" />
          Áudio & Voz (ElevenLabs)
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-barber-gold text-barber-black font-semibold'
              : 'text-barber-white/70 hover:bg-barber-gold/10 hover:text-barber-gold'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Conversas Recentes ({conversas.length})
        </button>
      </div>

      {/* Conteúdo da Tab: DIAGNÓSTICO DO SISTEMA */}
      {activeTab === 'diagnostico' && (
        <div className="max-w-4xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif text-lg font-bold text-barber-gold flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Diagnóstico em Tempo Real
              </h3>
              <p className="text-xs text-barber-white/60 mt-1">
                Verifica se todas as integrações e dados estão corretamente configurados para o atendimento funcionar sem erros.
              </p>
            </div>
            <button
              onClick={loadHealthData}
              disabled={loadingHealth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-barber-gold/30 text-barber-gold text-xs hover:bg-barber-gold/10 transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          {!healthData ? (
            <div className="py-12 text-center text-sm text-barber-white/50">
              <RefreshCw className="h-6 w-6 mx-auto animate-spin mb-3 text-barber-gold" />
              Verificando integrações...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Status Geral */}
              <div className={`md:col-span-2 rounded-2xl border p-5 ${
                healthData.overall === 'healthy'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-red-500/30 bg-red-500/5'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    healthData.overall === 'healthy' ? 'bg-emerald-500/20' : 'bg-red-500/20'
                  }`}>
                    {healthData.overall === 'healthy'
                      ? <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                      : <AlertCircle className="h-6 w-6 text-red-400" />}
                  </div>
                  <div>
                    <h4 className={`text-sm font-bold ${
                      healthData.overall === 'healthy' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {healthData.overall === 'healthy'
                        ? '✅ SISTEMA OPERACIONAL — Todas as integrações ativas'
                        : '⚠️ SISTEMA DEGRADADO — Verifique os itens abaixo'}
                    </h4>
                    <p className="text-[11px] text-barber-white/50">
                      Tenant: {healthData.tenantId} • Última verificação: {new Date(healthData.timestamp).toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Card: Firebase */}
              <div className={`rounded-2xl border p-4 space-y-2 ${
                healthData.firebase?.status === 'ok' ? 'border-emerald-500/20 bg-barber-gray/30' : 'border-red-500/30 bg-red-500/5'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-barber-gold" />
                    <span className="text-xs font-bold text-barber-white">Firebase Firestore</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    healthData.firebase?.status === 'ok'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {healthData.firebase?.status === 'ok' ? 'CONECTADO' : 'ERRO'}
                  </span>
                </div>
                <p className="text-[11px] text-barber-white/60">{healthData.firebase?.detail}</p>
              </div>

              {/* Card: Gemini API */}
              <div className={`rounded-2xl border p-4 space-y-2 ${
                healthData.gemini?.status === 'ok' ? 'border-emerald-500/20 bg-barber-gray/30' : 'border-red-500/30 bg-red-500/5'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-barber-gold" />
                    <span className="text-xs font-bold text-barber-white">Google Gemini API</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    healthData.gemini?.status === 'ok'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {healthData.gemini?.status === 'ok' ? 'ATIVA' : 'INATIVA'}
                  </span>
                </div>
                <p className="text-[11px] text-barber-white/60">{healthData.gemini?.detail}</p>
                {healthData.gemini?.model && (
                  <p className="text-[10px] text-barber-gold font-mono">Modelo: {healthData.gemini.model}</p>
                )}
              </div>

              {/* Card: WhatsApp */}
              <div className={`rounded-2xl border p-4 space-y-2 ${
                healthData.whatsapp?.status === 'ok' ? 'border-emerald-500/20 bg-barber-gray/30' : 'border-red-500/30 bg-red-500/5'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {healthData.whatsapp?.status === 'ok'
                      ? <Wifi className="h-4 w-4 text-emerald-400" />
                      : <WifiOff className="h-4 w-4 text-red-400" />}
                    <span className="text-xs font-bold text-barber-white">WhatsApp Web (Baileys)</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    healthData.whatsapp?.status === 'ok'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {healthData.whatsapp?.status === 'ok' ? 'CONECTADO' : 'DESCONECTADO'}
                  </span>
                </div>
                <p className="text-[11px] text-barber-white/60">{healthData.whatsapp?.detail}</p>
                {healthData.whatsapp?.phoneNumber && (
                  <p className="text-[10px] text-barber-gold font-mono">+{healthData.whatsapp.phoneNumber}</p>
                )}
              </div>

              {/* Card: Dados Cadastrados */}
              <div className="rounded-2xl border border-barber-gold/20 bg-barber-gray/30 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Database className="h-4 w-4 text-barber-gold" />
                  <span className="text-xs font-bold text-barber-white">Dados Cadastrados da Barbearia</span>
                </div>

                {/* Serviços */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-barber-white/70 font-medium">Serviços Ativos</span>
                    <span className={`text-[10px] font-bold ${
                      (healthData.dados?.servicos?.total || 0) > 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {healthData.dados?.servicos?.total || 0}
                    </span>
                  </div>
                  {healthData.dados?.servicos?.lista?.length > 0 ? (
                    <div className="space-y-1">
                      {healthData.dados.servicos.lista.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between bg-barber-black/40 rounded-lg px-2.5 py-1.5">
                          <span className="text-[11px] text-barber-white">{s.nome}</span>
                          <span className="text-[11px] font-bold text-barber-gold">R$ {s.preco},00</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-red-400">⚠️ Nenhum serviço cadastrado — o bot não conseguirá oferecer serviços reais!</p>
                  )}
                </div>

                {/* Barbeiros */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-barber-white/70 font-medium">Barbeiros Ativos</span>
                    <span className={`text-[10px] font-bold ${
                      (healthData.dados?.barbeiros?.total || 0) > 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {healthData.dados?.barbeiros?.total || 0}
                    </span>
                  </div>
                  {healthData.dados?.barbeiros?.lista?.length > 0 ? (
                    <div className="space-y-1">
                      {healthData.dados.barbeiros.lista.map((b: any) => (
                        <div key={b.id} className="flex items-center justify-between bg-barber-black/40 rounded-lg px-2.5 py-1.5">
                          <span className="text-[11px] text-barber-white">{b.nome}</span>
                          <span className="text-[10px] text-barber-white/50">{b.horario}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-red-400">⚠️ Nenhum barbeiro cadastrado — o bot não conseguirá oferecer profissionais reais!</p>
                  )}
                </div>

                {/* Resumo */}
                <div className="flex items-center gap-4 pt-1 border-t border-barber-gold/10">
                  <span className="text-[10px] text-barber-white/50">
                    Agendamentos hoje: <span className="text-barber-gold font-bold">{healthData.dados?.agendamentos_hoje || 0}</span>
                  </span>
                  <span className="text-[10px] text-barber-white/50">
                    Settings: {healthData.dados?.settings ? '✅' : '❌'}
                  </span>
                  <span className="text-[10px] text-barber-white/50">
                    AI Config: {healthData.dados?.ai_settings ? '✅' : '❌'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conteúdo da Tab: SIMULADOR */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Chat WhatsApp simulado */}
          <div className="lg:col-span-2 rounded-2xl border border-barber-gold/20 bg-barber-gray/30 p-6 flex flex-col h-[650px]">
            <div className="flex items-center justify-between border-b border-barber-gold/20 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-barber-white text-sm">
                    {tenant?.name || 'Barber AI'} — Atendente Virtual
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Online • Máquina de Estados Ativa
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-barber-gold/10 px-3 py-1 text-xs font-medium text-barber-gold">
                  Etapa: {simStep}
                </span>
                <button
                  type="button"
                  onClick={handleResetSimulator}
                  className="rounded-lg p-2 text-barber-white/60 hover:bg-barber-gold/10 hover:text-barber-gold"
                  title="Reiniciar Simulação"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {simMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.sender === 'client' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed shadow-sm ${
                      msg.sender === 'client'
                        ? 'bg-emerald-700/80 text-white rounded-br-none'
                        : 'bg-barber-black/90 text-barber-white/90 border border-barber-gold/20 rounded-bl-none'
                    }`}
                  >
                    <div className="whitespace-pre-line">{msg.text}</div>
                    <div
                      className={`mt-1.5 text-[10px] ${
                        msg.sender === 'client' ? 'text-emerald-200/70 text-right' : 'text-barber-white/40'
                      }`}
                    >
                      {msg.time}
                    </div>
                  </div>
                </div>
              ))}
              {simLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-none border border-barber-gold/20 bg-barber-black p-3 text-xs text-barber-gold/70 flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Digitando resposta...</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input do chat */}
            <form onSubmit={handleSendSimulator} className="mt-4 flex gap-2">
              <input
                type="text"
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                placeholder="Envie uma mensagem (ex: Marcos, Corte Cabelo, Terça 15h, Sim)..."
                className="flex-1 rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-3 text-sm text-barber-white placeholder:text-barber-white/40 focus:border-barber-gold focus:outline-none"
              />
              <button
                type="submit"
                disabled={simLoading || !simInput.trim()}
                className="flex items-center gap-2 rounded-xl bg-barber-gold px-5 py-3 font-semibold text-barber-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Enviar
              </button>
            </form>
          </div>

          {/* Roteiro Fixo Visual */}
          <div className="rounded-2xl border border-barber-gold/20 bg-barber-gray/30 p-6 space-y-4">
            <h3 className="font-serif text-lg font-bold text-barber-gold">
              Roteiro de Atendimento Fixo
            </h3>
            <p className="text-xs text-barber-white/60">
              A IA segue rigorosamente uma máquina de estados controlada pelo backend para evitar alucinações e erros.
            </p>

            <div className="space-y-3 pt-2">
              {[
                { num: '1', title: 'Saudação & Nome', desc: 'Pergunta o nome: "Olá bem-vindo a barbearia, para começarmos qual seu nome?"' },
                { num: '2', title: 'Data do Agendamento', desc: 'Pergunta o dia: "Perfeito {nome}, poderia me confirmar com qual dia gostaria de cortar?"' },
                { num: '3', title: 'Escolha do Barbeiro', desc: 'Consulta barbeiros ativos: "Perfeito para o dia {dia} tenho {profissionais} com quem você gostaria de cortar?"' },
                { num: '4', title: 'Horários Disponíveis', desc: 'Checa agenda no banco: "Certo o nosso profissional vai ter os seguintes horários disponíveis... qual o melhor?"' },
                { num: '5', title: 'Serviço & Preço', desc: 'Consulta serviços e valores: "Perfeito, os serviços disponíveis são corte por 35 e barba por 30, qual seria?"' },
                { num: '6', title: 'Forma de Pagamento', desc: 'Calcula total: "Então está combinado, valor de R$ {valor}, forma de pagamento: pix, dinheiro ou débito?"' },
                { num: '7', title: 'Gravação & Encerramento', desc: 'Grava no Firestore: "Perfeito e anotado estamos te esperando dia {dia} às {hora} com {barbeiro}! Encerrando atendimento."' },
              ].map((etapa) => (
                <div
                  key={etapa.num}
                  className="flex items-start gap-3 rounded-xl border border-barber-gold/10 bg-barber-black/40 p-3"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-barber-gold/20 text-xs font-bold text-barber-gold">
                    {etapa.num}
                  </span>
                  <div>
                    <h4 className="text-xs font-semibold text-barber-white">{etapa.title}</h4>
                    <p className="text-[11px] text-barber-white/60 mt-0.5">{etapa.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo da Tab: CONEXÃO WHATSAPP */}
      {activeTab === 'connection' && (
        <form onSubmit={handleSaveConnection} className="max-w-3xl space-y-6">
          <div className="rounded-2xl border border-barber-gold/20 bg-barber-gray/30 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-barber-gold/20 pb-4">
              <div>
                <h3 className="font-serif text-lg font-bold text-barber-gold">
                  WhatsApp Business Cloud API (Oficial Meta)
                </h3>
                <p className="text-xs text-barber-white/60">
                  Credenciais individuais desta barbearia para recebimento de webhooks e envio de mensagens.
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  waConfig.status === 'connected'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {waConfig.status === 'connected' ? 'Conectado' : 'Aguardando Credenciais'}
              </span>
            </div>

            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-barber-white/80 mb-1">
                  Número do WhatsApp da Barbearia
                </label>
                <input
                  type="text"
                  value={waConfig.businessPhoneNumber || ''}
                  onChange={(e) => setWaConfig({ ...waConfig, businessPhoneNumber: e.target.value })}
                  placeholder="+55 85 99999-9999"
                  className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-barber-white/80 mb-1">
                    Phone Number ID (Meta)
                  </label>
                  <input
                    type="text"
                    value={waConfig.phoneNumberId || ''}
                    onChange={(e) => setWaConfig({ ...waConfig, phoneNumberId: e.target.value })}
                    placeholder="Ex: 104859385928472"
                    className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-barber-white/80 mb-1">
                    WhatsApp Business Account ID (WABA ID)
                  </label>
                  <input
                    type="text"
                    value={waConfig.wabaId || ''}
                    onChange={(e) => setWaConfig({ ...waConfig, wabaId: e.target.value })}
                    placeholder="Ex: 928374659283741"
                    className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-barber-white/80 mb-1">
                  Webhook Verify Token (Token de Verificação)
                </label>
                <input
                  type="text"
                  value={waConfig.webhookVerifyToken || 'barberai_webhook_verify_2026'}
                  onChange={(e) => setWaConfig({ ...waConfig, webhookVerifyToken: e.target.value })}
                  className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                />
              </div>

              <div className="rounded-xl border border-barber-gold/10 bg-barber-black/50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-barber-white/70">
                    URL de Callback para Configurar no Meta for Developers:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyWebhookUrl}
                    className="flex items-center gap-1 text-xs text-barber-gold hover:underline"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar URL
                  </button>
                </div>
                <code className="block rounded-lg bg-barber-black px-3 py-2 text-xs text-barber-gold font-mono break-all">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/whatsapp` : '/api/webhook/whatsapp'}
                </code>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-barber-gold px-6 py-2.5 text-sm font-semibold text-barber-black transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Conexão'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Conteúdo da Tab: ROTEIRO & IA */}
      {activeTab === 'ai' && (
        <form onSubmit={handleSaveAI} className="max-w-3xl space-y-6">
          <div className="rounded-2xl border border-barber-gold/20 bg-barber-gray/30 p-6 space-y-5">
            <div className="border-b border-barber-gold/20 pb-4">
              <h3 className="font-serif text-lg font-bold text-barber-gold">
                Configurações do Motor de IA e Chaves de API
              </h3>
              <p className="text-xs text-barber-white/60 mt-1">
                Configure as chaves de integração do Google Gemini e ElevenLabs para o atendimento automático do WhatsApp.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-barber-gold/10 bg-barber-black/40 p-4">
                <div>
                  <h4 className="text-sm font-semibold text-barber-white">Atendimento Automático por IA</h4>
                  <p className="text-xs text-barber-white/60">
                    Responde imediatamente aos clientes pelo WhatsApp e conduz os agendamentos pelo fluxo passo a passo.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={aiConfig.enabled}
                  onChange={(e) => setAiConfig({ ...aiConfig, enabled: e.target.checked })}
                  className="h-5 w-5 accent-barber-gold cursor-pointer"
                />
              </div>

              {/* Chave Gemini */}
              <div className="rounded-xl border border-barber-gold/30 bg-barber-gold/5 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-barber-gold">
                    🔑 Chave de API do Google Gemini (Gemini API Key) *
                  </label>
                  <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Ativa no Sistema
                  </span>
                </div>
                <input
                  type="text"
                  value={aiConfig.geminiApiKey || ''}
                  onChange={(e) => setAiConfig({ ...aiConfig, geminiApiKey: e.target.value })}
                  placeholder="Cole a chave do Gemini"
                  className="w-full rounded-xl border border-barber-gold/40 bg-barber-black px-4 py-2.5 text-xs text-barber-white font-mono focus:border-barber-gold focus:outline-none"
                />
                <p className="text-[11px] text-barber-white/60">
                  Chave utilizada pelo motor de linguagem natural para conduzir os diálogos no WhatsApp da barbearia.
                </p>
              </div>

              {/* Chave ElevenLabs */}
              <div className="rounded-xl border border-barber-gold/20 bg-barber-black/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-barber-white/90">
                    🎙️ Chave de API do ElevenLabs (Opcional - Voz / Áudio)
                  </label>
                  <span className="text-[11px] text-barber-white/50">
                    {aiConfig.elevenlabsApiKey ? 'Configurada' : 'Pode preencher depois'}
                  </span>
                </div>
                <input
                  type="password"
                  value={aiConfig.elevenlabsApiKey || ''}
                  onChange={(e) => setAiConfig({ ...aiConfig, elevenlabsApiKey: e.target.value })}
                  placeholder="Ex: xi-api-key-... (você pode colocar depois)"
                  className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-xs text-barber-white font-mono focus:border-barber-gold focus:outline-none"
                />
                <p className="text-[11px] text-barber-white/60">
                  Gera respostas por áudio humanizado no WhatsApp. Você pode inserir esta chave a qualquer momento.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-barber-white/80 mb-1">
                  Modelo Gemini Selecionado
                </label>
                <select
                  value={aiConfig.model}
                  onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                  className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                >
                  <option value="gemini-3.8-flash">Gemini 3.8 Flash (Recomendado - Ultra rápido)</option>
                  <option value="gemini-3.8-pro">Gemini 3.8 Pro (Maior raciocínio contextual)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-barber-white/80 mb-1">
                  Mensagem de Saudação Inicial
                </label>
                <textarea
                  rows={3}
                  value={aiConfig.greetingMessage}
                  onChange={(e) => setAiConfig({ ...aiConfig, greetingMessage: e.target.value })}
                  className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-barber-white/80 mb-1">
                  Palavra-chave para Atendimento Humano
                </label>
                <input
                  type="text"
                  value={aiConfig.humanHandoffKeyword}
                  onChange={(e) => setAiConfig({ ...aiConfig, humanHandoffKeyword: e.target.value })}
                  placeholder="humano, atendente, pessoa"
                  className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-barber-gold px-6 py-2.5 text-sm font-semibold text-barber-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar Chaves e Parâmetros de IA'}
            </button>
          </div>
        </form>
      )}

      {/* Conteúdo da Tab: ÁUDIO ELEVENLABS */}
      {activeTab === 'audio' && (
        <form onSubmit={handleSaveAI} className="max-w-3xl space-y-6">
          <div className="rounded-2xl border border-barber-gold/20 bg-barber-gray/30 p-6 space-y-5">
            <div>
              <h3 className="font-serif text-lg font-bold text-barber-gold">
                Síntese de Áudio com ElevenLabs
              </h3>
              <p className="text-xs text-barber-white/60 mt-1">
                Gera áudios com tom humanizado e envia como mensagem de voz no WhatsApp para o cliente.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-barber-gold/10 bg-barber-black/40 p-4">
                <div>
                  <h4 className="text-sm font-semibold text-barber-white">Habilitar Respostas por Áudio</h4>
                  <p className="text-xs text-barber-white/60">
                    Converte o texto validado em áudio de voz antes de enviar pelo WhatsApp.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={aiConfig.audioEnabled}
                  onChange={(e) => setAiConfig({ ...aiConfig, audioEnabled: e.target.checked })}
                  className="h-5 w-5 accent-barber-gold cursor-pointer"
                />
              </div>

              {/* Chave ElevenLabs */}
              <div className="rounded-xl border border-barber-gold/20 bg-barber-black/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-barber-white/90">
                    Chave de API do ElevenLabs (ElevenLabs API Key)
                  </label>
                  <span className="text-[11px] text-barber-white/50">
                    {aiConfig.elevenlabsApiKey ? 'Chave salva' : 'Você pode colocar depois'}
                  </span>
                </div>
                <input
                  type="password"
                  value={aiConfig.elevenlabsApiKey || ''}
                  onChange={(e) => setAiConfig({ ...aiConfig, elevenlabsApiKey: e.target.value })}
                  placeholder="Insira sua chave ElevenLabs quando desejar ativar"
                  className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-xs text-barber-white font-mono focus:border-barber-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-barber-white/80 mb-1">
                  Voz do Atendente (Voice ID do ElevenLabs)
                </label>
                <input
                  type="text"
                  value={aiConfig.elevenlabsVoiceId || '21m00Tcm4TlvDq8ikWAM'}
                  onChange={(e) => setAiConfig({ ...aiConfig, elevenlabsVoiceId: e.target.value })}
                  placeholder="Ex: 21m00Tcm4TlvDq8ikWAM (Rachel)"
                  className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-barber-white/80 mb-1">
                  Idioma
                </label>
                <select
                  value={aiConfig.language || 'pt-BR'}
                  onChange={(e) => setAiConfig({ ...aiConfig, language: e.target.value })}
                  className="w-full rounded-xl border border-barber-gold/30 bg-barber-black px-4 py-2.5 text-sm text-barber-white focus:border-barber-gold focus:outline-none"
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">Inglês (Estados Unidos)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-barber-gold px-6 py-2.5 text-sm font-semibold text-barber-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar Configuração de Áudio'}
            </button>
          </div>
        </form>
      )}

      {/* Conteúdo da Tab: HISTÓRICO DE CONVERSAS */}
      {activeTab === 'history' && (
        <div className="rounded-2xl border border-barber-gold/20 bg-barber-gray/30 p-6 space-y-4">
          <h3 className="font-serif text-lg font-bold text-barber-gold">
            Conversas Registradas
          </h3>

          {conversas.length === 0 ? (
            <div className="py-12 text-center text-sm text-barber-white/50">
              Nenhuma conversa registrada ainda. Realize um teste no simulador para visualizar os atendimentos.
            </div>
          ) : (
            <div className="divide-y divide-barber-gold/10">
              {conversas.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-barber-white">
                      {c.clientName || 'Cliente'} ({c.clientPhone})
                    </h4>
                    <p className="text-xs text-barber-white/60">
                      Etapa atual: <span className="text-barber-gold">{c.currentStep}</span> • Última interação: {new Date(c.lastMessageAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      c.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : c.status === 'human_handoff'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
