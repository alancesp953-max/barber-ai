import {
  Alert,
  Avatar,
  Badge,
  Button,
  Center,
  Divider,
  Grid,
  Group,
  Loader,
  Paper,
  Progress,
  RingProgress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core'
import { AreaChart, DonutChart, Sparkline } from '@mantine/charts'
import {
  IconClipboardList,
  IconPackage,
  IconRefresh,
  IconFileText,
  IconScissors,
  IconShoppingCart,
  IconSparkles,
  IconTrendingUp,
} from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { getBarbers, getMovimentacoes, getProdutos, getResumoComissoes } from '../../lib/api'
import type { Produto, ResumoComissaoBarbeiro } from '../../lib/api'
import { gerarPDFResumoComissoes } from '../../utils/gerarPDF'

function sparkFromSeed(seed: number, points = 8): number[] {
  const out: number[] = []
  let v = Math.max(1, seed)
  for (let i = 0; i < points; i++) {
    v = Math.max(0, v + ((i * 17 + seed * 3) % 7) - 3)
    out.push(v)
  }
  return out
}

function StatCard({
  label,
  value,
  hint,
  icon,
  spark,
  color = 'gold',
}: {
  label: string
  value: string | number
  hint?: string
  icon: ReactNode
  spark: number[]
  color?: string
}) {
  return (
    <Paper p="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.6}>
            {label}
          </Text>
          <Text fz={28} fw={700} lh={1.1} style={{ letterSpacing: '-0.02em' }}>
            {value}
          </Text>
          {hint && (
            <Text size="xs" c="dimmed">
              {hint}
            </Text>
          )}
        </Stack>
        <ThemeIcon size={42} radius="md" variant="light" color={color}>
          {icon}
        </ThemeIcon>
      </Group>
      <Sparkline
        h={36}
        data={spark}
        curveType="natural"
        color={color}
        fillOpacity={0.35}
        strokeWidth={1.5}
      />
    </Paper>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ barbeiros: 0, produtos: 0, servicosMes: 0, vendasMes: 0 })
  const [produtosBaixo, setProdutosBaixo] = useState<Produto[]>([])
  const [comissoes, setComissoes] = useState<ResumoComissaoBarbeiro[]>([])
  const [movRecentes, setMovRecentes] = useState<any[]>([])
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    carregarDados()
  }, [])

  async function carregarDados() {
    setLoading(true)
    setErro(null)
    try {
      const [barbeiros, produtos, movimentacoes, comissoesData] = await Promise.all([
        getBarbers(),
        getProdutos(),
        getMovimentacoes(),
        getResumoComissoes({
          dataInicio: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            .toISOString()
            .split('T')[0],
          dataFim: new Date().toISOString().split('T')[0],
        }),
      ])
      setStats({
        barbeiros: barbeiros.length,
        produtos: produtos.length,
        servicosMes: comissoesData.reduce((a: number, r: any) => a + r.total_servicos, 0),
        vendasMes: comissoesData.reduce((a: number, r: any) => a + r.valor_vendas, 0),
      })
      setProdutosBaixo(
        produtos
          .filter((p) => p.estoque_atual <= p.estoque_minimo)
          .sort((a, b) => a.estoque_atual - b.estoque_atual),
      )
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

  const donutData = useMemo(
    () =>
      comissoes
        .filter((r) => r.total_a_receber > 0)
        .slice(0, 6)
        .map((r) => ({
          name: r.nome,
          value: Number(r.total_a_receber.toFixed(2)),
          color: 'gold.5',
        })),
    [comissoes],
  )

  const areaData = useMemo(() => {
    const top = comissoes.slice(0, 6)
    if (top.length === 0) return []
    return top.map((r) => ({
      barbeiro: r.nome.split(' ')[0],
      servicos: r.valor_servicos,
      vendas: r.valor_vendas,
    }))
  }, [comissoes])

  const estoqueOkPct = useMemo(() => {
    const total = stats.produtos || 1
    const ok = total - produtosBaixo.length
    return Math.round((ok / total) * 100)
  }, [stats.produtos, produtosBaixo.length])

  const handleExportarPDF = () => {
    if (comissoes.length === 0) return
    const dataInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0]
    const dataFim = new Date().toISOString().split('T')[0]
    gerarPDFResumoComissoes(comissoes, dataInicio, dataFim)
  }

  if (loading) {
    return (
      <Center mih={320}>
        <Stack align="center" gap="sm">
          <Loader color="gold" type="dots" />
          <Text c="dimmed" size="sm">
            Sincronizando inteligência do mês…
          </Text>
        </Stack>
      </Center>
    )
  }

  return (
    <Stack gap="lg">
      <Paper
        p="lg"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at top left, rgba(197,160,89,0.18), transparent 55%), linear-gradient(145deg, rgba(26,27,30,1), rgba(20,21,23,1))',
        }}
      >
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Group gap="md" wrap="nowrap">
            <ThemeIcon size={48} radius="md" variant="gradient" gradient={{ from: 'gold.6', to: 'gold.4', deg: 135 }}>
              <IconSparkles size={26} />
            </ThemeIcon>
            <Stack gap={2}>
              <Group gap="xs">
                <Title order={2}>Painel</Title>
                <Badge variant="light" color="gold" leftSection={<IconTrendingUp size={12} />}>
                  Ao vivo
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                Visão geral inteligente · comissões, estoque e movimento do mês
              </Text>
            </Stack>
          </Group>
          <Button
            variant="light"
            color="gold"
            leftSection={<IconRefresh size={16} />}
            onClick={carregarDados}
          >
            Atualizar
          </Button>
        </Group>
      </Paper>

      {erro && (
        <Alert color="red" variant="light" title="Erro">
          {erro}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard
          label="Barbeiros"
          value={stats.barbeiros}
          icon={<IconScissors size={20} stroke={1.5} />}
          spark={sparkFromSeed(stats.barbeiros + 3)}
        />
        <StatCard
          label="Produtos"
          value={stats.produtos}
          hint={
            produtosBaixo.length > 0 ? `${produtosBaixo.length} com estoque baixo` : 'Estoque ok'
          }
          icon={<IconPackage size={20} stroke={1.5} />}
          spark={sparkFromSeed(stats.produtos + 5)}
          color={produtosBaixo.length > 0 ? 'orange' : 'teal'}
        />
        <StatCard
          label="Serviços (mês)"
          value={stats.servicosMes}
          hint={`R$ ${totalServicosValor.toFixed(2)}`}
          icon={<IconClipboardList size={20} stroke={1.5} />}
          spark={sparkFromSeed(stats.servicosMes + 11)}
        />
        <StatCard
          label="Vendas (mês)"
          value={stats.vendasMes}
          hint={`R$ ${totalVendasValor.toFixed(2)}`}
          icon={<IconShoppingCart size={20} stroke={1.5} />}
          spark={sparkFromSeed(stats.vendasMes + 7)}
          color="teal"
        />
      </SimpleGrid>

      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Paper p="md" h="100%">
            <Group justify="space-between" mb="md" wrap="wrap">
              <div>
                <Title order={4}>Performance do mês</Title>
                <Text size="xs" c="dimmed">
                  Serviços × vendas por barbeiro
                </Text>
              </div>
              <Group gap="xs">
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconFileText size={14} />}
                  onClick={handleExportarPDF}
                  disabled={comissoes.length === 0}
                >
                  PDF
                </Button>
                <Button
                  variant="light"
                  color="gold"
                  size="xs"
                  onClick={() => navigate({ to: '/admin/comissoes' })}
                >
                  Ver relatório
                </Button>
              </Group>
            </Group>

            {areaData.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl" size="sm">
                Nenhum dado no período.
              </Text>
            ) : (
              <AreaChart
                h={240}
                data={areaData}
                dataKey="barbeiro"
                series={[
                  { name: 'servicos', color: 'gold.5', label: 'Serviços' },
                  { name: 'vendas', color: 'teal.5', label: 'Vendas' },
                ]}
                curveType="monotone"
                withLegend
                gridAxis="xy"
                tickLine="y"
              />
            )}
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Paper p="md" h="100%">
            <Title order={4} mb={4}>
              Comissões
            </Title>
            <Text size="xs" c="dimmed" mb="md">
              Distribuição a receber
            </Text>
            <Center>
              <RingProgress
                size={160}
                thickness={14}
                roundCaps
                sections={
                  totalServicosValor + totalVendasValor > 0
                    ? [
                        {
                          value:
                            (totalServicosValor / (totalServicosValor + totalVendasValor)) * 100,
                          color: 'gold',
                          tooltip: 'Serviços',
                        },
                        {
                          value: (totalVendasValor / (totalServicosValor + totalVendasValor)) * 100,
                          color: 'teal',
                          tooltip: 'Vendas',
                        },
                      ]
                    : [{ value: 100, color: 'dark.4' }]
                }
                label={
                  <Stack gap={0} align="center">
                    <Text fw={700} fz="lg">
                      R$ {totalComissao.toFixed(0)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      total
                    </Text>
                  </Stack>
                }
              />
            </Center>
            {donutData.length > 0 && (
              <>
                <Divider my="md" color="dark.5" />
                <DonutChart
                  data={donutData.map((d, i) => ({
                    ...d,
                    color: ['gold.5', 'gold.4', 'gold.6', 'teal.5', 'orange.5', 'grape.5'][i % 6],
                  }))}
                  withLabelsLine={false}
                  withTooltip
                  size={140}
                  thickness={18}
                  mx="auto"
                />
              </>
            )}
          </Paper>
        </Grid.Col>
      </Grid>

      <Paper p="md">
        <Title order={4} mb="md">
          Ranking de comissões
        </Title>
        {comissoes.length === 0 ? (
          <Text c="dimmed" ta="center" py="md" size="sm">
            Nenhum dado no período.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Barbeiro</Table.Th>
                  <Table.Th ta="center">Serviços</Table.Th>
                  <Table.Th ta="center">Vendas</Table.Th>
                  <Table.Th ta="right">A receber</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {comissoes.slice(0, 8).map((r) => (
                  <Table.Tr key={r.barbeiro_id}>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <Avatar radius="md" color="gold" variant="light" size={32}>
                          {r.nome.slice(0, 1).toUpperCase()}
                        </Avatar>
                        <Text size="sm" fw={500}>
                          {r.nome}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td ta="center">{r.total_servicos}</Table.Td>
                    <Table.Td ta="center">{r.total_vendas}</Table.Td>
                    <Table.Td ta="right" fw={700} c="gold.4">
                      R$ {r.total_a_receber.toFixed(2)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              {comissoes.length > 1 && (
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Td fw={700}>Total</Table.Td>
                    <Table.Td ta="center" fw={700}>
                      {comissoes.reduce((a, r) => a + r.total_servicos, 0)}
                    </Table.Td>
                    <Table.Td ta="center" fw={700}>
                      {comissoes.reduce((a, r) => a + r.total_vendas, 0)}
                    </Table.Td>
                    <Table.Td ta="right" fw={700} c="gold.4">
                      R$ {totalComissao.toFixed(2)}
                    </Table.Td>
                  </Table.Tr>
                </Table.Tfoot>
              )}
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Paper p="md">
          <Title order={4} mb="md">
            Últimas movimentações
          </Title>
          {movRecentes.length === 0 ? (
            <Text c="dimmed" ta="center" py="md" size="sm">
              Nenhuma movimentação recente.
            </Text>
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Produto</Table.Th>
                  <Table.Th>Data</Table.Th>
                  <Table.Th ta="right">Qtd</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {movRecentes.map((m: any) => (
                  <Table.Tr key={m.id}>
                    <Table.Td>{m.produtos?.nome || 'Produto'}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {new Date(m.created_at).toLocaleDateString('pt-BR')}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Badge color={m.tipo === 'entrada' ? 'teal' : 'red'} variant="light" size="sm">
                        {m.tipo === 'entrada' ? '+' : '-'}
                        {m.quantidade}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>

        <Paper p="md">
          <Group justify="space-between" mb="md">
            <div>
              <Title order={4}>Saúde do estoque</Title>
              <Text size="xs" c="dimmed">
                {estoqueOkPct}% dos SKUs acima do mínimo
              </Text>
            </div>
            {produtosBaixo.length > 0 && (
              <Badge color="orange" variant="light">
                {produtosBaixo.length} alerta
              </Badge>
            )}
          </Group>

          <RingProgress
            size={100}
            thickness={10}
            roundCaps
            mb="md"
            sections={[
              { value: estoqueOkPct, color: estoqueOkPct > 80 ? 'teal' : 'orange' },
              { value: 100 - estoqueOkPct, color: 'dark.4' },
            ]}
            label={
              <Text ta="center" fw={700} size="sm">
                {estoqueOkPct}%
              </Text>
            }
            mx="auto"
          />

          {produtosBaixo.length === 0 ? (
            <Text c="teal" ta="center" py="md" size="sm">
              Todos os produtos com estoque OK.
            </Text>
          ) : (
            <Stack gap="md">
              {produtosBaixo.slice(0, 6).map((p) => {
                const max = Math.max(p.estoque_minimo * 2, 1)
                const pct = Math.min(100, Math.round((p.estoque_atual / max) * 100))
                return (
                  <Stack key={p.id} gap={4}>
                    <Group justify="space-between">
                      <Tooltip label={p.nome}>
                        <Text size="sm" lineClamp={1} style={{ flex: 1 }}>
                          {p.nome}
                        </Text>
                      </Tooltip>
                      <Text size="xs" c="dimmed">
                        {p.estoque_atual} / mín {p.estoque_minimo}
                      </Text>
                    </Group>
                    <Progress
                      value={pct}
                      color={p.estoque_atual === 0 ? 'red' : 'orange'}
                      size="sm"
                      radius="xl"
                      animated={p.estoque_atual === 0}
                    />
                  </Stack>
                )
              })}
              <Button
                variant="light"
                color="gold"
                fullWidth
                onClick={() => navigate({ to: '/admin/produtos' })}
              >
                Gerenciar produtos
              </Button>
            </Stack>
          )}
        </Paper>
      </SimpleGrid>
    </Stack>
  )
}
