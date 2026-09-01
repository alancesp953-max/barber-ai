import {
  Button,
  Card,
  Group,
  Loader,
  NativeSelect,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useEffect, useState } from 'react'
import { getBarbers, getResumoComissoes, getRelatorioComissoes } from '../../lib/api'
import type { ResumoComissaoBarbeiro, RelatorioComissaoCompleto } from '../../lib/api'
import type { Barber } from '../../types/database'
import { gerarPDFResumoComissoes, gerarPDFRelatorioIndividual } from '../../utils/gerarPDF'
import { PageHeader } from '../../components/PageHeader'


const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5', colorScheme: 'dark' as const },
  label: { color: '#cfcfcf' },
}

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

  useEffect(() => {
    carregarBarbeiros()
  }, [])

  async function gerarRelatorio() {
    setLoading(true)
    setDetalhe(null)
    setDetalheAberto(null)
    try {
      if (barbeiroFiltro === 'todos') {
        const resumoData = await getResumoComissoes({ dataInicio, dataFim })
        setResumo(resumoData)
      } else {
        const detalheData = await getRelatorioComissoes({
          barbeiro_id: barbeiroFiltro,
          dataInicio,
          dataFim,
        })
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

  const handleExportarPDFGeral = () => {
    if (resumo.length === 0) return
    gerarPDFResumoComissoes(resumo, dataInicio, dataFim)
  }

  const handleExportarPDFIndividual = () => {
    if (!detalhe) return
    gerarPDFRelatorioIndividual(detalhe, dataInicio, dataFim)
  }

  const formatMoeda = (v: number) => `R$ ${v.toFixed(2)}`
  const formatData = (d: string) => new Date(d).toLocaleDateString('pt-BR')

  const totalGeral = resumo.reduce(
    (acc, r) => ({
      servicos: acc.servicos + r.total_servicos,
      vendas: acc.vendas + r.total_vendas,
      valor: acc.valor + r.total_a_receber,
    }),
    { servicos: 0, vendas: 0, valor: 0 },
  )

  return (
    <Stack gap="lg">
      <PageHeader
        title="Comissões"
        description="Relatório mensal: serviços concluídos × % cadastrada de cada barbeiro"
      />

      <Group align="flex-end" wrap="wrap" gap="md">
        <TextInput
          label="Data Início"
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.currentTarget.value)}
          styles={inputStyles}
          style={{ flex: 1, minWidth: 160 }}
        />
        <TextInput
          label="Data Fim"
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.currentTarget.value)}
          styles={inputStyles}
          style={{ flex: 1, minWidth: 160 }}
        />
        <NativeSelect
          label="Barbeiro"
          value={barbeiroFiltro}
          onChange={(e) => setBarbeiroFiltro(e.currentTarget.value)}
          data={[
            { value: 'todos', label: 'Todos os barbeiros' },
            ...barbeiros.map((b) => ({ value: b.id, label: b.nome })),
          ]}
          styles={inputStyles}
          style={{ flex: 1, minWidth: 160 }}
        />
        <Button color="gold" c="#0A0A0A" onClick={gerarRelatorio} loading={loading}>
          Gerar Relatório
        </Button>
      </Group>

      {resumo.length > 0 && (
        <Card withBorder padding="lg" radius="lg">
          <Group justify="space-between" mb="md" wrap="wrap">
            <Title order={4} c="gold">
              Resumo Geral
            </Title>
            <Button size="xs" variant="outline" color="teal" onClick={handleExportarPDFGeral}>
              Exportar PDF
            </Button>
          </Group>

          <Table.ScrollContainer minWidth={900}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Barbeiro</Table.Th>
                  <Table.Th ta="center">Serviços</Table.Th>
                  <Table.Th ta="right">Valor Serv.</Table.Th>
                  <Table.Th ta="right">Comissão Serv.</Table.Th>
                  <Table.Th ta="center">Vendas</Table.Th>
                  <Table.Th ta="right">Valor Vend.</Table.Th>
                  <Table.Th ta="right">Comissão Vend.</Table.Th>
                  <Table.Th ta="right">A Receber</Table.Th>
                  <Table.Th ta="center" />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {resumo.map((r) => (
                  <Table.Tr key={r.barbeiro_id}>
                    <Table.Td>{r.nome}</Table.Td>
                    <Table.Td ta="center">{r.total_servicos}</Table.Td>
                    <Table.Td ta="right">{formatMoeda(r.valor_servicos)}</Table.Td>
                    <Table.Td ta="right">{formatMoeda(r.comissao_servicos)}</Table.Td>
                    <Table.Td ta="center">{r.total_vendas}</Table.Td>
                    <Table.Td ta="right">{formatMoeda(r.valor_vendas)}</Table.Td>
                    <Table.Td ta="right">{formatMoeda(r.comissao_vendas)}</Table.Td>
                    <Table.Td ta="right" c="gold">
                      {formatMoeda(r.total_a_receber)}
                    </Table.Td>
                    <Table.Td ta="center">
                      <Button
                        size="xs"
                        variant="outline"
                        color="gold"
                        onClick={() => abrirDetalhe(r.barbeiro_id)}
                      >
                        {detalheAberto === r.barbeiro_id ? 'Fechar' : 'Detalhes'}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td fw={700}>Total Geral</Table.Td>
                  <Table.Td ta="center" fw={700}>
                    {totalGeral.servicos}
                  </Table.Td>
                  <Table.Td />
                  <Table.Td />
                  <Table.Td ta="center" fw={700}>
                    {totalGeral.vendas}
                  </Table.Td>
                  <Table.Td />
                  <Table.Td />
                  <Table.Td ta="right" fw={700} c="gold">
                    {formatMoeda(totalGeral.valor)}
                  </Table.Td>
                  <Table.Td />
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>

          {detalhe && detalheAberto && (
            <DetalhamentoBarbeiro
              detalhe={detalhe}
              formatMoeda={formatMoeda}
              formatData={formatData}
              onExportarPDF={handleExportarPDFIndividual}
            />
          )}
        </Card>
      )}

      {detalhe && barbeiroFiltro !== 'todos' && (
        <DetalhamentoBarbeiro
          detalhe={detalhe}
          formatMoeda={formatMoeda}
          formatData={formatData}
          onExportarPDF={handleExportarPDFIndividual}
        />
      )}

      {!loading && resumo.length === 0 && !detalhe && (
        <Text c="dimmed" ta="center" py="xl">
          Selecione o período e clique em Gerar Relatório
        </Text>
      )}

      {loading && (
        <Group justify="center">
          <Loader color="gold" size="sm" />
        </Group>
      )}
    </Stack>
  )
}

function DetalhamentoBarbeiro({
  detalhe,
  formatMoeda,
  formatData,
  onExportarPDF,
}: {
  detalhe: RelatorioComissaoCompleto
  formatMoeda: (v: number) => string
  formatData: (d: string) => string
  onExportarPDF: () => void
}) {
  return (
    <Card withBorder padding="lg" radius="lg" mt="md">
      <Group justify="space-between" mb="md" wrap="wrap">
        <div>
          <Title order={4} c="gold">
            {detalhe.barbeiro.nome}
          </Title>
          <Text size="xs" c="dimmed" mt={4}>
            Comissão serviços: {detalhe.barbeiro.percentual_servico}% · Comissão produtos:{' '}
            {detalhe.barbeiro.percentual_produto}%
          </Text>
        </div>
        <Button size="xs" variant="outline" color="teal" onClick={onExportarPDF}>
          Exportar PDF Individual
        </Button>
      </Group>

      <Text fw={600} c="teal.4" mb="xs" mt="md">
        Serviços Realizados
      </Text>
      {detalhe.servicos.length === 0 ? (
        <Text c="dimmed" py="sm">
          Nenhum serviço no período.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={500} mb="md">
          <Table verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Data</Table.Th>
                <Table.Th>Serviço</Table.Th>
                <Table.Th ta="right">Valor</Table.Th>
                <Table.Th ta="center">% Comissão</Table.Th>
                <Table.Th ta="right">Comissão</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detalhe.servicos.map((s, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{formatData(s.data)}</Table.Td>
                  <Table.Td>{s.servico_nome}</Table.Td>
                  <Table.Td ta="right">{formatMoeda(s.valor_cobrado)}</Table.Td>
                  <Table.Td ta="center">{s.percentual_comissao}%</Table.Td>
                  <Table.Td ta="right">{formatMoeda(s.valor_comissao)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td fw={700}>Total Serviços</Table.Td>
                <Table.Td />
                <Table.Td ta="right" fw={700}>
                  {formatMoeda(detalhe.totais.valor_servicos)}
                </Table.Td>
                <Table.Td />
                <Table.Td ta="right" fw={700}>
                  {formatMoeda(detalhe.totais.comissao_servicos)}
                </Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Table.ScrollContainer>
      )}

      <Text fw={600} c="blue.4" mb="xs" mt="md">
        Vendas de Produtos
      </Text>
      {detalhe.vendas.length === 0 ? (
        <Text c="dimmed" py="sm">
          Nenhuma venda no período.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={500} mb="md">
          <Table verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Data</Table.Th>
                <Table.Th>Produto</Table.Th>
                <Table.Th ta="center">Qtd</Table.Th>
                <Table.Th ta="right">Valor Total</Table.Th>
                <Table.Th ta="center">% Comissão</Table.Th>
                <Table.Th ta="right">Comissão</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {detalhe.vendas.map((v, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{formatData(v.data)}</Table.Td>
                  <Table.Td>{v.produto_nome}</Table.Td>
                  <Table.Td ta="center">{v.quantidade}</Table.Td>
                  <Table.Td ta="right">{formatMoeda(v.valor_total)}</Table.Td>
                  <Table.Td ta="center">{v.percentual_comissao}%</Table.Td>
                  <Table.Td ta="right">{formatMoeda(v.valor_comissao)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td fw={700}>Total Vendas</Table.Td>
                <Table.Td />
                <Table.Td />
                <Table.Td ta="right" fw={700}>
                  {formatMoeda(detalhe.totais.valor_vendas)}
                </Table.Td>
                <Table.Td />
                <Table.Td ta="right" fw={700}>
                  {formatMoeda(detalhe.totais.comissao_vendas)}
                </Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Table.ScrollContainer>
      )}

      <Card
        withBorder
        padding="md"
        radius="md"
        mt="md"
        style={{ background: '#1a1a1a', borderColor: '#c5a059' }}
      >
        <Text size="xs" c="dimmed">
          {detalhe.servicos.length} serviços · {detalhe.vendas.length} vendas
        </Text>
        <Text fz="lg" fw={700} c="gold" mt={4}>
          Total a Receber: {formatMoeda(detalhe.totais.total_a_receber)}
        </Text>
      </Card>
    </Card>
  )
}
