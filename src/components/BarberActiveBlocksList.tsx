import { Badge, Button, Group, Stack, Text } from '@mantine/core'
import { Coffee, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { BarberBlock } from '../lib/api'
import {
  blockMatchesDailyBreak,
  blockStatusFrom,
  formatBlockRangeFrom,
  formatRecurringBreak,
} from '../lib/barberBlocksDisplay'

export type DailyBreakSummary = {
  ativo: boolean
  inicio: string
  fim: string
  barbeiroId?: string
}

type Props = {
  bloqueios: BarberBlock[]
  dailyBreak?: DailyBreakSummary | null
  onRemove: (id: string) => Promise<void>
  removedMessage?: string
  onRemoved?: (message: string) => void
  onError?: (message: string) => void
}

export function BarberActiveBlocksList({
  bloqueios,
  dailyBreak,
  onRemove,
  removedMessage = 'Bloqueio removido. O barbeiro volta a aparecer na agenda e no rodízio.',
  onRemoved,
  onError,
}: Props) {
  const [removingId, setRemovingId] = useState<string | null>(null)
  const recurring =
    dailyBreak?.ativo === true
      ? formatRecurringBreak(dailyBreak.inicio, dailyBreak.fim)
      : null

  if (!recurring && bloqueios.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nenhuma folga/bloqueio programado.
      </Text>
    )
  }

  return (
    <Stack gap="sm">
      {recurring && dailyBreak && (
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div style={{ minWidth: 0 }}>
            <Group gap="xs" mb={4}>
              <Badge color="teal" variant="light" size="sm" leftSection={<Coffee size={12} />}>
                {recurring.badge}
              </Badge>
            </Group>
            <Text size="sm" fw={600}>
              {recurring.detail}
            </Text>
            <Text size="xs" c="dimmed">
              Todos os dias da escala · saída {dailyBreak.inicio} · volta {dailyBreak.fim}
            </Text>
          </div>
        </Group>
      )}

      {bloqueios.map((block) => {
        const st = blockStatusFrom(block)
        const lunchLike =
          dailyBreak?.ativo === true &&
          Boolean(dailyBreak.inicio) &&
          Boolean(dailyBreak.fim) &&
          blockMatchesDailyBreak(block, dailyBreak.inicio, dailyBreak.fim)
        return (
          <Group key={block.id} justify="space-between" wrap="nowrap" align="flex-start">
            <div style={{ minWidth: 0 }}>
              <Group gap="xs" mb={4}>
                <Badge color={st.color} variant="light" size="sm">
                  {st.label}
                </Badge>
                {lunchLike && (
                  <Badge color="teal" variant="outline" size="sm">
                    Intervalo {dailyBreak.inicio} às {dailyBreak.fim}
                  </Badge>
                )}
                {block.motivo && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {block.motivo}
                  </Text>
                )}
              </Group>
              <Text size="sm" fw={600}>
                {formatBlockRangeFrom(block)}
              </Text>
            </div>
            <Button
              variant="subtle"
              color="red"
              size="xs"
              loading={removingId === block.id}
              leftSection={<Trash2 size={14} />}
              onClick={() => {
                void (async () => {
                  setRemovingId(block.id)
                  try {
                    await onRemove(block.id)
                    onRemoved?.(removedMessage)
                  } catch (e) {
                    onError?.(e instanceof Error ? e.message : 'Erro ao remover bloqueio')
                  } finally {
                    setRemovingId(null)
                  }
                })()
              }}
            >
              Remover
            </Button>
          </Group>
        )
      })}
    </Stack>
  )
}
