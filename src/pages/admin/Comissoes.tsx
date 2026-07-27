import { useEffect, useState } from 'react'
import { getBarbers, getResumoComissoes, getRelatorioComissoes } from '../../lib/api'
import type { ResumoComissaoBarbeiro, RelatorioComissaoCompleto, DetalheServicoComissao, DetalheVendaComissao } from '../../lib/api'
import type { Barber } from '../../types/database'
import { gerarPDFResumoComissoes, gerarPDFRelatorioIndividual } from '../../utils/gerarPDF'

export default function Comissoes() {
  const hoje = new Date()
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const [dataInicio, setDataInicio] = useState(primeiroDia.toISOString().split('T')[0])
  const [dataFim, setDataFim] = useState(hoje.toISOString().split('T')[0])
  const [barbeiroFiltro, setBarbeiroFiltro] = useState('todos')
  const [barbeiros, setBarbeiros] = useState<Barber[]>([])
  const [resumo, setResumo] = useState<ResumoComissaoBarbeiro[]>([])
  const [detalhe, setDetalhe] = useState<RelatorioComissaoCompleto | null>(null)
  const [loading, setLoading] = useState(false)
  const [detalheAberto, setDetalheAberto] = useState<string | null>(null)

  async function carregarBarbeiros() {
    try {
      const data = await getBarbers()
      setBarbeiros(data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { carregarBarbeiros() }, [])

  async function gerarRelatorio() {
    setLoading(true)
    setDetalhe(null)
    setDetalheAberto(null)
    try {
      if (barbeiroFiltro === 'todos') {
        const resumoData = await getResumoComissoes({ dataInicio, dataFim })
        setResumo(resumoData)
      } else {
        const detalheData = await getRelatorioComissoes({ barbeiro_id: barbeiroFiltro, dataInicio, dataFim })
        setDetalhe(detalheData)
        setResumo([])
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function abrirDetalhe(barbeiroId: string) {
    if (detalheAberto === barbeiroId) {
      setDetalheAberto(null)
      setDetalhe(null)
      return
    }
    setLoading(true)
    try {
      const data = await getRelatorioComissoes({ barbeiro_id: barbeiroId, dataInicio, dataFim })
      setDetalhe(data)
      setDetalheAberto(barbeiroId)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  // 🔥 Handler PDF Geral
  const handleExportarPDFGeral = () => {
    if (resumo.length === 0) return
    gerarPDFResumoComissoes(resumo, dataInicio, dataFim)
  }

  // 🔥 Handler PDF Individual
  const handleExportarPDFIndividual = () => {
    if (!detalhe) return
    gerarPDFRelatorioIndividual(detalhe, dataInicio, dataFim)
  }

  const formatMoeda = (v: number) => `R$ ${v.toFixed(2)}`
  const formatData = (d: string) => new Date(d).toLocaleDateString('pt-BR')

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#0d0d0d', border: '1px solid #333', borderRadius: '6px',
    padding: '10px 12px', color: '#f5f5f5', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  // 🔥 Estilo específico para inputs de data — calendário amarelo
  const dateInputStyle: React.CSSProperties = {
    ...inputStyle,
    colorScheme: 'dark',
    accentColor: '#D4AF37',
  }

  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none', cursor: 'pointer' }

  const totalGeral = resumo.reduce(
    (acc, r) => ({
      servicos: acc.servicos + r.total_servicos,
      vendas: acc.vendas + r.total_vendas,
      valor: acc.valor + r.total_a_receber,
    }),
    { servicos: 0, vendas: 0, valor: 0 }
  )

  return (
    <>
      {/* 🔥 Estilo para o ícone do calendário ficar amarelo */}
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(76%) sepia(74%) saturate(654%) hue-rotate(359deg) brightness(103%) contrast(107%);
          cursor: pointer;
          opacity: 1;
        }
        input[type="date"]::-moz-calendar-picker-indicator {
          background-color: #D4AF37;
        }
      `}</style>

      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Título */}
        <h1 style={{ margin: '0 0 24px 0', fontSize: '24px' }}>💰 Comissões</h1>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '160px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#999', marginBottom: '4px' }}>Data Início</label>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={dateInputStyle} />
          </div>
          <div style={{ flex: '1', minWidth: '160px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#999', marginBottom: '4px' }}>Data Fim</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={dateInputStyle} />
          </div>
          <div style={{ flex: '1', minWidth: '160px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#999', marginBottom: '4px' }}>Barbeiro</label>
            <select value={barbeiroFiltro} onChange={e => setBarbeiroFiltro(e.target.value)} style={selectStyle}>
              <option value="todos">Todos os barbeiros</option>
              {barbeiros.map(b => (
                <option key={b.id} value={b.id}>{b.nome}</option>
              ))}
            </select>
          </div>
          <button onClick={gerarRelatorio} style={{
            backgroundColor: '#D4AF37', color: '#000', border: 'none', borderRadius: '6px',
            padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', height: '40px'
          }}>
            {loading ? 'Carregando...' : '📊 Gerar Relatório'}
          </button>
        </div>

        {/* Resumo de todos os barbeiros */}
        {resumo.length > 0 && (
          <div style={{ backgroundColor: '#161616', border: '1px solid #222', borderRadius: '8px', padding: '20px 24px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '16px' }}>📋 Resumo Geral</h2>
              {/* 🔥 Botão PDF Geral */}
              <button onClick={handleExportarPDFGeral} style={{
                backgroundColor: 'transparent', color: '#22c55e', border: '1px solid #22c55e',
                borderRadius: '4px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
              }}>
                📄 Exportar PDF
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333', color: '#999' }}>
                  <th style={{ textAlign: 'left', padding: '8px' }}>Barbeiro</th>
                  <th style={{ textAlign: 'center', padding: '8px' }}>Serviços</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Valor Serv.</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Comissão Serv.</th>
                  <th style={{ textAlign: 'center', padding: '8px' }}>Vendas</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Valor Vend.</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>Comissão Vend.</th>
                  <th style={{ textAlign: 'right', padding: '8px' }}>A Receber</th>
                  <th style={{ textAlign: 'center', padding: '8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {resumo.map(r => (
                  <tr key={r.barbeiro_id} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '8px' }}>{r.nome}</td>
                    <td style={{ textAlign: 'center', padding: '8px' }}>{r.total_servicos}</td>
                    <td style={{ textAlign: 'right', padding: '8px' }}>{formatMoeda(r.valor_servicos)}</td>
                    <td style={{ textAlign: 'right', padding: '8px' }}>{formatMoeda(r.comissao_servicos)}</td>
                    <td style={{ textAlign: 'center', padding: '8px' }}>{r.total_vendas}</td>
                    <td style={{ textAlign: 'right', padding: '8px' }}>{formatMoeda(r.valor_vendas)}</td>
                    <td style={{ textAlign: 'right', padding: '8px' }}>{formatMoeda(r.comissao_vendas)}</td>
                    <td style={{ textAlign: 'right', padding: '8px', color: '#D4AF37' }}>{formatMoeda(r.total_a_receber)}</td>
                    <td style={{ textAlign: 'center', padding: '8px' }}>
                      <button onClick={() => abrirDetalhe(r.barbeiro_id)} style={{
                        backgroundColor: 'transparent', color: '#D4AF37', border: '1px solid #D4AF37',
                        borderRadius: '4px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer'
                      }}>
                        {detalheAberto === r.barbeiro_id ? 'Fechar' : 'Detalhes'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #D4AF37', fontWeight: 700 }}>
                  <td style={{ padding: '8px' }}>Total Geral</td>
                  <td style={{ textAlign: 'center', padding: '8px' }}>{totalGeral.servicos}</td>
                  <td style={{ textAlign: 'right', padding: '8px' }}></td>
                  <td style={{ textAlign: 'right', padding: '8px' }}></td>
                  <td style={{ textAlign: 'center', padding: '8px' }}>{totalGeral.vendas}</td>
                  <td style={{ textAlign: 'right', padding: '8px' }}></td>
                  <td style={{ textAlign: 'right', padding: '8px' }}></td>
                  <td style={{ textAlign: 'right', padding: '8px', color: '#D4AF37' }}>{formatMoeda(totalGeral.valor)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>

            {/* Detalhamento de um barbeiro específico no resumo */}
            {detalhe && detalheAberto && (
              <DetalhamentoBarbeiro
                detalhe={detalhe}
                formatMoeda={formatMoeda}
                formatData={formatData}
                onExportarPDF={handleExportarPDFIndividual}
              />
            )}
          </div>
        )}

        {/* Relatório de um barbeiro específico (sem resumo) */}
        {detalhe && barbeiroFiltro !== 'todos' && (
          <DetalhamentoBarbeiro
            detalhe={detalhe}
            formatMoeda={formatMoeda}
            formatData={formatData}
            onExportarPDF={handleExportarPDFIndividual}
          />
        )}

        {/* Estado vazio */}
        {!loading && resumo.length === 0 && !detalhe && (
          <div style={{ color: '#666', padding: '40px', textAlign: 'center' }}>
            Selecione o período e clique em Gerar Relatório
          </div>
        )}
      </div>
    </>
  )
}

// =====================
// Componente de detalhamento separado
// =====================
function DetalhamentoBarbeiro({
  detalhe, formatMoeda, formatData, onExportarPDF
}: {
  detalhe: RelatorioComissaoCompleto
  formatMoeda: (v: number) => string
  formatData: (d: string) => string
  onExportarPDF: () => void
}) {
  return (
    <div style={{ backgroundColor: '#161616', border: '1px solid #222', borderRadius: '8px', padding: '20px 24px', marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '16px' }}>👤 {detalhe.barbeiro.nome}</h2>
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            Comissão serviços: {detalhe.barbeiro.percentual_servico}% · Comissão produtos: {detalhe.barbeiro.percentual_produto}%
          </div>
        </div>
        {/* 🔥 Botão PDF Individual */}
        <button onClick={onExportarPDF} style={{
          backgroundColor: 'transparent', color: '#22c55e', border: '1px solid #22c55e',
          borderRadius: '4px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer'
        }}>
          📄 Exportar PDF Individual
        </button>
      </div>

      {/* Serviços */}
      <h3 style={{ margin: '16px 0 8px 0', fontSize: '14px', color: '#22c55e' }}>🗂️ Serviços Realizados</h3>
      {detalhe.servicos.length === 0 ? (
        <div style={{ color: '#666', padding: '12px' }}>Nenhum serviço no período.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333', color: '#999' }}>
              <th style={{ textAlign: 'left', padding: '6px' }}>Data</th>
              <th style={{ textAlign: 'left', padding: '6px' }}>Serviço</th>
              <th style={{ textAlign: 'right', padding: '6px' }}>Valor</th>
              <th style={{ textAlign: 'center', padding: '6px' }}>% Comissão</th>
              <th style={{ textAlign: 'right', padding: '6px' }}>Comissão</th>
            </tr>
          </thead>
          <tbody>
            {detalhe.servicos.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px' }}>{formatData(s.data)}</td>
                <td style={{ padding: '6px' }}>{s.servico_nome}</td>
                <td style={{ textAlign: 'right', padding: '6px' }}>{formatMoeda(s.valor_cobrado)}</td>
                <td style={{ textAlign: 'center', padding: '6px' }}>{s.percentual_comissao}%</td>
                <td style={{ textAlign: 'right', padding: '6px' }}>{formatMoeda(s.valor_comissao)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #22c55e', fontWeight: 700 }}>
              <td style={{ padding: '6px' }}>Total Serviços</td>
              <td></td>
              <td style={{ textAlign: 'right', padding: '6px' }}>{formatMoeda(detalhe.totais.valor_servicos)}</td>
              <td></td>
              <td style={{ textAlign: 'right', padding: '6px' }}>{formatMoeda(detalhe.totais.comissao_servicos)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      {/* Vendas */}
      <h3 style={{ margin: '16px 0 8px 0', fontSize: '14px', color: '#3b82f6' }}>🛒 Vendas de Produtos</h3>
      {detalhe.vendas.length === 0 ? (
        <div style={{ color: '#666', padding: '12px' }}>Nenhuma venda no período.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333', color: '#999' }}>
              <th style={{ textAlign: 'left', padding: '6px' }}>Data</th>
              <th style={{ textAlign: 'left', padding: '6px' }}>Produto</th>
              <th style={{ textAlign: 'center', padding: '6px' }}>Qtd</th>
              <th style={{ textAlign: 'right', padding: '6px' }}>Valor Total</th>
              <th style={{ textAlign: 'center', padding: '6px' }}>% Comissão</th>
              <th style={{ textAlign: 'right', padding: '6px' }}>Comissão</th>
            </tr>
          </thead>
          <tbody>
            {detalhe.vendas.map((v, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '6px' }}>{formatData(v.data)}</td>
                <td style={{ padding: '6px' }}>{v.produto_nome}</td>
                <td style={{ textAlign: 'center', padding: '6px' }}>{v.quantidade}</td>
                <td style={{ textAlign: 'right', padding: '6px' }}>{formatMoeda(v.valor_total)}</td>
                <td style={{ textAlign: 'center', padding: '6px' }}>{v.percentual_comissao}%</td>
                <td style={{ textAlign: 'right', padding: '6px' }}>{formatMoeda(v.valor_comissao)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #3b82f6', fontWeight: 700 }}>
              <td style={{ padding: '6px' }}>Total Vendas</td>
              <td></td>
              <td></td>
              <td style={{ textAlign: 'right', padding: '6px' }}>{formatMoeda(detalhe.totais.valor_vendas)}</td>
              <td></td>
              <td style={{ textAlign: 'right', padding: '6px' }}>{formatMoeda(detalhe.totais.comissao_vendas)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      {/* Total a Receber */}
      <div style={{ backgroundColor: '#1a1a1a', border: '1px solid #D4AF37', borderRadius: '6px', padding: '12px 16px', marginTop: '16px' }}>
        <div style={{ fontSize: '12px', color: '#999' }}>
          {detalhe.servicos.length} serviços · {detalhe.vendas.length} vendas
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#D4AF37', marginTop: '4px' }}>
          💵 Total a Receber: {formatMoeda(detalhe.totais.total_a_receber)}
        </div>
      </div>
    </div>
  )
}