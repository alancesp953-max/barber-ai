import { AppShell, Box, Button, NavLink, Stack, Text } from '@mantine/core'
import { Link, Outlet, useRouter, useRouterState } from '@tanstack/react-router'
import {
  IconBuilding,
  IconCash,
  IconLayoutDashboard,
  IconBuildingStore,
  IconLogout,
  IconNotes,
} from '@tabler/icons-react'
import { useAuth } from '../lib/firebaseAuth'
import { BrandLogo } from './BrandLogo'

const superNavItems = [
  { to: '/superadmin/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { to: '/superadmin/tenants', label: 'Barbearias', icon: IconBuilding },
  { to: '/superadmin/financeiro', label: 'Financeiro', icon: IconCash },
  { to: '/superadmin/logs', label: 'Logs', icon: IconNotes },
] as const

export function SuperAdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const router = useRouter()
  const { logout, currentUser } = useAuth()

  const handleLogout = async () => {
    await logout()
    router.navigate({ to: '/login' })
  }

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`)

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Header>
        <Box h="100%" px="md" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text size="sm" c="dimmed">
            {currentUser?.email || 'admin@barb.com'}
          </Text>
          <Text size="xs" c="gold.4">
            Firebase
          </Text>
        </Box>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack h="100%" gap="md">
          <Box>
            <BrandLogo height={36} maw={180} />
            <Text size="xs" c="dimmed" mt={4}>
              Superadmin
            </Text>
          </Box>
          <Stack gap={2} style={{ flex: 1 }}>
            {superNavItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  component={Link}
                  to={item.to}
                  label={item.label}
                  leftSection={<Icon size={18} stroke={1.5} />}
                  active={isActive(item.to)}
                />
              )
            })}
          </Stack>
          <Button
            component={Link}
            to="/admin/dashboard"
            variant="subtle"
            color="gold"
            justify="flex-start"
            leftSection={<IconBuildingStore size={16} />}
          >
            Painel da barbearia
          </Button>
          <Button variant="subtle" color="red" justify="flex-start" leftSection={<IconLogout size={16} />} onClick={handleLogout}>
            Sair
          </Button>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
