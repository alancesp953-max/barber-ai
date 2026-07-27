import { Plus, Trash2, Edit2, Star, Percent } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getBarbers, createBarber, updateBarber, deleteBarber } from '../../lib/api'
import type { Barber } from '../../types/database'

export default function Barbeiros() {
  const [barbeiros, setBarbeiros] = useState<Barber[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState<string | null>(null)
  const [barbeiroEditando, setBarbeiroEditando] = useState<Barber | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Formulário
  const [formNome, setFormNome] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formTelefone, setFormTelefone] = useState('')
  const [formServico, setFormServico] = useState('')
  const [formProduto, setFormProduto] = useState('')
  const [formAvaliacao, setFormAvaliacao] = useState(5)

  async function loadBarbeiros() {
    try {
      const data = await getBarbers()
      setBarbeiros(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadBarbeiros() }, [])

  function abrirModal(tipo: string, barbeiro?: Barber) {
    setError(null)
    setModalAberto(tipo)
    setBarbeiroEditando(barbeiro || null)

    if (barbeiro) {
      setFormNome(barbeiro.nome)
      setFormEmail(barbeiro.email || '')
      setFormTelefone(barbeiro.telefone || '')
      setFormServico(String(barbeiro.percentual_servico))
      setFormProduto(String(barbeiro.percentual_produto))
      setFormAvaliacao(barbeiro.avaliacao || 5)
    } else {
      setFormNome('')
      setFormEmail('')
      setFormTelefone('')
      setFormServico('')
      setFormProduto('')
      setFormAvaliacao(5)
    }
  }

  function fecharModal() {
    setModalAberto(null)
    setBarbeiroEditando(null)
    setError(null)
  }

  async function handleSalvar() {
    if (!formNome.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true)
    try {
      if (barbeiroEditando) {
        await updateBarber(barbeiroEditando.id, {
          nome: formNome.trim(),
          email: formEmail.trim() || null,
          telefone: formTelefone.trim() || null,
          percentual_servico: Number(formServico) || 0,
          percentual_produto: Number(formProduto) || 0,
          avaliacao: formAvaliacao,
        })
      } else {
        await createBarber({
          nome: formNome.trim(),
          email: formEmail.trim() || null,
          telefone: formTelefone.trim() || null,
          percentual_servico: Number(formServico) || 0,
          percentual_produto: Number(formProduto) || 0,
          avaliacao: formAvaliacao,
        })
      }
      fecharModal()
      await loadBarbeiros()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function handleExcluir(id: string) {
    if (!confirm('Excluir permanentemente?')) return
    try { await deleteBarber(id); await loadBarbeiros() }
    catch (err: any) { alert(err.message) }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#0d0d0d', border: '1px solid #333', borderRadius: '6px',
    padding: '10px 12px', color: '#f5f5f5', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d0d0d', color: '#f5f5f5', padding: '32px' }}>
      {/* Título + Botão Novo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #222', paddingBottom: '12px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#D4AF37' }}>✂️ Barbeiros</h1>
        <button onClick={() => abrirModal('novo')}
          style={{ backgroundColor: '#D4AF37', color: '#0d0d0d', border: 'none', borderRadius: '6px', padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={18} /> Novo Barbeiro
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#aaa' }}>Carregando...</p>
      ) : (
        <div style={{ backgroundColor: '#161616', border: '1px solid #222', borderRadius: '8px', padding: '24px' }}>
          {barbeiros.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>Nenhum barbeiro cadastrado.</p>
          )}
          {barbeiros.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Nome</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Contato</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>% Serviço</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>% Produto</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Avaliação</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {barbeiros.map(b => (
                    <tr key={b.id}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', fontWeight: 500 }}>{b.nome}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', color: '#aaa', fontSize: '13px' }}>
                        {b.email && <div>{b.email}</div>}
                        {b.telefone && <div>{b.telefone}</div>}
                        {!b.email && !b.telefone && <span style={{ color: '#666' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', textAlign: 'center' }}>
                        <span style={{ backgroundColor: '#D4AF3720', color: '#D4AF37', padding: '4px 10px', borderRadius: '4px', fontWeight: 600, fontSize: '15px' }}>
                          {b.percentual_servico}%
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', textAlign: 'center' }}>
                        <span style={{ backgroundColor: '#4caf5020', color: '#4caf50', padding: '4px 10px', borderRadius: '4px', fontWeight: 600, fontSize: '15px' }}>
                          {b.percentual_produto}%
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', textAlign: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#ff9800' }}>
                          <Star size={14} fill="#ff9800" /> {b.avaliacao?.toFixed(1) || '5.0'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button onClick={() => abrirModal('editar', b)}
                            style={{ backgroundColor: 'transparent', color: '#D4AF37', border: '1px solid #D4AF37', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Edit2 size={14} /> Editar
                          </button>
                          <button onClick={() => handleExcluir(b.id)}
                            style={{ backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Trash2 size={14} /> Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Novo/Editar */}
      {(modalAberto === 'novo' || modalAberto === 'editar') && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={fecharModal}>
          <div style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '32px', width: '90%', maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', color: '#D4AF37', marginBottom: '4px', fontWeight: 600 }}>
              {barbeiroEditando ? '✏️ Editar Barbeiro' : '✂️ Novo Barbeiro'}
            </h2>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '20px' }}>
              {barbeiroEditando ? 'Altere os dados e as comissões do barbeiro.' : 'Cadastre um novo profissional.'}
            </p>

            {error && <div style={{ backgroundColor: '#3a1a1a', color: '#ff6b6b', padding: '10px', borderRadius: '4px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}

            {/* Dados básicos */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#cfcfcf', marginBottom: '16px' }}>
              Nome *
              <input style={inputStyle} value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="Nome do barbeiro" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#cfcfcf', marginBottom: '16px' }}>
              E-mail
              <input style={inputStyle} value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="email@exemplo.com" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#cfcfcf', marginBottom: '16px' }}>
              Telefone
              <input style={inputStyle} value={formTelefone} onChange={e => setFormTelefone(e.target.value)} placeholder="(11) 99999-9999" />
            </label>

            {/* 🔥 Comissões */}
            <div style={{ backgroundColor: '#0d0d0d', border: '1px solid #D4AF3740', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#D4AF37', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Percent size={16} /> Comissões
              </h3>
              <div style={{ display: 'flex', gap: '16px' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#cfcfcf', flex: 1 }}>
                  % Serviços
                  <div style={{ position: 'relative' }}>
                    <input style={{ ...inputStyle, paddingRight: '30px' }} type="number" value={formServico} onChange={e => setFormServico(e.target.value)} min="0" max="100" placeholder="Ex: 30" />
                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#D4AF37', fontWeight: 700 }}>%</span>
                  </div>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#cfcfcf', flex: 1 }}>
                  % Produtos
                  <div style={{ position: 'relative' }}>
                    <input style={{ ...inputStyle, paddingRight: '30px' }} type="number" value={formProduto} onChange={e => setFormProduto(e.target.value)} min="0" max="100" placeholder="Ex: 15" />
                    <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#4caf50', fontWeight: 700 }}>%</span>
                  </div>
                </label>
              </div>
              <p style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>
                Valores usados no cálculo automático das comissões do relatório.
              </p>
            </div>

            {/* Avaliação */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', color: '#cfcfcf', marginBottom: '24px' }}>
              Avaliação
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input style={{ ...inputStyle, flex: 1 }} type="number" value={formAvaliacao} onChange={e => setFormAvaliacao(Number(e.target.value))} min="0" max="5" step="0.1" />
                <span style={{ display: 'flex', gap: '2px', color: '#ff9800' }}>
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} size={18} fill={s <= Math.round(formAvaliacao) ? '#ff9800' : 'none'} />
                  ))}
                </span>
              </div>
            </label>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button onClick={fecharModal}
                style={{ backgroundColor: 'transparent', color: '#aaa', border: '1px solid #444', borderRadius: '6px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSalvar} disabled={saving}
                style={{ backgroundColor: '#D4AF37', color: '#0d0d0d', border: 'none', borderRadius: '6px', padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}