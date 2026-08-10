import { X } from 'lucide-react'
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

const statusColors: Record<AppointmentStatus, string> = {
  pendente: 'bg-blue-500/10 text-blue-400',
  confirmado: 'bg-barber-gold/10 text-barber-gold',
  concluido: 'bg-emerald-500/10 text-emerald-400',
  cancelado: 'bg-red-500/10 text-red-400',
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

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, loading, onClose])

  if (!open || !appointment) return null

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

  const canConfirm = appointment.status === 'pendente'
  const canComplete = appointment.status === 'confirmado'
  const canCancel = appointment.status === 'pendente' || appointment.status === 'confirmado'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => !loading && onClose()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-modal-title"
        className="w-full max-w-md rounded-2xl border border-barber-gold/30 bg-barber-gray shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-barber-gold/20 px-6 py-4">
          <div>
            <h2 id="checkin-modal-title" className="font-serif text-xl font-bold text-barber-gold">
              {t('checkin.title')}
            </h2>
            <p className="mt-1 text-sm text-barber-white/60">{t('checkin.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1 text-barber-white/60 transition hover:bg-barber-white/10 hover:text-barber-white disabled:opacity-50"
            aria-label={t('checkin.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <p className="text-lg font-semibold text-barber-white">
              {appointment.clientes?.nome ?? '—'}
            </p>
            <p className="text-sm text-barber-white/50">{appointment.clientes?.email ?? '—'}</p>
          </div>

          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-barber-white/60">{t('checkin.service')}</dt>
              <dd className="text-right text-barber-white">{appointment.servicos?.nome ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-barber-white/60">{t('checkin.barber')}</dt>
              <dd className="text-right text-barber-white">{appointment.barbeiros?.nome ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-barber-white/60">{t('checkin.dateTime')}</dt>
              <dd className="text-right text-barber-white">
                {formatDateTime(appointment.data, appointment.horario)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-barber-white/60">{t('checkin.price')}</dt>
              <dd className="text-right font-semibold text-barber-gold">
                {formatCurrency(Number(appointment.servicos?.preco ?? 0))}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-barber-white/60">{t('checkin.status')}</dt>
              <dd>
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs capitalize ${statusColors[appointment.status]}`}
                >
                  {t(`status.${appointment.status}`)}
                </span>
              </dd>
            </div>
          </dl>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-barber-gold/20 px-6 py-4">
          {canConfirm && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleStatusChange('confirmado')}
              className="flex-1 rounded-lg bg-barber-gold px-4 py-2 text-sm font-semibold text-barber-black hover:bg-barber-gold/90 disabled:opacity-50"
            >
              {loading ? t('checkin.processing') : t('checkin.confirmPresence')}
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleStatusChange('concluido')}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? t('checkin.processing') : t('checkin.completeService')}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleStatusChange('cancelado')}
              className="rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              {t('checkin.cancelAppointment')}
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-lg border border-barber-gray px-4 py-2 text-sm text-barber-white/70 hover:bg-barber-black/40 disabled:opacity-50"
          >
            {t('checkin.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
