import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckinModal } from '../../components/CheckinModal'
import { PageHeader } from '../../components/PageHeader'
import {
  createAppointment,
  deleteAppointment,
  findOrCreateClient,
  getAppointments,
  getBarbers,
  getServices,
  updateAppointmentStatus,
} from '../../lib/api'
import { formatCurrency, formatDateTime } from '../../lib/format'
import type { Appointment, AppointmentStatus, Barber, Service } from '../../types/database'

const statusColors: Record<AppointmentStatus, string> = {
  pendente: 'bg-blue-500/10 text-blue-400',
  confirmado: 'bg-barber-gold/10 text-barber-gold',
  concluido: 'bg-emerald-500/10 text-emerald-400',
  cancelado: 'bg-red-500/10 text-red-400',
}

const statusBgColors: Record<AppointmentStatus, string> = {
  pendente: 'bg-blue-500/20 border-l-blue-400',
  confirmado: 'bg-barber-gold/20 border-l-barber-gold',
  concluido: 'bg-emerald-500/20 border-l-emerald-400',
  cancelado: 'bg-red-500/20 border-l-red-400',
}

const appointmentStatuses = ['pendente', 'confirmado', 'concluido', 'cancelado'] as const

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// 🔥 Componente do calendário mensal
function MonthCalendar({
  currentMonth,
  appointmentsByDate,
  selectedDate,
  onDayClick,
}: {
  currentMonth: Date
  appointmentsByDate: Record<string, Appointment[]>
  selectedDate: string | null
  onDayClick: (dateStr: string) => void
}) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const days: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  function getDateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return (
    <div className="w-full rounded-lg border border-barber-gray bg-barber-darker">
      {/* Cabeçalho com dias da semana */}
      <div className="grid grid-cols-7 border-b border-barber-gray">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="border-r border-barber-gray py-2 text-center text-xs font-semibold uppercase text-barber-white/50 last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="border-r border-b border-barber-gray p-1 last:border-r-0" />
          }

          const dateStr = getDateStr(day)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const dayAppointments = appointmentsByDate[dateStr] || []
          const visibleAppts = dayAppointments.slice(0, 2)
          const overflowCount = dayAppointments.length - 2

          return (
            <button
              key={day}
              type="button"
              onClick={() => onDayClick(dateStr)}
              className={`
                relative flex min-h-[80px] flex-col border-r border-b border-barber-gray p-1 text-left transition-colors last:border-r-0
                hover:bg-barber-black/50
                ${isSelected ? 'bg-barber-gold/10 ring-1 ring-inset ring-barber-gold' : ''}
                sm:min-h-[100px] sm:p-1.5
              `}
            >
              {/* Número do dia */}
              <span
                className={`
                  mb-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium sm:h-7 sm:w-7 sm:text-sm
                  ${isToday ? 'bg-barber-gold text-barber-black' : ''}
                  ${isSelected && !isToday ? 'bg-barber-gold/30 text-barber-gold' : ''}
                  ${!isToday && !isSelected ? 'text-barber-white' : ''}
                `}
              >
                {day}
              </span>

              {/* Compromissos visíveis */}
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {visibleAppts.map((appt) => (
                  <div
                    key={appt.id}
                    className={`
                      truncate rounded px-1 py-0.5 text-[10px] leading-tight
                      border-l-2
                      ${appt.status === 'pendente' ? 'bg-blue-500/15 border-l-blue-400 text-blue-300' : ''}
                      ${appt.status === 'confirmado' ? 'bg-yellow-500/15 border-l-yellow-400 text-yellow-300' : ''}
                      ${appt.status === 'concluido' ? 'bg-emerald-500/15 border-l-emerald-400 text-emerald-300' : ''}
                      ${appt.status === 'cancelado' ? 'bg-red-500/15 border-l-red-400 text-red-300 line-through' : ''}
                      sm:text-xs
                    `}
                  >
                    <span className="font-medium">{appt.horario}</span>{' '}
                    <span className="hidden sm:inline">{appt.clientes?.nome?.split(' ')[0]}</span>
                  </div>
                ))}
                {overflowCount > 0 && (
                  <span className="px-1 text-[10px] font-medium text-barber-gold sm:text-xs">
                    +{overflowCount} mais
                  </span>
                )}
              </div>

              {/* Badge de quantidade (mobile) */}
              {dayAppointments.length > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-barber-gold/20 px-1 text-[9px] font-bold text-barber-gold sm:hidden">
                  {dayAppointments.length}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function Agendamentos() {
  const { t } = useTranslation()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [checkinAppointment, setCheckinAppointment] = useState<Appointment | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 🔥 Estados do calendário novo
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

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

  // 🔥 Agrupa agendamentos por data para o calendário
  const appointmentsByDate = useMemo(() => {
    const grouped: Record<string, Appointment[]> = {}
    appointments.forEach((appt) => {
      const dateStr = appt.data || ''
      if (!dateStr) return
      if (!grouped[dateStr]) grouped[dateStr] = []
      grouped[dateStr].push(appt)
    })
    // Ordena por horário dentro de cada dia
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => (a.horario || '').localeCompare(b.horario || ''))
    })
    return grouped
  }, [appointments])

  // 🔥 Filtra agendamentos pelo dia selecionado
  const filteredAppointments = useMemo(() => {
    if (!selectedDate) return appointments
    return appointments.filter((appt) => appt.data === selectedDate)
  }, [appointments, selectedDate])

  function handleDayClick(dateStr: string) {
    if (selectedDate === dateStr) {
      setSelectedDate(null) // desmarca se clicar no mesmo dia
    } else {
      setSelectedDate(dateStr)
    }
  }

  function prevMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
    setSelectedDate(null)
  }

  function nextMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
    setSelectedDate(null)
  }

  function goToToday() {
    const hoje = new Date()
    setCurrentMonth(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
    setSelectedDate(null)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)

    const nome = form.get('client_name') as string
    if (!nome || !nome.trim()) {
      setError('O nome do cliente é obrigatório')
      return
    }

    try {
      const cliente = await findOrCreateClient({
        nome: nome.trim(),
        email: form.get('client_email') as string,
        telefone: (form.get('client_phone') as string) || undefined,
      })

      await createAppointment({
        cliente_id: cliente.id,
        barbeiro_id: (form.get('barber_id') as string) || null,
        servico_id: (form.get('service_id') as string) || null,
        data: form.get('date') as string,
        horario: form.get('time') as string,
        status: 'pendente',
      })

      setShowForm(false)
      setError(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToCreate'))
    }
  }

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
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

  const inputClass = 'w-full rounded-lg border border-barber-gray bg-barber-black px-3 py-2 text-sm text-barber-white focus:border-barber-gold focus:outline-none'

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return ''
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  // 🔥 Contagem de agendamentos do mês
  const monthAppointmentCount = Object.entries(appointmentsByDate).filter(([dateStr]) => {
    const d = new Date(dateStr)
    return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()
  }).reduce((sum, [, apps]) => sum + apps.length, 0)

  return (
    <>
      <PageHeader
        title={t('appointments.title')}
        button={{
          label: t('appointments.newAppointment'),
          onClick: () => setShowForm(!showForm),
          icon: Plus,
        }}
      />

      <div className="mb-4">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-barber-gold px-4 py-2 text-sm font-semibold text-barber-black hover:bg-barber-gold/90"
        >
          <Plus size={18} />
          {t('appointments.newAppointment')}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 space-y-4 rounded-lg border border-barber-gray bg-barber-darker p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-barber-white/70">{t('appointments.clientName')} *</label>
              <input name="client_name" type="text" required className={inputClass} placeholder="Nome do cliente" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-barber-white/70">{t('common.email')}</label>
              <input name="client_email" type="email" className={inputClass} placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-barber-white/70">{t('common.phone')}</label>
              <input name="client_phone" type="text" className={inputClass} placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-barber-white/70">Data *</label>
              <input name="date" type="date" required className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-barber-white/70">Horário *</label>
              <input name="time" type="time" required className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-barber-white/70">{t('appointments.selectBarber')}</label>
              <select name="barber_id" className={inputClass} defaultValue="">
                <option value="">{t('appointments.selectBarber')}</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>{b.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-barber-white/70">{t('appointments.selectService')}</label>
              <select name="service_id" className={inputClass} defaultValue="">
                <option value="">{t('appointments.selectService')}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome} — {formatCurrency(Number(s.preco))}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="rounded-lg bg-barber-gold px-6 py-2 text-sm font-semibold text-barber-black hover:bg-barber-gold/90">
              {t('appointments.saveAppointment')}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-barber-gray px-4 py-2 text-sm text-barber-white/70">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-barber-white/50">{t('appointments.loading')}</p>
      ) : (
        <>
          {/* 🔥 CALENDÁRIO ESTILO GOOGLE */}
          <div className="mb-6">
            {/* Navegação do calendário */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="rounded-lg border border-barber-gray p-2 text-barber-white/70 hover:bg-barber-black hover:text-barber-gold"
                >
                  <ChevronLeft size={18} />
                </button>
                <h2 className="text-lg font-bold text-barber-white">
                  {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </h2>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="rounded-lg border border-barber-gray p-2 text-barber-white/70 hover:bg-barber-black hover:text-barber-gold"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-barber-white/50 sm:inline">
                  {monthAppointmentCount} agendamento{monthAppointmentCount !== 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  onClick={goToToday}
                  className="rounded-lg border border-barber-gray px-3 py-1.5 text-xs font-semibold text-barber-gold hover:bg-barber-black"
                >
                  Hoje
                </button>
              </div>
            </div>

            {/* 🔥 Grid do calendário */}
            <MonthCalendar
              currentMonth={currentMonth}
              appointmentsByDate={appointmentsByDate}
              selectedDate={selectedDate}
              onDayClick={handleDayClick}
            />

            {/* Indicador de filtro */}
            {selectedDate && (
              <div className="mt-2 flex items-center gap-2 text-sm text-barber-white/70">
                <span>
                  Agendamentos de <strong className="text-barber-gold">{formatDateDisplay(selectedDate)}</strong>
                  {' '}({filteredAppointments.length} encontrado{filteredAppointments.length !== 1 ? 's' : ''})
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-barber-gold hover:underline"
                >
                  Mostrar todos
                </button>
              </div>
            )}
          </div>

          {/* 🔥 Legenda de cores */}
          <div className="mb-4 flex flex-wrap gap-4 text-xs text-barber-white/60">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded bg-blue-400" /> Pendente
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded bg-yellow-400" /> Confirmado
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded bg-emerald-400" /> Concluído
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded bg-red-400" /> Cancelado
            </span>
          </div>

          {/* 🔥 Tabela de agendamentos */}
          <div className="overflow-x-auto rounded-lg border border-barber-gray">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-barber-gray bg-barber-darker">
                <tr>
                  <th className="px-4 py-3 font-medium text-barber-white/50">{t('appointments.client')}</th>
                  <th className="px-4 py-3 font-medium text-barber-white/50">{t('common.service')}</th>
                  <th className="px-4 py-3 font-medium text-barber-white/50">{t('appointments.barber')}</th>
                  <th className="px-4 py-3 font-medium text-barber-white/50">{t('appointments.dateTime')}</th>
                  <th className="px-4 py-3 font-medium text-barber-white/50">{t('common.status')}</th>
                  <th className="px-4 py-3 font-medium text-barber-white/50">{t('common.price')}</th>
                  <th className="px-4 py-3 font-medium text-barber-white/50">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-barber-gray">
                {filteredAppointments.map((appt) => (
                  <tr key={appt.id} className="hover:bg-barber-darker/50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{appt.clientes?.nome ?? '—'}</div>
                      <div className="text-xs text-barber-white/50">{appt.clientes?.email}</div>
                    </td>
                    <td className="px-4 py-3">{appt.servicos?.nome ?? '—'}</td>
                    <td className="px-4 py-3">{appt.barbeiros?.nome ?? '—'}</td>
                    <td className="px-4 py-3">{formatDateTime(appt.data, appt.horario)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={appt.status}
                        onChange={(e) => handleStatusChange(appt.id, e.target.value as AppointmentStatus)}
                        className={`rounded-full border-0 px-2 py-1 text-xs capitalize ${statusColors[appt.status]}`}
                      >
                        {appointmentStatuses.map((s) => (
                          <option key={s} value={s}>{t(`status.${s}`)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">{formatCurrency(Number(appt.servicos?.preco ?? 0))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(appt.status === 'pendente' || appt.status === 'confirmado') && (
                          <button
                            onClick={() => setCheckinAppointment(appt)}
                            className="rounded px-2 py-1 text-xs font-semibold text-barber-gold hover:bg-barber-gold/10"
                          >
                            {t('dashboard.checkIn')}
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(appt.id)}
                          className="rounded p-1 text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredAppointments.length === 0 && (
              <p className="p-4 text-center text-barber-white/50">
                {selectedDate
                  ? 'Nenhum agendamento nesta data.'
                  : t('appointments.noAppointments')}
              </p>
            )}
          </div>
        </>
      )}

      <CheckinModal
        appointment={checkinAppointment}
        onClose={() => setCheckinAppointment(null)}
        onUpdated={() => load()}
      />
    </>
  )
}