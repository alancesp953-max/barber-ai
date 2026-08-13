import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  CalendarDays,
  CalendarX2,
  Clock,
  LogOut,
  RefreshCw,
  Scissors,
  Star,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  createBarbeiroBloqueio,
  deleteBarbeiroBloqueio,
  getAgendaBarbeiro,
  getBarbeiroBloqueios,
  getBarbeiroByUserId,
  getBarbeiroHorarios,
  upsertBarbeiroHorario,
  type BarberBlock,
  type BarberDayHours,
} from '../../lib/api'
import { supabase } from '../../services/supabaseClient'

type AgendaItem = {
  id: string
  data: string
  horario?: string | null
  status: string | null
  servicos: { nome: string; duracao_minutos: number | null; preco: number | null } | null
  clientes: { nome: string; telefone: string | null } | null
}

type BarberInfo = {
  id: string
  nome: string
  avaliacao: number | null
  foto_url: string | null
}

const DIAS = [
  { dia: 1, label: 'Segunda' },
  { dia: 2, label: 'Terça' },
  { dia: 3, label: 'Quarta' },
  { dia: 4, label: 'Quinta' },
  { dia: 5, label: 'Sexta' },
  { dia: 6, label: 'Sábado' },
  { dia: 0, label: 'Domingo' },
]

const groupByDate = (items: AgendaItem[]) => {
  const groups: Record<string, AgendaItem[]> = {}
  for (const item of items) {
    if (!groups[item.data]) groups[item.data] = []
    groups[item.data].push(item)
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')))
  }
  return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]))
}

const formatDate = (dateStr: string) => {
  const d = new Date(`${dateStr}T12:00:00`)
  const label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const formatHorario = (horario?: string | null) => {
  if (!horario) return '--:--'
  return String(horario).slice(0, 5)
}

const dayLabel = (dateStr: string) => {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const amanha = new Date(hoje)
  amanha.setDate(amanha.getDate() + 1)
  const d = new Date(`${dateStr}T12:00:00`)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === amanha.toDateString()) return 'Amanhã'
  return null
}

const statusInfo = (status: string | null) => {
  const s = (status ?? '').toLowerCase()
  if (s.includes('cancel')) return { label: 'Cancelado', color: 'red' }
  if (s.includes('conclu') || s.includes('realiz')) return { label: 'Concluído', color: 'teal' }
  if (s.includes('confirm')) return { label: 'Confirmado', color: 'teal' }
  if (s.includes('pend')) return { label: 'Pendente', color: 'orange' }
  return { label: status ?? 'Agendado', color: 'gold' }
}

export default function BarberAgenda() {
  const navigate = useNavigate()
  const [barbeiro, setBarbeiro] = useState<BarberInfo | null>(null)
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [horarios, setHorarios] = useState<Record<number, BarberDayHours>>({})
  const [bloqueios, setBloqueios] = useState<BarberBlock[]>([])
  const [blockDate, setBlockDate] = useState('')
  const [blockStart, setBlockStart] = useState('08:30')
  const [blockEnd, setBlockEnd] = useState('12:00')
  const [blockMotivo, setBlockMotivo] = useState('')
  const [savingBlock, setSavingBlock] = useState(false)
  const [availMsg, setAvailMsg] = useState<string | null>(null)

  const loadAvailability = useCallback(async (barbeiroId: string) => {
    const [hRows, bRows] = await Promise.all([
      getBarbeiroHorarios(barbeiroId),
      getBarbeiroBloqueios(barbeiroId),
    ])
    const map: Record<number, BarberDayHours> = {}
    for (const d of DIAS) {
      const found = hRows.find((h) => h.dia_semana === d.dia)
      map[d.dia] = found || {
        barbeiro_id: barbeiroId,
        dia_semana: d.dia,
        abertura: '08:30',
        fechamento: '19:30',
        fechado: d.dia === 0,
      }
    }
    setHorarios(map)
    setBloqueios(bRows)
  }, [])

  const loadAgenda = useCallback(
    async (opts?: { soft?: boolean }) => {
      try {
        if (opts?.soft) setRefreshing(true)
        else setLoading(true)
        setError('')

        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) {
          navigate({ to: '/login' })
          return
        }

        const info = await getBarbeiroByUserId(session.user.id)
        if (!info) {
          await supabase.auth.signOut()
          navigate({ to: '/login' })
          return
        }

        setBarbeiro(info)
        const itens = await getAgendaBarbeiro(info.id)
        setAgenda(itens as AgendaItem[])
        await loadAvailability(info.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar agenda.')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [navigate, loadAvailability],
  )

  useEffect(() => {
    void loadAgenda()
  }, [loadAgenda])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate({ to: '/login' })
  }

  const saveDayHours = async (dia: number, patch: Partial<BarberDayHours>) => {
    if (!barbeiro) return
    const current = horarios[dia]
    const next = { ...current, ...patch, barbeiro_id: barbeiro.id, dia_semana: dia }
    setHorarios((prev) => ({ ...prev, [dia]: next }))
    try {
      await upsertBarbeiroHorario({
        barbeiro_id: barbeiro.id,
        dia_semana: dia,
        abertura: next.fechado ? null : next.abertura,
        fechamento: next.fechado ? null : next.fechamento,
        fechado: Boolean(next.fechado),
      })
      setAvailMsg('Horário salvo.')
    } catch (e) {
      setAvailMsg(e instanceof Error ? e.message : 'Erro ao salvar horário')
    }
  }

  const handleCreateBlock = async () => {
    if (!barbeiro || !blockDate || !blockStart || !blockEnd) {
      setAvailMsg('Preencha data e horários do bloqueio.')
      return
    }
    setSavingBlock(true)
    setAvailMsg(null)
    try {
      const inicio = `${blockDate}T${blockStart}:00-03:00`
      const fim = `${blockDate}T${blockEnd}:00-03:00`
      await createBarbeiroBloqueio({
        barbeiro_id: barbeiro.id,
        inicio,
        fim,
        motivo: blockMotivo || undefined,
      })
      setBlockMotivo('')
      await loadAvailability(barbeiro.id)
      setAvailMsg('Horário bloqueado. Clientes não poderão agendar nesse período.')
    } catch (e) {
      setAvailMsg(e instanceof Error ? e.message : 'Erro ao bloquear')
    } finally {
      setSavingBlock(false)
    }
  }

  const grupos = groupByDate(agenda)
  const totalHoje = agenda.filter((a) => dayLabel(a.data) === 'Hoje').length

  return (
    <Box m="-xl" mih="100vh" bg="dark.8">
      <Group
        justify="space-between"
        px="lg"
        py="md"
        style={{
          borderBottom: '1px solid rgba(197,160,89,0.2)',
          background: 'var(--mantine-color-dark-7)',
        }}
      >
        <Group gap="sm">
          <ThemeIcon size={40} radius="md" variant="light" color="gold">
            <Scissors size={20} />
          </ThemeIcon>
          <div>
            <Title order={4} c="gold">
              Minha agenda
            </Title>
            <Text size="xs" c="dimmed">
              Horários, disponibilidade e bloqueios
            </Text>
          </div>
        </Group>

        <Group gap="sm">
          <Group gap="xs" visibleFrom="xs">
            {barbeiro?.foto_url ? (
              <Avatar src={barbeiro.foto_url} radius="xl" size={36} />
            ) : (
              <Avatar radius="xl" size={36} color="gold">
                <UserIcon size={18} />
              </Avatar>
            )}
            <Box visibleFrom="sm">
              <Text size="sm" fw={600}>
                {barbeiro?.nome}
              </Text>
              <Group gap={4}>
                <Star size={12} fill="#c5a059" color="#c5a059" />
                <Text size="xs" c="dimmed">
                  {barbeiro?.avaliacao ?? '—'}
                </Text>
              </Group>
            </Box>
          </Group>
          <Button
            variant="default"
            size="sm"
            leftSection={<RefreshCw size={14} />}
            loading={refreshing}
            onClick={() => void loadAgenda({ soft: true })}
          >
            Atualizar
          </Button>
          <Button
            variant="outline"
            color="gold"
            size="sm"
            leftSection={<LogOut size={16} />}
            onClick={handleLogout}
          >
            Sair
          </Button>
        </Group>
      </Group>

      <Box maw={720} mx="auto" p="lg">
        {error && (
          <Alert color="red" variant="light" mb="md">
            {error}
          </Alert>
        )}

        {loading ? (
          <Group justify="center" py={80}>
            <Loader color="gold" />
          </Group>
        ) : (
          <Tabs defaultValue="agenda" color="gold">
            <Tabs.List mb="md">
              <Tabs.Tab value="agenda" leftSection={<CalendarDays size={14} />}>
                Agenda
              </Tabs.Tab>
              <Tabs.Tab value="disponibilidade" leftSection={<Clock size={14} />}>
                Disponibilidade
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="agenda">
              <Group mb="md" gap="sm">
                <Badge variant="light" color="gold" size="lg">
                  {agenda.length} agendamento{agenda.length === 1 ? '' : 's'}
                </Badge>
                {totalHoje > 0 && (
                  <Badge variant="filled" color="gold" size="lg" c="dark.9">
                    {totalHoje} hoje
                  </Badge>
                )}
              </Group>

              {grupos.length === 0 ? (
                <Card withBorder padding="xl" radius="lg">
                  <Stack align="center" py="xl" gap="sm">
                    <CalendarX2 size={48} color="rgba(197,160,89,0.6)" />
                    <Text c="dimmed">Nenhum agendamento para os próximos dias.</Text>
                  </Stack>
                </Card>
              ) : (
                <Stack gap="lg">
                  {grupos.map(([data, itens]) => {
                    const label = dayLabel(data)
                    return (
                      <div key={data}>
                        <Group gap="sm" mb="sm">
                          <CalendarDays size={20} color="#c5a059" />
                          <Text fw={600}>{formatDate(data)}</Text>
                          {label && (
                            <Badge color="gold" variant="light">
                              {label}
                            </Badge>
                          )}
                        </Group>
                        <Stack gap="sm">
                          {itens.map((item) => {
                            const status = statusInfo(item.status)
                            return (
                              <Card key={item.id} withBorder padding="lg" radius="lg">
                                <Group justify="space-between" align="flex-start" wrap="nowrap">
                                  <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
                                    <ThemeIcon size={56} radius="md" variant="light" color="gold">
                                      <Text fw={700} fz="sm">
                                        {formatHorario(item.horario)}
                                      </Text>
                                    </ThemeIcon>
                                    <div style={{ minWidth: 0 }}>
                                      <Text size="lg" fw={600} lineClamp={1}>
                                        {item.clientes?.nome ?? 'Cliente'}
                                      </Text>
                                      {item.clientes?.telefone && (
                                        <Text size="sm" c="dimmed">
                                          {item.clientes.telefone}
                                        </Text>
                                      )}
                                      <Text size="sm" c="gold" mt={4}>
                                        {item.servicos?.nome ?? 'Serviço'}
                                        {item.servicos?.duracao_minutos
                                          ? ` · ~${item.servicos.duracao_minutos} min`
                                          : ''}
                                      </Text>
                                    </div>
                                  </Group>
                                  <Badge color={status.color} variant="light">
                                    {status.label}
                                  </Badge>
                                </Group>
                              </Card>
                            )
                          })}
                        </Stack>
                      </div>
                    )
                  })}
                </Stack>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="disponibilidade">
              <Stack gap="lg">
                {availMsg && (
                  <Alert color="gold" variant="light">
                    {availMsg}
                  </Alert>
                )}

                <Card withBorder padding="lg">
                  <Title order={4} mb="xs">
                    Dias e horários de trabalho
                  </Title>
                  <Text size="sm" c="dimmed" mb="md">
                    Se não configurar, vale o horário da barbearia. Dias fechados não aceitam agendamento.
                  </Text>
                  <Stack gap="sm">
                    {DIAS.map((d) => {
                      const h = horarios[d.dia]
                      return (
                        <SimpleGrid key={d.dia} cols={{ base: 1, sm: 4 }} spacing="sm">
                          <Text fw={600} style={{ alignSelf: 'center' }}>
                            {d.label}
                          </Text>
                          <Switch
                            label="Fechado"
                            checked={Boolean(h?.fechado)}
                            onChange={(e) =>
                              void saveDayHours(d.dia, { fechado: e.currentTarget.checked })
                            }
                          />
                          <TextInput
                            type="time"
                            label="Abre"
                            disabled={Boolean(h?.fechado)}
                            value={h?.abertura?.slice(0, 5) || '08:30'}
                            onChange={(e) =>
                              setHorarios((prev) => ({
                                ...prev,
                                [d.dia]: { ...prev[d.dia], abertura: e.currentTarget.value },
                              }))
                            }
                            onBlur={() => void saveDayHours(d.dia, {})}
                          />
                          <TextInput
                            type="time"
                            label="Fecha"
                            disabled={Boolean(h?.fechado)}
                            value={h?.fechamento?.slice(0, 5) || '19:30'}
                            onChange={(e) =>
                              setHorarios((prev) => ({
                                ...prev,
                                [d.dia]: { ...prev[d.dia], fechamento: e.currentTarget.value },
                              }))
                            }
                            onBlur={() => void saveDayHours(d.dia, {})}
                          />
                        </SimpleGrid>
                      )
                    })}
                  </Stack>
                </Card>

                <Card withBorder padding="lg">
                  <Title order={4} mb="xs">
                    Bloquear horário
                  </Title>
                  <Text size="sm" c="dimmed" mb="md">
                    Ex.: bloquear manhã de sexta até meio-dia. O período fica indisponível no WhatsApp e no sistema.
                  </Text>
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="md">
                    <TextInput
                      type="date"
                      label="Data"
                      value={blockDate}
                      onChange={(e) => setBlockDate(e.currentTarget.value)}
                    />
                    <TextInput
                      label="Motivo (opcional)"
                      value={blockMotivo}
                      onChange={(e) => setBlockMotivo(e.currentTarget.value)}
                      placeholder="Almoço / compromisso"
                    />
                    <TextInput
                      type="time"
                      label="Início"
                      value={blockStart}
                      onChange={(e) => setBlockStart(e.currentTarget.value)}
                    />
                    <TextInput
                      type="time"
                      label="Fim"
                      value={blockEnd}
                      onChange={(e) => setBlockEnd(e.currentTarget.value)}
                    />
                  </SimpleGrid>
                  <Button color="gold" c="dark.9" loading={savingBlock} onClick={() => void handleCreateBlock()}>
                    Bloquear
                  </Button>

                  <Stack gap="sm" mt="lg">
                    {bloqueios.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        Nenhum bloqueio futuro.
                      </Text>
                    ) : (
                      bloqueios.map((b) => (
                        <Group key={b.id} justify="space-between" wrap="nowrap">
                          <div>
                            <Text size="sm" fw={600}>
                              {new Date(b.inicio).toLocaleString('pt-BR')} →{' '}
                              {new Date(b.fim).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Text>
                            {b.motivo && (
                              <Text size="xs" c="dimmed">
                                {b.motivo}
                              </Text>
                            )}
                          </div>
                          <Button
                            variant="subtle"
                            color="red"
                            size="xs"
                            leftSection={<Trash2 size={14} />}
                            onClick={async () => {
                              await deleteBarbeiroBloqueio(b.id)
                              if (barbeiro) await loadAvailability(barbeiro.id)
                            }}
                          >
                            Remover
                          </Button>
                        </Group>
                      ))
                    )}
                  </Stack>
                </Card>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        )}
      </Box>
    </Box>
  )
}
