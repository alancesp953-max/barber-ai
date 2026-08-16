import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { CalendarOff, ChevronDown, ChevronUp, Plus, Trash2, Edit2, Star, Percent, ListOrdered } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getBarbers,
  createBarber,
  updateBarber,
  deleteBarber,
  setBarberQueueOrder,
} from '../../lib/api'
import type { Barber } from '../../types/database'
import { PageHeader } from '../../components/PageHeader'
import { BarberBlocksManager } from '../../components/BarberBlocksManager'


const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

function sortByQueue(list: Barber[]): Barber[] {
  return [...list].sort((a, b) => {
    const ao = a.ordem_rodizio ?? 9999
    const bo = b.ordem_rodizio ?? 9999
    if (ao !== bo) return ao - bo
    return (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
  })
}

export default function Barbeiros() {
  const [barbeiros, setBarbeiros] = useState<Barber[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState<string | null>(null)
  const [barbeiroEditando, setBarbeiroEditando] = useState<Barber | null>(null)
  const [saving, setSaving] = useState(false)
  const [queueSaving, setQueueSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queueMsg, setQueueMsg] = useState<string | null>(null)

  const [formNome, setFormNome] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formTelefone, setFormTelefone] = useState('')
  const [formServico, setFormServico] = useState<number | string>('')
  const [formProduto, setFormProduto] = useState<number | string>('')
  const [formAvaliacao, setFormAvaliacao] = useState(5)

  async function loadBarbeiros() {
    try {
      const data = await getBarbers()
      setBarbeiros(sortByQueue(data))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBarbeiros()
  }, [])

  function abrirModal(tipo: string, barbeiro?: Barber) {
    setError(null)
    setModalAberto(tipo)
    setBarbeiroEditando(barbeiro || null)

    if (barbeiro) {
      setFormNome(barbeiro.nome)
      setFormEmail(barbeiro.email || '')
      setFormTelefone(barbeiro.telefone || '')
      setFormServico(barbeiro.percentual_servico)
      setFormProduto(barbeiro.percentual_produto)
      setFormAvaliacao(barbeiro.avaliacao || 5)
    } else {
      setFormNome('')
      setFormEmail('')
      setFormTelefone('')
      setFormServico('')
      setFormProduto('')
      setFormAvaliacao(5)
    }
  }

  function fecharModal() {
    setModalAberto(null)
    setBarbeiroEditando(null)
    setError(null)
  }

  async function handleSalvar() {
    if (!formNome.trim()) {
      setError('Nome é obrigatório')
      return
    }
    setSaving(true)
    try {
      if (barbeiroEditando) {
        await updateBarber(barbeiroEditando.id, {
          nome: formNome.trim(),
          email: formEmail.trim() || null,
          telefone: formTelefone.trim() || null,
          percentual_servico: Number(formServico) || 0,
          percentual_produto: Number(formProduto) || 0,
          avaliacao: formAvaliacao,
        })
      } else {
        await createBarber({
          nome: formNome.trim(),
          email: formEmail.trim() || null,
          telefone: formTelefone.trim() || null,
          percentual_servico: Number(formServico) || 0,
          percentual_produto: Number(formProduto) || 0,
          avaliacao: formAvaliacao,
        })
      }
      fecharModal()
      await loadBarbeiros()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleExcluir(id: string) {
    if (!confirm('Excluir permanentemente?')) return
    try {
      await deleteBarber(id)
      await loadBarbeiros()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function moveInQueue(index: number, direction: -1 | 1) {
    const next = index + direction
    if (next < 0 || next >= barbeiros.length) return
    const ordered = [...barbeiros]
    const tmp = ordered[index]
    ordered[index] = ordered[next]
    ordered[next] = tmp
    setBarbeiros(ordered)
    setQueueSaving(true)
    setQueueMsg(null)
    try {
      await setBarberQueueOrder(ordered.map((b) => b.id))
      setQueueMsg('Fila do rodízio atualizada.')
      await loadBarbeiros()
    } catch (err: any) {
      setQueueMsg(err.message || 'Erro ao salvar fila')
      await loadBarbeiros()
    } finally {
      setQueueSaving(false)
    }
  }

  return (
    <Stack gap="md">
      <PageHeader
        title="Barbeiros"
        description="Cadastro, comissões e fila do rodízio"
        action={
          <Button color="gold" c="#0A0A0A" leftSection={<Plus size={16} />} onClick={() => abrirModal('novo')}>
            Novo Barbeiro
          </Button>
        }
      />

      {loading ? (
        <Group justify="center" py="xl">
          <Loader color="gold" />
        </Group>
      ) : (
        <>
          <Paper withBorder p="lg" radius="lg">
            <Group gap="xs" mb="xs">
              <ListOrdered size={18} color="#c5a059" />
              <Title order={4} c="gold">
                Fila do rodízio
              </Title>
            </Group>
            <Text size="sm" c="dimmed" mb="md">
              Posição 1 = próximo a receber quando o cliente não escolher barbeiro. Após cada
              atendimento sem preferência, o sistema joga o profissional para o fim da fila.
            </Text>

            {queueMsg && (
              <Alert
                color={queueMsg.includes('Erro') ? 'red' : 'teal'}
                variant="light"
                mb="md"
                withCloseButton
                onClose={() => setQueueMsg(null)}
              >
                {queueMsg}
              </Alert>
            )}

            {barbeiros.length === 0 ? (
              <Text c="dimmed" size="sm">
                Cadastre barbeiros para montar a fila.
              </Text>
            ) : (
              <Stack gap="xs">
                {barbeiros.map((b, index) => (
                  <Paper
                    key={b.id}
                    withBorder
                    p="sm"
                    radius="md"
                    style={{
                      background: index === 0 ? 'rgba(197,160,89,0.08)' : undefined,
                      borderColor: index === 0 ? 'rgba(197,160,89,0.45)' : undefined,
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        <Badge color="gold" variant={index === 0 ? 'filled' : 'light'} circle>
                          {index + 1}
                        </Badge>
                        <div style={{ minWidth: 0 }}>
                          <Text fw={600} lineClamp={1}>
                            {b.nome}
                          </Text>
                          {index === 0 && (
                            <Text size="xs" c="gold">
                              Próximo da fila
                            </Text>
                          )}
                        </div>
                      </Group>
                      <Group gap={4}>
                        <ActionIcon
                          variant="outline"
                          color="gold"
                          aria-label="Subir na fila"
                          disabled={index === 0 || queueSaving}
                          onClick={() => void moveInQueue(index, -1)}
                        >
                          <ChevronUp size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="outline"
                          color="gold"
                          aria-label="Descer na fila"
                          disabled={index === barbeiros.length - 1 || queueSaving}
                          onClick={() => void moveInQueue(index, 1)}
                        >
                          <ChevronDown size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            )}
          </Paper>

          <Paper withBorder p="lg" radius="lg">
            {barbeiros.length === 0 ? (
              <Text c="dimmed" ta="center" py="md">
                Nenhum barbeiro cadastrado.
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={700}>
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={70}>Fila</Table.Th>
                      <Table.Th>Nome</Table.Th>
                      <Table.Th>Contato</Table.Th>
                      <Table.Th ta="center">% Serviço</Table.Th>
                      <Table.Th ta="center">% Produto</Table.Th>
                      <Table.Th ta="center">Avaliação</Table.Th>
                      <Table.Th ta="center">Ações</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {barbeiros.map((b, index) => (
                      <Table.Tr key={b.id}>
                        <Table.Td>
                          <Badge color="gold" variant="light">
                            #{index + 1}
                          </Badge>
                        </Table.Td>
                        <Table.Td fw={500}>{b.nome}</Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {b.email || b.telefone ? (
                              <>
                                {b.email && <div>{b.email}</div>}
                                {b.telefone && <div>{b.telefone}</div>}
                              </>
                            ) : (
                              '—'
                            )}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Badge color="gold" variant="light">
                            {b.percentual_servico}%
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Badge color="teal" variant="light">
                            {b.percentual_produto}%
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Group gap={4} justify="center" c="orange.4">
                            <Star size={14} fill="#ff9800" />
                            <Text size="sm">{b.avaliacao?.toFixed(1) || '5.0'}</Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs" justify="center">
                            <Button
                              size="xs"
                              variant="outline"
                              color="gold"
                              leftSection={<CalendarOff size={12} />}
                              onClick={() => abrirModal('folgas', b)}
                            >
                              Folgas
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              color="gold"
                              leftSection={<Edit2 size={12} />}
                              onClick={() => abrirModal('editar', b)}
                            >
                              Editar
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              color="red"
                              leftSection={<Trash2 size={12} />}
                              onClick={() => handleExcluir(b.id)}
                            >
                              Excluir
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Paper>
        </>
      )}

      <Modal
        opened={modalAberto === 'novo' || modalAberto === 'editar'}
        onClose={fecharModal}
        title={
          <Title order={4} c="gold">
            {barbeiroEditando ? 'Editar Barbeiro' : 'Novo Barbeiro'}
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
          <Text size="sm" c="dimmed">
            {barbeiroEditando
              ? 'Altere os dados e as comissões do barbeiro.'
              : 'Cadastre um novo profissional.'}
          </Text>

          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}

          <TextInput
            label="Nome *"
            value={formNome}
            onChange={(e) => setFormNome(e.currentTarget.value)}
            placeholder="Nome do barbeiro"
            styles={inputStyles}
          />
          <TextInput
            label="E-mail"
            value={formEmail}
            onChange={(e) => setFormEmail(e.currentTarget.value)}
            placeholder="email@exemplo.com"
            styles={inputStyles}
          />
          <TextInput
            label="Telefone"
            value={formTelefone}
            onChange={(e) => setFormTelefone(e.currentTarget.value)}
            placeholder="(11) 99999-9999"
            styles={inputStyles}
          />

          <Paper withBorder p="md" radius="md">
            <Group gap="xs" mb="sm">
              <Percent size={16} color="#c5a059" />
              <Text fw={600} c="gold" size="sm">
                Comissões
              </Text>
            </Group>
            <Group grow>
              <NumberInput
                label="% Serviços"
                value={formServico}
                onChange={setFormServico}
                min={0}
                max={100}
                suffix="%"
                styles={inputStyles}
              />
              <NumberInput
                label="% Produtos"
                value={formProduto}
                onChange={setFormProduto}
                min={0}
                max={100}
                suffix="%"
                styles={inputStyles}
              />
            </Group>
            <Text size="xs" c="dimmed" mt="xs">
              Valores usados no cálculo automático das comissões do relatório.
            </Text>
          </Paper>

          <NumberInput
            label="Avaliação"
            value={formAvaliacao}
            onChange={(v) => setFormAvaliacao(Number(v) || 0)}
            min={0}
            max={5}
            step={0.1}
            decimalScale={1}
            styles={inputStyles}
          />

          <Group justify="flex-end" mt="sm">
            <Button variant="outline" color="gray" onClick={fecharModal}>
              Cancelar
            </Button>
            <Button color="gold" c="#0A0A0A" onClick={handleSalvar} loading={saving}>
              Salvar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={modalAberto === 'folgas' && Boolean(barbeiroEditando)}
        onClose={fecharModal}
        title={
          <Title order={4} c="gold">
            Folgas — {barbeiroEditando?.nome}
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
        {barbeiroEditando && (
          <BarberBlocksManager
            barbeiroId={barbeiroEditando.id}
            barbeiroNome={barbeiroEditando.nome}
            inputStyles={inputStyles}
          />
        )}
      </Modal>
    </Stack>
  )
}
