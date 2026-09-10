import {
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { useMemo } from 'react'
import type { Appointment, AppointmentStatus, Barber } from '../types/database'
import { formatCurrency } from '../lib/format'

const statusColors: Record<AppointmentStatus, string> = {
  pendente: 'blue',
  confirmado: 'gold',
  concluido: 'teal',
  cancelado: 'red',
}

const statusLabel: Record<AppointmentStatus, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

type Props = {
  date: string
  onDateChange: (ymd: string) => void
  appointments: Appointment[]
  barbers: Barber[]
  /** Se definido, mostra só a coluna deste barbeiro */
  onlyBarberId?: string | null
  onOpenAppointment: (appt: Appointment) => void
  onCheckout: (appt: Appointment) => void
}

export function AgendaKanban({
  date,
  onDateChange,
  appointments,
  barbers,
  onlyBarberId,
  onOpenAppointment,
  onCheckout,
}: Props) {
  const columns = useMemo(() => {
    const active = barbers.filter((b) => b.ativo !== false && b.active !== false)
    const list = onlyBarberId ? active.filter((b) => b.id === onlyBarberId) : active
    return list.length ? list : active
  }, [barbers, onlyBarberId])

  const byBarber = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const b of columns) map.set(b.id, [])
    for (const a of appointments) {
      if (a.data !== date) continue
      if (a.status === 'cancelado') continue
      const key = a.barbeiro_id || '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    for (const list of map.values()) {
      list.sort((x, y) => String(x.horario || '').localeCompare(String(y.horario || '')))
    }
    return map
  }, [appointments, columns, date])

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <TextInput
          type="date"
          label="Dia"
          value={date}
          onChange={(e) => onDateChange(e.currentTarget.value)}
          styles={{
            input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
            label: { color: '#cfcfcf' },
          }}
        />
        <Text size="sm" c="dimmed">
          Grade por profissional — role horizontal no celular
        </Text>
      </Group>

      <ScrollArea type="scroll" offsetScrollbars style={{ width: '100%' }}>
        <Box
          style={{
            display: 'flex',
            gap: 12,
            minWidth: '100%',
            paddingBottom: 8,
          }}
        >
          {columns.map((barber) => {
            const cards = byBarber.get(barber.id) || []
            return (
              <Card
                key={barber.id}
                withBorder
                padding="sm"
                radius="lg"
                style={{
                  minWidth: 260,
                  maxWidth: 320,
                  flex: '0 0 280px',
                  background: '#141414',
                  borderColor: 'rgba(197,160,89,0.25)',
                }}
              >
                <Group gap="sm" mb="sm" wrap="nowrap">
                  <Avatar src={barber.foto_url || undefined} radius="xl" size={40} color="gold">
                    {barber.nome.slice(0, 1).toUpperCase()}
                  </Avatar>
                  <div style={{ minWidth: 0 }}>
                    <Text fw={700} c="gold" lineClamp={1}>
                      {barber.nome}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {cards.length} atendimento{cards.length === 1 ? '' : 's'}
                    </Text>
                  </div>
                </Group>

                <Stack gap="xs">
                  {cards.length === 0 ? (
                    <Text size="sm" c="dimmed" ta="center" py="md">
                      Sem horários
                    </Text>
                  ) : (
                    cards.map((appt) => (
                      <Card
                        key={appt.id}
                        padding="sm"
                        radius="md"
                        withBorder
                        style={{
                          background: '#0d0d0d',
                          borderColor: 'rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                        }}
                        onClick={() => onOpenAppointment(appt)}
                      >
                        <Group justify="space-between" mb={4}>
                          <Text fw={700} size="sm">
                            {String(appt.horario || '').slice(0, 5)}
                          </Text>
                          <Badge size="xs" color={statusColors[appt.status]} variant="light">
                            {statusLabel[appt.status]}
                          </Badge>
                        </Group>
                        <Text size="sm" fw={600} lineClamp={1}>
                          {appt.clientes?.nome || 'Cliente'}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {appt.servicos?.nome || 'Serviço'}
                        </Text>
                        <Group justify="space-between" mt={6}>
                          <Text size="xs" c="gold">
                            {formatCurrency(Number(appt.valor ?? appt.servicos?.preco ?? 0))}
                          </Text>
                          {(appt.status === 'pendente' || appt.status === 'confirmado') && (
                            <Button
                              size="compact-xs"
                              color="teal"
                              onClick={(e) => {
                                e.stopPropagation()
                                onCheckout(appt)
                              }}
                            >
                              Check-out
                            </Button>
                          )}
                        </Group>
                      </Card>
                    ))
                  )}
                </Stack>
              </Card>
            )
          })}
        </Box>
      </ScrollArea>
    </Stack>
  )
}
