import {
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { FileText, Search, DollarSign, Scissors, Users, TrendingUp } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { PageHeader } from '../components/PageHeader'
import { KPICard } from '../components/KPICard'

const CORES = ['#c5a059', '#1a1a1a', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899']


const inputStyles = {
  input: {
    background: '#0d0d0d',
    borderColor: 'rgba(197,160,89,0.2)',
    color: '#f5f5f5',
    colorScheme: 'dark' as const,
  },
  label: { color: '#cfcfcf' },
}

type RelatorioAgendamento = {
  data: string
  horario: string
  barbeiros?: { nome: string } | { nome: string }[] | null
  servicos?: { nome: string; preco: number } | { nome: string; preco: number }[] | null
}

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function joinOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export default function Relatorios() {
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [agendamentos, setAgendamentos] = useState<RelatorioAgendamento[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const hoje = new Date()
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    setDataInicio(primeiroDia.toISOString().split('T')[0])
    setDataFim(hoje.toISOString().split('T')[0])
  }, [])

  const buscarDados = async () => {
    if (!dataInicio || !dataFim) return
    setLoading(true)
    const { data, error } = await supabase
      .from('agendamentos')
      .select('data, horario, barbeiros(nome), servicos(nome, preco)')
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .order('data', { ascending: true })
    if (error) {
      console.error('Erro:', error)
    } else {
      setAgendamentos(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (dataInicio && dataFim) buscarDados()
  }, [dataInicio, dataFim])

  const relatorio = useMemo(() => {
    const barbeiroMap: Record<string, { quantidade: number; receita: number }> = {}
    const servicoMap: Record<string, { quantidade: number; receita: number }> = {}
    let receitaTotal = 0
    let quantidadeTotal = 0

    agendamentos.forEach((item) => {
      const barbeiro = joinOne(item.barbeiros)?.nome || 'Desconhecido'
      const servicoInfo = joinOne(item.servicos)
      const servico = servicoInfo?.nome || 'Desconhecido'
      const preco = Number(servicoInfo?.preco) || 0

      if (!barbeiroMap[barbeiro]) {
        barbeiroMap[barbeiro] = { quantidade: 0, receita: 0 }
      }
      barbeiroMap[barbeiro].quantidade += 1
      barbeiroMap[barbeiro].receita += preco

      if (!servicoMap[servico]) {
        servicoMap[servico] = { quantidade: 0, receita: 0 }
      }
      servicoMap[servico].quantidade += 1
      servicoMap[servico].receita += preco

      receitaTotal += preco
      quantidadeTotal += 1
    })

    const servicosPorBarbeiro = Object.entries(barbeiroMap).map(([b, v]) => ({
      barbeiro: b,
      quantidade: v.quantidade,
    }))

    const receitaPorBarbeiro = Object.entries(barbeiroMap).map(([b, v]) => ({
      barbeiro: b,
      receita: v.receita,
    }))

    const servicosPorTipo = Object.entries(servicoMap).map(([s, v]) => ({
      servico: s,
      quantidade: v.quantidade,
      receita: v.receita,
    }))

    const maisRentavel = Object.entries(barbeiroMap).reduce(
      (acc, [nome, val]) => (val.receita > acc.receita ? { nome, receita: val.receita } : acc),
      { nome: '-', receita: 0 },
    ).nome

    return {
      receitaTotal,
      quantidadeTotal,
      ticketMedio: quantidadeTotal > 0 ? receitaTotal / quantidadeTotal : 0,
      barbeiroMaisRentavel: maisRentavel,
      servicosPorBarbeiro,
      receitaPorBarbeiro,
      servicosPorTipo,
      barbeiros: Object.keys(barbeiroMap),
    }
  }, [agendamentos])

  const exportarPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('Relatorio de Atendimentos', 14, 20)
    doc.setFontSize(12)
    doc.text('Periodo: ' + dataInicio + ' a ' + dataFim, 14, 30)
    doc.text('Receita Total: ' + formatarMoeda(relatorio.receitaTotal), 14, 38)
    doc.text('Total de Atendimentos: ' + relatorio.quantidadeTotal, 14, 46)
    const linhas = agendamentos.map((item) => {
      const barbeiro = joinOne(item.barbeiros)?.nome || 'Desconhecido'
      const servicoInfo = joinOne(item.servicos)
      return [
        item.data ? new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-',
        item.horario || '-',
        barbeiro,
        servicoInfo?.nome || 'Desconhecido',
        formatarMoeda(Number(servicoInfo?.preco) || 0),
      ]
    })
    autoTable(doc, {
      head: [['Data', 'Horario', 'Barbeiro', 'Servico', 'Receita']],
      body: linhas,
      startY: 55,
      headStyles: { fillColor: [26, 26, 26], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { textColor: 0 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    })
    doc.save('relatorio-atendimentos.pdf')
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Relatórios"
        description="Análise de atendimentos e receita"
        action={
          <Group gap="sm" wrap="wrap">
            <TextInput
              label="De"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.currentTarget.value)}
              styles={inputStyles}
            />
            <TextInput
              label="Até"
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.currentTarget.value)}
              styles={inputStyles}
            />
            <Button
              color="gold"
              c="#0A0A0A"
              leftSection={<Search size={16} />}
              onClick={buscarDados}
              mt={22}
            >
              Buscar
            </Button>
            <Button
              variant="outline"
              color="gold"
              leftSection={<FileText size={16} />}
              onClick={exportarPDF}
              mt={22}
            >
              Exportar PDF
            </Button>
          </Group>
        }
      />

      {loading ? (
        <Group justify="center" py="xl">
          <Loader color="gold" />
          <Text c="dimmed">Carregando relatório...</Text>
        </Group>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            <KPICard
              title="Receita Total"
              value={formatarMoeda(relatorio.receitaTotal)}
              icon={DollarSign}
            />
            <KPICard
              title="Total Atendimentos"
              value={relatorio.quantidadeTotal}
              icon={Scissors}
            />
            <KPICard
              title="Ticket Médio"
              value={formatarMoeda(relatorio.ticketMedio)}
              icon={TrendingUp}
            />
            <KPICard
              title="Mais Rentável"
              value={relatorio.barbeiroMaisRentavel}
              icon={Users}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Card withBorder padding="lg" radius="lg">
              <Title order={5} c="gold" mb="md">
                Serviços por Barbeiro
              </Title>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={relatorio.servicosPorBarbeiro}>
                  <CartesianGrid stroke="rgba(197,160,89,0.15)" strokeDasharray="3 3" />
                  <XAxis dataKey="barbeiro" tick={{ fill: '#aaa', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#aaa', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid rgba(197,160,89,0.3)',
                      color: '#f5f5f5',
                    }}
                  />
                  <Bar dataKey="quantidade" fill="#c5a059" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card withBorder padding="lg" radius="lg">
              <Title order={5} c="gold" mb="md">
                Receita por Barbeiro
              </Title>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={relatorio.receitaPorBarbeiro}>
                  <CartesianGrid stroke="rgba(197,160,89,0.15)" strokeDasharray="3 3" />
                  <XAxis dataKey="barbeiro" tick={{ fill: '#aaa', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#aaa', fontSize: 12 }} tickFormatter={(v) => 'R$' + v} />
                  <Tooltip
                    formatter={(v) => formatarMoeda(Number(v ?? 0))}
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid rgba(197,160,89,0.3)',
                      color: '#f5f5f5',
                    }}
                  />
                  <Bar dataKey="receita" fill="#c5a059" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Card withBorder padding="lg" radius="lg">
              <Title order={5} c="gold" mb="md">
                Serviços por Tipo
              </Title>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={relatorio.servicosPorTipo}
                    dataKey="quantidade"
                    nameKey="servico"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) =>
                      name + ': ' + ((percent ?? 0) * 100).toFixed(0) + '%'
                    }
                  >
                    {relatorio.servicosPorTipo.map((_, i) => (
                      <Cell key={i} fill={CORES[i % CORES.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1a1a',
                      border: '1px solid rgba(197,160,89,0.3)',
                      color: '#f5f5f5',
                    }}
                  />
                  <Legend wrapperStyle={{ color: '#aaa' }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card withBorder padding="lg" radius="lg">
              <Title order={5} c="gold" mb="md">
                Atendimentos Detalhados
              </Title>
              <Table.ScrollContainer minWidth={400}>
                <Table highlightOnHover verticalSpacing="sm" fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Data</Table.Th>
                      <Table.Th>Horário</Table.Th>
                      <Table.Th>Barbeiro</Table.Th>
                      <Table.Th>Serviço</Table.Th>
                      <Table.Th ta="right">Receita</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {agendamentos.map((item, i) => {
                      const barbeiro = joinOne(item.barbeiros)?.nome || 'Desconhecido'
                      const servicoInfo = joinOne(item.servicos)
                      return (
                        <Table.Tr key={i}>
                          <Table.Td>
                            {item.data
                              ? new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR')
                              : '-'}
                          </Table.Td>
                          <Table.Td>{item.horario || '-'}</Table.Td>
                          <Table.Td>{barbeiro}</Table.Td>
                          <Table.Td>{servicoInfo?.nome || 'Desconhecido'}</Table.Td>
                          <Table.Td ta="right" fw={700} c="gold">
                            {formatarMoeda(Number(servicoInfo?.preco) || 0)}
                          </Table.Td>
                        </Table.Tr>
                      )
                    })}
                    {agendamentos.length === 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={5}>
                          <Text c="dimmed" ta="center" py="md">
                            Nenhum atendimento encontrado no período selecionado.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Card>
          </SimpleGrid>
        </>
      )}
    </Stack>
  )
}
