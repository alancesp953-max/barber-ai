import {
  Alert,
  Badge,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  createBarbeiroBloqueio,
  deleteBarbeiroBloqueio,
  getBarbeiroBloqueios,
  type BarberBlock,
} from '../lib/api'

const todayYmd = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const addDaysYmd = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const toBrtIso = (date: string, time: string) =>
  `${date}T${time.length === 5 ? `${time}:00` : time}-03:00`

const formatBlockRange = (inicio: string, fim: string | null) => {
  const a = new Date(inicio)
  if (!fim) {
    return `${a.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })} → sem previsão de retorno`
  }
  const b = new Date(fim)
  const sameDay = a.toDateString() === b.toDateString()
  const dOpts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
  if (sameDay) {
    return `${a.toLocaleDateString('pt-BR')} · ${a.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })} → ${b.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }
  return `${a.toLocaleString('pt-BR', dOpts)} → ${b.toLocaleString('pt-BR', dOpts)}`
}

const blockStatus = (inicio: string, fim: string | null) => {
  const now = Date.now()
  const a = new Date(inicio).getTime()
  if (!fim) {
    return now >= a
      ? { label: 'Afastamento ativo', color: 'red' as const }
      : { label: 'Afastamento programado', color: 'gold' as const }
  }
  const b = new Date(fim).getTime()
  if (now >= a && now < b) return { label: 'Ativo agora', color: 'orange' as const }
  if (now < a) return { label: 'Programado', color: 'gold' as const }
  return { label: 'Encerrado', color: 'gray' as const }
}

type Props = {
  barbeiroId: string
  barbeiroNome?: string
  /** Estilos dos inputs (admin dark). */
  inputStyles?: Record<string, unknown>
}

export function BarberBlocksManager({ barbeiroId, barbeiroNome, inputStyles }: Props) {
  const [bloqueios, setBloqueios] = useState<BarberBlock[]>([])
  const [blockStartDate, setBlockStartDate] = useState(todayYmd)
  const [blockStartTime, setBlockStartTime] = useState('08:30')
  const [blockEndDate, setBlockEndDate] = useState(todayYmd)
  const [blockEndTime, setBlockEndTime] = useState('19:30')
  const [blockNoEnd, setBlockNoEnd] = useState(false)
  const [blockMotivo, setBlockMotivo] = useState('')
  const [savingBlock, setSavingBlock] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgTone, setMsgTone] = useState<'gold' | 'orange' | 'red'>('gold')

  const load = useCallback(async () => {
    const rows = await getBarbeiroBloqueios(barbeiroId)
    setBloqueios(rows)
  }, [barbeiroId])

  useEffect(() => {
    void load().catch((e) => {
      setMsgTone('red')
      setMsg(e instanceof Error ? e.message : 'Erro ao carregar bloqueios')
    })
  }, [load])

  const applyShortcut = (kind: 'folga_dia' | 'turno_manha' | 'turno_tarde' | 'ferias_5') => {
    const base = blockStartDate || todayYmd()
    if (kind === 'folga_dia') {
      setBlockNoEnd(false)
      setBlockStartDate(base)
      setBlockStartTime('00:00')
      setBlockEndDate(base)
      setBlockEndTime('23:59')
      setBlockMotivo((m) => m || 'Folga')
      return
    }
    if (kind === 'turno_manha') {
      setBlockNoEnd(false)
      setBlockStartDate(base)
      setBlockStartTime('08:30')
      setBlockEndDate(base)
      setBlockEndTime('12:00')
      setBlockMotivo((m) => m || 'Turno da manhã')
      return
    }
    if (kind === 'turno_tarde') {
      setBlockNoEnd(false)
      setBlockStartDate(base)
      setBlockStartTime('12:00')
      setBlockEndDate(base)
      setBlockEndTime('19:30')
      setBlockMotivo((m) => m || 'Turno da tarde')
      return
    }
    setBlockNoEnd(false)
    setBlockStartDate(base)
    setBlockStartTime('00:00')
    setBlockEndDate(addDaysYmd(base, 4))
    setBlockEndTime('23:59')
    setBlockMotivo((m) => m || 'Férias / afastamento')
  }

  const handleCreate = async () => {
    if (
      !blockStartDate ||
      !blockStartTime ||
      (!blockNoEnd && (!blockEndDate || !blockEndTime))
    ) {
      setMsgTone('orange')
      setMsg('Preencha início e fim do período de indisponibilidade.')
      return
    }
    const inicio = toBrtIso(blockStartDate, blockStartTime)
    const fim = blockNoEnd ? null : toBrtIso(blockEndDate, blockEndTime)
    if (fim && !(new Date(fim).getTime() > new Date(inicio).getTime())) {
      setMsgTone('orange')
      setMsg('O fim do período precisa ser depois do início.')
      return
    }

    setSavingBlock(true)
    setMsg(null)
    try {
      await createBarbeiroBloqueio({
        barbeiro_id: barbeiroId,
        inicio,
        fim,
        motivo: blockMotivo || undefined,
      })
      setBlockMotivo('')
      await load()
      setMsgTone('gold')
      setMsg(
        barbeiroNome
          ? `Indisponibilidade salva para ${barbeiroNome}. A Diva não oferece os horários dele e o rodízio pula automaticamente nesse período.`
          : 'Indisponibilidade salva. Nesse período a Diva não oferece horários e o rodízio pula automaticamente.',
      )
    } catch (e) {
      setMsgTone('red')
      setMsg(e instanceof Error ? e.message : 'Erro ao bloquear')
    } finally {
      setSavingBlock(false)
    }
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Pause a escala por turno, dia ou período (férias, atestado). Enquanto ativo, a Diva não oferece
        horários desse barbeiro e o rodízio (&quot;qualquer um&quot;) pula ele automaticamente.
      </Text>

      {msg && (
        <Alert color={msgTone} variant="light">
          {msg}
        </Alert>
      )}

      <Group gap="xs">
        <Button size="xs" variant="light" color="gold" onClick={() => applyShortcut('folga_dia')}>
          Folga do dia
        </Button>
        <Button size="xs" variant="light" color="gold" onClick={() => applyShortcut('turno_manha')}>
          Turno manhã
        </Button>
        <Button size="xs" variant="light" color="gold" onClick={() => applyShortcut('turno_tarde')}>
          Turno tarde
        </Button>
        <Button size="xs" variant="light" color="gold" onClick={() => applyShortcut('ferias_5')}>
          Férias 5 dias
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          type="date"
          label="Início — data"
          value={blockStartDate}
          onChange={(e) => {
            const v = e.currentTarget.value
            setBlockStartDate(v)
            if (!blockEndDate || blockEndDate < v) setBlockEndDate(v)
          }}
          styles={inputStyles}
        />
        <TextInput
          type="time"
          label="Início — horário"
          value={blockStartTime}
          onChange={(e) => setBlockStartTime(e.currentTarget.value)}
          styles={inputStyles}
        />
        <TextInput
          type="date"
          label="Fim — data"
          value={blockEndDate}
          disabled={blockNoEnd}
          onChange={(e) => setBlockEndDate(e.currentTarget.value)}
          styles={inputStyles}
        />
        <TextInput
          type="time"
          label="Fim — horário"
          value={blockEndTime}
          disabled={blockNoEnd}
          onChange={(e) => setBlockEndTime(e.currentTarget.value)}
          styles={inputStyles}
        />
        <Switch
          label="Sem previsão de retorno"
          description="Só volta à agenda e ao rodízio quando o bloqueio for removido."
          checked={blockNoEnd}
          onChange={(e) => setBlockNoEnd(e.currentTarget.checked)}
          style={{ gridColumn: '1 / -1' }}
        />
        <TextInput
          label="Motivo (opcional)"
          value={blockMotivo}
          onChange={(e) => setBlockMotivo(e.currentTarget.value)}
          placeholder="Folga, férias, atestado, compromisso…"
          style={{ gridColumn: '1 / -1' }}
          styles={inputStyles}
        />
      </SimpleGrid>

      <Button color="gold" c="dark.9" loading={savingBlock} onClick={() => void handleCreate()} w="fit-content">
        Salvar indisponibilidade
      </Button>

      <Stack gap="sm">
        <Text size="sm" fw={600}>
          Bloqueios futuros e ativos
        </Text>
        {bloqueios.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nenhuma folga/bloqueio programado.
          </Text>
        ) : (
          bloqueios.map((b) => {
            const st = blockStatus(b.inicio, b.fim)
            return (
              <Group key={b.id} justify="space-between" wrap="nowrap" align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Group gap="xs" mb={4}>
                    <Badge color={st.color} variant="light" size="sm">
                      {st.label}
                    </Badge>
                    {b.motivo && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {b.motivo}
                      </Text>
                    )}
                  </Group>
                  <Text size="sm" fw={600}>
                    {formatBlockRange(b.inicio, b.fim)}
                  </Text>
                </div>
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  leftSection={<Trash2 size={14} />}
                  onClick={async () => {
                    await deleteBarbeiroBloqueio(b.id)
                    await load()
                    setMsgTone('gold')
                    setMsg('Bloqueio removido. O barbeiro volta a aparecer na agenda e no rodízio.')
                  }}
                >
                  Remover
                </Button>
              </Group>
            )
          })
        )}
      </Stack>
    </Stack>
  )
}
