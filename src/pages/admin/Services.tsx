import { Clock, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/PageHeader'
import { createService, deleteService, getServices } from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import type { Service } from '../../types/database'

export default function Services() {
  const { t } = useTranslation()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      setServices(await getServices())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)

    try {
      await createService({
        nome: form.get('name') as string,
        descricao: (form.get('description') as string) || null,
        duracao_minutos: Number(form.get('duration_minutes')),
        preco: Number(form.get('price')),
      })
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToCreate'))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('services.deleteConfirm'))) return
    try {
      await deleteService(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToDelete'))
    }
  }

  const inputClass =
    'w-full rounded-lg border border-barber-gray bg-barber-black px-3 py-2 text-sm text-barber-white focus:border-barber-gold focus:outline-none'

  return (
    <div>
      <PageHeader
        title={t('services.title')}
        description={t('services.description')}
        action={
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-lg bg-barber-gold px-4 py-2 text-sm font-semibold text-barber-black hover:bg-barber-gold/90"
          >
            <Plus className="h-4 w-4" />
            {t('services.addService')}
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-8 grid gap-4 rounded-2xl border border-barber-gray bg-barber-gray/40 p-6 sm:grid-cols-2"
        >
          <input name="name" placeholder={t('services.serviceName')} required className={inputClass} />
          <input name="price" type="number" step="0.01" placeholder={t('common.price')} required className={inputClass} />
          <input name="duration_minutes" type="number" placeholder={t('services.durationMinutes')} required className={inputClass} />
          <textarea name="description" placeholder={t('services.descriptionField')} className={`${inputClass} sm:col-span-2`} rows={2} />
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="rounded-lg bg-barber-gold px-4 py-2 text-sm font-semibold text-barber-black">
              {t('services.saveService')}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-barber-gray px-4 py-2 text-sm text-barber-white/70">
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-barber-white/60">{t('services.loading')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <div
              key={service.id}
              className="rounded-2xl border border-barber-gray bg-barber-gray/40 p-6 transition-colors hover:border-barber-gold/30"
            >
              <h3 className="font-serif text-lg font-semibold text-barber-white">{service.nome}</h3>

              {service.descricao && (
                <p className="mt-2 text-sm text-barber-white/60">{service.descricao}</p>
              )}

              <div className="mt-4 flex items-center justify-between">
                <p className="font-serif text-2xl font-bold text-barber-gold">
                  {formatCurrency(Number(service.preco))}
                </p>
                <div className="flex items-center gap-1 text-sm text-barber-white/50">
                  <Clock className="h-4 w-4" />
                  {t('services.minutes', { count: service.duracao_minutos })}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleDelete(service.id)}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          {services.length === 0 && (
            <p className="col-span-full py-8 text-center text-barber-white/50">{t('services.noServices')}</p>
          )}
        </div>
      )}
    </div>
  )
}
