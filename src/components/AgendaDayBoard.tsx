import { ActionIcon, Avatar, Badge, Box, Button, Card, Group, Stack, Text } from '@mantine/core'
import { Clock, Trash2, User as UserIcon } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Appointment, AppointmentStatus, Barber } from '../types/database'

const statusColors: Record<AppointmentStatus, string> = {
  pendente: 'blue',
  confirmado: 'gold',
  concluido: 'teal',
  cancelado: 'red',
}

const UNASSIGNED_ID = '__unassigned__'

type BoardColumn = {
  id: string
  nome: string
  foto_url: string | null
  appointments: Appointment[]
}

function isBarberVisible(barber: Barber) {
  return barber.ativo !== false && barber.active !== false
}

function sortBarbers(list: Barber[]) {
  return [...list].sort((a, b) => {
    const ao = a.ordem_rodizio ?? 9999
    const bo = b.ordem_rodizio ?? 9999
    if (ao !== bo) return ao - bo
    return (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
  })
}

function sortByTime(list: Appointment[]) {
  return [...list].sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
}

function formatClock(horario?: string | null) {
  if (!horario) return '--:--'
  return String(horario).slice(0, 5)
}

function addMinutesToTime(horario: string, minutes: number) {
  const [h, m] = formatClock(horario).split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const total = h * 60 + m + minutes
  const normalized = ((total % 1440) + 1440) % 1440
  const hh = Math.floor(normalized / 60)
  const mm = normalized % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function formatTimeRange(appt: Appointment) {
  const start = formatClock(appt.horario)
  const duration = Number(appt.servicos?.duracao_minutos)
  if (!duration) return start
  const end = addMinutesToTime(appt.horario, duration)
  return end ? `${start} – ${end}` : start
}

function serviceLabel(appt: Appointment) {
  return appt.servicos?.nome || '—'
}

function initials(nome: string) {
  const parts = nome.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function buildColumns(barbers: Barber[], appointments: Appointment[]): BoardColumn[] {
  const byBarber = new Map<string, Appointment[]>()
  const unassigned: Appointment[] = []

  for (const appt of appointments) {
    if (!appt.barbeiro_id) {
      unassigned.push(appt)
      continue
    }
    const list = byBarber.get(appt.barbeiro_id) ?? []
    list.push(appt)
    byBarber.set(appt.barbeiro_id, list)
  }

  const columns: BoardColumn[] = []
  const seen = new Set<string>()

  for (const barber of sortBarbers(barbers.filter(isBarberVisible))) {
    seen.add(barber.id)
    columns.push({
      id: barber.id,
      nome: barber.nome,
      foto_url: barber.foto_url,
      appointments: sortByTime(byBarber.get(barber.id) ?? []),
    })
  }

  for (const barber of sortBarbers(barbers)) {
    if (seen.has(barber.id) || !byBarber.has(barber.id)) continue
    seen.add(barber.id)
    columns.push({
      id: barber.id,
      nome: barber.nome,
      foto_url: barber.foto_url,
      appointments: sortByTime(byBarber.get(barber.id) ?? []),
    })
  }

  for (const [barberId, list] of byBarber) {
    if (seen.has(barberId)) continue
    const nome = list.find((a) => a.barbeiros?.nome)?.barbeiros?.nome || 'Barbeiro'
    columns.push({
      id: barberId,
      nome,
      foto_url: null,
      appointments: sortByTime(list),
    })
  }

  if (unassigned.length > 0) {
    columns.push({
      id: UNASSIGNED_ID,
      nome: '',
      foto_url: null,
      appointments: sortByTime(unassigned),
    })
  }

  return columns
}

/** Placeholder da futura rota financeira de check-out. Recebe o ID sem navegar. */
export function handleAppointmentCheckout(_appointmentId: string) {
  return
}

interface AgendaDayBoardProps {
  barbers: Barber[]
  appointments: Appointment[]
  onCheckin?: (appointment: Appointment) => void
  onCheckout?: (appointmentId: string) => void
  onDelete?: (appointmentId: string) => void
}

export function AgendaDayBoard({
  barbers,
  appointments,
  onCheckin,
  onCheckout = handleAppointmentCheckout,
  onDelete,
}: AgendaDayBoardProps) {
  const { t } = useTranslation()
  const columns = useMemo(() => buildColumns(barbers, appointments), [barbers, appointments])

  if (columns.length === 0) {
    return (
      <Card withBorder padding="xl" radius="lg">
        <Text c="dimmed" ta="center">
          {t('appointments.noBarbersForBoard')}
        </Text>
      </Card>
    )
  }

  return (
    <Box
      style={{
        display: 'flex',
        gap: 16,
        overflowX: 'auto',
        paddingBottom: 8,
        alignItems: 'stretch',
      }}
    >
      {columns.map((column) => (
        <Box
          key={column.id}
          style={{
            flex: '1 0 280px',
            minWidth: 280,
            maxWidth: 360,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 16,
            border: '1px solid rgba(197,160,89,0.2)',
            background: 'rgba(13,13,13,0.55)',
            minHeight: 320,
          }}
        >
          <Group
            gap="sm"
            wrap="nowrap"
            px="md"
            py="sm"
            style={{
              borderBottom: '1px solid rgba(197,160,89,0.16)',
              position: 'sticky',
              top: 0,
              zIndex: 1,
              background: 'rgba(20,21,23,0.96)',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
            }}
          >
            {column.foto_url ? (
              <Avatar src={column.foto_url} radius="xl" size={40} />
            ) : (
              <Avatar radius="xl" size={40} color="gold">
                {column.id === UNASSIGNED_ID ? (
                  <UserIcon size={18} />
                ) : (
                  initials(column.nome || t('dashboard.unassigned'))
                )}
              </Avatar>
            )}
            <Box style={{ minWidth: 0, flex: 1 }}>
              <Text fw={700} size="sm" lineClamp={1} c="white">
                {column.id === UNASSIGNED_ID ? t('dashboard.unassigned') : column.nome}
              </Text>
              <Text size="xs" c="dimmed">
                {column.appointments.length}{' '}
                {column.appointments.length === 1
                  ? t('appointments.oneAppointment')
                  : t('appointments.manyAppointments')}
              </Text>
            </Box>
          </Group>

          <Stack gap="sm" p="sm" style={{ flex: 1 }}>
            {column.appointments.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="xl">
                {t('appointments.emptyColumn')}
              </Text>
            ) : (
              column.appointments.map((appt) => {
                const canCheckin = appt.status === 'pendente' || appt.status === 'confirmado'
                const canCheckout = appt.status !== 'cancelado'

                return (
                  <Card
                    key={appt.id}
                    padding="sm"
                    radius="md"
                    withBorder
                    style={{
                      background: 'rgba(26,27,30,0.95)',
                      borderColor: 'rgba(197,160,89,0.18)',
                    }}
                  >
                    <Stack gap={8}>
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Group gap={6} wrap="nowrap">
                          <Clock size={14} color="#c5a059" />
                          <Text size="sm" fw={700} c="gold">
                            {formatTimeRange(appt)}
                          </Text>
                        </Group>
                        <Badge color={statusColors[appt.status]} variant="light" size="sm">
                          {t(`status.${appt.status}`)}
                        </Badge>
                      </Group>

                      <Box>
                        <Text fw={600} size="sm" lineClamp={1}>
                          {appt.clientes?.nome ?? '—'}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                          {serviceLabel(appt)}
                        </Text>
                      </Box>

                      <Group gap={6} justify="space-between" wrap="nowrap">
                        <Group gap={6}>
                          {canCheckout && (
                            <Button
                              size="compact-xs"
                              variant="light"
                              color="gold"
                              onClick={() => onCheckout(appt.id)}
                            >
                              {t('appointments.checkout')}
                            </Button>
                          )}
                          {canCheckin && onCheckin && (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="gold"
                              onClick={() => onCheckin(appt)}
                            >
                              {t('dashboard.checkIn')}
                            </Button>
                          )}
                        </Group>
                        {onDelete && (
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            onClick={() => onDelete(appt.id)}
                            aria-label={t('app.delete')}
                          >
                            <Trash2 size={14} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Stack>
                  </Card>
                )
              })
            )}
          </Stack>
        </Box>
      ))}
    </Box>
  )
}
