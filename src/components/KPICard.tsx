import { Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon | ((props: { size?: number }) => ReactNode)
  trend?: string
}

export function KPICard({ title, value, subtitle, icon: Icon, trend }: KPICardProps) {
  return (
    <Paper p="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.5}>
            {title}
          </Text>
          <Text fz={26} fw={700} lh={1.15} style={{ letterSpacing: '-0.02em' }}>
            {value}
          </Text>
          {subtitle && (
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          )}
          {trend && (
            <Text size="xs" c="teal">
              {trend}
            </Text>
          )}
        </Stack>
        <ThemeIcon size={42} radius="md" variant="light" color="gold">
          <Icon size={20} />
        </ThemeIcon>
      </Group>
    </Paper>
  )
}
