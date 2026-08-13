import { Box, Button, NavLink, Stack, Text, Title } from '@mantine/core'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
  IconCalendar,
  IconCash,
  IconChartBar,
  IconLayoutDashboard,
  IconLogout,
  IconPackage,
  IconPercentage,
  IconScissors,
  IconSettings,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { signOut } from '../integrations/supabase/client'

const navItems = [
  { to: '/admin/dashboard', labelKey: 'nav.dashboard', icon: IconLayoutDashboard },
  { to: '/admin/services', labelKey: 'nav.services', icon: IconScissors },
  { to: '/admin/produtos', labelKey: 'nav.products', icon: IconPackage },
  { to: '/admin/appointments', labelKey: 'nav.appointments', icon: IconCalendar },
  { to: '/admin/barbers', labelKey: 'nav.barbers', icon: IconUsers },
  { to: '/admin/usuarios', label: 'Usuários', icon: IconUserPlus },
  { to: '/admin/financeiro', label: 'Financeiro', icon: IconCash },
  { to: '/admin/comissoes', label: 'Comissões', icon: IconPercentage },
  { to: '/admin/relatorios', labelKey: 'nav.reports', icon: IconChartBar },
  { to: '/admin/configuracoes', label: 'Configurações', icon: IconSettings },
] as const

type AdminSidebarProps = {
  onNavigate?: () => void
}

export function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const router = useRouter()

  const handleLogout = async () => {
    await signOut()
    router.navigate({ to: '/login' })
  }

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`)

  return (
    <Stack h="100%" gap="md">
      <Box py="xs">
        <GroupBrand />
        <Text size="xs" c="dimmed" mt={4}>
          {t('app.adminDashboard')}
        </Text>
      </Box>

      <Stack gap={2} style={{ flex: 1 }}>
        {navItems.map((item) => {
          const Icon = item.icon
          const label = 'label' in item ? item.label : t(item.labelKey)
          const active = isActive(item.to)
          return (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={label}
              leftSection={<Icon size={18} stroke={1.5} />}
              active={active}
              onClick={onNavigate}
            />
          )
        })}
      </Stack>

      <Button
        variant="subtle"
        color="gray"
        leftSection={<IconLogout size={18} />}
        justify="flex-start"
        onClick={handleLogout}
      >
        {t('nav.signOut')}
      </Button>
    </Stack>
  )
}

function GroupBrand() {
  const { t } = useTranslation()
  return (
    <Box style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Box
        w={32}
        h={32}
        bg="gold.5"
        style={{ borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0 }}
      >
        <IconScissors size={18} color="#0A0A0A" stroke={2} />
      </Box>
      <Title order={4} fw={700}>
        {t('app.name')}
      </Title>
    </Box>
  )
}
