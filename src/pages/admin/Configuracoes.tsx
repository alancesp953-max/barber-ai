import { useCallback, useEffect, useState } from 'react'
import {
  connectWhatsAppInstance,
  disconnectWhatsAppInstance,
  getConfiguracoes,
  getWhatsAppInstanceStatus,
  updateConfiguracoes,
  type WhatsAppInstanceResult,
} from '../../lib/api'

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#0d0d0d',
  color: '#f5f5f5',
  padding: '32px',
  fontFamily: 'Arial, Helvetica, sans-serif',
}

const titleStyle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 700,
  color: '#D4AF37',
  marginBottom: '24px',
  borderBottom: '1px solid #222',
  paddingBottom: '12px',
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#161616',
  border: '1px solid #222',
  borderRadius: '8px',
  padding: '24px',
  marginBottom: '24px',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '18px',
  color: '#D4AF37',
  marginBottom: '16px',
  fontWeight: 600,
}

const formGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
  gap: '16px',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  fontSize: '14px',
  color: '#cfcfcf',
}

const inputStyle: React.CSSProperties = {
  backgroundColor: '#0d0d0d',
  border: '1px solid #333',
  borderRadius: '6px',
  padding: '10px 12px',
  color: '#f5f5f5',
  fontSize: '14px',
  outline: 'none',
}

const buttonStyle: React.CSSProperties = {
  backgroundColor: '#D4AF37',
  color: '#0d0d0d',
  border: 'none',
  borderRadius: '6px',
  padding: '12px 24px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
  marginTop: '16px',
}

const buttonSecondaryStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: 'transparent',
  color: '#D4AF37',
  border: '1px solid #D4AF37',
  marginTop: 0,
  marginRight: 8,
}

const buttonDangerStyle: React.CSSProperties = {
  ...buttonSecondaryStyle,
  color: '#ff6b6b',
  borderColor: '#ff6b6b',
}

const messageStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '6px',
  marginBottom: '16px',
  fontSize: '14px',
}

const successMsgStyle: React.CSSProperties = {
  ...messageStyle,
  backgroundColor: '#1a3a1a',
  color: '#4caf50',
  border: '1px solid #4caf50',
}

const errorMsgStyle: React.CSSProperties = {
  ...messageStyle,
  backgroundColor: '#2a1212',
  color: '#ff6b6b',
  border: '1px solid #ff6b6b',
}

function statusLabel(status?: string | null): { text: string; color: string } {
  const s = (status || '').toLowerCase()
  if (s.includes('connect') && !s.includes('disconnect') && !s.includes('connecting')) {
    return { text: status || 'connected', color: '#4caf50' }
  }
  if (s.includes('connecting')) return { text: status || 'connecting', color: '#ff9800' }
  if (s.includes('disconnect') || s.includes('close')) {
    return { text: status || 'disconnected', color: '#ff6b6b' }
  }
  if (s.includes('hibern')) return { text: status || 'hibernated', color: '#888' }
  return { text: status || 'desconhecido', color: '#aaa' }
}

function resolveStatusFromResult(result: WhatsAppInstanceResult): string | null {
  if (result.status) return result.status
  const data = result.data as Record<string, unknown> | undefined
  if (!data) return null
  const inst = (data.instance || data) as Record<string, unknown>
  const s = inst.status ?? inst.state ?? data.status
  return typeof s === 'string' ? s : null
}

export default function Configuracoes() {
  const [form, setForm] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const [waStatus, setWaStatus] = useState<string | null>(null)
  const [qrcode, setQrcode] = useState<string | null>(null)
  const [paircode, setPaircode] = useState<string | null>(null)
  const [waLoading, setWaLoading] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await getConfiguracoes()
        setForm(data || {})
      } catch {
        setMessage({ tipo: 'erro', texto: 'Erro ao carregar configurações.' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const refreshStatus = useCallback(async () => {
    setWaError(null)
    try {
      const result = await getWhatsAppInstanceStatus()
      if (!result.ok) {
        setWaError(result.error || 'Falha ao consultar status')
        return
      }
      setWaStatus(resolveStatusFromResult(result))
      if (result.qrcode) setQrcode(result.qrcode)
      if (result.paircode) setPaircode(result.paircode)
    } catch (err) {
      setWaError(err instanceof Error ? err.message : 'Erro ao consultar status')
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  // Poll status while waiting for QR scan
  useEffect(() => {
    if (!qrcode) return
    const s = (waStatus || '').toLowerCase()
    if (s.includes('connected') && !s.includes('disconnect')) return
    const id = window.setInterval(() => {
      void refreshStatus()
    }, 5000)
    return () => window.clearInterval(id)
  }, [qrcode, waStatus, refreshStatus])

  function handleChange(campo: string, valor: any) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await updateConfiguracoes(form)
      setMessage({ tipo: 'sucesso', texto: 'Configurações salvas com sucesso!' })
    } catch {
      setMessage({ tipo: 'erro', texto: 'Erro ao salvar configurações.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateQr() {
    setWaLoading(true)
    setWaError(null)
    setMessage(null)
    try {
      const result = await connectWhatsAppInstance()
      if (!result.ok) {
        setWaError(result.error || 'Não foi possível gerar o QR')
        return
      }
      setWaStatus(resolveStatusFromResult(result))
      setQrcode(result.qrcode || null)
      setPaircode(result.paircode || null)
      if (!result.qrcode && !result.paircode) {
        const s = resolveStatusFromResult(result)
        if (s && s.toLowerCase().includes('connected')) {
          setMessage({ tipo: 'sucesso', texto: 'WhatsApp já está conectado.' })
        } else {
          setWaError('A UAZAPI não retornou QR code. Confira secrets e status da instância.')
        }
      }
    } catch (err) {
      setWaError(err instanceof Error ? err.message : 'Erro ao gerar QR')
    } finally {
      setWaLoading(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar o WhatsApp desta instância?')) return
    setWaLoading(true)
    setWaError(null)
    try {
      const result = await disconnectWhatsAppInstance()
      if (!result.ok) {
        setWaError(result.error || 'Falha ao desconectar')
        return
      }
      setQrcode(null)
      setPaircode(null)
      setWaStatus('disconnected')
      setMessage({ tipo: 'sucesso', texto: 'Instância desconectada.' })
    } catch (err) {
      setWaError(err instanceof Error ? err.message : 'Erro ao desconectar')
    } finally {
      setWaLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#888' }}>Carregando configurações...</p>
      </div>
    )
  }

  const statusUi = statusLabel(waStatus)

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Configurações</h1>

      {message && (
        <div style={message.tipo === 'sucesso' ? successMsgStyle : errorMsgStyle}>
          {message.texto}
        </div>
      )}

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Informações da Barbearia</h2>
        <div style={formGridStyle}>
          <label style={labelStyle}>
            Nome da Barbearia
            <input style={inputStyle} value={form.nome_barbearia || ''} onChange={(e) => handleChange('nome_barbearia', e.target.value)} placeholder="Minha Barbearia" />
          </label>
          <label style={labelStyle}>
            Endereço
            <input style={inputStyle} value={form.endereco || ''} onChange={(e) => handleChange('endereco', e.target.value)} placeholder="Rua Exemplo, 123" />
          </label>
          <label style={labelStyle}>
            Telefone
            <input style={inputStyle} value={form.telefone || ''} onChange={(e) => handleChange('telefone', e.target.value)} placeholder="(11) 99999-9999" />
          </label>
          <label style={labelStyle}>
            E-mail
            <input style={inputStyle} value={form.email || ''} onChange={(e) => handleChange('email', e.target.value)} placeholder="contato@barbearia.com" />
          </label>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Redes Sociais</h2>
        <div style={formGridStyle}>
          <label style={labelStyle}>
            Instagram
            <input style={inputStyle} value={form.instagram || ''} onChange={(e) => handleChange('instagram', e.target.value)} placeholder="@minhabarbearia" />
          </label>
          <label style={labelStyle}>
            Facebook
            <input style={inputStyle} value={form.facebook || ''} onChange={(e) => handleChange('facebook', e.target.value)} placeholder="fb.com/minhabarbearia" />
          </label>
          <label style={labelStyle}>
            WhatsApp
            <input style={inputStyle} value={form.whatsapp || ''} onChange={(e) => handleChange('whatsapp', e.target.value)} placeholder="(11) 99999-9999" />
          </label>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Bot WhatsApp (UAZAPI)</h2>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 16, marginTop: 0 }}>
          Token e URL da instância ficam nos Secrets do Supabase.
          Escaneie o QR abaixo no WhatsApp do celular (Aparelhos conectados).
          Preferir WhatsApp Business. API: POST /instance/connect · GET /instance/status
        </p>
        <div style={formGridStyle}>
          <label style={labelStyle}>
            Bot ativo
            <select
              style={inputStyle}
              value={form.whatsapp_bot_ativo === true ? 'true' : 'false'}
              onChange={(e) => handleChange('whatsapp_bot_ativo', e.target.value === 'true')}
            >
              <option value="true">Sim — responder mensagens</option>
              <option value="false">Não — bot desligado</option>
            </select>
          </label>
          <label style={labelStyle}>
            URL base UAZAPI (referência)
            <input
              style={inputStyle}
              value={form.uazapi_base_url || ''}
              onChange={(e) => handleChange('uazapi_base_url', e.target.value)}
              placeholder="https://seudominio.uazapi.com"
            />
          </label>
        </div>

        <div
          style={{
            marginTop: 20,
            padding: 16,
            border: '1px solid #333',
            borderRadius: 8,
            background: '#0d0d0d',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: '#aaa' }}>Status da instância:</span>
            <strong style={{ color: statusUi.color }}>{statusUi.text}</strong>
          </div>

          {waError && (
            <div style={{ ...errorMsgStyle, marginBottom: 12 }}>{waError}</div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() => void handleGenerateQr()}
              disabled={waLoading}
            >
              {waLoading ? 'Aguarde...' : 'Gerar / renovar QR code'}
            </button>
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() => void refreshStatus()}
              disabled={waLoading}
            >
              Atualizar status
            </button>
            <button
              type="button"
              style={buttonDangerStyle}
              onClick={() => void handleDisconnect()}
              disabled={waLoading}
            >
              Desconectar
            </button>
          </div>

          {qrcode && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#cfcfcf', fontSize: 14, marginBottom: 12 }}>
                Abra o WhatsApp → Aparelhos conectados → Conectar um aparelho e escaneie:
              </p>
              <div
                style={{
                  display: 'inline-block',
                  padding: 16,
                  background: '#fff',
                  borderRadius: 12,
                }}
              >
                <img
                  src={qrcode.startsWith('data:') || qrcode.startsWith('http') ? qrcode : `data:image/png;base64,${qrcode}`}
                  alt="QR Code WhatsApp UAZAPI"
                  style={{ width: 260, height: 260, display: 'block' }}
                />
              </div>
              <p style={{ color: '#888', fontSize: 12, marginTop: 10 }}>
                O status atualiza sozinho a cada 5s enquanto o QR estiver visível.
              </p>
            </div>
          )}

          {paircode && (
            <p style={{ color: '#D4AF37', fontSize: 16, marginTop: 12 }}>
              Código de pareamento: <strong>{paircode}</strong>
            </p>
          )}

          {!qrcode && !paircode && !waError && (
            <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
              Clique em <strong>Gerar / renovar QR code</strong> para conectar o WhatsApp no painel.
              Os secrets <code>UAZAPI_BASE_URL</code> e <code>UAZAPI_INSTANCE_TOKEN</code> precisam
              estar configurados no Supabase.
            </p>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Horários de Funcionamento</h2>
        <div style={formGridStyle}>
          {[
            { chave: 'horario_segunda', label: 'Segunda-feira' },
            { chave: 'horario_terca', label: 'Terça-feira' },
            { chave: 'horario_quarta', label: 'Quarta-feira' },
            { chave: 'horario_quinta', label: 'Quinta-feira' },
            { chave: 'horario_sexta', label: 'Sexta-feira' },
            { chave: 'horario_sabado', label: 'Sábado' },
            { chave: 'horario_domingo', label: 'Domingo' },
          ].map((dia) => (
            <label key={dia.chave} style={labelStyle}>
              {dia.label}
              <input style={inputStyle} value={form[dia.chave] || ''} onChange={(e) => handleChange(dia.chave, e.target.value)} placeholder="08:00 - 18:00" />
            </label>
          ))}
        </div>
      </div>

      <button style={buttonStyle} onClick={handleSave} disabled={saving}>
        {saving ? 'Salvando...' : 'Salvar Configurações'}
      </button>
    </div>
  )
}
