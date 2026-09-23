import { Alert, Button, Group, Stack, Switch, Text, TextInput } from '@mantine/core'
import { Coffee } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getBarber, saveBarberDailyBreak } from '../lib/api'
import { parseBreakHm, readConfiguredDailyBreak } from '../lib/availability'

const defaultInputStyles = {
  input: { background: '#0d0d0d', borderColor: 'rgba(197,160,89,0.2)', color: '#f5f5f5' },
  label: { color: '#cfcfcf' },
}

type Props = {
  barbeiroId: string
  inputStyles?: Record<string, unknown>
  onSaved?: () => void
}

export function BarberDailyBreak({ barbeiroId, inputStyles, onSaved }: Props) {
  const styles = inputStyles || defaultInputStyles
  const [ativo, setAtivo] = useState(false)
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setAtivo(false)
    setInicio('')
    setFim('')
    setMsg(null)
    setErr(null)
    void (async () => {
      try {
        const barber = await getBarber(barbeiroId)
        if (cancelled || barber.id !== barbeiroId) return
        const configured = readConfiguredDailyBreak(barber)
        setAtivo(Boolean(configured))
        setInicio(configured?.inicio || parseBreakHm(barber.intervalo_inicio) || '')
        setFim(configured?.fim || parseBreakHm(barber.intervalo_fim) || '')
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Erro ao carregar intervalo')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [barbeiroId])

  const save = async () => {
    setSaving(true)
    setErr(null)
    setMsg(null)
    try {
      await saveBarberDailyBreak(barbeiroId, {
        intervalo_ativo: ativo,
        intervalo_inicio: inicio,
        intervalo_fim: fim,
      })
      setMsg(
        ativo
          ? `Intervalo diário deste barbeiro salvo: ${inicio} às ${fim}. Não altera a escala dos outros profissionais.`
          : 'Intervalo diário desativado para este barbeiro. A lista de folgas fica livre até um novo horário ser cadastrado.',
      )
      onSaved?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao salvar intervalo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Coffee size={16} color="#c5a059" />
        <Text fw={600} c="gold" size="sm">
          Intervalo diário deste barbeiro
        </Text>
      </Group>
      <Text size="sm" c="dimmed">
        Pausa só deste profissional. Se estiver desligada ou sem horário, a lista de folgas
        fica limpa — nenhum 12:00 às 14:00 global é aplicado.
      </Text>
      <Switch
        label={ativo ? 'Intervalo ligado' : 'Intervalo desligado'}
        checked={ativo}
        onChange={(e) => setAtivo(e.currentTarget.checked)}
        color="gold"
      />
      <Group grow>
        <TextInput
          type="time"
          label="Início do intervalo"
          value={inicio}
          disabled={!ativo}
          onChange={(e) => setInicio(e.currentTarget.value)}
          styles={styles}
        />
        <TextInput
          type="time"
          label="Fim do intervalo"
          value={fim}
          disabled={!ativo}
          onChange={(e) => setFim(e.currentTarget.value)}
          styles={styles}
        />
      </Group>
      {err && (
        <Alert color="red" variant="light">
          {err}
        </Alert>
      )}
      {msg && (
        <Alert color="teal" variant="light">
          {msg}
        </Alert>
      )}
      <Button color="gold" c="#0A0A0A" loading={saving} onClick={() => void save()} w="fit-content">
        Salvar intervalo
      </Button>
    </Stack>
  )
}
