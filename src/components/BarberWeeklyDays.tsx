import { Alert, Button, Checkbox, Group, Stack, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import { getBarbeiroHorarios, saveBarbeiroDiasAtendimento } from '../lib/api'

const DIAS = [
  { dia: 1, label: 'Segunda' },
  { dia: 2, label: 'Terça' },
  { dia: 3, label: 'Quarta' },
  { dia: 4, label: 'Quinta' },
  { dia: 5, label: 'Sexta' },
  { dia: 6, label: 'Sábado' },
  { dia: 0, label: 'Domingo' },
]

export function BarberWeeklyDays({
  barbeiroId,
  onSaved,
}: {
  barbeiroId: string
  onSaved?: () => void
}) {
  const [openDays, setOpenDays] = useState<number[]>([1, 2, 3, 4, 5, 6])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const rows = await getBarbeiroHorarios(barbeiroId)
        if (cancelled) return
        if (!rows.length) {
          setOpenDays([1, 2, 3, 4, 5, 6])
          return
        }
        setOpenDays(rows.filter((r) => !r.fechado).map((r) => r.dia_semana))
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Erro ao carregar dias')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [barbeiroId])

  const toggle = (dia: number, checked: boolean) => {
    setOpenDays((prev) => {
      const next = checked ? [...new Set([...prev, dia])] : prev.filter((d) => d !== dia)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setErr(null)
    setMsg(null)
    try {
      await saveBarbeiroDiasAtendimento(barbeiroId, openDays)
      setMsg('Dias de atendimento salvos. Os outros dias ficam fechados na agenda.')
      onSaved?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Marque só os dias em que este barbeiro atende. Os demais ficam persistidos como fechados
        (a Diva e o rodízio não oferecem horário nesses dias).
      </Text>
      <Group>
        {DIAS.map((d) => (
          <Checkbox
            key={d.dia}
            label={d.label}
            checked={openDays.includes(d.dia)}
            onChange={(e) => toggle(d.dia, e.currentTarget.checked)}
          />
        ))}
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
      <Button color="gold" c="#0A0A0A" loading={saving} onClick={() => void save()}>
        Salvar dias
      </Button>
    </Stack>
  )
}
