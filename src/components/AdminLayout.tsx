import { AppShell, Burger, Group, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Outlet } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AdminSidebar } from './AdminSidebar'

export function AdminLayout() {
  const { t } = useTranslation()
  const [opened, { toggle }] = useDisclosure()

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md">
          <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
          <Text size="sm" c="dimmed">
            {t('adminLayout.welcome')}
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AdminSidebar onNavigate={() => opened && toggle()} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
