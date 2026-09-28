import { useEffect, useState } from 'react'
import { getConfiguracoes, updateConfiguracoes } from '../../lib/api'

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

export default function Configuracoes() {
  const [form, setForm] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await getConfiguracoes()
        setForm(data || {})
      } catch (err) {
        setMessage({ tipo: 'erro', texto: 'Erro ao carregar configurações.' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function handleChange(campo: string, valor: any) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await updateConfiguracoes(form)
      setMessage({ tipo: 'sucesso', texto: 'Configurações salvas com sucesso!' })
    } catch (err) {
      setMessage({ tipo: 'erro', texto: 'Erro ao salvar configurações.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: '#888' }}>Carregando configurações...</p>
      </div>
    )
  }

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
