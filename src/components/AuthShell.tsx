import { Box, Flex, Stack, Text, Title, Badge, Group, Paper } from '@mantine/core'
import { IconScissors } from '@tabler/icons-react'
import type { ReactNode } from 'react'

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1600&q=80'

type AuthShellProps = {
  children: ReactNode
  heroBadge?: string
  heroTitle?: string
  heroSubtitle?: string
}

export function AuthShell({
  children,
  heroBadge = 'WHATSAPP · AGENDAMENTO',
  heroTitle = 'Agenda cheia, atendimento no WhatsApp.',
  heroSubtitle = 'Conecte o número, ative o bot e confirme horários sem fricção — da conversa ao agendamento.',
}: AuthShellProps) {
  return (
    <Flex mih="100vh" w="100%" bg="dark.8">
      <Box
        flex={1}
        bg="dark.8"
        pos="relative"
        px={{ base: 'md', sm: 'xl' }}
        py="xl"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <Group gap="sm" mb="xl">
          <Box
            w={36}
            h={36}
            bg="gold.5"
            style={{ borderRadius: 10, display: 'grid', placeItems: 'center' }}
          >
            <IconScissors size={20} color="#0A0A0A" stroke={2} />
          </Box>
          <Text fw={700} fz="lg">
            BarberAI
          </Text>
        </Group>

        <Flex flex={1} align="center" justify="center">
          {children}
        </Flex>

        <Text size="xs" c="dimmed" mt="xl">
          © {new Date().getFullYear()} BarberAI
        </Text>
      </Box>

      <Box
        visibleFrom="md"
        flex={1}
        pos="relative"
        style={{
          backgroundImage: `url(${HERO_IMAGE})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Box
          pos="absolute"
          inset={0}
          style={{
            background:
              'linear-gradient(180deg, rgba(10,10,10,0.35) 0%, rgba(10,10,10,0.8) 65%, rgba(10,10,10,0.95) 100%)',
          }}
        />
        <Stack pos="absolute" bottom={0} left={0} right={0} p="xl" gap="sm" maw={480}>
          <Badge color="gold" variant="filled" size="lg" radius="sm" w="fit-content">
            {heroBadge}
          </Badge>
          <Title order={2} c="white" style={{ lineHeight: 1.2 }}>
            {heroTitle}
          </Title>
          <Text c="gray.4" size="sm" maw={420}>
            {heroSubtitle}
          </Text>
          <Text size="xs" c="dimmed" mt="xs">
            BarberAI — gestão e WhatsApp para barbearias
          </Text>
        </Stack>
      </Box>
    </Flex>
  )
}

/** Card de formulário auth em dark */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <Paper p="xl" radius="md" maw={420} w="100%" bg="dark.7">
      {children}
    </Paper>
  )
}
