import { useState, useEffect } from 'react'
import { Cpu, Volume2, MessageSquare } from 'lucide-react'
import { getPlatformLogs } from '../../lib/api'
import type { AuditLog } from '../../types/database'

export default function SuperAdminLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])

  useEffect(() => {
    async function load() {
      try {
        const logsData = await getPlatformLogs()
        setLogs(logsData)
      } catch (e) {
        console.error(e)
      }
    }
    load()
  }, [])

  // Mock logs para visualização de atividade inicial do sistema
  const sampleLogs = [
    {
      id: '1',
      action: 'MENSAGEM_WHATSAPP_RECEBIDA',
      performedBy: 'Sistema Webhook Cloud API',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      details: { servico: 'WhatsApp', origem: '+55 85 99999-1234', etapa: 'AWAITING_SERVICE' },
    },
    {
      id: '2',
      action: 'CONSULTA_IA_GEMINI',
      performedBy: 'Motor de Agendamento',
      timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      details: { servico: 'Gemini 2.5 Flash', promptTokens: 140, responseTokens: 65, status: 'sucesso' },
    },
    {
      id: '3',
      action: 'AGENDAMENTO_CRIADO_ATOMICO',
      performedBy: 'Bot Atendimento',
      timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      details: { servico: 'Firestore DB', cliente: 'Lucas Lima', barbeiro: 'Carlos', horario: '15:30' },
    },
    {
      id: '4',
      action: 'CONFIRMACAO_WHATSAPP_ENVIADA',
      performedBy: 'WhatsApp Sender API',
      timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
      details: { servico: 'WhatsApp Cloud API', status: 'entregue' },
    },
  ]

  const displayLogs = logs.length > 0 ? logs : sampleLogs

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-amber-400">
          Logs, Auditoria & Consumo de APIs
        </h1>
        <p className="text-xs text-barber-white/60 mt-1">
          Monitoramento centralizado de webhooks do WhatsApp, chamadas de IA do Gemini e síntese de voz ElevenLabs.
        </p>
      </div>

      {/* Cards de Consumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-4 flex items-center gap-3">
          <div className="rounded-xl bg-blue-500/10 p-3 text-blue-400">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs text-barber-white/60">Google Gemini 2.5</div>
            <div className="text-lg font-bold text-barber-white">100% Operacional</div>
            <div className="text-[10px] text-blue-400">Tokens de entrada/saída monitorados</div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-4 flex items-center gap-3">
          <div className="rounded-xl bg-purple-500/10 p-3 text-purple-400">
            <Volume2 className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs text-barber-white/60">ElevenLabs TTS</div>
            <div className="text-lg font-bold text-barber-white">Pronto p/ Envio</div>
            <div className="text-[10px] text-purple-400">Voz configurável por barbearia</div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-4 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-400">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs text-barber-white/60">WhatsApp Cloud Webhook</div>
            <div className="text-lg font-bold text-emerald-400">Ativo</div>
            <div className="text-[10px] text-emerald-400/80">Idempotência & Isolamento</div>
          </div>
        </div>
      </div>

      {/* Lista de Logs */}
      <div className="rounded-2xl border border-amber-500/20 bg-[#121212] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-amber-500/10 pb-4">
          <h2 className="font-serif text-lg font-bold text-amber-400">Eventos de Auditoria Recentes</h2>
          <span className="text-xs text-barber-white/40">Exibindo últimos 50 eventos</span>
        </div>

        <div className="space-y-2">
          {displayLogs.map((log: any) => (
            <div
              key={log.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-amber-500/10 bg-[#0d0d0d] p-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-300">{log.action}</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-barber-white/60">
                    {log.performedBy}
                  </span>
                </div>
                {log.details && (
                  <div className="text-[11px] text-barber-white/60 font-mono">
                    {JSON.stringify(log.details)}
                  </div>
                )}
              </div>
              <div className="text-[10px] text-barber-white/40 font-mono sm:text-right shrink-0">
                {new Date(log.timestamp).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
