import { Box, Button, NavLink, Stack, Text } from '@mantine/core'
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
import { BrandLogo } from './BrandLogo'

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
  return <BrandLogo height={34} maw={180} />
}
