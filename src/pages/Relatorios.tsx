import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  FileText, Search, DollarSign, Scissors, Users, TrendingUp, Calendar,
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const CORES = ['#c9a227', '#1a1a1a', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Relatorios() {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [agendamentos, setAgendamentos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    setDataInicio(primeiroDia.toISOString().split('T')[0]);
    setDataFim(hoje.toISOString().split('T')[0]);
  }, []);

  const buscarDados = async () => {
    if (!dataInicio || !dataFim) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('agendamentos')
      .select('data, horario, barbeiros(nome), servicos(nome, preco)')
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .order('data', { ascending: true });
    if (error) {
      console.error('Erro:', error);
    } else {
      setAgendamentos(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { buscarDados(); }, [dataInicio, dataFim]);

  const relatorio = useMemo(() => {
    const barbeiroMap = {};
    const servicoMap = {};
    let receitaTotal = 0;
    let quantidadeTotal = 0;

    agendamentos.forEach((item) => {
      const barbeiro = item.barbeiros?.nome || 'Desconhecido';
      const servico = item.servicos?.nome || 'Desconhecido';
      const preco = Number(item.servicos?.preco) || 0;

      if (!barbeiroMap[barbeiro]) {
        barbeiroMap[barbeiro] = { quantidade: 0, receita: 0 };
      }
      barbeiroMap[barbeiro].quantidade += 1;
      barbeiroMap[barbeiro].receita += preco;

      if (!servicoMap[servico]) {
        servicoMap[servico] = { quantidade: 0, receita: 0 };
      }
      servicoMap[servico].quantidade += 1;
      servicoMap[servico].receita += preco;

      receitaTotal += preco;
      quantidadeTotal += 1;
    });

    const servicosPorBarbeiro = Object.entries(barbeiroMap).map(([b, v]) => ({
      barbeiro: b, quantidade: v.quantidade
    }));

    const receitaPorBarbeiro = Object.entries(barbeiroMap).map(([b, v]) => ({
      barbeiro: b, receita: v.receita
    }));

    const servicosPorTipo = Object.entries(servicoMap).map(([s, v]) => ({
      servico: s, quantidade: v.quantidade, receita: v.receita
    }));

    const maisRentavel = Object.entries(barbeiroMap).reduce(
      (acc, [nome, val]) => val.receita > acc.receita ? { nome, receita: val.receita } : acc,
      { nome: '-', receita: 0 }
    ).nome;

    return {
      receitaTotal, quantidadeTotal,
      ticketMedio: quantidadeTotal > 0 ? receitaTotal / quantidadeTotal : 0,
      barbeiroMaisRentavel: maisRentavel,
      servicosPorBarbeiro, receitaPorBarbeiro, servicosPorTipo,
      barbeiros: Object.keys(barbeiroMap),
    };
  }, [agendamentos]);

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Relatorio de Atendimentos', 14, 20);
    doc.setFontSize(12);
    doc.text('Periodo: ' + dataInicio + ' a ' + dataFim, 14, 30);
    doc.text('Receita Total: ' + formatarMoeda(relatorio.receitaTotal), 14, 38);
    doc.text('Total de Atendimentos: ' + relatorio.quantidadeTotal, 14, 46);
    const linhas = agendamentos.map((item) => [
      item.data ? new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
      item.horario || '-',
      item.barbeiros?.nome || 'Desconhecido',
      item.servicos?.nome || 'Desconhecido',
      formatarMoeda(Number(item.servicos?.preco) || 0),
    ]);
    doc.autoTable({
      head: [['Data', 'Horario', 'Barbeiro', 'Servico', 'Receita']],
      body: linhas, startY: 55,
      headStyles: { fillColor: [26, 26, 26], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { textColor: 0 }, alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    doc.save('relatorio-atendimentos.pdf');
  };

  const estiloInput = {
    backgroundColor: '#ffffff', color: '#000000',
    border: '2px solid #1a1a1a', borderRadius: 8,
    padding: '10px 14px', fontSize: 15, fontWeight: 600,
    marginLeft: 8,
  };

  const estiloBotao = {
    padding: '10px 18px', borderRadius: 8, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, border: '2px solid #1a1a1a',
  };

  const estiloCardGrafico = {
    backgroundColor: '#ffffff', border: '2px solid #1a1a1a',
    borderRadius: 12, padding: 20,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)', color: '#000000',
    flex: 1, minWidth: 300,
  };

  return (
    <div style={{ padding: 24, backgroundColor: '#f3f4f6', minHeight: '100vh', color: '#000' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={32} color="#c9a227" /> Relat&oacute;rios
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 700, color: '#1a1a1a' }}>
              De: <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={estiloInput} />
            </label>
            <label style={{ fontWeight: 700, color: '#1a1a1a' }}>
              At&eacute;: <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={estiloInput} />
            </label>
            <button onClick={buscarDados} style={{ ...estiloBotao, backgroundColor: '#c9a227', color: '#000' }}>
              <Search size={18} /> Buscar
            </button>
            <button onClick={exportarPDF} style={{ ...estiloBotao, backgroundColor: '#1a1a1a', color: '#fff' }}>
              <FileText size={18} /> Exportar PDF
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#1a1a1a', fontWeight: 700, fontSize: 16, textAlign: 'center', padding: 40 }}>
            Carregando relat&oacute;rio...
          </p>
        ) : (
          <>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div style={{ background: 'linear-gradient(135deg, #f5d78e 0%, #c9a227 100%)', color: '#000', borderRadius: 12, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <DollarSign size={32} />
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: '#1a1a1a' }}>Receita Total</p>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#000' }}>{formatarMoeda(relatorio.receitaTotal)}</h2>
                </div>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #f5d78e 0%, #c9a227 100%)', color: '#000', borderRadius: 12, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <Scissors size={32} />
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: '#1a1a1a' }}>Total Atendimentos</p>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#000' }}>{relatorio.quantidadeTotal}</h2>
                </div>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #f5d78e 0%, #c9a227 100%)', color: '#000', borderRadius: 12, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <TrendingUp size={32} />
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: '#1a1a1a' }}>Ticket M&eacute;dio</p>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#000' }}>{formatarMoeda(relatorio.ticketMedio)}</h2>
                </div>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #f5d78e 0%, #c9a227 100%)', color: '#000', borderRadius: 12, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <Users size={32} />
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: '#1a1a1a' }}>Mais Rent&aacute;vel</p>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#000' }}>{relatorio.barbeiroMaisRentavel}</h2>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 24 }}>
              <div style={estiloCardGrafico}>
                <h3 style={{ marginBottom: 12, color: '#000', fontWeight: 800 }}>Servi&ccedil;os por Barbeiro</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={relatorio.servicosPorBarbeiro}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis dataKey="barbeiro" tick={{ fill: '#000', fontWeight: 700 }} />
                    <YAxis tick={{ fill: '#000', fontWeight: 700 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '2px solid #1a1a1a', color: '#000' }} itemStyle={{ color: '#000', fontWeight: 700 }} />
                    <Bar dataKey="quantidade" fill="#c9a227" stroke="#1a1a1a" strokeWidth={2} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={estiloCardGrafico}>
                <h3 style={{ marginBottom: 12, color: '#000', fontWeight: 800 }}>Receita por Barbeiro</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={relatorio.receitaPorBarbeiro}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                    <XAxis dataKey="barbeiro" tick={{ fill: '#000', fontWeight: 700 }} />
                    <YAxis tick={{ fill: '#000', fontWeight: 700 }} tickFormatter={(v) => 'R$' + v} />
                    <Tooltip formatter={(v) => formatarMoeda(v)} contentStyle={{ backgroundColor: '#fff', border: '2px solid #1a1a1a', color: '#000' }} itemStyle={{ color: '#000', fontWeight: 700 }} />
                    <Bar dataKey="receita" fill="#1a1a1a" stroke="#c9a227" strokeWidth={2} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 24 }}>
              <div style={{ ...estiloCardGrafico, maxWidth: 500 }}>
                <h3 style={{ marginBottom: 12, color: '#000', fontWeight: 800 }}>Servi&ccedil;os por Tipo</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={relatorio.servicosPorTipo} dataKey="quantidade" nameKey="servico"
                      cx="50%" cy="50%" outerRadius={100}
                      label={({ name, percent }) => name + ': ' + (percent * 100).toFixed(0) + '%'}>
                      {relatorio.servicosPorTipo.map((_, i) => (
                        <Cell key={i} fill={CORES[i % CORES.length]} stroke="#1a1a1a" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '2px solid #1a1a1a', color: '#000' }} itemStyle={{ color: '#000', fontWeight: 700 }} />
                    <Legend wrapperStyle={{ color: '#000', fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ ...estiloCardGrafico, flex: 2, minWidth: 400 }}>
                <h3 style={{ marginBottom: 12, color: '#000', fontWeight: 800 }}>Atendimentos Detalhados</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#000' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#1a1a1a', color: '#fff' }}>
                        <th style={{ padding: 12, textAlign: 'left', fontWeight: 800 }}>Data</th>
                        <th style={{ padding: 12, textAlign: 'left', fontWeight: 800 }}>Hor&aacute;rio</th>
                        <th style={{ padding: 12, textAlign: 'left', fontWeight: 800 }}>Barbeiro</th>
                        <th style={{ padding: 12, textAlign: 'left', fontWeight: 800 }}>Servi&ccedil;o</th>
                        <th style={{ padding: 12, textAlign: 'right', fontWeight: 800 }}>Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agendamentos.map((item, i) => (
                        <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f3f4f6' }}>
                          <td style={{ padding: 12, fontWeight: 700, color: '#000' }}>
                            {item.data ? new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td style={{ padding: 12, fontWeight: 700, color: '#000' }}>{item.horario || '-'}</td>
                          <td style={{ padding: 12, fontWeight: 700, color: '#000' }}>{item.barbeiros?.nome || 'Desconhecido'}</td>
                          <td style={{ padding: 12, fontWeight: 700, color: '#000' }}>{item.servicos?.nome || 'Desconhecido'}</td>
                          <td style={{ padding: 12, textAlign: 'right', fontWeight: 900, color: '#000' }}>
                            {formatarMoeda(Number(item.servicos?.preco) || 0)}
                          </td>
                        </tr>
                      ))}
                      {agendamentos.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: '#000', fontWeight: 700 }}>
                            Nenhum atendimento encontrado no per&iacute;odo selecionado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  );
}