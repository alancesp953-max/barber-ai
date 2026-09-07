import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  NativeSelect,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import {
  getPagamentos,
  getAgendamentosPendentesPagamento,
  getClients,
  createPagamento,
  deletePagamento,
  getResumoFinanceiro,
  getPagamentosDoAgendamento,
} from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { KPICard } from '../../components/KPICard'
import { DollarSign, CreditCard } from 'lucide-react'

const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

type SplitLine = { forma: string; valor: string }

function parseMoney(raw: string): number {
  const valorLimpo = raw.replace(/\./g, '').replace(',', '.')
  return Number(valorLimpo)
}

export default function Financeiro({
  initialAgendamentoId,
}: {
  initialAgendamentoId?: string
}) {
  const [pagamentos, setPagamentos] = useState<any[]>([])
  const [resumo, setResumo] = useState({ total: 0, porForma: {} as Record<string, number>, quantidade: 0 })
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formAgendamento, setFormAgendamento] = useState('')
  const [lines, setLines] = useState<SplitLine[]>([{ forma: 'Dinheiro', valor: '' }])
  const [paidBefore, setPaidBefore] = useState(0)

  async function loadData() {
    try {
      const [p, r, a, c] = await Promise.all([
        getPagamentos(),
        getResumoFinanceiro(),
        getAgendamentosPendentesPagamento(),
        getClients(),
      ])
      setPagamentos(p)
      setResumo(r)
      setAgendamentos(a)
      setClientes(c)
      return a
    } catch (err) {
      console.error(err)
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      const a = await loadData()
      if (initialAgendamentoId) {
        setShowModal(true)
        await handleSelectAgendamento(initialAgendamentoId, a)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAgendamentoId])

  function getClienteNome(clienteId: string) {
    return clientes.find((c) => c.id === clienteId)?.nome || 'Cliente'
  }

  function getAgendamentoInfo(agendamentoId: string) {
    const ag = agendamentos.find((a) => a.id === agendamentoId)
    if (!ag) {
      const fromHist = pagamentos.find((p) => p.agendamento_id === agendamentoId)?.agendamentos
      return {
        servico: fromHist?.servicos?.nome || 'N/A',
        barbeiro: fromHist?.barbeiros?.nome || 'N/A',
      }
    }
    return {
      servico: ag.servico || ag.servico_nome || ag.servicos?.nome || 'Serviço',
      barbeiro: ag.barbeiro || ag.barbeiro_nome || ag.barbeiros?.nome || 'Barbeiro',
    }
  }

  async function handleSelectAgendamento(id: string, list?: any[]) {
    setFormAgendamento(id)
    const source = list || agendamentos
    const ag = source.find((a) => a.id === id)
    const total = Number(ag?.restante ?? ag?.total_comanda ?? ag?.valor ?? ag?.servicos?.preco ?? 0)
    const pago = Number(ag?.total_pago ?? 0)
    setPaidBefore(pago)
    try {
      const prev = await getPagamentosDoAgendamento(id)
      const sum = prev
        .filter((p) => !p.status || p.status === 'Pago')
        .reduce((s, p) => s + Number(p.valor || 0), 0)
      setPaidBefore(sum)
      const restante = Math.max(0, Number(ag?.total_comanda ?? total + sum) - sum)
      setLines([{ forma: 'Dinheiro', valor: restante > 0 ? restante.toFixed(2).replace('.', ',') : '' }])
    } catch {
      setLines([{ forma: 'Dinheiro', valor: total > 0 ? total.toFixed(2).replace('.', ',') : '' }])
    }
  }

  const selectedAg = useMemo(
    () => agendamentos.find((a) => a.id === formAgendamento),
    [agendamentos, formAgendamento],
  )

  const totalComanda = Number(
    selectedAg?.total_comanda ?? selectedAg?.valor ?? selectedAg?.servicos?.preco ?? 0,
  )
  const linesSum = lines.reduce((s, l) => {
    const n = parseMoney(l.valor || '0')
    return s + (isNaN(n) ? 0 : n)
  }, 0)
  const restanteApos = Math.round((totalComanda - paidBefore - linesSum) * 100) / 100
  const canClose = formAgendamento && lines.every((l) => parseMoney(l.valor) > 0) && Math.abs(restanteApos) < 0.01

  async function handleCriarPagamento() {
    if (!formAgendamento) {
      alert('Selecione o agendamento')
      return
    }
    if (!canClose) {
      alert('A soma das formas deve fechar exatamente o valor restante da comanda.')
      return
    }

    setSaving(true)
    try {
      const ag = agendamentos.find((a) => a.id === formAgendamento)
      for (const line of lines) {
        const valorNumerico = parseMoney(line.valor)
        await createPagamento({
          agendamento_id: formAgendamento,
          cliente_id: ag?.cliente_id || '',
          valor: valorNumerico,
          forma_pagamento: line.forma,
          status: 'Pago',
        })
      }

      setShowModal(false)
      setFormAgendamento('')
      setLines([{ forma: 'Dinheiro', valor: '' }])
      setPaidBefore(0)
      await loadData()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : JSON.stringify(err)
      alert('Erro ao criar pagamento: ' + message)
    } finally {
      setSaving(false)
    }
  }

  async function handleExcluir(id: string) {
    if (!confirm('Excluir este pagamento?')) return
    try {
      await deletePagamento(id)
      await loadData()
    } catch {
      alert('Erro ao excluir pagamento')
    }
  }

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader color="gold" />
        <Text c="dimmed">Carregando financeiro...</Text>
      </Group>
    )
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Financeiro"
        description="Pagamentos e resumo de receitas"
        action={
          <Button color="gold" c="#0A0A0A" onClick={() => setShowModal(true)}>
            + Novo Pagamento
          </Button>
        }
      />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <KPICard title="Total Recebido" value={`R$ ${resumo.total.toFixed(2)}`} icon={DollarSign} />
        <KPICard title="Pagamentos Hoje" value={resumo.quantidade} icon={CreditCard} />
        {Object.entries(resumo.porForma).map(([forma, valor]) => (
          <KPICard
            key={forma}
            title={forma}
            value={`R$ ${Number(valor).toFixed(2)}`}
            icon={CreditCard}
          />
        ))}
      </SimpleGrid>

      <Card withBorder padding="lg" radius="lg">
        <Title order={4} c="gold" mb="md">
          Histórico de Pagamentos
        </Title>
        {pagamentos.length === 0 ? (
          <Text c="dimmed">Nenhum pagamento registrado.</Text>
        ) : (
          <Table.ScrollContainer minWidth={800}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Cliente</Table.Th>
                  <Table.Th>Serviço</Table.Th>
                  <Table.Th>Barbeiro</Table.Th>
                  <Table.Th>Valor</Table.Th>
                  <Table.Th>Forma</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Data</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {pagamentos.map((p) => {
                  const info = getAgendamentoInfo(p.agendamento_id)
                  return (
                    <Table.Tr key={p.id}>
                      <Table.Td>{getClienteNome(p.cliente_id)}</Table.Td>
                      <Table.Td>{info.servico}</Table.Td>
                      <Table.Td>{info.barbeiro}</Table.Td>
                      <Table.Td>R$ {Number(p.valor).toFixed(2)}</Table.Td>
                      <Table.Td>{p.forma_pagamento}</Table.Td>
                      <Table.Td>
                        <Badge color={p.status === 'Pago' ? 'teal' : 'orange'} variant="light">
                          {p.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '-'}
                      </Table.Td>
                      <Table.Td>
                        <Button size="xs" variant="outline" color="red" onClick={() => handleExcluir(p.id)}>
                          Excluir
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Modal
        opened={showModal}
        onClose={() => setShowModal(false)}
        title={
          <Title order={4} c="gold">
            Baixar comanda
          </Title>
        }
        centered
        size="lg"
        styles={{
          content: { background: '#1a1a1a', border: '1px solid rgba(197,160,89,0.2)' },
          header: { background: '#1a1a1a' },
          body: { background: '#1a1a1a' },
        }}
      >
        <Stack gap="md">
          <NativeSelect
            label="Agendamento"
            value={formAgendamento}
            onChange={(e) => void handleSelectAgendamento(e.currentTarget.value)}
            data={[
              { value: '', label: 'Selecione…' },
              ...agendamentos.map((a) => ({
                value: a.id,
                label: `${a.clientes?.nome || 'Cliente'} — ${a.servicos?.nome || 'Serviço'} — R$ ${Number(a.restante ?? a.total_comanda ?? a.servicos?.preco ?? 0).toFixed(2)}`,
              })),
            ]}
            styles={inputStyles}
          />

          {selectedAg && (
            <Card withBorder padding="sm" radius="md">
              <Text size="sm">
                Cliente: <strong>{selectedAg.clientes?.nome || '—'}</strong>
              </Text>
              <Text size="sm">
                Total da comanda: <strong>R$ {totalComanda.toFixed(2)}</strong>
              </Text>
              {paidBefore > 0 && (
                <Text size="sm" c="dimmed">
                  Já pago: R$ {paidBefore.toFixed(2)}
                </Text>
              )}
              <Text size="sm" c="gold">
                Restante: R$ {(totalComanda - paidBefore).toFixed(2)}
              </Text>
            </Card>
          )}

          <Text size="sm" fw={600} c="gold">
            Formas de pagamento
          </Text>
          {lines.map((line, idx) => (
            <Group key={idx} align="flex-end" grow>
              <NativeSelect
                label={idx === 0 ? 'Forma' : undefined}
                value={line.forma}
                onChange={(e) => {
                  const next = [...lines]
                  next[idx] = { ...next[idx], forma: e.currentTarget.value }
                  setLines(next)
                }}
                data={['Dinheiro', 'Pix', 'Cartão Débito', 'Cartão Crédito', 'Outro']}
                styles={inputStyles}
              />
              <TextInput
                label={idx === 0 ? 'Valor' : undefined}
                value={line.valor}
                onChange={(e) => {
                  const next = [...lines]
                  next[idx] = { ...next[idx], valor: e.currentTarget.value }
                  setLines(next)
                }}
                placeholder="0,00"
                styles={inputStyles}
              />
              <Button
                variant="outline"
                color="red"
                disabled={lines.length <= 1}
                onClick={() => setLines(lines.filter((_, i) => i !== idx))}
              >
                Remover
              </Button>
            </Group>
          ))}

          <Group>
            <Button
              variant="outline"
              color="gold"
              onClick={() => setLines([...lines, { forma: 'Pix', valor: '' }])}
            >
              + Outra forma
            </Button>
            <Text size="sm" c={Math.abs(restanteApos) < 0.01 ? 'teal' : 'orange'}>
              Soma lançamentos: R$ {linesSum.toFixed(2)}
              {formAgendamento
                ? ` · Diferença: R$ ${restanteApos.toFixed(2)}`
                : ''}
            </Text>
          </Group>

          <Button
            color="gold"
            c="#0A0A0A"
            loading={saving}
            disabled={!canClose}
            onClick={() => void handleCriarPagamento()}
          >
            Baixar comanda
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
