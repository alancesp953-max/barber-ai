import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NativeSelect,
  Stack,
  Text,
  Title,
  ActionIcon,
} from '@mantine/core'
import { Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'

import {
  addServicoAoAgendamento,
  ensureAgendamentoServicos,
  getServices,
  removeServicoDoAgendamento,
  updateAppointmentStatus,
  type AgendamentoServicoItem,
} from '../lib/api'
import { formatCurrency, formatDateTime } from '../lib/format'
import type { Appointment, AppointmentStatus, Service } from '../types/database'

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
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<AgendamentoServicoItem[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [addServiceId, setAddServiceId] = useState('')

  useEffect(() => {
    if (!open) {
      setError(null)
      setLoading(false)
      setItems([])
      setAddServiceId('')
      return
    }
    if (!appointment) return
    void (async () => {
      try {
        const [list, svcs] = await Promise.all([
          ensureAgendamentoServicos(appointment.id),
          getServices(),
        ])
        setItems(list)
        setServices(svcs)
      } catch (e) {
        setError(e instanceof Error ? e.message : t('checkin.error'))
      }
    })()
  }, [open, appointment, t])

  const total = useMemo(
    () => items.reduce((s, i) => s + Number(i.preco || 0), 0),
    [items],
  )

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

  async function handleCheckout() {
    if (!appointment) return
    onClose()
    navigate({
      to: '/admin/financeiro',
      search: { agendamentoId: appointment.id },
    })
  }

  async function handleAddService() {
    if (!appointment || !addServiceId) return
    setLoading(true)
    setError(null)
    try {
      await addServicoAoAgendamento(appointment.id, addServiceId)
      setItems(await ensureAgendamentoServicos(appointment.id))
      setAddServiceId('')
      onUpdated?.(appointment)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar serviço')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!appointment) return
    if (items.length <= 1) {
      setError('A comanda precisa ter pelo menos um serviço')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await removeServicoDoAgendamento(itemId, appointment.id)
      setItems(await ensureAgendamentoServicos(appointment.id))
      onUpdated?.(appointment)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover serviço')
    } finally {
      setLoading(false)
    }
  }

  if (!appointment) return null

  const canConfirm = appointment.status === 'pendente'
  const canCheckout =
    appointment.status === 'pendente' || appointment.status === 'confirmado'
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
              {t('checkin.status')}
            </Text>
            <Badge color={statusColor[appointment.status]} variant="light">
              {t(`status.${appointment.status}`)}
            </Badge>
          </Group>
        </Stack>

        <Stack gap="xs">
          <Text size="sm" fw={600} c="gold">
            Serviços da comanda
          </Text>
          {items.map((item) => (
            <Group key={item.id} justify="space-between" wrap="nowrap">
              <Text size="sm" style={{ flex: 1 }}>
                {item.servicos?.nome || 'Serviço'}
              </Text>
              <Text size="sm" c="gold">
                {formatCurrency(Number(item.preco))}
              </Text>
              <ActionIcon
                variant="subtle"
                color="red"
                disabled={loading || items.length <= 1}
                onClick={() => void handleRemoveItem(item.id)}
              >
                <Trash2 size={14} />
              </ActionIcon>
            </Group>
          ))}
          <Group align="flex-end" grow>
            <NativeSelect
              label="Adicionar serviço"
              value={addServiceId}
              onChange={(e) => setAddServiceId(e.currentTarget.value)}
              data={[
                { value: '', label: 'Selecione…' },
                ...services.map((s) => ({
                  value: s.id,
                  label: `${s.nome} — ${formatCurrency(Number(s.preco))}`,
                })),
              ]}
            />
            <Button
              color="gold"
              c="#0A0A0A"
              disabled={!addServiceId || loading}
              onClick={() => void handleAddService()}
            >
              Incluir
            </Button>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Total
            </Text>
            <Text size="sm" fw={700} c="gold">
              {formatCurrency(total || Number(appointment.servicos?.preco ?? 0))}
            </Text>
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
          {canCheckout && (
            <Button flex={1} color="teal" loading={loading} onClick={handleCheckout}>
              Check-out
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
