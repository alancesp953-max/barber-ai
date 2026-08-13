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
import { useEffect, useState } from 'react'
import {
  getPagamentos,
  getAgendamentosPendentesPagamento,
  getClients,
  createPagamento,
  deletePagamento,
  getResumoFinanceiro,
} from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { KPICard } from '../../components/KPICard'
import { DollarSign, CreditCard } from 'lucide-react'


const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

export default function Financeiro() {
  const [pagamentos, setPagamentos] = useState<any[]>([])
  const [resumo, setResumo] = useState({ total: 0, porForma: {} as Record<string, number>, quantidade: 0 })
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
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
        getAgendamentosPendentesPagamento(),
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
      servico: ag.servico || ag.servico_nome || ag.servicos?.nome || 'Serviço',
      barbeiro: ag.barbeiro || ag.barbeiro_nome || ag.barbeiros?.nome || 'Barbeiro',
    }
  }

  function handleSelectAgendamento(id: string) {
    setFormAgendamento(id)
    const ag = agendamentos.find((a) => a.id === id)
    if (ag) {
      const preco = ag.preco || ag.valor || ag.servico_preco || ag.servicos?.preco || 0
      setFormValor(preco.toString().replace('.', ','))
    }
  }

  async function handleCriarPagamento() {
    if (!formAgendamento || !formValor) {
      alert('Preencha todos os campos!')
      return
    }

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

      await createPagamento(dadosPagamento)

      setShowModal(false)
      setFormAgendamento('')
      setFormValor('')
      setFormForma('Dinheiro')
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
            Novo Pagamento
          </Title>
        }
        centered
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
            onChange={(e) => handleSelectAgendamento(e.currentTarget.value)}
            data={[
              { value: '', label: 'Selecione um agendamento pendente...' },
              ...agendamentos.map((a) => ({
                value: a.id,
                label: `${getClienteNome(a.cliente_id) || a.clientes?.nome || 'Cliente'} - ${a.servico || a.servico_nome || a.servicos?.nome || 'Serviço'} (${new Date((a.data || a.created_at) + 'T12:00:00').toLocaleDateString('pt-BR')})`,
              })),
            ]}
            styles={inputStyles}
          />
          <TextInput
            label="Valor (R$)"
            inputMode="decimal"
            value={formValor}
            onChange={(e) => setFormValor(e.currentTarget.value)}
            placeholder="59,90"
            styles={inputStyles}
          />
          <NativeSelect
            label="Forma de Pagamento"
            value={formForma}
            onChange={(e) => setFormForma(e.currentTarget.value)}
            data={['Dinheiro', 'Cartão Débito', 'Cartão Crédito', 'PIX', 'Outro']}
            styles={inputStyles}
          />
          <Group justify="flex-end">
            <Button variant="outline" color="gray" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button color="gold" c="#0A0A0A" onClick={handleCriarPagamento} loading={saving}>
              Registrar Pagamento
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
