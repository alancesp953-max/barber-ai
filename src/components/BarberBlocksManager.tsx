import {
  Alert,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { useCallback, useEffect, useState } from 'react'
import {
  createBarbeiroBloqueio,
  deleteBarbeiroBloqueio,
  getBarber,
  getBarbeiroBloqueios,
  type BarberBlock,
} from '../lib/api'
import { readConfiguredDailyBreak } from '../lib/availability'
import { BarberActiveBlocksList, type DailyBreakSummary } from './BarberActiveBlocksList'
import { BarberDailyBreak } from './BarberDailyBreak'

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

type Props = {
  barbeiroId: string
  barbeiroNome?: string
  /** Estilos dos inputs (admin dark). */
  inputStyles?: Record<string, unknown>
}

export function BarberBlocksManager({ barbeiroId, barbeiroNome, inputStyles }: Props) {
  const [bloqueios, setBloqueios] = useState<BarberBlock[]>([])
  const [dailyBreak, setDailyBreak] = useState<DailyBreakSummary | null>(null)
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
    setDailyBreak(null)
    const [rows, barber] = await Promise.all([
      getBarbeiroBloqueios(barbeiroId),
      getBarber(barbeiroId),
    ])
    if (barber.id !== barbeiroId) return
    setBloqueios(rows.filter((row) => row.barbeiro_id === barbeiroId))
    const configured = readConfiguredDailyBreak(barber)
    setDailyBreak(
      configured
        ? { ativo: true, inicio: configured.inicio, fim: configured.fim, barbeiroId: barber.id }
        : null,
    )
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
    const fim = blockNoEnd ? null : toBrtIso(blockEndDate, blockEndTime) || null
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
      <BarberDailyBreak barbeiroId={barbeiroId} inputStyles={inputStyles} onSaved={() => void load()} />

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
        <BarberActiveBlocksList
          bloqueios={bloqueios}
          dailyBreak={dailyBreak}
          onRemove={async (id) => {
            await deleteBarbeiroBloqueio(id)
            await load()
          }}
          onRemoved={(message) => {
            setMsgTone('gold')
            setMsg(message)
          }}
          onError={(message) => {
            setMsgTone('red')
            setMsg(message)
          }}
        />
      </Stack>
    </Stack>
  )
}
