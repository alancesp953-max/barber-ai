import { useState, useEffect } from 'react'
import {
  Anchor,
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { IconBuilding, IconCash, IconPlus, IconSparkles, IconAlertTriangle } from '@tabler/icons-react'
import { getPlatformStats, getTenants } from '../../lib/api'
import type { Tenant } from '../../types/database'
import { Link } from '@tanstack/react-router'
import { PageHeader } from '../../components/PageHeader'

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState({
    totalTenants: 0,
    activeTenants: 0,
    blockedTenants: 0,
    faturamentoMensalPrevisto: 0,
    valoresPendentes: 0,
    totalClientes: 0,
    totalAgendamentos: 0,
    atendimentosIA: 0,
    statusWhatsApp: 'Operacional',
  })
  const [tenants, setTenants] = useState<Tenant[]>([])

  useEffect(() => {
    async function load() {
      try {
        const [statsData, tenantsData] = await Promise.all([getPlatformStats(), getTenants()])
        setStats(statsData)
        setTenants(tenantsData)
      } catch (err) {
        console.error('Erro ao carregar dados do superadmin:', err)
      }
    }
    load()
  }, [])

  const money = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <Stack gap="lg">
      <PageHeader
        title="Visão geral"
        description="Barbearias, faturamento e conexões."
        action={
          <Button component={Link} to="/superadmin/tenants" color="gold" c="dark.9" leftSection={<IconPlus size={16} />}>
            Cadastrar barbearia
          </Button>
        }
      />

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Paper p="md">
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Barbearias
            </Text>
            <ThemeIcon color="gold" variant="light">
              <IconBuilding size={16} />
            </ThemeIcon>
          </Group>
          <Title order={2}>{stats.totalTenants}</Title>
          <Text size="xs" c="teal">
            {stats.activeTenants} ativas
            {stats.blockedTenants > 0 ? ` · ${stats.blockedTenants} suspensas` : ''}
          </Text>
        </Paper>
        <Paper p="md">
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Previsto no mês
            </Text>
            <ThemeIcon color="teal" variant="light">
              <IconCash size={16} />
            </ThemeIcon>
          </Group>
          <Title order={2}>{money(stats.faturamentoMensalPrevisto)}</Title>
          <Text size="xs" c="dimmed">
            Valores definidos no cadastro
          </Text>
        </Paper>
        <Paper p="md">
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Pendente
            </Text>
            <ThemeIcon color="gold" variant="light">
              <IconAlertTriangle size={16} />
            </ThemeIcon>
          </Group>
          <Title order={2}>{money(stats.valoresPendentes)}</Title>
          <Text size="xs" c="dimmed">
            Mensalidades a receber
          </Text>
        </Paper>
        <Paper p="md">
          <Group justify="space-between" mb="xs">
            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
              Atendimentos
            </Text>
            <ThemeIcon color="gold" variant="light">
              <IconSparkles size={16} />
            </ThemeIcon>
          </Group>
          <Title order={2}>{stats.atendimentosIA}</Title>
          <Text size="xs" c="dimmed">
            WhatsApp · {stats.statusWhatsApp}
          </Text>
        </Paper>
      </SimpleGrid>

      <Paper p="lg">
        <Group justify="space-between" mb="md">
          <Title order={4} c="gold">
            Barbearias cadastradas
          </Title>
          <Anchor component={Link} to="/superadmin/tenants" c="gold.4" size="sm">
            Ver todas ({tenants.length})
          </Anchor>
        </Group>
        {tenants.length === 0 ? (
          <Stack align="center" py="xl" gap="sm">
            <Text size="sm" c="dimmed">
              Nenhuma barbearia cadastrada ainda.
            </Text>
            <Button component={Link} to="/superadmin/tenants" variant="outline" color="gold">
              Cadastrar a primeira
            </Button>
          </Stack>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Barbearia</Table.Th>
                <Table.Th>Responsável</Table.Th>
                <Table.Th>Contato</Table.Th>
                <Table.Th>Mensalidade</Table.Th>
                <Table.Th>Vencimento</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tenants.slice(0, 5).map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td>{t.name}</Table.Td>
                  <Table.Td>{t.ownerName || '—'}</Table.Td>
                  <Table.Td>{t.contactPhone || t.contactEmail}</Table.Td>
                  <Table.Td>R$ {t.monthlyFee?.toFixed(2)}/mês</Table.Td>
                  <Table.Td>Dia {t.billingDueDate || 10}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={t.status === 'active' ? 'teal' : t.status === 'suspended' ? 'gold' : 'red'}
                    >
                      {t.status}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  )
}
