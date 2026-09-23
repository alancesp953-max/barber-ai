import {
  Button,
  Combobox,
  Group,
  InputBase,
  Modal,
  NativeSelect,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  useCombobox,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import {
  createAppointment,
  findOrCreateClient,
  getClients,
  notifyAppointmentWhatsApp,
} from '../lib/api'
import { formatCurrency } from '../lib/format'
import type { Service } from '../types/database'

const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

type LockedBarber = { id: string; nome: string }

type ClientHit = {
  id: string
  nome: string
  telefone?: string | null
  email?: string | null
}

type Props = {
  opened: boolean
  onClose: () => void
  onCreated: () => void
  barbers?: { id: string; nome: string }[]
  services: Service[]
  lockedBarber?: LockedBarber | null
  defaultDate?: string
}

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function matchesClient(client: ClientHit, query: string) {
  const q = fold(query)
  if (!q) return true
  const nome = fold(client.nome)
  if (nome.startsWith(q) || nome.includes(q)) return true
  const digits = query.replace(/\D/g, '')
  if (digits.length >= 2 && String(client.telefone || '').includes(digits)) return true
  return false
}

function ClientSearchField({
  catalog,
  search,
  selectedId,
  onSearchChange,
  onSelect,
}: {
  catalog: ClientHit[]
  search: string
  selectedId: string | null
  onSearchChange: (value: string) => void
  onSelect: (client: ClientHit | null, displayName: string) => void
}) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.selectFirstOption(),
  })

  const query = search.trim()
  const filtered = useMemo(() => {
    const q = fold(query)
    const scored = catalog
      .filter((client) => matchesClient(client, query))
      .map((client) => {
        const nome = fold(client.nome)
        return { client, rank: q && nome.startsWith(q) ? 0 : 1 }
      })
    scored.sort((a, b) => a.rank - b.rank || a.client.nome.localeCompare(b.client.nome, 'pt-BR'))
    return scored.slice(0, 20).map((item) => item.client)
  }, [catalog, query])

  const canCreate = query.length > 0 && !selectedId && filtered.length === 0

  return (
    <Combobox
      store={combobox}
      withinPortal
      zIndex={400}
      onOptionSubmit={(value) => {
        if (value === '$create') {
          onSelect(null, query)
          combobox.closeDropdown()
          return
        }
        const client = catalog.find((item) => item.id === value)
        if (client) onSelect(client, client.nome)
        combobox.closeDropdown()
      }}
    >
      <Combobox.Target>
        <InputBase
          label="Cliente *"
          required
          placeholder="Digite para buscar ou cadastrar"
          description={
            selectedId
              ? 'Cliente vinculado ao cadastro existente.'
              : canCreate
                ? `Ninguém com essas letras. “${query}” será cadastrado ao salvar.`
                : 'Digite uma ou mais letras. Enter seleciona a sugestão.'
          }
          value={search}
          onChange={(event) => {
            onSearchChange(event.currentTarget.value)
            combobox.openDropdown()
            combobox.updateSelectedOptionIndex()
            window.requestAnimationFrame(() => combobox.selectFirstOption())
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          rightSection={<Combobox.Chevron />}
          rightSectionPointerEvents="none"
          styles={inputStyles}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          <ScrollArea.Autosize mah={240} type="scroll">
            {filtered.map((client) => (
              <Combobox.Option value={client.id} key={client.id} active={client.id === selectedId}>
                <Text size="sm">{client.nome}</Text>
                {client.telefone ? (
                  <Text size="xs" c="dimmed">
                    {client.telefone}
                  </Text>
                ) : null}
              </Combobox.Option>
            ))}
            {canCreate && (
              <Combobox.Option value="$create">
                Cadastrar “{query}”
              </Combobox.Option>
            )}
            {filtered.length === 0 && !canCreate && (
              <Combobox.Empty>Digite o nome do cliente</Combobox.Empty>
            )}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}

export function AppointmentCreateModal({
  opened,
  onClose,
  onCreated,
  barbers = [],
  services,
  lockedBarber,
  defaultDate,
}: Props) {
  const [clientName, setClientName] = useState('')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<ClientHit[]>([])
  const [date, setDate] = useState(defaultDate || '')
  const [time, setTime] = useState('')
  const [barberId, setBarberId] = useState(lockedBarber?.id || '')
  const [serviceId, setServiceId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!opened) return
    setError(null)
    setDate(defaultDate || '')
    setTime('')
    setBarberId(lockedBarber?.id || '')
    setServiceId('')
    setClientName('')
    setSelectedClientId(null)
    void getClients()
      .then((rows) =>
        setCatalog(
          (rows || []).map((row) => ({
            id: String(row.id),
            nome: String(row.nome || ''),
            telefone: row.telefone ?? null,
            email: row.email ?? null,
          })),
        ),
      )
      .catch(() => setCatalog([]))
  }, [opened, lockedBarber?.id, defaultDate])

  const handleSelectClient = (client: ClientHit | null, displayName: string) => {
    setClientName(displayName)
    setSelectedClientId(client?.id || null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nome = clientName.trim()
    if (!nome) {
      setError('O nome do cliente é obrigatório')
      return
    }
    if (!date || !time) {
      setError('Data e horário são obrigatórios')
      return
    }
    if (!serviceId) {
      setError('Selecione um serviço')
      return
    }
    const assignedBarberId = lockedBarber?.id || barberId || null
    if (lockedBarber && assignedBarberId !== lockedBarber.id) {
      setError('Este agendamento precisa ficar no seu nome.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const selected = catalog.find((item) => item.id === selectedClientId)
      const cliente = await findOrCreateClient({
        id: selectedClientId || undefined,
        nome: selected?.nome || nome,
      })
      const created = await createAppointment({
        cliente_id: cliente.id,
        barbeiro_id: assignedBarberId,
        servico_id: serviceId,
        data: date,
        horario: time,
        status: 'pendente',
        allowOverlap: true,
      })
      const phone = String(selected?.telefone || cliente.telefone || '').replace(/\D/g, '')
      if (phone) {
        const barberName =
          created?.barbeiros?.nome ||
          lockedBarber?.nome ||
          barbers.find((b) => b.id === assignedBarberId)?.nome
        const service = services.find((s) => s.id === serviceId)
        void notifyAppointmentWhatsApp({
          phone,
          clientName: cliente.nome || nome,
          serviceName: service?.nome,
          barberName,
          date,
          time,
        })
      }
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o agendamento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={700} c="gold" size="lg">
          Novo agendamento
        </Text>
      }
      centered
      size="lg"
      styles={{
        content: { background: '#1a1a1a', border: '1px solid rgba(197,160,89,0.2)' },
        header: { background: '#1a1a1a' },
        body: { background: '#1a1a1a' },
      }}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Encaixe permitido: o horário é gravado mesmo se já existir outro atendimento no mesmo
            intervalo.
          </Text>
          {error && (
            <Text size="sm" c="red.4">
              {error}
            </Text>
          )}
          <ClientSearchField
            catalog={catalog}
            search={clientName}
            selectedId={selectedClientId}
            onSearchChange={(value) => {
              setClientName(value)
              setSelectedClientId(null)
            }}
            onSelect={handleSelectClient}
          />
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
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
              value={time}
              onChange={(e) => setTime(e.currentTarget.value)}
              description="Pode coincidir com outro agendamento (encaixe)."
              styles={inputStyles}
            />
            <NativeSelect
              label="Profissional"
              value={lockedBarber?.id || barberId}
              disabled={Boolean(lockedBarber)}
              onChange={(e) => setBarberId(e.currentTarget.value)}
              data={
                lockedBarber
                  ? [{ value: lockedBarber.id, label: lockedBarber.nome }]
                  : [
                      { value: '', label: 'Qualquer (rodízio)' },
                      ...barbers.map((b) => ({ value: b.id, label: b.nome })),
                    ]
              }
              styles={inputStyles}
            />
            <NativeSelect
              label="Serviço *"
              value={serviceId}
              onChange={(e) => setServiceId(e.currentTarget.value)}
              data={[
                { value: '', label: 'Selecione um serviço' },
                ...services.map((s) => ({
                  value: s.id,
                  label: `${s.nome} — ${formatCurrency(Number(s.preco))}`,
                })),
              ]}
              styles={inputStyles}
            />
          </SimpleGrid>
          <Group justify="flex-end">
            <Button variant="outline" color="gray" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" color="gold" c="#0A0A0A" loading={saving}>
              Salvar agendamento
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
