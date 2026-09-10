import {
  Autocomplete,
  ActionIcon,
  Alert,
  Box,
  Button,
  Card,
  Group,
  Loader,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AgendaDayBoard, persistCheckoutAppointment } from '../../components/AgendaDayBoard'
import { PageHeader } from '../../components/PageHeader'
import {
  createAppointment,
  deleteAppointment,
  findOrCreateClient,
  searchClients,
  getAppointments,
  getBarbers,
  getServices,
  notifyAppointmentWhatsApp,
  updateAppointmentStatus,
} from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import type { Appointment, AppointmentStatus, Barber, Service } from '../../types/database'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function todayYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '01'
  return `${get('year')}-${get('month')}-${get('day')}`
}


const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

const apptBg: Record<AppointmentStatus, string> = {
  pendente: 'rgba(59,130,246,0.15)',
  confirmado: 'rgba(197,160,89,0.15)',
  concluido: 'rgba(16,185,129,0.15)',
  cancelado: 'rgba(239,68,68,0.15)',
}

const apptBorder: Record<AppointmentStatus, string> = {
  pendente: '#60a5fa',
  confirmado: '#c5a059',
  concluido: '#34d399',
  cancelado: '#f87171',
}

function MonthCalendar({
  currentMonth,
  appointmentsByDate,
  selectedDate,
  onDayClick,
}: {
  currentMonth: Date
  appointmentsByDate: Record<string, Appointment[]>
  selectedDate: string
  onDayClick: (dateStr: string) => void
}) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const todayStr = todayYmd()

  const days: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  function getDateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return (
    <Card withBorder padding={0} radius="lg">
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: '1px solid rgba(197,160,89,0.2)',
        }}
      >
        {WEEKDAYS.map((d) => (
          <Text key={d} size="xs" fw={600} tt="uppercase" c="dimmed" ta="center" py="xs">
            {d}
          </Text>
        ))}
      </Box>

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map((day, idx) => {
          if (day === null) {
            return (
              <Box
                key={`empty-${idx}`}
                style={{
                  minHeight: 80,
                  borderRight: '1px solid rgba(197,160,89,0.1)',
                  borderBottom: '1px solid rgba(197,160,89,0.1)',
                }}
              />
            )
          }

          const dateStr = getDateStr(day)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const dayAppointments = appointmentsByDate[dateStr] || []
          const visibleAppts = dayAppointments.slice(0, 2)
          const overflowCount = dayAppointments.length - 2

          return (
            <Box
              key={day}
              component="button"
              type="button"
              onClick={() => onDayClick(dateStr)}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 80,
                padding: 6,
                textAlign: 'left',
                cursor: 'pointer',
                background: isSelected ? 'rgba(197,160,89,0.1)' : 'transparent',
                border: 'none',
                borderRight: '1px solid rgba(197,160,89,0.1)',
                borderBottom: '1px solid rgba(197,160,89,0.1)',
                boxShadow: isSelected ? 'inset 0 0 0 1px #c5a059' : undefined,
                color: 'inherit',
              }}
            >
              <Box
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 2,
                  background: isToday
                    ? '#c5a059'
                    : isSelected
                      ? 'rgba(197,160,89,0.3)'
                      : 'transparent',
                  color: isToday ? '#0A0A0A' : isSelected ? '#c5a059' : '#f5f5f5',
                }}
              >
                {day}
              </Box>

              <Stack gap={2}>
                {visibleAppts.map((appt) => (
                  <Text
                    key={appt.id}
                    size="10px"
                    truncate
                    style={{
                      padding: '2px 4px',
                      borderRadius: 4,
                      borderLeft: `2px solid ${apptBorder[appt.status]}`,
                      background: apptBg[appt.status],
                      textDecoration: appt.status === 'cancelado' ? 'line-through' : undefined,
                    }}
                  >
                    <Text span fw={600}>
                      {appt.horario}
                    </Text>{' '}
                    {appt.clientes?.nome?.split(' ')[0]}
                  </Text>
                ))}
                {overflowCount > 0 && (
                  <Text size="xs" c="gold" fw={500}>
                    +{overflowCount} mais
                  </Text>
                )}
              </Stack>
            </Box>
          )
        })}
      </Box>
    </Card>
  )
}

function ymdInMonth(monthDate: Date, day: number) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const safeDay = Math.min(Math.max(day, 1), daysInMonth)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
}

export default function Agendamentos() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(() => todayYmd())

  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientBirthdate, setClientBirthdate] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [clientHits, setClientHits] = useState<
    { id: string; nome: string; telefone: string | null; email: string | null; data_nascimento: string | null }[]
  >([])
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [barberId, setBarberId] = useState('')
  const [serviceId, setServiceId] = useState('')

  const load = async () => {
    try {
      const [a, b, s] = await Promise.all([getAppointments(), getBarbers(), getServices()])
      setAppointments(a)
      setBarbers(b)
      setServices(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const q = clientName.trim()
    if (q.length < 2) {
      setClientHits([])
      return
    }
    const t = window.setTimeout(() => {
      void searchClients(q)
        .then(setClientHits)
        .catch(() => setClientHits([]))
    }, 250)
    return () => window.clearTimeout(t)
  }, [clientName])

  const appointmentsByDate = useMemo(() => {
    const grouped: Record<string, Appointment[]> = {}
    appointments.forEach((appt) => {
      const dateStr = appt.data || ''
      if (!dateStr) return
      if (!grouped[dateStr]) grouped[dateStr] = []
      grouped[dateStr].push(appt)
    })
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
    })
    return grouped
  }, [appointments])

  const filteredAppointments = useMemo(
    () => appointments.filter((appt) => appt.data === selectedDate),
    [appointments, selectedDate],
  )

  function handleDayClick(dateStr: string) {
    setSelectedDate(dateStr)
  }

  function shiftMonth(delta: number) {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1)
    const day = Number(selectedDate.split('-')[2]) || 1
    setCurrentMonth(next)
    setSelectedDate(ymdInMonth(next, day))
  }

  function prevMonth() {
    shiftMonth(-1)
  }

  function nextMonth() {
    shiftMonth(1)
  }

  function goToToday() {
    const hoje = todayYmd()
    const [y, m] = hoje.split('-').map(Number)
    setCurrentMonth(new Date(y, m - 1, 1))
    setSelectedDate(hoje)
  }

  function handleCheckout(appointment: Appointment) {
    persistCheckoutAppointment(appointment)
    void navigate({ to: '/admin/financeiro' })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!clientName || !clientName.trim()) {
      setError('O nome do cliente é obrigatório')
      return
    }

    try {
      const phone = clientPhone.trim()
      const cliente = await findOrCreateClient({
        id: selectedClientId || undefined,
        nome: clientName.trim(),
        email: clientEmail,
        telefone: phone || undefined,
        data_nascimento: clientBirthdate || null,
      })

      const created = await createAppointment({
        cliente_id: cliente.id,
        barbeiro_id: barberId || null,
        servico_id: serviceId || null,
        data: date,
        horario: time,
        status: 'pendente',
      })

      if (phone) {
        const barberName =
          created?.barbeiros?.nome ||
          barbers.find((b) => b.id === (created?.barbeiro_id || barberId))?.nome
        const service = services.find((s) => s.id === serviceId)
        void notifyAppointmentWhatsApp({
          phone,
          clientName: clientName.trim(),
          serviceName: service?.nome,
          barberName,
          date,
          time,
        })
      }

      setShowForm(false)
      setError(null)
      setClientName('')
      setClientEmail('')
      setClientPhone('')
      setClientBirthdate('')
      setSelectedClientId(null)
      setClientHits([])
      setDate('')
      setTime('')
      setBarberId('')
      setServiceId('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToCreate'))
    }
  }

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    if (status === 'concluido') return
    try {
      await updateAppointmentStatus(id, status)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToUpdate'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('appointments.deleteConfirm'))) return
    try {
      await deleteAppointment(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToDelete'))
    }
  }

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  const monthAppointmentCount = Object.entries(appointmentsByDate)
    .filter(([dateStr]) => {
      const d = new Date(dateStr)
      return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()
    })
    .reduce((sum, [, apps]) => sum + apps.length, 0)

  return (
    <Stack gap="md">
      <PageHeader
        title={t('appointments.title')}
        description={t('appointments.description')}
        action={
          <Button
            color="gold"
            c="#0A0A0A"
            leftSection={<Plus size={16} />}
            onClick={() => setShowForm(!showForm)}
          >
            {t('appointments.newAppointment')}
          </Button>
        }
      />

      {error && (
        <Alert color="red" variant="light" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {showForm && (
        <Card
          withBorder
          padding="lg"
          radius="lg"
         
          component="form"
          onSubmit={handleCreate}
        >
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Autocomplete
              label={`${t('appointments.clientName')} *`}
              required
              value={clientName}
              onChange={(v) => {
                setClientName(v)
                setSelectedClientId(null)
              }}
              data={clientHits.map((c) => ({
                value: c.id,
                label: `${c.nome}${c.telefone ? ` — ${c.telefone}` : ''}`,
              }))}
              onOptionSubmit={(id) => {
                const c = clientHits.find((x) => x.id === id)
                if (!c) return
                setSelectedClientId(c.id)
                setClientName(c.nome)
                setClientPhone(c.telefone || '')
                setClientEmail(c.email || '')
                setClientBirthdate(c.data_nascimento || '')
              }}
              placeholder="Buscar por nome ou telefone"
              styles={inputStyles}
            />
            <TextInput
              label={t('common.email')}
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.currentTarget.value)}
              placeholder="email@exemplo.com"
              styles={inputStyles}
            />
            <TextInput
              label={t('common.phone')}
              value={clientPhone}
              onChange={(e) => setClientPhone(e.currentTarget.value)}
              placeholder="(11) 99999-9999"
              styles={inputStyles}
            />
            <TextInput
              label="Data de nascimento"
              type="date"
              value={clientBirthdate}
              onChange={(e) => setClientBirthdate(e.currentTarget.value)}
              styles={inputStyles}
            />
            <TextInput
              label="Data *"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.currentTarget.value)}
              styles={inputStyles}
            />
            <TextInput
              label="Horário *"
              type="time"
              required
              step={60}
              value={time}
              onChange={(e) => setTime(e.currentTarget.value)}
              description="Pode ser qualquer horário (ex.: 17:40), não precisa ser de 15 em 15."
              styles={inputStyles}
            />
            <NativeSelect
              label="Barbeiro"
              value={barberId}
              onChange={(e) => setBarberId(e.currentTarget.value)}
              data={[
                { value: '', label: 'Qualquer (rodízio)' },
                ...barbers.map((b) => ({ value: b.id, label: b.nome })),
              ]}
              styles={inputStyles}
            />
            <NativeSelect
              label={t('appointments.selectService')}
              value={serviceId}
              onChange={(e) => setServiceId(e.currentTarget.value)}
              data={[
                { value: '', label: t('appointments.selectService') },
                ...services.map((s) => ({
                  value: s.id,
                  label: `${s.nome} — ${formatCurrency(Number(s.preco))}`,
                })),
              ]}
              styles={inputStyles}
            />
          </SimpleGrid>
          <Group mt="md">
            <Button type="submit" color="gold" c="#0A0A0A">
              {t('appointments.saveAppointment')}
            </Button>
            <Button variant="outline" color="gray" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
          </Group>
        </Card>
      )}

      {loading ? (
        <Group justify="center" py="xl">
          <Loader color="gold" />
          <Text c="dimmed">{t('appointments.loading')}</Text>
        </Group>
      ) : (
        <>
          <Stack gap="sm">
            <Group justify="space-between" wrap="wrap">
              <Group gap="sm">
                <ActionIcon variant="outline" color="gold" onClick={prevMonth}>
                  <ChevronLeft size={18} />
                </ActionIcon>
                <Title order={4} c="white">
                  {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </Title>
                <ActionIcon variant="outline" color="gold" onClick={nextMonth}>
                  <ChevronRight size={18} />
                </ActionIcon>
              </Group>
              <Group gap="sm">
                <Text size="sm" c="dimmed" visibleFrom="sm">
                  {monthAppointmentCount} agendamento{monthAppointmentCount !== 1 ? 's' : ''}
                </Text>
                <Button size="xs" variant="outline" color="gold" onClick={goToToday}>
                  Hoje
                </Button>
              </Group>
            </Group>

            <MonthCalendar
              currentMonth={currentMonth}
              appointmentsByDate={appointmentsByDate}
              selectedDate={selectedDate}
              onDayClick={handleDayClick}
            />

            <Group gap="sm">
              <Text size="sm" c="dimmed">
                Agendamentos de{' '}
                <Text span fw={700} c="gold">
                  {formatDateDisplay(selectedDate)}
                </Text>{' '}
                ({filteredAppointments.length} encontrado
                {filteredAppointments.length !== 1 ? 's' : ''})
              </Text>
            </Group>
          </Stack>

          <Group gap="md">
            <Group gap={6}>
              <Box w={10} h={10} bg="blue.4" style={{ borderRadius: 2 }} />
              <Text size="xs" c="dimmed">
                Pendente
              </Text>
            </Group>
            <Group gap={6}>
              <Box w={10} h={10} bg="gold.5" style={{ borderRadius: 2 }} />
              <Text size="xs" c="dimmed">
                Confirmado
              </Text>
            </Group>
            <Group gap={6}>
              <Box w={10} h={10} bg="teal.4" style={{ borderRadius: 2 }} />
              <Text size="xs" c="dimmed">
                Concluído
              </Text>
            </Group>
            <Group gap={6}>
              <Box w={10} h={10} bg="red.4" style={{ borderRadius: 2 }} />
              <Text size="xs" c="dimmed">
                Cancelado
              </Text>
            </Group>
          </Group>

          <AgendaDayBoard
            barbers={barbers}
            appointments={filteredAppointments}
            onCheckout={handleCheckout}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        </>
      )}
    </Stack>
  )
}
