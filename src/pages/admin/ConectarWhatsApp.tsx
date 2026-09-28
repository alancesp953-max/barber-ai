import { useState, useEffect, useRef } from 'react'
import { QrCode, Smartphone, Wifi, RefreshCw, LogOut, CheckCircle2, AlertCircle, Info, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../../components/PageHeader'
import { useAuth } from '../../lib/firebaseAuth'

interface WhatsAppStatus {
  status: 'connected' | 'waiting_qr' | 'connecting' | 'disconnected'
  phoneNumber?: string | null
  qrCode?: string | null
  connectedAt?: string | null
  lastError?: string | null
  lastQrAt?: string | null
}

export default function ConectarWhatsApp() {
  const { tenant } = useAuth()
  const tenantId = tenant?.id || 'barbearia-principal'

  const [statusData, setStatusData] = useState<WhatsAppStatus>({
    status: 'disconnected',
    phoneNumber: null,
    qrCode: null,
  })
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const pollTimerRef = useRef<any>(null)

  // Consulta status do backend
  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/whatsapp/status?tenantId=${tenantId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStatusData(data)
      setErrorMsg(null)
    } catch (err: any) {
      console.warn('Erro ao consultar status do WhatsApp:', err.message)
    }
  }

  useEffect(() => {
    fetchStatus()
    // Polling contínuo para atualizar o QR Code e detectar leitura
    pollTimerRef.current = setInterval(fetchStatus, 3000)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [tenantId])

  // Ação: Iniciar conexão (Gera QR Code real)
  const handleConnect = async () => {
    setActionLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao iniciar conexão')
      setStatusData((prev) => ({ ...prev, ...data }))
      // Força consulta em 2s
      setTimeout(fetchStatus, 2000)
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Ação: Desconectar sessão
  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar o WhatsApp desta barbearia?')) return
    setActionLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/whatsapp/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao desconectar')
      setStatusData({
        status: 'disconnected',
        phoneNumber: null,
        qrCode: null,
      })
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Ação: Reconectar (Força novo QR Code)
  const handleReconnect = async () => {
    setActionLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/whatsapp/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao reconectar')
      setStatusData((prev) => ({ ...prev, ...data }))
      setTimeout(fetchStatus, 2000)
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp — Conectar Número"
        description="Conecte o WhatsApp da barbearia diretamente via QR Code, sem custos de intermediários."
      />

      {errorMsg && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Card Principal de Conexão */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Painel Esquerdo: Status e Ações */}
        <div className="lg:col-span-6 space-y-6">
          <div className="p-6 rounded-2xl border border-barber-gold/20 bg-barber-gray/50 space-y-5">
            <h3 className="text-base font-semibold text-barber-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-barber-gold" />
              Status da Conexão
            </h3>

            {/* Badge de Status */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-barber-black/60 border border-barber-gold/10">
              <div className="flex items-center gap-3">
                {statusData.status === 'connected' ? (
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                  </span>
                ) : statusData.status === 'waiting_qr' ? (
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
                  </span>
                ) : statusData.status === 'connecting' ? (
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full bg-red-500"></span>
                )}

                <div>
                  <div className="text-sm font-semibold text-barber-white">
                    {statusData.status === 'connected' && 'WhatsApp Conectado'}
                    {statusData.status === 'waiting_qr' && 'Aguardando Leitura do QR Code'}
                    {statusData.status === 'connecting' && 'Iniciando Sessão...'}
                    {statusData.status === 'disconnected' && 'WhatsApp Desconectado'}
                  </div>
                  <div className="text-xs text-barber-white/60">
                    {statusData.status === 'connected' && statusData.phoneNumber
                      ? `Número: +${statusData.phoneNumber}`
                      : 'Nenhum número pareado no momento'}
                  </div>
                </div>
              </div>

              {statusData.status === 'connected' && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Ativo
                </div>
              )}
            </div>

            {/* Metadados da conexão */}
            {statusData.status === 'connected' && (
              <div className="space-y-2 text-xs text-barber-white/70 bg-barber-black/30 p-4 rounded-xl border border-barber-gold/10">
                <div className="flex justify-between">
                  <span className="text-barber-white/50">Data da Conexão:</span>
                  <span className="font-mono text-barber-white">
                    {statusData.connectedAt ? new Date(statusData.connectedAt).toLocaleString('pt-BR') : 'Hoje'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-barber-white/50">Dispositivo:</span>
                  <span className="text-barber-gold font-medium">WhatsApp Web (Sessão Isolada)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-barber-white/50">IA de Agendamento:</span>
                  <span className="text-emerald-400 font-medium">Pronta para responder</span>
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex flex-wrap gap-3 pt-2">
              {statusData.status === 'disconnected' && (
                <button
                  onClick={handleConnect}
                  disabled={actionLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-barber-gold text-barber-black font-semibold hover:bg-barber-gold/90 transition shadow-lg shadow-barber-gold/10 disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                  Conectar WhatsApp
                </button>
              )}

              {statusData.status === 'waiting_qr' && (
                <button
                  onClick={handleReconnect}
                  disabled={actionLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-barber-gold text-barber-black font-semibold hover:bg-barber-gold/90 transition shadow-lg shadow-barber-gold/10 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                  Gerar Novo QR Code
                </button>
              )}

              {statusData.status === 'connected' && (
                <>
                  <button
                    onClick={handleReconnect}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-barber-gold/30 text-barber-gold hover:bg-barber-gold/10 transition text-sm font-medium cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reconectar
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition text-sm font-medium cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Desconectar WhatsApp
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Card Informativo de Segurança */}
          <div className="p-5 rounded-2xl border border-barber-gold/15 bg-barber-black/40 space-y-3">
            <div className="flex items-center gap-2 text-barber-gold text-sm font-semibold">
              <ShieldCheck className="w-4 h-4" />
              Isolamento e Segurança Multi-Tenant
            </div>
            <p className="text-xs text-barber-white/70 leading-relaxed">
              A sessão deste WhatsApp fica isolada exclusivamente no servidor da sua barbearia. As credenciais nunca
              são expostas no navegador e não há compartilhamento de dados com outros estabelecimentos.
            </p>
          </div>
        </div>

        {/* Painel Direito: Exibição do QR Code ou Instruções */}
        <div className="lg:col-span-6">
          <div className="p-6 rounded-2xl border border-barber-gold/20 bg-barber-gray/50 flex flex-col items-center justify-center min-h-[420px] text-center space-y-5">
            {statusData.status === 'waiting_qr' && statusData.qrCode ? (
              <div className="space-y-5 flex flex-col items-center">
                <div className="p-4 rounded-2xl bg-white shadow-2xl border-4 border-barber-gold/40 inline-block animate-fadeIn">
                  <img
                    src={statusData.qrCode}
                    alt="QR Code WhatsApp Web"
                    className="w-64 h-64 object-contain rounded-lg"
                  />
                </div>

                <div className="space-y-1.5 max-w-sm">
                  <p className="text-sm font-medium text-barber-white">
                    Escaneie este código com a câmera do seu WhatsApp
                  </p>
                  <p className="text-xs text-barber-white/50">
                    O QR Code atualiza automaticamente em caso de expiração. Mantenha esta tela aberta.
                  </p>
                </div>
              </div>
            ) : statusData.status === 'connected' ? (
              <div className="space-y-4 max-w-sm">
                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <h4 className="text-lg font-semibold text-barber-white">WhatsApp Conectado e Operando</h4>
                <p className="text-xs text-barber-white/60">
                  Todas as conversas recebidas por este número estão sendo sincronizadas na aba{' '}
                  <strong className="text-barber-gold">Conversas Reais</strong> e atendidas pela IA.
                </p>
              </div>
            ) : statusData.status === 'connecting' ? (
              <div className="space-y-4 max-w-sm">
                <RefreshCw className="w-12 h-12 text-barber-gold mx-auto animate-spin" />
                <h4 className="text-base font-semibold text-barber-white">Inicializando motor WhatsApp...</h4>
                <p className="text-xs text-barber-white/60">
                  Aguarde enquanto preparamos a sessão para gerar seu QR Code de autenticação.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-w-sm">
                <div className="w-20 h-20 mx-auto rounded-full bg-barber-gold/10 border border-barber-gold/20 flex items-center justify-center">
                  <QrCode className="w-10 h-10 text-barber-gold" />
                </div>
                <h4 className="text-lg font-semibold text-barber-white">Conexão Pronta para Iniciar</h4>
                <p className="text-xs text-barber-white/60">
                  Clique no botão <strong className="text-barber-gold">Conectar WhatsApp</strong> ao lado para gerar o
                  código QR e parear o número da barbearia.
                </p>
              </div>
            )}

            {/* Passo a Passo para o Dono da Barbearia */}
            <div className="w-full text-left pt-4 border-t border-barber-gold/10">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-barber-gold mb-2.5 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Instruções no Celular
              </h5>
              <ol className="text-xs text-barber-white/70 space-y-1.5 list-decimal list-inside">
                <li>Abra o aplicativo do WhatsApp no celular.</li>
                <li>Toque em <strong className="text-barber-white">Configurações</strong> ou nos <strong className="text-barber-white">3 pontos</strong> no topo.</li>
                <li>Selecione <strong className="text-barber-white">Aparelhos conectados</strong> e clique em <strong className="text-barber-white">Conectar um aparelho</strong>.</li>
                <li>Aponte a câmera para o QR Code exibido nesta tela.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
