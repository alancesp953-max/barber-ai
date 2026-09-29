import { useState, useEffect, useRef } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { IconBrandWhatsapp, IconQrcode, IconRefresh, IconShieldCheck } from '@tabler/icons-react'
import { PageHeader } from '../../components/PageHeader'
import { useAuth } from '../../lib/firebaseAuth'
import { getBotActive, saveBotActive } from '../../lib/api'

const BAILEYS_API = 'http://127.0.0.1:8787'

interface WhatsAppStatus {
  status: 'connected' | 'waiting_qr' | 'connecting' | 'disconnected'
  phoneNumber?: string | null
  qrCode?: string | null
  connectedAt?: string | null
  lastError?: string | null
  lastQrAt?: string | null
}

export default function ConectarWhatsApp() {
  const { tenant } = useAuth()
  const tenantId = tenant?.id || 'barbearia-principal'

  const [statusData, setStatusData] = useState<WhatsAppStatus>({
    status: 'disconnected',
    phoneNumber: null,
    qrCode: null,
  })
  const [actionLoading, setActionLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [botAtivo, setBotAtivo] = useState(false)
  const [botMsg, setBotMsg] = useState<string | null>(null)
  const [savingBot, setSavingBot] = useState(false)
  const pollTimerRef = useRef<any>(null)

  // Consulta status do backend
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${BAILEYS_API}/api/whatsapp/status?tenantId=${tenantId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStatusData(data)
      setErrorMsg(null)
    } catch (err: any) {
      console.warn('Erro ao consultar status do WhatsApp:', err.message)
    }
  }

  useEffect(() => {
    getBotActive(tenantId)
      .then((bot) => setBotAtivo(bot?.bot_ativo === true))
      .catch(() => setBotAtivo(false))
    fetchStatus()
    // Polling contínuo para atualizar o QR Code e detectar leitura
    pollTimerRef.current = setInterval(fetchStatus, 3000)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [tenantId])

  // Ação: Iniciar conexão (Gera QR Code real)
  const handleConnect = async () => {
    setActionLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`${BAILEYS_API}/api/whatsapp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao iniciar conexão')
      setStatusData((prev) => ({ ...prev, ...data }))
      // Força consulta em 2s
      setTimeout(fetchStatus, 2000)
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Ação: Desconectar sessão
  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar o WhatsApp desta barbearia?')) return
    setActionLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`${BAILEYS_API}/api/whatsapp/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao desconectar')
      setStatusData({
        status: 'disconnected',
        phoneNumber: null,
        qrCode: null,
      })
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  // Ação: Reconectar (Força novo QR Code)
  const handleReconnect = async () => {
    setActionLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`${BAILEYS_API}/api/whatsapp/reconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao reconectar')
      setStatusData((prev) => ({ ...prev, ...data }))
      setTimeout(fetchStatus, 2000)
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleBotChange = async (ligado: boolean) => {
    setSavingBot(true)
    setBotMsg(null)
    setBotAtivo(ligado)
    try {
      const saved = await saveBotActive(ligado, tenantId)
      setBotAtivo(saved?.bot_ativo === true)
      setBotMsg(saved?.bot_ativo ? 'Bot gravado: Sim — bot ligado.' : 'Bot gravado: Não — bot desligado.')
    } catch (err: any) {
      setBotMsg(err.message || 'Não foi possível gravar o bot ativo.')
    } finally {
      setSavingBot(false)
    }
  }

  const statusLabel =
    statusData.status === 'connected'
      ? 'WhatsApp conectado'
      : statusData.status === 'waiting_qr'
        ? 'Aguardando leitura do QR Code'
        : statusData.status === 'connecting'
          ? 'Iniciando sessão...'
          : 'WhatsApp desconectado'

  return (
    <Stack gap="lg">
      <PageHeader
        title="WhatsApp — Conectar número"
        description="Pareie o WhatsApp da barbearia pelo Baileys local. O bot ativo fica gravado no Firestore."
      />

      {errorMsg && (
        <Alert color="red" variant="light">
          {errorMsg}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Stack gap="lg">
          <Card withBorder padding="lg" radius="lg">
            <Group gap="sm" mb="md">
              <ThemeIcon color="gold" variant="light" size="lg" radius="md">
                <IconBrandWhatsapp size={18} />
              </ThemeIcon>
              <Title order={4} c="gold">
                Status da conexão
              </Title>
            </Group>

            <Group justify="space-between" align="center" mb="md">
              <div>
                <Text fw={600}>{statusLabel}</Text>
                <Text size="xs" c="dimmed">
                  {statusData.status === 'connected' && statusData.phoneNumber
                    ? `Número: +${statusData.phoneNumber}`
                    : 'Nenhum número pareado no momento'}
                </Text>
              </div>
              {statusData.status === 'connected' && (
                <Badge color="teal" variant="light">
                  Ativo
                </Badge>
              )}
            </Group>

            {statusData.status === 'connected' && (
              <Stack gap={6} mb="md">
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">
                    Data da conexão
                  </Text>
                  <Text size="xs">
                    {statusData.connectedAt ? new Date(statusData.connectedAt).toLocaleString('pt-BR') : 'Hoje'}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">
                    Dispositivo
                  </Text>
                  <Text size="xs" c="gold.4">
                    WhatsApp Web (sessão local)
                  </Text>
                </Group>
              </Stack>
            )}

            <NativeSelect
              label="Bot ativo"
              value={botAtivo ? 'true' : 'false'}
              disabled={savingBot}
              onChange={(e) => handleBotChange(e.currentTarget.value === 'true')}
              data={[
                { value: 'false', label: 'Não — bot desligado' },
                { value: 'true', label: 'Sim — bot ligado' },
              ]}
              maw={360}
            />
            {botMsg && (
              <Text size="xs" c="gold.4" mt="xs">
                {botMsg}
              </Text>
            )}

            <Group gap="sm" mt="lg">
              {statusData.status === 'disconnected' && (
                <Button color="gold" c="dark.9" onClick={handleConnect} loading={actionLoading}>
                  Conectar WhatsApp
                </Button>
              )}
              {(statusData.status === 'waiting_qr' || statusData.status === 'connecting') && (
                <Button color="gold" c="dark.9" onClick={handleReconnect} loading={actionLoading} leftSection={<IconRefresh size={16} />}>
                  Gerar novo QR Code
                </Button>
              )}
              {statusData.status === 'connected' && (
                <>
                  <Button variant="outline" color="gold" onClick={handleReconnect} loading={actionLoading}>
                    Reconectar
                  </Button>
                  <Button variant="outline" color="red" onClick={handleDisconnect} loading={actionLoading}>
                    Desconectar WhatsApp
                  </Button>
                </>
              )}
            </Group>
          </Card>

          <Card withBorder padding="lg" radius="lg">
            <Group gap="sm" mb="xs">
              <ThemeIcon color="gold" variant="light" radius="md">
                <IconShieldCheck size={16} />
              </ThemeIcon>
              <Text fw={600} c="gold.4">
                Sessão local
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              A sessão fica no servidor desta barbearia. O estado do bot é gravado no Firestore e a Diva só responde quando ele está ligado.
            </Text>
          </Card>
        </Stack>

        <Card withBorder padding="lg" radius="lg">
          <Stack align="center" gap="md" mih={420} justify="center">
            {statusData.status === 'waiting_qr' && statusData.qrCode ? (
              <>
                <div style={{ padding: 16, background: '#fff', borderRadius: 12 }}>
                  <img src={statusData.qrCode} alt="QR Code WhatsApp Baileys" style={{ width: 256, height: 256, display: 'block' }} />
                </div>
                <Text fw={600} ta="center">
                  Escaneie este código com a câmera do WhatsApp
                </Text>
                <Text size="xs" c="dimmed" ta="center" maw={360}>
                  O QR atualiza sozinho se expirar. Mantenha esta tela aberta.
                </Text>
              </>
            ) : statusData.status === 'connected' ? (
              <>
                <ThemeIcon color="teal" variant="light" size={72} radius="xl">
                  <IconBrandWhatsapp size={36} />
                </ThemeIcon>
                <Title order={4}>WhatsApp conectado</Title>
                <Text size="sm" c="dimmed" ta="center" maw={360}>
                  As mensagens deste número passam pelo Baileys local e a Diva responde quando o bot está ligado.
                </Text>
              </>
            ) : statusData.status === 'connecting' ? (
              <>
                <ThemeIcon color="gold" variant="light" size={72} radius="xl">
                  <IconRefresh size={36} />
                </ThemeIcon>
                <Title order={4}>Inicializando WhatsApp</Title>
                <Text size="sm" c="dimmed" ta="center" maw={360}>
                  Aguarde a sessão local gerar o QR Code.
                </Text>
              </>
            ) : (
              <>
                <ThemeIcon color="gold" variant="light" size={72} radius="xl">
                  <IconQrcode size={36} />
                </ThemeIcon>
                <Title order={4}>Conexão pronta para iniciar</Title>
                <Text size="sm" c="dimmed" ta="center" maw={360}>
                  Clique em Conectar WhatsApp para gerar o QR e parear o número da barbearia.
                </Text>
              </>
            )}

            <List size="sm" c="dimmed" spacing={4} w="100%" maw={420}>
              <List.Item>Abra o WhatsApp no celular.</List.Item>
              <List.Item>Toque em Configurações ou nos três pontos.</List.Item>
              <List.Item>Escolha Aparelhos conectados e depois Conectar um aparelho.</List.Item>
              <List.Item>Aponte a câmera para o QR Code desta tela.</List.Item>
            </List>
          </Stack>
        </Card>
      </SimpleGrid>
    </Stack>
  )
}
