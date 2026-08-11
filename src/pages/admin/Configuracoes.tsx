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

function isConnectedStatus(status?: string | null): boolean {
  const s = (status || '').toLowerCase()
  if (!s) return false
  if (s === 'connected' || s === 'open' || s === 'online') return true
  if (s.includes('connecting')) return false
  if (s.includes('disconnect')) return false
  return s.includes('connected') || s.includes('logged')
}

function statusLabel(status?: string | null): { text: string; color: string; connected: boolean } {
  const s = (status || '').toLowerCase()
  if (isConnectedStatus(status)) {
    return { text: 'Conectado', color: '#4caf50', connected: true }
  }
  if (s.includes('connecting')) {
    return { text: 'Conectando… escaneie o QR', color: '#ff9800', connected: false }
  }
  if (s.includes('disconnect') || s.includes('close') || s === 'offline') {
    return { text: 'Desconectado', color: '#ff6b6b', connected: false }
  }
  if (s.includes('hibern')) {
    return { text: 'Hibernado', color: '#888', connected: false }
  }
  return { text: status || 'Desconhecido', color: '#aaa', connected: false }
}

function resolveStatusFromResult(result: WhatsAppInstanceResult): string | null {
  if (result.status) return result.status
  const data = result.data as Record<string, unknown> | undefined
  if (!data) return null

  const statusObj = data.status
  if (statusObj && typeof statusObj === 'object') {
    const st = statusObj as Record<string, unknown>
    if (st.connected === true || st.loggedIn === true) return 'connected'
    if (st.connected === false) return 'disconnected'
  }

  const inst = (data.instance || data) as Record<string, unknown>
  const s = inst.status ?? inst.state
  if (typeof s === 'string') return s
  if (typeof data.connected === 'boolean') return data.connected ? 'connected' : 'disconnected'
  return null
}

function resolveProfileFromResult(result: WhatsAppInstanceResult): { name?: string; owner?: string } {
  const data = result.data as Record<string, unknown> | undefined
  if (!data) return {}
  const inst = (data.instance || data) as Record<string, unknown>
  return {
    name: typeof inst.profileName === 'string' ? inst.profileName : typeof inst.name === 'string' ? inst.name : undefined,
    owner: typeof inst.owner === 'string' ? inst.owner : undefined,
  }
}

export default function Configuracoes() {
  const [form, setForm] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const [waStatus, setWaStatus] = useState<string | null>(null)
  const [qrcode, setQrcode] = useState<string | null>(null)
  const [paircode, setPaircode] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string | null>(null)
  const [profileOwner, setProfileOwner] = useState<string | null>(null)
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
      const status = resolveStatusFromResult(result)
      setWaStatus(status)
      const profile = resolveProfileFromResult(result)
      if (profile.name) setProfileName(profile.name)
      if (profile.owner) setProfileOwner(profile.owner)

      if (isConnectedStatus(status)) {
        setQrcode(null)
        setPaircode(null)
      } else {
        if (result.qrcode) setQrcode(result.qrcode)
        if (result.paircode) setPaircode(result.paircode)
      }
    } catch (err) {
      setWaError(err instanceof Error ? err.message : 'Erro ao consultar status')
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  // Poll while not connected (QR pending or connecting)
  useEffect(() => {
    const connected = isConnectedStatus(waStatus)
    if (connected) return
    // poll if showing QR or waiting for connection
    if (!qrcode && waStatus && !String(waStatus).toLowerCase().includes('connecting')) return
    const id = window.setInterval(() => {
      void refreshStatus()
    }, 3000)
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
      const status = resolveStatusFromResult(result)
      setWaStatus(status)
      const profile = resolveProfileFromResult(result)
      if (profile.name) setProfileName(profile.name)
      if (profile.owner) setProfileOwner(profile.owner)

      if (isConnectedStatus(status)) {
        setQrcode(null)
        setPaircode(null)
        setMessage({ tipo: 'sucesso', texto: 'WhatsApp já está conectado.' })
        return
      }

      setQrcode(result.qrcode || null)
      setPaircode(result.paircode || null)
      if (!result.qrcode && !result.paircode) {
        setWaError('A UAZAPI não retornou QR code. Confira secrets e status da instância.')
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
      setProfileName(null)
      setProfileOwner(null)
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
  const connected = statusUi.connected
  const showQr = !connected && !!qrcode

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
          Escaneie o QR no celular (WhatsApp → Aparelhos conectados). Preferir WhatsApp Business.
          Mensagens são respondidas pela IA MiMo via Edge Function.
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
              placeholder="https://barberai.uazapi.com"
            />
          </label>
        </div>

        <div
          style={{
            marginTop: 20,
            padding: 16,
            border: connected ? '1px solid #4caf50' : '1px solid #333',
            borderRadius: 8,
            background: connected ? '#0f1a0f' : '#0d0d0d',
          }}
        >
          {/* Visual status banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
              padding: '12px 14px',
              borderRadius: 8,
              background: connected ? 'rgba(76,175,80,0.15)' : 'rgba(255,152,0,0.1)',
              border: connected ? '1px solid #4caf50' : '1px solid #ff9800',
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: statusUi.color,
                boxShadow: connected ? '0 0 8px #4caf50' : 'none',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: statusUi.color, fontSize: 15 }}>
                {connected ? 'WhatsApp conectado' : statusUi.text}
              </div>
              {connected && (
                <div style={{ color: '#aaa', fontSize: 13, marginTop: 2 }}>
                  {profileName ? `Perfil: ${profileName}` : 'Instância online'}
                  {profileOwner ? ` · ${profileOwner}` : ''}
                </div>
              )}
              {!connected && (
                <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                  Gere o QR e escaneie no celular. Ao conectar, o QR some automaticamente.
                </div>
              )}
            </div>
          </div>

          {waError && (
            <div style={{ ...errorMsgStyle, marginBottom: 12 }}>{waError}</div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {!connected && (
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => void handleGenerateQr()}
                disabled={waLoading}
              >
                {waLoading ? 'Aguarde...' : 'Gerar / renovar QR code'}
              </button>
            )}
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() => void refreshStatus()}
              disabled={waLoading}
            >
              Atualizar status
            </button>
            {connected && (
              <button
                type="button"
                style={buttonDangerStyle}
                onClick={() => void handleDisconnect()}
                disabled={waLoading}
              >
                Desconectar
              </button>
            )}
          </div>

          {showQr && (
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
                  src={qrcode!.startsWith('data:') || qrcode!.startsWith('http') ? qrcode! : `data:image/png;base64,${qrcode}`}
                  alt="QR Code WhatsApp UAZAPI"
                  style={{ width: 260, height: 260, display: 'block' }}
                />
              </div>
              <p style={{ color: '#888', fontSize: 12, marginTop: 10 }}>
                Atualiza sozinho a cada 3s. Quando conectar, esta área some.
              </p>
            </div>
          )}

          {!connected && paircode && (
            <p style={{ color: '#D4AF37', fontSize: 16, marginTop: 12 }}>
              Código de pareamento: <strong>{paircode}</strong>
            </p>
          )}

          {!connected && !showQr && !paircode && !waError && (
            <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
              Clique em <strong>Gerar / renovar QR code</strong> para conectar o WhatsApp.
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
