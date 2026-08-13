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
import { Clock, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/PageHeader'
import { createService, deleteService, getServices } from '../../lib/api'
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
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState<number | string>('')
  const [duration, setDuration] = useState<number | string>('')
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createService({
        nome: name,
        descricao: description || null,
        duracao_minutos: Number(duration),
        preco: Number(price),
      })
      setShowForm(false)
      setName('')
      setPrice('')
      setDuration('')
      setDescription('')
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
            onClick={() => setShowForm(!showForm)}
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
        <Card withBorder padding="lg" radius="lg" component="form" onSubmit={handleCreate}>
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
              value={price}
              onChange={setPrice}
              styles={inputStyles}
            />
            <NumberInput
              label={t('services.durationMinutes')}
              required
              value={duration}
              onChange={setDuration}
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
            <Button type="submit" color="gold" c="#0A0A0A">
              {t('services.saveService')}
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
              <Group mt="md">
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
