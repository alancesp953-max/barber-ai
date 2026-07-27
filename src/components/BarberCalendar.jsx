import moment from 'moment'
import 'moment/locale/pt-br'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, momentLocalizer } from 'react-big-calendar'
import { useTranslation } from 'react-i18next'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { getAppointments, updateAppointmentStatus } from '../lib/api'
import { formatCurrency } from '../lib/format'
import './AppointmentsCalendar.css'

const localizer = momentLocalizer(moment)

function toEvents(agendamentos) {
  return agendamentos.map((appt) => {
    const start = new Date(`${appt.data}T${appt.horario}`)
    const end = moment(start).add(appt.servicos?.duracao_minutos ?? 60, 'minutes').toDate()

    return {
      id: appt.id,
      title: appt.clientes?.nome ?? '—',
      start,
      end,
      horario: appt.horario,
      cliente: appt.clientes?.nome ?? '—',
      servico: appt.servicos?.nome ?? '—',
      barbeiro: appt.barbeiros?.nome ?? '—',
      preco: appt.servicos?.preco ?? 0,
      status: appt.status,
      resource: appt,
    }
  })
}

function filterDayEvents(events, date) {
  const day = moment(date).format('YYYY-MM-DD')
  return events.filter((e) => moment(e.start).format('YYYY-MM-DD') === day)
}

export default function BarberCalendar({ agendamentos: agendamentosProp, onChange }) {
  const { t, i18n } = useTranslation()
  const [agendamentos, setAgendamentos] = useState(agendamentosProp ?? [])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dayEvents, setDayEvents] = useState([])
  const [updatingId, setUpdatingId] = useState(null)

  moment.locale(i18n.language === 'pt-BR' ? 'pt-br' : 'en')

  const reload = useCallback(async () => {
    const data = await getAppointments()
    setAgendamentos(data)
    onChange?.(data)
    return data
  }, [onChange])

  useEffect(() => {
    if (agendamentosProp) {
      setAgendamentos(agendamentosProp)
      return
    }

    getAppointments()
      .then(setAgendamentos)
      .catch((err) => console.error('Failed to load appointments:', err))
  }, [agendamentosProp])

  const events = useMemo(() => toEvents(agendamentos), [agendamentos])

  useEffect(() => {
    setDayEvents(filterDayEvents(events, selectedDate))
  }, [events, selectedDate])

  const messages = useMemo(
    () => ({
      today: t('calendar.today'),
      previous: t('calendar.previous'),
      next: t('calendar.next'),
      month: t('calendar.month'),
      week: t('calendar.week'),
      day: t('calendar.day'),
      agenda: t('calendar.agenda'),
      date: t('calendar.date'),
      time: t('calendar.time'),
      event: t('calendar.event'),
      noEventsInRange: t('calendar.noEvents'),
    }),
    [t],
  )

  const handleSelectSlot = (slotInfo) => {
    setSelectedDate(slotInfo.start)
    setDayEvents(filterDayEvents(events, slotInfo.start))
  }

  const handleStatusChange = async (id, status) => {
    setUpdatingId(id)
    try {
      await updateAppointmentStatus(id, status)
      const data = await reload()
      const updatedEvents = toEvents(data)
      setDayEvents(filterDayEvents(updatedEvents, selectedDate))
    } catch (err) {
      console.error('Failed to update appointment:', err)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="mb-8 flex min-h-[80vh] gap-5 rounded-2xl bg-barber-black p-5 text-barber-white">
      <div className="appointments-calendar flex-[0.7] overflow-hidden rounded-lg border border-barber-gray bg-barber-gray/60 p-3">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          selectable
          onSelectSlot={handleSelectSlot}
          style={{ height: '75vh' }}
          messages={messages}
          eventPropGetter={() => ({
            style: {
              backgroundColor: '#d4af37',
              color: '#121212',
              borderRadius: '4px',
              border: 'none',
            },
          })}
        />
      </div>

      <aside className="flex-[0.3] overflow-y-auto rounded-lg border border-barber-gray bg-barber-gray/60 p-5">
        <h2 className="font-serif text-xl font-semibold text-barber-gold">
          {t('calendar.reservations')}: {moment(selectedDate).format('DD/MM/YYYY')}
        </h2>

        {dayEvents.length === 0 ? (
          <p className="mt-4 text-sm text-barber-white/60">{t('calendar.noDayEvents')}</p>
        ) : (
          <ul className="mt-4 space-y-0">
            {dayEvents.map((ev) => (
              <li key={ev.id} className="border-b border-barber-white/10 py-4 text-sm">
                <p>
                  <strong>{t('calendar.client')}:</strong> {ev.cliente}
                </p>
                <p>
                  <strong>{t('calendar.service')}:</strong> {ev.servico} |{' '}
                  <strong>{t('calendar.barber')}:</strong> {ev.barbeiro}
                </p>
                <p>
                  <strong>{t('calendar.time')}:</strong> {moment(ev.start).format('HH:mm')} |{' '}
                  <strong>{t('calendar.price')}:</strong> {formatCurrency(Number(ev.preco))}
                </p>
                <p>
                  <strong>{t('calendar.status')}:</strong> {t(`status.${ev.status}`)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={updatingId === ev.id}
                    onClick={() => handleStatusChange(ev.id, 'confirmado')}
                    className="rounded bg-barber-gold px-3 py-1 text-xs font-semibold text-barber-black disabled:opacity-50"
                  >
                    {t('calendar.confirm')}
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === ev.id}
                    onClick={() => handleStatusChange(ev.id, 'cancelado')}
                    className="rounded bg-barber-white/20 px-3 py-1 text-xs text-barber-white disabled:opacity-50"
                  >
                    {t('calendar.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === ev.id}
                    onClick={() => handleStatusChange(ev.id, 'concluido')}
                    className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                  >
                    {t('calendar.complete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
