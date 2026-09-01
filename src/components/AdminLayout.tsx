import { AppShell, Box, Burger, Group, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Outlet } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AdminSidebar } from './AdminSidebar'
import { BrandLogo } from './BrandLogo'

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
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Box visibleFrom="sm">
              <Text size="sm" c="dimmed">
                {t('adminLayout.welcome')}
              </Text>
            </Box>
            <Box hiddenFrom="sm">
              <BrandLogo height={28} maw={140} />
            </Box>
          </Group>
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
