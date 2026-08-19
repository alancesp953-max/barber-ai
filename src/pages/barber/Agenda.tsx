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
  Star,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { BrandLogo } from '../../components/BrandLogo'
import {
  createBarbeiroBloqueio,
  deleteBarbeiroBloqueio,
  getAgendaBarbeiro,
  getBarbeiroBloqueios,
  getBarbeiroByUserId,
  getBarbeiroHorarios,
  saveBarbeiroDiasAtendimento,
  type BarberBlock,
  type BarberDayHours,
} from '../../lib/api'
import { BarberWeeklyDays } from '../../components/BarberWeeklyDays'

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

const todayYmd = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const addDaysYmd = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ISO com offset de Fortaleza (BRT, sem horário de verão). */
const toBrtIso = (date: string, time: string) => `${date}T${time.length === 5 ? `${time}:00` : time}-03:00`

const formatBlockRange = (inicio: string, fim: string | null) => {
  const a = new Date(inicio)
  if (!fim) {
    return `${a.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })} → sem previsão de retorno`
  }
  const b = new Date(fim)
  const sameDay = a.toDateString() === b.toDateString()
  const dOpts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
  if (sameDay) {
    return `${a.toLocaleDateString('pt-BR')} · ${a.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })} → ${b.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }
  return `${a.toLocaleString('pt-BR', dOpts)} → ${b.toLocaleString('pt-BR', dOpts)}`
}

const blockStatus = (inicio: string, fim: string | null) => {
  const now = Date.now()
  const a = new Date(inicio).getTime()
  if (!fim) {
    return now >= a
      ? { label: 'Afastamento ativo', color: 'red' as const }
      : { label: 'Afastamento programado', color: 'gold' as const }
  }
  const b = new Date(fim).getTime()
  if (now >= a && now < b) return { label: 'Ativo agora', color: 'orange' as const }
  if (now < a) return { label: 'Programado', color: 'gold' as const }
  return { label: 'Encerrado', color: 'gray' as const }
}

const appointmentOverlapsBlock = (
  item: AgendaItem,
  blockStartMs: number,
  blockEndMs: number,
): boolean => {
  const status = (item.status ?? '').toLowerCase()
  if (status.includes('cancel') || status.includes('conclu') || status.includes('realiz')) {
    return false
  }
  const hm = String(item.horario || '00:00').slice(0, 5)
  const start = new Date(toBrtIso(item.data, hm)).getTime()
  const dur = Number(item.servicos?.duracao_minutos) || 30
  const end = start + dur * 60_000
  return start < blockEndMs && end > blockStartMs
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
  const [blockStartDate, setBlockStartDate] = useState(todayYmd)
  const [blockStartTime, setBlockStartTime] = useState('08:30')
  const [blockEndDate, setBlockEndDate] = useState(todayYmd)
  const [blockEndTime, setBlockEndTime] = useState('19:30')
  const [blockNoEnd, setBlockNoEnd] = useState(false)
  const [blockMotivo, setBlockMotivo] = useState('')
  const [savingBlock, setSavingBlock] = useState(false)
  const [availMsg, setAvailMsg] = useState<string | null>(null)
  const [availMsgTone, setAvailMsgTone] = useState<'gold' | 'orange' | 'red'>('gold')

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
    const nextMap = { ...horarios, [dia]: next }
    setHorarios(nextMap)
    try {
      const openDays = DIAS
        .map((d) => d.dia)
        .filter((d) => !Boolean((d === dia ? next : nextMap[d])?.fechado))
      await saveBarbeiroDiasAtendimento(
        barbeiro.id,
        openDays,
        Object.fromEntries(
          DIAS.map((d) => {
            const h = d.dia === dia ? next : nextMap[d.dia]
            return [d.dia, { abertura: h?.abertura, fechamento: h?.fechamento }]
          }),
        ),
      )
      setAvailMsgTone('gold')
      setAvailMsg('Horário salvo. Dias sem atendimento ficam fechados na agenda.')
    } catch (e) {
      setAvailMsgTone('red')
      setAvailMsg(e instanceof Error ? e.message : 'Erro ao salvar horário')
    }
  }

  const applyShortcut = (
    kind: 'folga_dia' | 'turno_manha' | 'turno_tarde' | 'ferias_5',
  ) => {
    const base = blockStartDate || todayYmd()
    if (kind === 'folga_dia') {
      setBlockNoEnd(false)
      setBlockStartDate(base)
      setBlockStartTime('00:00')
      setBlockEndDate(base)
      setBlockEndTime('23:59')
      setBlockMotivo((m) => m || 'Folga')
      return
    }
    if (kind === 'turno_manha') {
      setBlockNoEnd(false)
      setBlockStartDate(base)
      setBlockStartTime('08:30')
      setBlockEndDate(base)
      setBlockEndTime('12:00')
      setBlockMotivo((m) => m || 'Turno da manhã')
      return
    }
    if (kind === 'turno_tarde') {
      setBlockNoEnd(false)
      setBlockStartDate(base)
      setBlockStartTime('12:00')
      setBlockEndDate(base)
      setBlockEndTime('19:30')
      setBlockMotivo((m) => m || 'Turno da tarde')
      return
    }
    setBlockNoEnd(false)
    setBlockStartDate(base)
    setBlockStartTime('00:00')
    setBlockEndDate(addDaysYmd(base, 4))
    setBlockEndTime('23:59')
    setBlockMotivo((m) => m || 'Férias / afastamento')
  }

  const handleCreateBlock = async () => {
    if (
      !barbeiro ||
      !blockStartDate ||
      !blockStartTime ||
      (!blockNoEnd && (!blockEndDate || !blockEndTime))
    ) {
      setAvailMsgTone('orange')
      setAvailMsg('Preencha início e fim do período de indisponibilidade.')
      return
    }
    const inicio = toBrtIso(blockStartDate, blockStartTime)
    const fim = blockNoEnd ? null : toBrtIso(blockEndDate, blockEndTime)
    const startMs = new Date(inicio).getTime()
    const endMs = fim ? new Date(fim).getTime() : Number.POSITIVE_INFINITY
    if (fim && !(endMs > startMs)) {
      setAvailMsgTone('orange')
      setAvailMsg('O fim do período precisa ser depois do início.')
      return
    }

    const conflicts = agenda.filter((item) => appointmentOverlapsBlock(item, startMs, endMs))

    setSavingBlock(true)
    setAvailMsg(null)
    try {
      await createBarbeiroBloqueio({
        barbeiro_id: barbeiro.id,
        inicio,
        fim,
        motivo: blockMotivo || undefined,
      })
      setBlockMotivo('')
      await loadAvailability(barbeiro.id)
      if (conflicts.length > 0) {
        const preview = conflicts
          .slice(0, 3)
          .map(
            (c) =>
              `${formatDate(c.data)} ${formatHorario(c.horario)} (${c.clientes?.nome || 'cliente'})`,
          )
          .join('; ')
        const extra =
          conflicts.length > 3 ? ` e mais ${conflicts.length - 3}` : ''
        setAvailMsgTone('orange')
        setAvailMsg(
          `Folga salva: WhatsApp e rodízio não oferecem você nesse período. Atenção: há ${conflicts.length} agendamento(s) já marcado(s) — ${preview}${extra}. Eles não foram cancelados automaticamente.`,
        )
      } else {
        setAvailMsgTone('gold')
        setAvailMsg(
          'Indisponibilidade salva. Nesse período a Diva não oferece seus horários e o rodízio pula você automaticamente.',
        )
      }
    } catch (e) {
      setAvailMsgTone('red')
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
          <BrandLogo height={36} maw={160} />
          <div>
            <Title order={4} c="gold">
              Minha agenda
            </Title>
            <Text size="xs" c="dimmed">
              Horários, folgas e bloqueios
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
                  <Alert color={availMsgTone} variant="light">
                    {availMsg}
                  </Alert>
                )}

                {barbeiro && (
                <Card withBorder padding="lg">
                  <Group gap="xs" mb="xs">
                    <CalendarDays size={18} color="#c5a059" />
                    <Title order={4}>Dias que atende</Title>
                  </Group>
                  <BarberWeeklyDays
                    barbeiroId={barbeiro.id}
                    onSaved={() => void loadAvailability(barbeiro.id)}
                  />
                </Card>
                )}

                <Card withBorder padding="lg">
                  <Title order={4} mb="xs">
                    Dias e horários de trabalho
                  </Title>
                  <Text size="sm" c="dimmed" mb="md">
                    Ao salvar, os dias não marcados ficam fechados (não usa o horário da loja).
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
                    Folga / indisponibilidade programada
                  </Title>
                  <Text size="sm" c="dimmed" mb="md">
                    Pause sua escala por um turno, um dia ou vários dias (férias, atestado, compromisso).
                    Enquanto o bloqueio estiver ativo, a Diva não oferece seus horários e o rodízio
                    (&quot;qualquer um&quot;) pula você automaticamente — mesmo com a barbearia aberta.
                  </Text>

                  <Group gap="xs" mb="md">
                    <Button
                      size="xs"
                      variant="light"
                      color="gold"
                      onClick={() => applyShortcut('folga_dia')}
                    >
                      Folga do dia
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="gold"
                      onClick={() => applyShortcut('turno_manha')}
                    >
                      Turno manhã
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="gold"
                      onClick={() => applyShortcut('turno_tarde')}
                    >
                      Turno tarde
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="gold"
                      onClick={() => applyShortcut('ferias_5')}
                    >
                      Férias 5 dias
                    </Button>
                  </Group>

                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="md">
                    <TextInput
                      type="date"
                      label="Início — data"
                      value={blockStartDate}
                      onChange={(e) => {
                        const v = e.currentTarget.value
                        setBlockStartDate(v)
                        if (!blockEndDate || blockEndDate < v) setBlockEndDate(v)
                      }}
                    />
                    <TextInput
                      type="time"
                      label="Início — horário"
                      value={blockStartTime}
                      onChange={(e) => setBlockStartTime(e.currentTarget.value)}
                    />
                    <TextInput
                      type="date"
                      label="Fim — data"
                      value={blockEndDate}
                      disabled={blockNoEnd}
                      onChange={(e) => setBlockEndDate(e.currentTarget.value)}
                    />
                    <TextInput
                      type="time"
                      label="Fim — horário"
                      value={blockEndTime}
                      disabled={blockNoEnd}
                      onChange={(e) => setBlockEndTime(e.currentTarget.value)}
                    />
                    <Switch
                      label="Sem previsão de retorno"
                      description="Afastamento por tempo indeterminado: você só volta à agenda e ao rodízio quando remover o bloqueio."
                      checked={blockNoEnd}
                      onChange={(e) => setBlockNoEnd(e.currentTarget.checked)}
                      style={{ gridColumn: '1 / -1' }}
                    />
                    <TextInput
                      label="Motivo (opcional)"
                      value={blockMotivo}
                      onChange={(e) => setBlockMotivo(e.currentTarget.value)}
                      placeholder="Folga, férias, atestado, compromisso…"
                      style={{ gridColumn: '1 / -1' }}
                    />
                  </SimpleGrid>
                  <Button color="gold" c="dark.9" loading={savingBlock} onClick={() => void handleCreateBlock()}>
                    Salvar indisponibilidade
                  </Button>

                  <Stack gap="sm" mt="lg">
                    <Text size="sm" fw={600}>
                      Bloqueios futuros e ativos
                    </Text>
                    {bloqueios.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        Nenhuma folga/bloqueio programado.
                      </Text>
                    ) : (
                      bloqueios.map((b) => {
                        const st = blockStatus(b.inicio, b.fim)
                        return (
                          <Group key={b.id} justify="space-between" wrap="nowrap" align="flex-start">
                            <div style={{ minWidth: 0 }}>
                              <Group gap="xs" mb={4}>
                                <Badge color={st.color} variant="light" size="sm">
                                  {st.label}
                                </Badge>
                                {b.motivo && (
                                  <Text size="xs" c="dimmed" lineClamp={1}>
                                    {b.motivo}
                                  </Text>
                                )}
                              </Group>
                              <Text size="sm" fw={600}>
                                {formatBlockRange(b.inicio, b.fim)}
                              </Text>
                            </div>
                            <Button
                              variant="subtle"
                              color="red"
                              size="xs"
                              leftSection={<Trash2 size={14} />}
                              onClick={async () => {
                                await deleteBarbeiroBloqueio(b.id)
                                if (barbeiro) await loadAvailability(barbeiro.id)
                                setAvailMsgTone('gold')
                                setAvailMsg('Bloqueio removido. Você volta a aparecer na agenda e no rodízio.')
                              }}
                            >
                              Remover
                            </Button>
                          </Group>
                        )
                      })
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
