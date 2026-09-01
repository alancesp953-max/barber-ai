import {
  Alert,
  Button,
  Code,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { KeyRound, Plus, Star, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createBarberUser, getUsers, resetBarberPassword } from '../../lib/api'
import type { Barber } from '../../types/database'
import { PageHeader } from '../../components/PageHeader'

const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

type BarberUser = Barber & { senha_temporaria?: string | null }

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<BarberUser[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdInfo, setCreatedInfo] = useState<{ email: string; senha: string } | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [lastReset, setLastReset] = useState<{ nome: string; senha: string } | null>(null)

  const [formNome, setFormNome] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formSenha, setFormSenha] = useState('')
  const [formAvaliacao, setFormAvaliacao] = useState(5)

  async function loadUsuarios() {
    try {
      const data = await getUsers()
      setUsuarios(data as BarberUser[])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsuarios()
  }, [])

  function abrirModal() {
    setError(null)
    setCreatedInfo(null)
    setModalAberto(true)
    setFormNome('')
    setFormEmail('')
    setFormSenha('')
    setFormAvaliacao(5)
  }

  function fecharModal() {
    setModalAberto(false)
    setError(null)
  }

  async function handleSalvar() {
    if (!formNome.trim()) {
      setError('Nome é obrigatório')
      return
    }
    if (!formEmail.trim()) {
      setError('E-mail é obrigatório')
      return
    }
    if (formSenha.length < 6) {
      setError('Senha deve ter no mínimo 6 caracteres')
      return
    }

    setSaving(true)
    try {
      await createBarberUser({
        nome: formNome.trim(),
        email: formEmail.trim(),
        senha: formSenha,
        avaliacao: formAvaliacao,
      })
      setCreatedInfo({ email: formEmail.trim().toLowerCase(), senha: formSenha })
      await loadUsuarios()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar usuário')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetSenha(usuario: BarberUser) {
    setResettingId(usuario.id)
    setLastReset(null)
    try {
      const result = await resetBarberPassword(usuario.id)
      setLastReset({ nome: usuario.nome, senha: result.senha })
      await loadUsuarios()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao redefinir senha')
    } finally {
      setResettingId(null)
    }
  }

  return (
    <Stack gap="md">
      <PageHeader
        title="Usuários"
        description="Barbeiros com conta de login — entram em /login e vão direto para a agenda"
        action={
          <Button color="gold" c="#0A0A0A" leftSection={<Plus size={16} />} onClick={abrirModal}>
            Novo Usuário
          </Button>
        }
      />

      <Alert color="gold" variant="light">
        A coluna <strong>Senha</strong> mostra a senha temporária cadastrada. O barbeiro entra em{' '}
        <Text span fw={700} component="a" href="/login" c="gold.4">
          /login
        </Text>
        . Use “Nova senha” para gerar outra.
      </Alert>

      {lastReset && (
        <Alert color="teal" variant="light" title={`Nova senha — ${lastReset.nome}`}>
          Senha temporária: <Code>{lastReset.senha}</Code>
        </Alert>
      )}

      {loading ? (
        <Group justify="center" py="xl">
          <Loader color="gold" />
        </Group>
      ) : (
        <Paper withBorder p="lg" radius="lg">
          {usuarios.length === 0 ? (
            <Text c="dimmed" ta="center" py="md">
              Nenhum usuário com login cadastrado.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Nome</Table.Th>
                    <Table.Th>E-mail</Table.Th>
                    <Table.Th>Senha</Table.Th>
                    <Table.Th ta="center">Avaliação</Table.Th>
                    <Table.Th>Ações</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {usuarios.map((usuario) => (
                    <Table.Tr key={usuario.id}>
                      <Table.Td>
                        <Group gap="xs">
                          <UserPlus size={16} color="#c5a059" />
                          <Text fw={500}>{usuario.nome}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td c="dimmed">{usuario.email || '—'}</Table.Td>
                      <Table.Td>
                        {usuario.senha_temporaria ? (
                          <Code>{usuario.senha_temporaria}</Code>
                        ) : (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="center">
                        <Group gap={4} justify="center" c="orange.4">
                          <Star size={14} fill="#ff9800" />
                          <Text size="sm">{usuario.avaliacao?.toFixed(1) || '5.0'}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="light"
                          color="gold"
                          leftSection={<KeyRound size={14} />}
                          loading={resettingId === usuario.id}
                          onClick={() => void handleResetSenha(usuario)}
                        >
                          Nova senha
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Paper>
      )}

      <Modal
        opened={modalAberto}
        onClose={fecharModal}
        title={
          <Title order={4} c="gold">
            {createdInfo ? 'Usuário criado' : 'Novo Usuário'}
          </Title>
        }
        centered
        styles={{
          content: { background: '#1a1a1a', border: '1px solid rgba(197,160,89,0.2)' },
          header: { background: '#1a1a1a' },
          body: { background: '#1a1a1a' },
        }}
      >
        <Stack gap="md">
          {createdInfo ? (
            <>
              <Alert color="teal" variant="light">
                Conta criada. Anote os dados de acesso:
              </Alert>
              <Text size="sm">
                E-mail: <Code>{createdInfo.email}</Code>
              </Text>
              <Text size="sm">
                Senha: <Code>{createdInfo.senha}</Code>
              </Text>
              <Button color="gold" c="#0A0A0A" onClick={fecharModal}>
                Fechar
              </Button>
            </>
          ) : (
            <>
              <Text size="sm" c="dimmed">
                Cria conta de login e vincula ao cadastro de barbeiro. A senha fica visível na lista.
              </Text>

              {error && (
                <Alert color="red" variant="light">
                  {error}
                </Alert>
              )}

              <TextInput
                label="Nome *"
                value={formNome}
                onChange={(e) => setFormNome(e.currentTarget.value)}
                placeholder="Nome do barbeiro"
                styles={inputStyles}
              />
              <TextInput
                label="E-mail *"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.currentTarget.value)}
                placeholder="email@exemplo.com"
                styles={inputStyles}
              />
              <PasswordInput
                label="Senha *"
                value={formSenha}
                onChange={(e) => setFormSenha(e.currentTarget.value)}
                placeholder="Mínimo 6 caracteres"
                styles={inputStyles}
              />
              <NumberInput
                label="Avaliação inicial"
                value={formAvaliacao}
                onChange={(v) => setFormAvaliacao(Number(v) || 0)}
                min={0}
                max={5}
                step={0.1}
                decimalScale={1}
                styles={inputStyles}
              />

              <Group justify="flex-end">
                <Button variant="outline" color="gray" onClick={fecharModal}>
                  Cancelar
                </Button>
                <Button color="gold" c="#0A0A0A" onClick={handleSalvar} loading={saving}>
                  Criar usuário
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </Stack>
  )
}
