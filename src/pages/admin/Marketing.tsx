import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import {
  getCampaigns,
  getClients,
  sendWhatsAppCampaign,
  type CampaignRow,
} from '../../lib/api'
import type { Client } from '../../types/database'

const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

export default function Marketing() {
  const [clients, setClients] = useState<Client[]>([])
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mensagem, setMensagem] = useState(
    'Oi, {nome}! Passando pra lembrar que a {barbearia} tá te esperando. Quando quiser marcar, é só responder aqui.',
  )

  async function load() {
    setLoading(true)
    try {
      const [c, camps] = await Promise.all([getClients(), getCampaigns()])
      setClients(c)
      setCampaigns(camps)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter((c) => {
      if (!c.telefone) return false
      if (!q) return true
      return (
        (c.nome || '').toLowerCase().includes(q) ||
        String(c.telefone || '').includes(q.replace(/\D/g, ''))
      )
    })
  }, [clients, search])

  async function handleSend() {
    if (!mensagem.trim()) {
      setError('Escreva a mensagem da campanha')
      return
    }
    if (!filtered.length) {
      setError('Nenhum contato com telefone na lista filtrada')
      return
    }
    if (
      !confirm(
        `Enviar campanha para ${filtered.length} contato(s)? Isso dispara WhatsApp em sequência.`,
      )
    ) {
      return
    }
    setSending(true)
    setError(null)
    setOkMsg(null)
    try {
      const result = await sendWhatsAppCampaign({
        mensagem: mensagem.trim(),
        cliente_ids: filtered.map((c) => c.id),
      })
      if (!result.ok) {
        setError(result.error || 'Falha no envio')
        return
      }
      setOkMsg(
        `Campanha concluída: ${result.enviados ?? 0} enviados, ${result.erros ?? 0} erros (total ${result.total ?? 0}).`,
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar')
    } finally {
      setSending(false)
    }
  }

  return (
    <Stack gap="md">
      <PageHeader
        title="Marketing"
        description="Base de contatos capturados pelo WhatsApp/agendamentos e disparos em massa"
      />

      {error && (
        <Alert color="red" variant="light" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {okMsg && (
        <Alert color="teal" variant="light" withCloseButton onClose={() => setOkMsg(null)}>
          {okMsg}
        </Alert>
      )}

      {loading ? (
        <Group justify="center" py="xl">
          <Loader color="gold" />
        </Group>
      ) : (
        <>
          <Card withBorder padding="lg" radius="lg">
            <Title order={4} c="gold" mb="xs">
              Nova campanha
            </Title>
            <Text size="sm" c="dimmed" mb="md">
              Placeholders: {'{nome}'} e {'{barbearia}'}. Envio serializado com atraso para reduzir risco
              de bloqueio. Destinatários = lista filtrada abaixo ({filtered.length}).
            </Text>
            <Textarea
              label="Mensagem"
              minRows={4}
              value={mensagem}
              onChange={(e) => setMensagem(e.currentTarget.value)}
              styles={inputStyles}
              mb="md"
            />
            <Button color="gold" c="#0A0A0A" loading={sending} onClick={() => void handleSend()}>
              Enviar para {filtered.length} contato(s)
            </Button>
          </Card>

          <Card withBorder padding="lg" radius="lg">
            <Group justify="space-between" mb="md">
              <Title order={4} c="gold">
                Contatos capturados
              </Title>
              <TextInput
                placeholder="Buscar nome ou telefone"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
                styles={inputStyles}
                w={260}
              />
            </Group>
            <Table.ScrollContainer minWidth={700}>
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Nome</Table.Th>
                    <Table.Th>WhatsApp</Table.Th>
                    <Table.Th>Nascimento</Table.Th>
                    <Table.Th>Opt-in</Table.Th>
                    <Table.Th>Desde</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filtered.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>{c.nome}</Table.Td>
                      <Table.Td>{c.telefone || '—'}</Table.Td>
                      <Table.Td>{c.data_nascimento || '—'}</Table.Td>
                      <Table.Td>
                        <Badge color={c.whatsapp_opt_in === false ? 'red' : 'teal'} variant="light">
                          {c.whatsapp_opt_in === false ? 'Não' : 'Sim'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {c.created_at
                          ? new Date(c.created_at).toLocaleDateString('pt-BR')
                          : '—'}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {filtered.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={5}>
                        <Text c="dimmed" ta="center" py="md">
                          Nenhum contato com telefone.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>

          <Card withBorder padding="lg" radius="lg">
            <Title order={4} c="gold" mb="md">
              Histórico de campanhas
            </Title>
            <Table.ScrollContainer minWidth={600}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Data</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Dest.</Table.Th>
                    <Table.Th>Enviados</Table.Th>
                    <Table.Th>Erros</Table.Th>
                    <Table.Th>Mensagem</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {campaigns.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>
                        {c.created_at
                          ? new Date(c.created_at).toLocaleString('pt-BR')
                          : '—'}
                      </Table.Td>
                      <Table.Td>{c.status}</Table.Td>
                      <Table.Td>{c.total_destinatarios}</Table.Td>
                      <Table.Td>{c.total_enviados}</Table.Td>
                      <Table.Td>{c.total_erros}</Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={2}>
                          {c.mensagem}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {campaigns.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text c="dimmed" ta="center" py="md">
                          Nenhuma campanha ainda.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </>
      )}
    </Stack>
  )
}
