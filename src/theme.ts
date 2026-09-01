import { createTheme, type MantineColorsTuple, type MantineThemeOverride } from '@mantine/core'

/** Ouro BarberAI */
const gold: MantineColorsTuple = [
  '#fbf6eb',
  '#f3ead3',
  '#e8d5a8',
  '#dcc07a',
  '#d1ae55',
  '#c5a059',
  '#b8923f',
  '#9a7a35',
  '#7c622b',
  '#5e4a21',
]

export const theme: MantineThemeOverride = createTheme({
  primaryColor: 'gold',
  colors: { gold },
  fontFamily: '"DM Sans", system-ui, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  headings: {
    fontFamily: '"DM Sans", system-ui, sans-serif',
    fontWeight: '600',
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
  other: {
    darkOnly: true,
    aiGlow: '0 0 28px rgba(197, 160, 89, 0.12)',
    aiBorder: 'rgba(197, 160, 89, 0.22)',
    aiSurface:
      'linear-gradient(145deg, rgba(197,160,89,0.07) 0%, rgba(26,27,30,0.95) 42%, rgba(20,21,23,1) 100%)',
  },
  components: {
    Button: {
      defaultProps: { radius: 'md' },
    },
    TextInput: {
      defaultProps: { radius: 'md' },
    },
    PasswordInput: {
      defaultProps: { radius: 'md' },
    },
    Paper: {
      defaultProps: { radius: 'md', withBorder: true },
      styles: {
        root: {
          backgroundImage:
            'linear-gradient(145deg, rgba(197,160,89,0.06) 0%, rgba(26,27,30,0.98) 45%, rgba(20,21,23,1) 100%)',
          borderColor: 'rgba(197, 160, 89, 0.2)',
          boxShadow: '0 0 24px rgba(197, 160, 89, 0.06)',
        },
      },
    },
    Card: {
      defaultProps: { radius: 'md', withBorder: true, padding: 'lg' },
      styles: {
        root: {
          backgroundImage:
            'linear-gradient(145deg, rgba(197,160,89,0.06) 0%, rgba(26,27,30,0.98) 45%, rgba(20,21,23,1) 100%)',
          borderColor: 'rgba(197, 160, 89, 0.2)',
          boxShadow: '0 0 24px rgba(197, 160, 89, 0.06)',
        },
      },
    },
    Table: {
      defaultProps: {
        highlightOnHover: true,
        verticalSpacing: 'sm',
        horizontalSpacing: 'md',
      },
    },
    AppShell: {
      defaultProps: {
        padding: 'md',
      },
      styles: {
        navbar: {
          borderColor: 'rgba(197, 160, 89, 0.15)',
          backgroundColor: 'var(--mantine-color-dark-8)',
        },
        header: {
          borderColor: 'rgba(197, 160, 89, 0.15)',
          backgroundColor: 'var(--mantine-color-dark-8)',
        },
        main: {
          backgroundColor: 'var(--mantine-color-dark-8)',
        },
      },
    },
    NavLink: {
      defaultProps: {
        variant: 'light',
        color: 'gold',
      },
    },
  },
})
