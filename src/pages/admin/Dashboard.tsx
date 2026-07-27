import { useEffect, useState } from 'react'
import { getBarbers, getProdutos, getMovimentacoes, getResumoComissoes } from '../../lib/api'
import type { Barber } from '../../types/database'
import type { Produto, ResumoComissaoBarbeiro } from '../../lib/api'
import { useNavigate } from '@tanstack/react-router'
import { gerarPDFResumoComissoes } from '../../utils/gerarPDF'

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ barbeiros: 0, produtos: 0, servicosMes: 0, vendasMes: 0 })
  const [produtosBaixo, setProdutosBaixo] = useState<Produto[]>([])
  const [comissoes, setComissoes] = useState<ResumoComissaoBarbeiro[]>([])
  const [movRecentes, setMovRecentes] = useState<any[]>([])
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => { carregarDados() }, [])

  async function carregarDados() {
    setLoading(true)
    setErro(null)
    try {
      const [barbeiros, produtos, movimentacoes, comissoesData] = await Promise.all([
        getBarbers(),
        getProdutos(),
        getMovimentacoes(),
        getResumoComissoes({
          dataInicio: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          dataFim: new Date().toISOString().split('T')[0],
        }),
      ])
      setStats({
        barbeiros: barbeiros.length,
        produtos: produtos.length,
        servicosMes: comissoesData.reduce((a: number, r: any) => a + r.total_servicos, 0),
        vendasMes: comissoesData.reduce((a: number, r: any) => a + r.total_vendas, 0),
      })
      setProdutosBaixo(produtos.filter(p => p.estoque_atual <= p.estoque_minimo).sort((a, b) => a.estoque_atual - b.estoque_atual))
      setComissoes(comissoesData)
      setMovRecentes(movimentacoes.slice(0, 5))
    } catch (err: any) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalComissao = comissoes.reduce((a, r) => a + r.total_a_receber, 0)
  const totalServicosValor = comissoes.reduce((a, r) => a + r.valor_servicos, 0)
  const totalVendasValor = comissoes.reduce((a, r) => a + r.valor_vendas, 0)

  // 🔥 Handler do PDF
  const handleExportarPDF = () => {
    if (comissoes.length === 0) return
    const dataInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    const dataFim = new Date().toISOString().split('T')[0]
    gerarPDFResumoComissoes(comissoes, dataInicio, dataFim)
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#161616',
    border: '1px solid #222',
    borderRadius: '8px',
    padding: '20px 24px',
    flex: '1',
    minWidth: '200px',
  }

  const valorStyle: React.CSSProperties = {
    fontSize: '28px',
    fontWeight: 700,
    marginTop: '8px',
  }

  if (loading) {
    return <div style={{ padding: '24px', color: '#999' }}>Carregando dashboard...</div>
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Título */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '24px' }}>📊 Dashboard</h1>
        <button onClick={carregarDados} style={{
          backgroundColor: 'transparent', color: '#D4AF37', border: '1px solid #D4AF37',
          borderRadius: '4px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
        }}>🔄 Atualizar</button>
      </div>

      {erro && (
        <div style={{ backgroundColor: '#2d1b1b', border: '1px solid #ff4444', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', color: '#ff6666' }}>
          {erro}
        </div>
      )}

      {/* Cards de métricas */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div style={cardStyle}>
          <div style={{ fontSize: '13px', color: '#999' }}>✂️ Barbeiros</div>
          <div style={valorStyle}>{stats.barbeiros}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '13px', color: '#999' }}>📦 Produtos</div>
          <div style={valorStyle}>{stats.produtos}</div>
          {produtosBaixo.length > 0 && (
            <div style={{ fontSize: '11px', color: '#ff8844', marginTop: '4px' }}>
              ⚠️ {produtosBaixo.length} com estoque baixo
            </div>
          )}
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '13px', color: '#999' }}>🗂️ Serviços (mês)</div>
          <div style={valorStyle}>{stats.servicosMes}</div>
          <div style={{ fontSize: '12px', color: '#22c55e' }}>R$ {totalServicosValor.toFixed(2)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: '13px', color: '#999' }}>🛒 Vendas (mês)</div>
          <div style={valorStyle}>{stats.vendasMes}</div>
          <div style={{ fontSize: '12px', color: '#22c55e' }}>R$ {totalVendasValor.toFixed(2)}</div>
        </div>
      </div>

      {/* Comissões do mês */}
      <div style={{ ...cardStyle, marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '16px' }}>💰 Comissões do Mês</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* 🔥 Botão Exportar PDF */}
            <button onClick={handleExportarPDF} style={{
              backgroundColor: 'transparent', color: '#22c55e', border: '1px solid #22c55e',
              borderRadius: '4px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
            }}>
              📄 Exportar PDF
            </button>
            <button onClick={() => navigate({ to: '/admin/comissoes' })} style={{
              backgroundColor: 'transparent', color: '#D4AF37', border: '1px solid #D4AF37',
              borderRadius: '4px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
            }}> Ver Relatório</button>
          </div>
        </div>

        {comissoes.length === 0 ? (
          <div style={{ color: '#666', padding: '20px', textAlign: 'center' }}>Nenhum dado no período.</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333', color: '#999' }}>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Barbeiro</th>
                  <th style={{ textAlign: 'center', padding: '8px' }}>Serviços</th>
                  <th style={{ textAlign: 'center', padding: '8px' }}>Vendas</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>A Receber</th>
                </tr>
              </thead>
              <tbody>
                {comissoes.slice(0, 5).map(r => (
                  <tr key={r.barbeiro_id} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '8px' }}>{r.nome}</td>
                    <td style={{ textAlign: 'center', padding: '8px' }}>{r.total_servicos}</td>
                    <td style={{ textAlign: 'center', padding: '8px' }}>{r.total_vendas}</td>
                    <td style={{ textAlign: 'right', padding: '8px', color: '#D4AF37' }}>R$ {r.total_a_receber.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              {comissoes.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #D4AF37', fontWeight: 700 }}>
                    <td style={{ padding: '8px' }}>Total</td>
                    <td style={{ textAlign: 'center', padding: '8px' }}>{comissoes.reduce((a, r) => a + r.total_servicos, 0)}</td>
                    <td style={{ textAlign: 'center', padding: '8px' }}>{comissoes.reduce((a, r) => a + r.total_vendas, 0)}</td>
                    <td style={{ textAlign: 'right', padding: '8px', color: '#D4AF37' }}>R$ {totalComissao.toFixed(2)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </>
        )}
      </div>

      {/* Layout de duas colunas */}
      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Últimas movimentações */}
        <div style={{ ...cardStyle, flex: '2' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>📋 Últimas Movimentações</h2>
          {movRecentes.length === 0 ? (
            <div style={{ color: '#666', padding: '20px', textAlign: 'center' }}>Nenhuma movimentação recente.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {movRecentes.map((m: any) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #222', fontSize: '13px' }}>
                  <div>
                    <div>{m.produtos?.nome || 'Produto'}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>{new Date(m.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <div style={{ color: m.tipo === 'entrada' ? '#22c55e' : '#ff6666', fontWeight: 600 }}>
                    {m.tipo === 'entrada' ? '+ENT' : '-SAI'} {m.quantidade}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar - Estoque Baixo */}
        <div style={{ ...cardStyle, flex: '1' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>⚠️ Estoque Baixo</h2>
          {produtosBaixo.length === 0 ? (
            <div style={{ color: '#22c55e', padding: '20px', textAlign: 'center' }}>✅ Todos os produtos com estoque OK.</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {produtosBaixo.slice(0, 10).map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #222', fontSize: '12px' }}>
                    <div>
                      <div>{p.nome}</div>
                      <div style={{ color: '#666', fontSize: '11px' }}>Mín: {p.estoque_minimo}</div>
                    </div>
                    <div style={{ color: '#ff8844', fontWeight: 600 }}>{p.estoque_atual}</div>
                  </div>
                ))}
              </div>
              {produtosBaixo.length > 10 && (
                <div style={{ color: '#999', fontSize: '11px', marginTop: '8px', textAlign: 'center' }}>
                  +{produtosBaixo.length - 10} produtos com estoque baixo
                </div>
              )}
              <button onClick={() => navigate({ to: '/admin/produtos' })} style={{
                backgroundColor: 'transparent', color: '#D4AF37', border: '1px solid #D4AF37',
                borderRadius: '4px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer',
                width: '100%', marginTop: '12px'
              }}> Gerenciar Produtos</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}