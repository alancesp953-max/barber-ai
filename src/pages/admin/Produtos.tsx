import { Plus, Trash2, Package, ArrowDownToLine, ArrowUpFromLine, History, AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getProdutos,
  createProduto,
  deleteProduto,
  updateProduto,
  registrarEntradaEstoque,
  registrarSaidaEstoque,
  getMovimentacoes,
  getBarbers,
} from '../../lib/api'
import type { Produto, MovimentacaoEstoque } from '../../lib/api'
import type { Barber } from '../../types/database'

export default function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [barbeiros, setBarbeiros] = useState<Barber[]>([])
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState<string | null>(null)
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtroProduto, setFiltroProduto] = useState('')
  const [formNome, setFormNome] = useState('')
  const [formPreco, setFormPreco] = useState('')
  const [formEstoque, setFormEstoque] = useState('0')
  const [formEstoqueMinimo, setFormEstoqueMinimo] = useState('5')
  const [movQuantidade, setMovQuantidade] = useState('1')
  const [movObservacao, setMovObservacao] = useState('')
  const [movBarbeiroId, setMovBarbeiroId] = useState('')
  const [movComissao, setMovComissao] = useState(0)
  const [valorTotal, setValorTotal] = useState(0)

  useEffect(() => {
    if (produtoSelecionado && movQuantidade) {
      const qtd = Number(movQuantidade) || 0
      setValorTotal((produtoSelecionado.preco_venda || 0) * qtd)
    } else {
      setValorTotal(0)
    }
  }, [produtoSelecionado, movQuantidade])

  async function loadProdutos() {
    try {
      const [data, barbeirosData] = await Promise.all([getProdutos(), getBarbers()])
      setProdutos(data)
      setBarbeiros(barbeirosData)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadProdutos() }, [])

  async function loadMovimentacoes(produtoId?: string) {
    try {
      const data = await getMovimentacoes(produtoId)
      setMovimentacoes(data)
    } catch (err) { console.error(err) }
  }

  function abrirModal(tipo: string, produto?: Produto) {
    setError(null)
    setModalAberto(tipo)
    setProdutoSelecionado(produto || null)
    setMovQuantidade('1')
    setMovObservacao('')
    setMovBarbeiroId('')
    setMovComissao(0)
    if (produto && tipo === 'movimentacoes') loadMovimentacoes(produto.id)
    if (tipo === 'produto') {
      setFormNome(produto?.nome || '')
      setFormPreco(String(produto?.preco_venda || ''))
      setFormEstoque(String(produto?.estoque_atual ?? '0'))
      setFormEstoqueMinimo(String(produto?.estoque_minimo ?? '5'))
    }
  }

  function fecharModal() {
    setModalAberto(null)
    setProdutoSelecionado(null)
    setError(null)
    setMovBarbeiroId('')
    setMovComissao(0)
  }

  function handleBarbeiroChange(id: string) {
    setMovBarbeiroId(id)
    const barbeiro = barbeiros.find(b => b.id === id)
    setMovComissao(barbeiro?.percentual_produto ?? 0)
  }

  async function handleSalvarProduto() {
    if (!formNome.trim()) { setError('Nome é obrigatório'); return }
    setSaving(true)
    try {
      if (produtoSelecionado) {
        await updateProduto(produtoSelecionado.id, {
          nome: formNome.trim(),
          preco_venda: Number(formPreco.replace(',', '.')) || 0,
          estoque_atual: Number(formEstoque) || 0,
          estoque_minimo: Number(formEstoqueMinimo) || 5,
        })
      } else {
        await createProduto({
          nome: formNome.trim(),
          preco_venda: Number(formPreco.replace(',', '.')) || 0,
          estoque_atual: Number(formEstoque) || 0,
          estoque_minimo: Number(formEstoqueMinimo) || 5,
        })
      }
      fecharModal(); await loadProdutos()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function handleEntrada() {
    if (!produtoSelecionado) return
    const qtd = Number(movQuantidade)
    if (!qtd || qtd <= 0) { setError('Quantidade inválida'); return }
    setSaving(true)
    try {
      await registrarEntradaEstoque({
        produto_id: produtoSelecionado.id,
        quantidade: qtd,
        motivo: 'compra',
        observacao: movObservacao || undefined,
      })
      fecharModal(); await loadProdutos()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function handleSaida() {
    if (!produtoSelecionado) return
    const qtd = Number(movQuantidade)
    if (!qtd || qtd <= 0) { setError('Quantidade inválida'); return }
    setSaving(true)
    try {
      await registrarSaidaEstoque({
        produto_id: produtoSelecionado.id,
        quantidade: qtd,
        motivo: 'venda',
        observacao: movObservacao || undefined,
        barbeiro_id: movBarbeiroId || undefined,
      })
      fecharModal(); await loadProdutos()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function handleExcluir(id: string) {
    if (!confirm('Excluir permanentemente?')) return
    try { await deleteProduto(id); await loadProdutos() }
    catch (err: any) { alert(err.message) }
  }

  const produtosFiltrados = produtos.filter(p =>
    p.nome.toLowerCase().includes(filtroProduto.toLowerCase())
  )

  // 🔧 FIX: converte explicitamente para número para evitar TS2367
  const getStatus = (p: Produto) => {
    const estoque = Number(p.estoque_atual)
    const minimo = Number(p.estoque_minimo)
    if (estoque === 0) return { cor: '#ff6b6b', texto: 'Sem estoque' }
    if (estoque <= minimo) return { cor: '#ff9800', texto: 'Estoque baixo' }
    return { cor: '#4caf50', texto: 'OK' }
  }

  // 🔧 FIX: helpers para comparar com número convertido
  const estoqueZero = (p: Produto) => Number(p.estoque_atual) === 0
  const estoqueBaixo = (p: Produto) => Number(p.estoque_atual) <= Number(p.estoque_minimo)

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#0d0d0d', border: '1px solid #333', borderRadius: '6px',
    padding: '10px 12px', color: '#f5f5f5', fontSize: '14px', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0d0d0d', color: '#f5f5f5', padding: '32px' }}>
      {/* Título + Botão Novo Produto */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '24px', borderBottom: '1px solid #222', paddingBottom: '12px'
      }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#D4AF37' }}>📦 Produtos</h1>
        <button onClick={() => abrirModal('produto')} style={{
          backgroundColor: '#D4AF37', color: '#0d0d0d', border: 'none', borderRadius: '6px',
          padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <Plus size={18} /> Novo Produto
        </button>
      </div>

      {/* Filtro */}
      <div style={{ marginBottom: '16px' }}>
        <input style={inputStyle} placeholder="Buscar produto..."
          value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)} />
      </div>

      {loading ? (
        <p style={{ color: '#aaa' }}>Carregando...</p>
      ) : (
        <div style={{
          backgroundColor: '#161616', border: '1px solid #222', borderRadius: '8px',
          padding: '24px', marginBottom: '24px'
        }}>
          {produtosFiltrados.length === 0 && (
            <p style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>
              {filtroProduto ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
            </p>
          )}
          {produtosFiltrados.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Produto</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Preço</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Estoque</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Mínimo</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {produtosFiltrados.map(p => {
                    const st = getStatus(p)
                    return (
                      <tr key={p.id} style={{
                        backgroundColor: estoqueZero(p) ? '#1a0a0a' : undefined
                      }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222' }}>
                          <Package size={16} color="#D4AF37" style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                          <span style={{ fontWeight: 500 }}>{p.nome}</span>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222' }}>
                          R$ {Number(p.preco_venda).toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222' }}>
                          <span style={{
                            fontWeight: 700, fontSize: '16px',
                            color: estoqueZero(p) ? '#ff6b6b' : estoqueBaixo(p) ? '#ff9800' : '#4caf50'
                          }}>
                            {p.estoque_atual}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222' }}>{p.estoque_minimo}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            backgroundColor: st.cor + '20', color: st.cor,
                            padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600
                          }}>
                            {estoqueBaixo(p) && <AlertTriangle size={12} />}
                            {st.texto}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button onClick={() => abrirModal('entrada', p)} style={{
                              backgroundColor: '#D4AF37', color: '#0d0d0d', border: 'none',
                              borderRadius: '6px', padding: '4px 8px', fontSize: '11px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                            }}>
                              <ArrowDownToLine size={14} /> Entrada
                            </button>
                            <button onClick={() => abrirModal('saida', p)}
                              disabled={estoqueZero(p)}
                              style={{
                                backgroundColor: '#ff9800', color: '#0d0d0d', border: 'none',
                                borderRadius: '6px', padding: '4px 8px', fontSize: '11px',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                opacity: estoqueZero(p) ? 0.5 : 1
                              }}>
                              <ArrowUpFromLine size={14} /> Saída
                            </button>
                            <button onClick={() => abrirModal('movimentacoes', p)} style={{
                              backgroundColor: 'transparent', color: '#aaa', border: '1px solid #444',
                              borderRadius: '6px', padding: '4px 8px', fontSize: '11px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                            }}>
                              <History size={14} /> Histórico
                            </button>
                            <button onClick={() => abrirModal('produto', p)} style={{
                              backgroundColor: 'transparent', color: '#aaa', border: '1px solid #444',
                              borderRadius: '6px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer'
                            }}>
                              Editar
                            </button>
                            <button onClick={() => handleExcluir(p.id)} style={{
                              backgroundColor: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b',
                              borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer'
                            }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Novo/Editar Produto */}
      {modalAberto === 'produto' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000
        }} onClick={fecharModal}>
          <div style={{
            backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px',
            padding: '32px', width: '90%', maxWidth: '500px'
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', color: '#D4AF37', marginBottom: '16px', fontWeight: 600 }}>
              {produtoSelecionado ? 'Editar Produto' : 'Novo Produto'}
            </h2>
            {error && (
              <div style={{
                backgroundColor: '#3a1a1a', color: '#ff6b6b', padding: '10px',
                borderRadius: '4px', marginBottom: '16px', fontSize: '13px'
              }}>{error}</div>
            )}
            <label style={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              fontSize: '14px', color: '#cfcfcf', marginBottom: '16px'
            }}>
              Nome * <input style={inputStyle} value={formNome}
                onChange={e => setFormNome(e.target.value)} placeholder="Ex: Shampoo" />
            </label>
            <label style={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              fontSize: '14px', color: '#cfcfcf', marginBottom: '16px'
            }}>
              Preço (R$) <input style={inputStyle} value={formPreco}
                onChange={e => setFormPreco(e.target.value)} placeholder="39,90" />
            </label>
            <label style={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              fontSize: '14px', color: '#cfcfcf', marginBottom: '16px'
            }}>
              Estoque Inicial <input style={inputStyle} type="number"
                value={formEstoque} onChange={e => setFormEstoque(e.target.value)} min="0" />
            </label>
            <label style={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              fontSize: '14px', color: '#cfcfcf', marginBottom: '16px'
            }}>
              Estoque Mínimo <input style={inputStyle} type="number"
                value={formEstoqueMinimo} onChange={e => setFormEstoqueMinimo(e.target.value)} min="0" />
            </label>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button onClick={fecharModal} style={{
                backgroundColor: 'transparent', color: '#aaa', border: '1px solid #444',
                borderRadius: '6px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer'
              }}>Cancelar</button>
              <button onClick={handleSalvarProduto} disabled={saving} style={{
                backgroundColor: '#D4AF37', color: '#0d0d0d', border: 'none',
                borderRadius: '6px', padding: '10px 20px', fontSize: '14px', fontWeight: 700,
                cursor: 'pointer'
              }}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Entrada */}
      {modalAberto === 'entrada' && produtoSelecionado && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000
        }} onClick={fecharModal}>
          <div style={{
            backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px',
            padding: '32px', width: '90%', maxWidth: '500px'
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', color: '#D4AF37', marginBottom: '16px', fontWeight: 600 }}>
              📥 Registrar Entrada
            </h2>
            <p style={{ color: '#aaa', marginBottom: '16px' }}>
              Produto: <strong style={{ color: '#D4AF37' }}>{produtoSelecionado.nome}</strong><br />
              Estoque atual: <strong>{produtoSelecionado.estoque_atual}</strong>
            </p>
            {error && (
              <div style={{
                backgroundColor: '#3a1a1a', color: '#ff6b6b', padding: '10px',
                borderRadius: '4px', marginBottom: '16px', fontSize: '13px'
              }}>{error}</div>
            )}
            <label style={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              fontSize: '14px', color: '#cfcfcf', marginBottom: '16px'
            }}>
              Quantidade * <input style={inputStyle} type="number"
                value={movQuantidade} onChange={e => setMovQuantidade(e.target.value)} min="1" />
            </label>
            <label style={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              fontSize: '14px', color: '#cfcfcf', marginBottom: '16px'
            }}>
              Observação <input style={inputStyle} value={movObservacao}
                onChange={e => setMovObservacao(e.target.value)} placeholder="Compra do fornecedor" />
            </label>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button onClick={fecharModal} style={{
                backgroundColor: 'transparent', color: '#aaa', border: '1px solid #444',
                borderRadius: '6px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer'
              }}>Cancelar</button>
              <button onClick={handleEntrada} disabled={saving} style={{
                backgroundColor: '#D4AF37', color: '#0d0d0d', border: 'none',
                borderRadius: '6px', padding: '10px 20px', fontSize: '14px', fontWeight: 700,
                cursor: 'pointer'
              }}>
                {saving ? 'Registrando...' : 'Registrar Entrada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Saída */}
      {modalAberto === 'saida' && produtoSelecionado && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000
        }} onClick={fecharModal}>
          <div style={{
            backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px',
            padding: '32px', width: '90%', maxWidth: '500px'
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', color: '#D4AF37', marginBottom: '16px', fontWeight: 600 }}>
              📤 Registrar Saída (Venda)
            </h2>
            <p style={{ color: '#aaa', marginBottom: '16px' }}>
              Produto: <strong style={{ color: '#D4AF37' }}>{produtoSelecionado.nome}</strong><br />
              Estoque atual: <strong>{produtoSelecionado.estoque_atual}</strong><br />
              Preço unitário: <strong style={{ color: '#D4AF37' }}>
                R$ {Number(produtoSelecionado.preco_venda).toFixed(2)}</strong>
            </p>
            {error && (
              <div style={{
                backgroundColor: '#3a1a1a', color: '#ff6b6b', padding: '10px',
                borderRadius: '4px', marginBottom: '16px', fontSize: '13px'
              }}>{error}</div>
            )}
            <label style={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              fontSize: '14px', color: '#cfcfcf', marginBottom: '16px'
            }}>
              Barbeiro que vendeu *
              <select style={selectStyle} value={movBarbeiroId}
                onChange={e => handleBarbeiroChange(e.target.value)}>
                <option value="">Selecione um barbeiro</option>
                {barbeiros.map(b => (
                  <option key={b.id} value={b.id}>{b.nome}</option>
                ))}
              </select>
            </label>
            {movBarbeiroId && (
              <div style={{
                backgroundColor: '#D4AF3715', border: '1px solid #D4AF3740',
                borderRadius: '6px', padding: '12px', marginBottom: '16px'
              }}>
                <p style={{ color: '#D4AF37', fontSize: '13px', margin: 0 }}>
                  💰 Comissão do barbeiro: <strong>{movComissao}%</strong>
                  {valorTotal > 0 && (
                    <span> — R$ {(valorTotal * movComissao / 100).toFixed(2)}</span>
                  )}
                </p>
              </div>
            )}
            <label style={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              fontSize: '14px', color: '#cfcfcf', marginBottom: '16px'
            }}>
              Quantidade * <input style={inputStyle} type="number"
                value={movQuantidade} onChange={e => setMovQuantidade(e.target.value)}
                min="1" max={produtoSelecionado.estoque_atual} />
            </label>
            <label style={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              fontSize: '14px', color: '#cfcfcf', marginBottom: '16px'
            }}>
              Valor Total (R$)
              <div style={{
                backgroundColor: '#0d0d0d', border: '1px solid #333', borderRadius: '6px',
                padding: '10px 12px', color: '#D4AF37', fontSize: '16px', fontWeight: 700,
              }}>
                R$ {valorTotal.toFixed(2)}
              </div>
            </label>
            <label style={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              fontSize: '14px', color: '#cfcfcf', marginBottom: '16px'
            }}>
              Observação <input style={inputStyle} value={movObservacao}
                onChange={e => setMovObservacao(e.target.value)} placeholder="Venda avulsa" />
            </label>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button onClick={fecharModal} style={{
                backgroundColor: 'transparent', color: '#aaa', border: '1px solid #444',
                borderRadius: '6px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer'
              }}>Cancelar</button>
              <button onClick={handleSaida} disabled={saving || !movBarbeiroId} style={{
                backgroundColor: '#ff9800', color: '#0d0d0d', border: 'none',
                borderRadius: '6px', padding: '10px 20px', fontSize: '14px', fontWeight: 700,
                cursor: 'pointer', opacity: saving || !movBarbeiroId ? 0.5 : 1
              }}>
                {saving ? 'Registrando...' : 'Registrar Saída'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Histórico */}
      {modalAberto === 'movimentacoes' && produtoSelecionado && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000
        }} onClick={fecharModal}>
          <div style={{
            backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px',
            padding: '32px', width: '90%', maxWidth: '700px',
            maxHeight: '90vh', overflowY: 'auto'
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '18px', color: '#D4AF37', marginBottom: '16px', fontWeight: 600 }}>
              📊 Histórico — {produtoSelecionado.nome}
            </h2>
            {movimentacoes.length === 0 && (
              <p style={{ color: '#aaa', textAlign: 'center', padding: '20px' }}>
                Nenhuma movimentação.
              </p>
            )}
            {movimentacoes.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Data</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Tipo</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Qtd</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Barbeiro</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Comissão</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Motivo</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #333', color: '#aaa', fontWeight: 600 }}>Obs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimentacoes.map(m => (
                      <tr key={m.id}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222' }}>
                          {new Date(m.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222' }}>
                          <span style={{
                            display: 'inline-flex', padding: '2px 8px', borderRadius: '4px',
                            fontSize: '12px', fontWeight: 600,
                            backgroundColor: m.tipo === 'entrada' ? '#1a3a1a' : '#3a1a1a',
                            color: m.tipo === 'entrada' ? '#4caf50' : '#ff6b6b'
                          }}>
                            {m.tipo === 'entrada' ? '📥 Entrada' : '📤 Saída'}
                          </span>
                        </td>
                        <td style={{
                          padding: '10px 12px', borderBottom: '1px solid #222',
                          fontWeight: 700, fontSize: '16px',
                          color: m.tipo === 'entrada' ? '#4caf50' : '#ff6b6b'
                        }}>
                          {m.tipo === 'entrada' ? '+' : '-'}{m.quantidade}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', color: '#aaa' }}>
                          {m.barbeiros?.nome || '-'}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', color: '#aaa' }}>
                          {m.comissao_percentual != null ? `${m.comissao_percentual}%` : '-'}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', color: '#aaa', textTransform: 'capitalize' }}>
                          {m.motivo === 'venda' ? 'Venda' : m.motivo === 'compra' ? 'Compra' : m.motivo === 'ajuste' ? 'Ajuste' : 'Perda'}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #222', color: '#888', fontSize: '12px' }}>
                          {m.observacao || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={fecharModal} style={{
                backgroundColor: 'transparent', color: '#aaa', border: '1px solid #444',
                borderRadius: '6px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer'
              }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}