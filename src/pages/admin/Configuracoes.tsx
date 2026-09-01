import {
  Alert,
  Box,
  Button,
  Card,
  Group,
  Image,
  Loader,
  NativeSelect,
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useCallback, useEffect, useState } from 'react'
import {
  connectWhatsAppInstance,
  disconnectWhatsAppInstance,
  getConfiguracoes,
  getWhatsAppInstanceStatus,
  runCrmDispatch,
  updateConfiguracoes,
  type WhatsAppInstanceResult,
} from '../../lib/api'
import { PageHeader } from '../../components/PageHeader'
import { withShopDefaults } from '../../lib/shopDefaults'


const inputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

function isConnectedStatus(status?: string | null): boolean {
  const s = (status || '').toLowerCase()
  if (!s) return false
  if (s === 'connected' || s === 'open' || s === 'online') return true
  if (s.includes('connecting')) return false
  if (s.includes('disconnect')) return false
  return s.includes('connected') || s.includes('logged')
}

function statusLabel(status?: string | null): { text: string; color: string; connected: boolean } {
  const s = (status || '').toLowerCase()
  if (isConnectedStatus(status)) {
    return { text: 'Conectado', color: 'teal', connected: true }
  }
  if (s.includes('connecting')) {
    return { text: 'Conectando… escaneie o QR', color: 'orange', connected: false }
  }
  if (s.includes('disconnect') || s.includes('close') || s === 'offline') {
    return { text: 'Desconectado', color: 'red', connected: false }
  }
  if (s.includes('hibern')) {
    return { text: 'Hibernado', color: 'gray', connected: false }
  }
  return { text: status || 'Desconhecido', color: 'gray', connected: false }
}

function resolveStatusFromResult(result: WhatsAppInstanceResult): string | null {
  if (result.status) return result.status
  const data = result.data as Record<string, unknown> | undefined
  if (!data) return null

  const statusObj = data.status
  if (statusObj && typeof statusObj === 'object') {
    const st = statusObj as Record<string, unknown>
    if (st.connected === true || st.loggedIn === true) return 'connected'
    if (st.connected === false) return 'disconnected'
  }

  const inst = (data.instance || data) as Record<string, unknown>
  const s = inst.status ?? inst.state
  if (typeof s === 'string') return s
  if (typeof data.connected === 'boolean') return data.connected ? 'connected' : 'disconnected'
  return null
}

function resolveProfileFromResult(result: WhatsAppInstanceResult): { name?: string; owner?: string } {
  const data = result.data as Record<string, unknown> | undefined
  if (!data) return {}
  const inst = (data.instance || data) as Record<string, unknown>
  return {
    name:
      typeof inst.profileName === 'string'
        ? inst.profileName
        : typeof inst.name === 'string'
          ? inst.name
          : undefined,
    owner: typeof inst.owner === 'string' ? inst.owner : undefined,
  }
}

export default function Configuracoes() {
  const [form, setForm] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const [waStatus, setWaStatus] = useState<string | null>(null)
  const [qrcode, setQrcode] = useState<string | null>(null)
  const [paircode, setPaircode] = useState<string | null>(null)
  const [profileName, setProfileName] = useState<string | null>(null)
  const [profileOwner, setProfileOwner] = useState<string | null>(null)
  const [waLoading, setWaLoading] = useState(false)
  const [waError, setWaError] = useState<string | null>(null)
  const [crmRunning, setCrmRunning] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const data = await getConfiguracoes()
        setForm(withShopDefaults(data || {}))
      } catch {
        setMessage({ tipo: 'erro', texto: 'Erro ao carregar configurações.' })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const refreshStatus = useCallback(async () => {
    setWaError(null)
    try {
      const result = await getWhatsAppInstanceStatus()
      if (!result.ok) {
        setWaError(result.error || 'Falha ao consultar status')
        return
      }
      const status = resolveStatusFromResult(result)
      setWaStatus(status)
      const profile = resolveProfileFromResult(result)
      if (profile.name) setProfileName(profile.name)
      if (profile.owner) setProfileOwner(profile.owner)

      if (isConnectedStatus(status)) {
        setQrcode(null)
        setPaircode(null)
      } else {
        if (result.qrcode) setQrcode(result.qrcode)
        if (result.paircode) setPaircode(result.paircode)
      }
    } catch (err) {
      setWaError(err instanceof Error ? err.message : 'Erro ao consultar status')
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    const connected = isConnectedStatus(waStatus)
    if (connected) return
    if (!qrcode && waStatus && !String(waStatus).toLowerCase().includes('connecting')) return
    const id = window.setInterval(() => {
      void refreshStatus()
    }, 3000)
    return () => window.clearInterval(id)
  }, [qrcode, waStatus, refreshStatus])

  function handleChange(campo: string, valor: any) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const payload = withShopDefaults(form)
      await updateConfiguracoes(payload)
      setForm(payload)
      setMessage({ tipo: 'sucesso', texto: 'Configurações salvas com sucesso!' })
    } catch {
      setMessage({ tipo: 'erro', texto: 'Erro ao salvar configurações.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateQr() {
    setWaLoading(true)
    setWaError(null)
    setMessage(null)
    try {
      const result = await connectWhatsAppInstance()
      if (!result.ok) {
        setWaError(result.error || 'Não foi possível gerar o QR')
        return
      }
      const status = resolveStatusFromResult(result)
      setWaStatus(status)
      const profile = resolveProfileFromResult(result)
      if (profile.name) setProfileName(profile.name)
      if (profile.owner) setProfileOwner(profile.owner)

      if (isConnectedStatus(status)) {
        setQrcode(null)
        setPaircode(null)
        setMessage({ tipo: 'sucesso', texto: 'WhatsApp já está conectado.' })
        return
      }

      setQrcode(result.qrcode || null)
      setPaircode(result.paircode || null)
      if (!result.qrcode && !result.paircode) {
        setWaError('A UAZAPI não retornou QR code. Confira secrets e status da instância.')
      }
    } catch (err) {
      setWaError(err instanceof Error ? err.message : 'Erro ao gerar QR')
    } finally {
      setWaLoading(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar o WhatsApp desta instância?')) return
    setWaLoading(true)
    setWaError(null)
    try {
      const result = await disconnectWhatsAppInstance()
      if (!result.ok) {
        setWaError(result.error || 'Falha ao desconectar')
        return
      }
      setQrcode(null)
      setPaircode(null)
      setProfileName(null)
      setProfileOwner(null)
      setWaStatus('disconnected')
      setMessage({ tipo: 'sucesso', texto: 'Instância desconectada.' })
    } catch (err) {
      setWaError(err instanceof Error ? err.message : 'Erro ao desconectar')
    } finally {
      setWaLoading(false)
    }
  }

  async function handleRunCrm() {
    setCrmRunning(true)
    setMessage(null)
    try {
      const result = await runCrmDispatch()
      if (!result.ok) {
        setMessage({ tipo: 'erro', texto: result.error || 'Falha ao rodar automações' })
        return
      }
      const errHint =
        result.erros && result.erros.length > 0
          ? ` · ${result.erros.length} erro(s)`
          : ''
      setMessage({
        tipo: 'sucesso',
        texto: `Automações: ${result.ausencia ?? 0} ausência(s), ${result.aniversario ?? 0} aniversário(s), ${result.skipped ?? 0} ignorado(s)${errHint}`,
      })
    } catch (err) {
      setMessage({
        tipo: 'erro',
        texto: err instanceof Error ? err.message : 'Erro ao rodar automações',
      })
    } finally {
      setCrmRunning(false)
    }
  }

  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader color="gold" />
        <Text c="dimmed">Carregando configurações...</Text>
      </Group>
    )
  }

  const statusUi = statusLabel(waStatus)
  const connected = statusUi.connected
  const showQr = !connected && !!qrcode

  return (
    <Stack gap="lg">
      <PageHeader title="Configurações" description="Dados da barbearia e integração WhatsApp" />

      {message && (
        <Alert color={message.tipo === 'sucesso' ? 'teal' : 'red'} variant="light">
          {message.texto}
        </Alert>
      )}

      <Card withBorder padding="lg" radius="lg">
        <Title order={4} c="gold" mb="md">
          Informações da Barbearia
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="Nome da Barbearia"
            value={form.nome_barbearia || ''}
            onChange={(e) => handleChange('nome_barbearia', e.currentTarget.value)}
            placeholder="Minha Barbearia"
            styles={inputStyles}
          />
          <TextInput
            label="Endereço"
            value={form.endereco || ''}
            onChange={(e) => handleChange('endereco', e.currentTarget.value)}
            placeholder="Rua Castro Monte 165, Bairro Varjota, Fortaleza"
            styles={inputStyles}
          />
          <TextInput
            label="Telefone"
            value={form.telefone || ''}
            onChange={(e) => handleChange('telefone', e.currentTarget.value)}
            placeholder="(11) 99999-9999"
            styles={inputStyles}
          />
          <TextInput
            label="E-mail"
            value={form.email || ''}
            onChange={(e) => handleChange('email', e.currentTarget.value)}
            placeholder="contato@barbearia.com"
            styles={inputStyles}
          />
        </SimpleGrid>
      </Card>

      <Card withBorder padding="lg" radius="lg">
        <Title order={4} c="gold" mb="md">
          Redes Sociais
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          <TextInput
            label="Instagram"
            value={form.instagram || ''}
            onChange={(e) => handleChange('instagram', e.currentTarget.value)}
            placeholder="@minhabarbearia"
            styles={inputStyles}
          />
          <TextInput
            label="Facebook"
            value={form.facebook || ''}
            onChange={(e) => handleChange('facebook', e.currentTarget.value)}
            placeholder="fb.com/minhabarbearia"
            styles={inputStyles}
          />
          <TextInput
            label="WhatsApp"
            value={form.whatsapp || ''}
            onChange={(e) => handleChange('whatsapp', e.currentTarget.value)}
            placeholder="(11) 99999-9999"
            styles={inputStyles}
          />
        </SimpleGrid>
      </Card>

      <Card withBorder padding="lg" radius="lg">
        <Title order={4} c="gold" mb="xs">
          Bot WhatsApp (UAZAPI)
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Escaneie o QR no celular (WhatsApp → Aparelhos conectados). Preferir WhatsApp Business.
          Mensagens são respondidas pela IA MiMo via Edge Function.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NativeSelect
            label="Bot ativo"
            value={form.whatsapp_bot_ativo === true ? 'true' : 'false'}
            onChange={(e) => handleChange('whatsapp_bot_ativo', e.currentTarget.value === 'true')}
            data={[
              { value: 'true', label: 'Sim — responder mensagens' },
              { value: 'false', label: 'Não — bot desligado' },
            ]}
            styles={inputStyles}
          />
          <TextInput
            label="URL base UAZAPI (referência)"
            value={form.uazapi_base_url || ''}
            onChange={(e) => handleChange('uazapi_base_url', e.currentTarget.value)}
            placeholder="https://barberai.uazapi.com"
            styles={inputStyles}
          />
        </SimpleGrid>

        <Card
          withBorder
          mt="lg"
          padding="md"
          radius="md"
          style={{
            background: connected ? '#0f1a0f' : '#0d0d0d',
            borderColor: connected ? 'teal' : 'rgba(197,160,89,0.2)',
          }}
        >
          <Alert
            color={connected ? 'teal' : 'orange'}
            variant="light"
            mb="md"
            title={connected ? 'WhatsApp conectado' : statusUi.text}
          >
            {connected ? (
              <Text size="sm">
                {profileName ? `Perfil: ${profileName}` : 'Instância online'}
                {profileOwner ? ` · ${profileOwner}` : ''}
              </Text>
            ) : (
              <Text size="sm">Gere o QR e escaneie no celular. Ao conectar, o QR some automaticamente.</Text>
            )}
          </Alert>

          {waError && (
            <Alert color="red" variant="light" mb="md">
              {waError}
            </Alert>
          )}

          <Group gap="sm" mb="md" wrap="wrap">
            {!connected && (
              <Button
                variant="outline"
                color="gold"
                onClick={() => void handleGenerateQr()}
                loading={waLoading}
              >
                Gerar / renovar QR code
              </Button>
            )}
            <Button
              variant="outline"
              color="gold"
              onClick={() => void refreshStatus()}
              disabled={waLoading}
            >
              Atualizar status
            </Button>
            {connected && (
              <Button
                variant="outline"
                color="red"
                onClick={() => void handleDisconnect()}
                loading={waLoading}
              >
                Desconectar
              </Button>
            )}
          </Group>

          {showQr && (
            <Stack align="center" gap="sm">
              <Text size="sm" c="dimmed">
                Abra o WhatsApp → Aparelhos conectados → Conectar um aparelho e escaneie:
              </Text>
              <Box p="md" bg="white" style={{ borderRadius: 12 }}>
                <Image
                  src={
                    qrcode!.startsWith('data:') || qrcode!.startsWith('http')
                      ? qrcode!
                      : `data:image/png;base64,${qrcode}`
                  }
                  alt="QR Code WhatsApp UAZAPI"
                  w={260}
                  h={260}
                />
              </Box>
              <Text size="xs" c="dimmed">
                Atualiza sozinho a cada 3s. Quando conectar, esta área some.
              </Text>
            </Stack>
          )}

          {!connected && paircode && (
            <Text c="gold" mt="sm">
              Código de pareamento: <strong>{paircode}</strong>
            </Text>
          )}

          {!connected && !showQr && !paircode && !waError && (
            <Text size="sm" c="dimmed">
              Clique em <strong>Gerar / renovar QR code</strong> para conectar o WhatsApp.
            </Text>
          )}
        </Card>
      </Card>

      <Card withBorder padding="lg" radius="lg">
        <Title order={4} c="gold" mb="xs">
          Automações WhatsApp
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Disparos diários (job ~10h BRT): clientes sem visita há X dias e aniversariantes.
          Use {'{nome}'}, {'{dias}'} e {'{barbearia}'} nos textos. Deixe em branco para a mensagem padrão.
        </Text>

        <Stack gap="lg">
          <Card withBorder padding="md" radius="md" bg="dark.8">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Reengajamento (ausência)</Text>
              <Switch
                checked={form.auto_ausencia_ativo === true}
                onChange={(e) => handleChange('auto_ausencia_ativo', e.currentTarget.checked)}
                color="gold"
              />
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <NumberInput
                label="Dias sem visita (concluída)"
                min={7}
                max={365}
                value={Number(form.auto_ausencia_dias) || 45}
                onChange={(v) => handleChange('auto_ausencia_dias', Number(v) || 45)}
                disabled={!form.auto_ausencia_ativo}
                styles={inputStyles}
              />
              <Textarea
                label="Mensagem"
                minRows={3}
                value={form.auto_ausencia_mensagem || ''}
                onChange={(e) => handleChange('auto_ausencia_mensagem', e.currentTarget.value)}
                placeholder="Oi, {nome}! Faz {dias} dias que você não aparece na {barbearia}…"
                disabled={!form.auto_ausencia_ativo}
                styles={inputStyles}
                style={{ gridColumn: '1 / -1' }}
              />
            </SimpleGrid>
          </Card>

          <Card withBorder padding="md" radius="md" bg="dark.8">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Aniversário</Text>
              <Switch
                checked={form.auto_aniversario_ativo === true}
                onChange={(e) => handleChange('auto_aniversario_ativo', e.currentTarget.checked)}
                color="gold"
              />
            </Group>
            <Textarea
              label="Mensagem"
              minRows={3}
              value={form.auto_aniversario_mensagem || ''}
              onChange={(e) => handleChange('auto_aniversario_mensagem', e.currentTarget.value)}
              placeholder="Feliz aniversário, {nome}! Abraço da {barbearia}."
              disabled={!form.auto_aniversario_ativo}
              styles={inputStyles}
            />
          </Card>

          <Group>
            <Button
              variant="outline"
              color="gold"
              onClick={() => void handleRunCrm()}
              loading={crmRunning}
            >
              Rodar agora (teste)
            </Button>
            <Text size="xs" c="dimmed">
              Envia só quem ainda não recebeu nesta janela (idempotente).
            </Text>
          </Group>
        </Stack>
      </Card>

      <Card withBorder padding="lg" radius="lg">
        <Title order={4} c="gold" mb="md">
          Horários de Funcionamento
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {[
            { chave: 'horario_segunda', label: 'Segunda-feira' },
            { chave: 'horario_terca', label: 'Terça-feira' },
            { chave: 'horario_quarta', label: 'Quarta-feira' },
            { chave: 'horario_quinta', label: 'Quinta-feira' },
            { chave: 'horario_sexta', label: 'Sexta-feira' },
            { chave: 'horario_sabado', label: 'Sábado' },
            { chave: 'horario_domingo', label: 'Domingo' },
          ].map((dia) => (
            <TextInput
              key={dia.chave}
              label={dia.label}
              value={form[dia.chave] || ''}
              onChange={(e) => handleChange(dia.chave, e.currentTarget.value)}
              placeholder="08:30 - 19:30"
              description="Formato: HH:MM - HH:MM (ex.: 08:30 - 19:30). Use Fechado se não abrir."
              styles={inputStyles}
            />
          ))}
        </SimpleGrid>
      </Card>

      <Button color="gold" c="#0A0A0A" onClick={handleSave} loading={saving} w="fit-content">
        Salvar Configurações
      </Button>
    </Stack>
  )
}
