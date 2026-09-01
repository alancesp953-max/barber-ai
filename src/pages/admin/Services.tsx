import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { Clock, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/PageHeader'
import { createService, deleteService, getServices, updateService } from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import type { Service } from '../../types/database'


const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

export default function Services() {
  const { t } = useTranslation()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState<number | string>('')
  const [duration, setDuration] = useState<number | string>('')
  const [buffer, setBuffer] = useState<number | string>(10)
  const [description, setDescription] = useState('')

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

  const resetForm = () => {
    setShowForm(false)
    setEditing(null)
    setName('')
    setPrice('')
    setDuration('')
    setBuffer(10)
    setDescription('')
  }

  const openCreate = () => {
    setError(null)
    setEditing(null)
    setName('')
    setPrice('')
    setDuration('')
    setBuffer(10)
    setDescription('')
    setShowForm(true)
  }

  const openEdit = (service: Service) => {
    setError(null)
    setEditing(service)
    setName(service.nome)
    setPrice(Number(service.preco))
    setDuration(service.duracao_minutos)
    setBuffer(Number((service as any).buffer_minutos ?? 10))
    setDescription(service.descricao || '')
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        nome: name.trim(),
        descricao: description.trim() || null,
        duracao_minutos: Number(duration),
        buffer_minutos: Number(buffer) || 10,
        preco: Number(price),
      }
      if (editing) {
        await updateService(editing.id, payload)
      } else {
        await createService(payload)
      }
      resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToCreate'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('services.deleteConfirm'))) return
    try {
      await deleteService(id)
      if (editing?.id === id) resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.failedToDelete'))
    }
  }

  return (
    <Stack gap="md">
      <PageHeader
        title={t('services.title')}
        description={t('services.description')}
        action={
          <Button
            color="gold"
            c="#0A0A0A"
            leftSection={<Plus size={16} />}
            onClick={() => (showForm && !editing ? resetForm() : openCreate())}
          >
            {t('services.addService')}
          </Button>
        }
      />

      {error && (
        <Alert color="red" variant="light" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {showForm && (
        <Card withBorder padding="lg" radius="lg" component="form" onSubmit={handleSubmit}>
          <Title order={5} c="white" mb="md" style={{ fontFamily: 'Syne, DM Sans, sans-serif' }}>
            {editing ? t('services.edit') : t('services.new')}
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label={t('services.serviceName')}
              required
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              styles={inputStyles}
            />
            <NumberInput
              label={t('common.price')}
              required
              decimalScale={2}
              min={0}
              value={price}
              onChange={setPrice}
              styles={inputStyles}
            />
            <NumberInput
              label={t('services.durationMinutes')}
              required
              min={1}
              value={duration}
              onChange={setDuration}
              styles={inputStyles}
            />
            <NumberInput
              label="Intervalo / buffer (min)"
              description="Margem após o serviço (ex.: 10 → 40min de serviço libera às 15:50 se começou 15:00)"
              min={0}
              max={60}
              value={buffer}
              onChange={setBuffer}
              styles={inputStyles}
            />
            <Textarea
              label={t('services.descriptionField')}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              styles={inputStyles}
              style={{ gridColumn: '1 / -1' }}
            />
          </SimpleGrid>
          <Group mt="md">
            <Button type="submit" color="gold" c="#0A0A0A" loading={saving}>
              {t('services.saveService')}
            </Button>
            <Button variant="outline" color="gray" onClick={resetForm}>
              {t('common.cancel')}
            </Button>
          </Group>
        </Card>
      )}

      {loading ? (
        <Group justify="center" py="xl">
          <Loader color="gold" />
          <Text c="dimmed">{t('services.loading')}</Text>
        </Group>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {services.map((service) => (
            <Card key={service.id} withBorder padding="lg" radius="lg">
              <Title order={4} c="white" style={{ fontFamily: 'Syne, DM Sans, sans-serif' }}>
                {service.nome}
              </Title>
              {service.descricao && (
                <Text size="sm" c="dimmed" mt="xs">
                  {service.descricao}
                </Text>
              )}
              <Group justify="space-between" mt="md">
                <Text fz={22} fw={700} c="gold" style={{ fontFamily: 'Syne, DM Sans, sans-serif' }}>
                  {formatCurrency(Number(service.preco))}
                </Text>
                <Group gap={4} c="dimmed">
                  <Clock size={14} />
                  <Text size="sm">{t('services.minutes', { count: service.duracao_minutos })}</Text>
                </Group>
              </Group>
              <Group mt="md" gap="xs">
                <ActionIcon
                  variant="outline"
                  color="gold"
                  onClick={() => openEdit(service)}
                  aria-label="Editar"
                >
                  <Pencil size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="outline"
                  color="red"
                  onClick={() => handleDelete(service.id)}
                  aria-label="Excluir"
                >
                  <Trash2 size={14} />
                </ActionIcon>
              </Group>
            </Card>
          ))}
          {services.length === 0 && (
            <Text c="dimmed" ta="center" py="xl" style={{ gridColumn: '1 / -1' }}>
              {t('services.noServices')}
            </Text>
          )}
        </SimpleGrid>
      )}
    </Stack>
  )
}
