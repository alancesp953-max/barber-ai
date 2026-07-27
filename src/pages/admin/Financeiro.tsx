import { useEffect, useState } from 'react'
import { getPagamentos, getAppointments, getClients, createPagamento, deletePagamento, getResumoFinanceiro } from '../../lib/api'

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

const resumoGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '16px',
  marginBottom: '24px',
}

const resumoCard: React.CSSProperties = {
  backgroundColor: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: '8px',
  padding: '20px',
  textAlign: 'center',
}

const resumoValor: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: '#4caf50',
  marginTop: '8px',
}

const sectionTitle: React.CSSProperties = {
  fontSize: '18px',
  color: '#D4AF37',
  marginBottom: '16px',
  fontWeight: 600,
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '14px',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '1px solid #333',
  color: '#aaa',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #222',
}

const statusPago: React.CSSProperties = {
  backgroundColor: '#1a3a1a',
  color: '#4caf50',
  padding: '4px 10px',
  borderRadius: '4px',
  fontSize: '12px',
  fontWeight: 600,
}

const statusPendente: React.CSSProperties = {
  backgroundColor: '#3a2a1a',
  color: '#ff9800',
  padding: '4px 10px',
  borderRadius: '4px',
  fontSize: '12px',
  fontWeight: 600,
}

const btnNovo: React.CSSProperties = {
  backgroundColor: '#D4AF37',
  color: '#0d0d0d',
  border: 'none',
  borderRadius: '6px',
  padding: '10px 20px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
  marginBottom: '16px',
}

const btnExcluir: React.CSSProperties = {
  backgroundColor: 'transparent',
  color: '#ff6b6b',
  border: '1px solid #ff6b6b',
  borderRadius: '4px',
  padding: '4px 10px',
  fontSize: '12px',
  cursor: 'pointer',
}

const btnSalvar: React.CSSProperties = {
  backgroundColor: '#D4AF37',
  color: '#0d0d0d',
  border: 'none',
  borderRadius: '6px',
  padding: '10px 24px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
}

const btnCancelar: React.CSSProperties = {
  backgroundColor: 'transparent',
  color: '#aaa',
  border: '1px solid #444',
  borderRadius: '6px',
  padding: '10px 24px',
  fontSize: '14px',
  cursor: 'pointer',
}

const modalOverlay: React.CSSProperties = {
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
}

const modalContent: React.CSSProperties = {
  backgroundColor: '#1a1a1a',
  border: '1px solid #333',
  borderRadius: '8px',
  padding: '32px',
  width: '90%',
  maxWidth: '500px',
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

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  fontSize: '14px',
  color: '#cfcfcf',
  marginBottom: '16px',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'auto',
}

export default function Financeiro() {
  const [pagamentos, setPagamentos] = useState([])
  const [resumo, setResumo] = useState({ total: 0, porForma: {}, quantidade: 0 })
  const [agendamentos, setAgendamentos] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formAgendamento, setFormAgendamento] = useState('')
  const [formValor, setFormValor] = useState('')
  const [formForma, setFormForma] = useState('Dinheiro')

  async function loadData() {
    try {
      const [p, r, a, c] = await Promise.all([
        getPagamentos(),
        getResumoFinanceiro(),
        getAppointments(),
        getClients(),
      ])
      setPagamentos(p)
      setResumo(r)
      setAgendamentos(a)
      setClientes(c)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  function getClienteNome(clienteId: string) {
    return clientes.find((c) => c.id === clienteId)?.nome || 'Cliente'
  }

  function getAgendamentoInfo(agendamentoId: string) {
    const ag = agendamentos.find((a) => a.id === agendamentoId)
    if (!ag) return { servico: 'N/A', barbeiro: 'N/A' }
    return {
      servico: ag.servico || ag.servico_nome || 'Serviço',
      barbeiro: ag.barbeiro || ag.barbeiro_nome || 'Barbeiro',
    }
  }

  // 🔥 Quando seleciona o agendamento, já preenche o valor automaticamente
  function handleSelectAgendamento(id: string) {
    setFormAgendamento(id)
    const ag = agendamentos.find((a) => a.id === id)
    if (ag) {
      const preco = ag.preco || ag.valor || ag.servico_preco || 0
      setFormValor(preco.toString().replace('.', ','))
    }
  }

  async function handleCriarPagamento() {
    if (!formAgendamento || !formValor) {
      alert('Preencha todos os campos!')
      return
    }

    // 🔥 Converte vírgula para ponto antes de salvar
    const valorLimpo = formValor.replace(/\./g, '').replace(',', '.')
    const valorNumerico = Number(valorLimpo)

    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      alert('Valor inválido!')
      return
    }

    setSaving(true)
    try {
      const ag = agendamentos.find((a) => a.id === formAgendamento)

      const dadosPagamento = {
        agendamento_id: formAgendamento,
        cliente_id: ag?.cliente_id || '',
        valor: valorNumerico,
        forma_pagamento: formForma,
        status: 'Pago',
      }

      console.log('📤 Enviando pagamento:', JSON.stringify(dadosPagamento, null, 2))

      await createPagamento(dadosPagamento)

      setShowModal(false)
      setFormAgendamento('')
      setFormValor('')
      setFormForma('Dinheiro')
      await loadData()
    } catch (err) {
      console.error('❌ Erro completo ao criar pagamento:', err)
      console.error('❌ Mensagem:', err?.message)
      console.error('❌ Resposta:', err?.response)
      console.error('❌ Stack:', err?.stack)
      alert('Erro ao criar pagamento: ' + (err?.message || JSON.stringify(err)))
    } finally {
      setSaving(false)
    }
  }

  async function handleExcluir(id: string) {
    if (!confirm('Excluir este pagamento?')) return
    try {
      await deletePagamento(id)
      await loadData()
    } catch (err) {
      alert('Erro ao excluir pagamento')
    }
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <p>Carregando financeiro...</p>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>💰 Financeiro</h1>

      <div style={resumoGrid}>
        <div style={resumoCard}>
          <p>Total Recebido</p>
          <p style={resumoValor}>R$ {resumo.total.toFixed(2)}</p>
        </div>
        <div style={resumoCard}>
          <p>Pagamentos Hoje</p>
          <p style={resumoValor}>{resumo.quantidade}</p>
        </div>
        {Object.entries(resumo.porForma).map(([forma, valor]) => (
          <div key={forma} style={resumoCard}>
            <p>{forma}</p>
            <p style={resumoValor}>R$ {Number(valor).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <button onClick={() => setShowModal(true)} style={btnNovo}>
        + Novo Pagamento
      </button>

      <div style={cardStyle}>
        <h2 style={sectionTitle}>Histórico de Pagamentos</h2>
        {pagamentos.length === 0 && (
          <p>Nenhum pagamento registrado.</p>
        )}
        {pagamentos.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Cliente</th>
                <th style={thStyle}>Serviço</th>
                <th style={thStyle}>Barbeiro</th>
                <th style={thStyle}>Valor</th>
                <th style={thStyle}>Forma</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Data</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {pagamentos.map((p) => {
                const info = getAgendamentoInfo(p.agendamento_id)
                return (
                  <tr key={p.id}>
                    <td style={tdStyle}>{getClienteNome(p.cliente_id)}</td>
                    <td style={tdStyle}>{info.servico}</td>
                    <td style={tdStyle}>{info.barbeiro}</td>
                    <td style={tdStyle}>R$ {Number(p.valor).toFixed(2)}</td>
                    <td style={tdStyle}>{p.forma_pagamento}</td>
                    <td style={tdStyle}>
                      <span style={p.status === 'Pago' ? statusPago : statusPendente}>
                        {p.status}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {p.created_at
                        ? new Date(p.created_at).toLocaleDateString('pt-BR')
                        : '-'}
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => handleExcluir(p.id)} style={btnExcluir}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div style={modalOverlay} onClick={() => setShowModal(false)}>
          <div style={modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={sectionTitle}>Novo Pagamento</h2>

            <label style={labelStyle}>
              Agendamento
              <select
                style={selectStyle}
                value={formAgendamento}
                onChange={(e) => handleSelectAgendamento(e.target.value)}
              >
                <option value="">Selecione um agendamento...</option>
                {agendamentos
                  .filter((a) => a.status !== 'Cancelado')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {getClienteNome(a.cliente_id)} - {a.servico || a.servico_nome} ({new Date(a.data || a.created_at).toLocaleDateString('pt-BR')})
                    </option>
                  ))}
              </select>
            </label>

            <label style={labelStyle}>
              Valor (R$)
              <input
                style={inputStyle}
                type="text"
                inputMode="decimal"
                value={formValor}
                onChange={(e) => setFormValor(e.target.value)}
                placeholder="59,90"
              />
            </label>

            <label style={labelStyle}>
              Forma de Pagamento
              <select
                style={selectStyle}
                value={formForma}
                onChange={(e) => setFormForma(e.target.value)}
              >
                <option value="Dinheiro">Dinheiro</option>
                <option value="Cartão Débito">Cartão Débito</option>
                <option value="Cartão Crédito">Cartão Crédito</option>
                <option value="PIX">PIX</option>
                <option value="Outro">Outro</option>
              </select>
            </label>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button onClick={() => setShowModal(false)} style={btnCancelar}>
                Cancelar
              </button>
              <button onClick={handleCriarPagamento} style={btnSalvar} disabled={saving}>
                {saving ? 'Salvando...' : 'Registrar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}