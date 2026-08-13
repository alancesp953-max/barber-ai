import { Alert, Badge, Button, Group, Modal, Stack, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { updateAppointmentStatus } from '../lib/api'
import { formatCurrency, formatDateTime } from '../lib/format'
import type { Appointment, AppointmentStatus } from '../types/database'

interface CheckinModalProps {
  appointment: Appointment | null
  open: boolean
  onClose: () => void
  onUpdated?: (appointment: Appointment) => void
}

const statusColor: Record<AppointmentStatus, string> = {
  pendente: 'blue',
  confirmado: 'gold',
  concluido: 'teal',
  cancelado: 'red',
}

export function CheckinModal({ appointment, open, onClose, onUpdated }: CheckinModalProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setError(null)
      setLoading(false)
    }
  }, [open])

  async function handleStatusChange(status: AppointmentStatus) {
    if (!appointment) return

    setLoading(true)
    setError(null)
    try {
      const updated = await updateAppointmentStatus(appointment.id, status)
      onUpdated?.(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('checkin.error'))
    } finally {
      setLoading(false)
    }
  }

  if (!appointment) return null

  const canConfirm = appointment.status === 'pendente'
  const canComplete = appointment.status === 'confirmado'
  const canCancel = appointment.status === 'pendente' || appointment.status === 'confirmado'

  return (
    <Modal
      opened={open}
      onClose={() => !loading && onClose()}
      title={
        <div>
          <Title order={3} c="gold" style={{ fontFamily: 'Syne, DM Sans, sans-serif' }}>
            {t('checkin.title')}
          </Title>
          <Text size="sm" c="dimmed">
            {t('checkin.subtitle')}
          </Text>
        </div>
      }
      centered
      radius="lg"
      styles={{
        content: { background: '#1A1A1A', border: '1px solid rgba(197,160,89,0.3)' },
        header: { background: '#1A1A1A' },
        body: { background: '#1A1A1A' },
      }}
    >
      <Stack gap="md">
        <div>
          <Text fw={600} size="lg">
            {appointment.clientes?.nome ?? '—'}
          </Text>
          <Text size="sm" c="dimmed">
            {appointment.clientes?.email ?? '—'}
          </Text>
        </div>

        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('checkin.service')}
            </Text>
            <Text size="sm">{appointment.servicos?.nome ?? '—'}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('checkin.barber')}
            </Text>
            <Text size="sm">{appointment.barbeiros?.nome ?? '—'}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('checkin.dateTime')}
            </Text>
            <Text size="sm">{formatDateTime(appointment.data, appointment.horario)}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('checkin.price')}
            </Text>
            <Text size="sm" fw={700} c="gold">
              {formatCurrency(Number(appointment.servicos?.preco ?? 0))}
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {t('checkin.status')}
            </Text>
            <Badge color={statusColor[appointment.status]} variant="light">
              {t(`status.${appointment.status}`)}
            </Badge>
          </Group>
        </Stack>

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        <Group gap="sm">
          {canConfirm && (
            <Button
              flex={1}
              color="gold"
              c="#0A0A0A"
              loading={loading}
              onClick={() => handleStatusChange('confirmado')}
            >
              {t('checkin.confirmPresence')}
            </Button>
          )}
          {canComplete && (
            <Button flex={1} color="teal" loading={loading} onClick={() => handleStatusChange('concluido')}>
              {t('checkin.completeService')}
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" color="red" loading={loading} onClick={() => handleStatusChange('cancelado')}>
              {t('checkin.cancelAppointment')}
            </Button>
          )}
          <Button variant="default" disabled={loading} onClick={onClose}>
            {t('checkin.close')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
