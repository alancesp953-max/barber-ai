import { Plus, Star, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createBarberUser, getUsers } from '../../lib/api'
import type { Barber } from '../../types/database'

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Barber[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formNome, setFormNome] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formSenha, setFormSenha] = useState('')
  const [formAvaliacao, setFormAvaliacao] = useState(5)

  async function loadUsuarios() {
    try {
      const data = await getUsers()
      setUsuarios(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsuarios()
  }, [])

  function abrirModal() {
    setError(null)
    setModalAberto(true)
    setFormNome('')
    setFormEmail('')
    setFormSenha('')
    setFormAvaliacao(5)
  }

  function fecharModal() {
    setModalAberto(false)
    setError(null)
  }

  async function handleSalvar() {
    if (!formNome.trim()) {
      setError('Nome é obrigatório')
      return
    }
    if (!formEmail.trim()) {
      setError('E-mail é obrigatório')
      return
    }
    if (formSenha.length < 6) {
      setError('Senha deve ter no mínimo 6 caracteres')
      return
    }

    setSaving(true)
    try {
      await createBarberUser({
        nome: formNome.trim(),
        email: formEmail.trim(),
        senha: formSenha,
        avaliacao: formAvaliacao,
      })
      fecharModal()
      await loadUsuarios()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#0d0d0d',
    border: '1px solid #333',
    borderRadius: '6px',
    padding: '10px 12px',
    color: '#f5f5f5',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d0d0d', color: '#f5f5f5', padding: '32px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          borderBottom: '1px solid #222',
          paddingBottom: '12px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#D4AF37', margin: 0 }}>Usuários</h1>
          <p style={{ color: '#888', fontSize: '13px', marginTop: '6px' }}>
            Barbeiros com conta de login no sistema
          </p>
        </div>
        <button
          onClick={abrirModal}
          style={{
            backgroundColor: '#D4AF37',
            color: '#0d0d0d',
            border: 'none',
            borderRadius: '6px',
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Plus size={18} /> Novo Usuário
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#aaa' }}>Carregando...</p>
      ) : (
        <div style={{ backgroundColor: '#161616', border: '1px solid #222', borderRadius: '8px', padding: '24px' }}>
          {usuarios.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>
              Nenhum usuário com login cadastrado.
            </p>
          )}
          {usuarios.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Nome</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>E-mail</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Avaliação</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Cadastro</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => (
                    <tr key={usuario.id}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', fontWeight: 500 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <UserPlus size={16} color="#D4AF37" />
                          {usuario.nome}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', color: '#aaa' }}>
                        {usuario.email || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ff9800' }}>
                          <Star size={14} fill="#ff9800" /> {usuario.avaliacao?.toFixed(1) || '5.0'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', color: '#888', fontSize: '13px' }}>
                        {usuario.created_at
                          ? new Date(usuario.created_at).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modalAberto && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={fecharModal}
        >
          <div
            style={{
              backgroundColor: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '32px',
              width: '90%',
              maxWidth: '480px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '18px', color: '#D4AF37', marginBottom: '4px', fontWeight: 600 }}>
              Novo Usuário
            </h2>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '20px' }}>
              Cria conta de login e vincula ao cadastro de barbeiro.
            </p>

            {error && (
              <div
                style={{
                  backgroundColor: '#3a1a1a',
                  color: '#ff6b6b',
                  padding: '10px',
                  borderRadius: '4px',
                  marginBottom: '16px',
                  fontSize: '13px',
                }}
              >
                {error}
              </div>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#cfcfcf', marginBottom: '16px' }}>
              Nome *
              <input style={inputStyle} value={formNome} onChange={(e) => setFormNome(e.target.value)} placeholder="Nome do barbeiro" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#cfcfcf', marginBottom: '16px' }}>
              E-mail *
              <input style={inputStyle} type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="email@exemplo.com" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#cfcfcf', marginBottom: '16px' }}>
              Senha *
              <input style={inputStyle} type="password" value={formSenha} onChange={(e) => setFormSenha(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#cfcfcf', marginBottom: '24px' }}>
              Avaliação inicial
              <input
                style={inputStyle}
                type="number"
                value={formAvaliacao}
                onChange={(e) => setFormAvaliacao(Number(e.target.value))}
                min="0"
                max="5"
                step="0.1"
              />
            </label>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={fecharModal}
                style={{
                  backgroundColor: 'transparent',
                  color: '#aaa',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={saving}
                style={{
                  backgroundColor: '#D4AF37',
                  color: '#0d0d0d',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Criando...' : 'Criar usuário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
