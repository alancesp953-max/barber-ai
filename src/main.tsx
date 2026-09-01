import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, localStorageColorSchemeManager } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import App from './App'
import { theme } from './theme'
import './i18n'

import '@mantine/core/styles.css'
import '@mantine/charts/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'

/** Sempre dark — ignora preferência do sistema / toggle */
const colorSchemeManager = localStorageColorSchemeManager({
  key: 'barberai-color-scheme',
})

const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <MantineProvider
        theme={theme}
        forceColorScheme="dark"
        defaultColorScheme="dark"
        colorSchemeManager={colorSchemeManager}
      >
        <Notifications position="top-right" zIndex={4000} />
        <App />
      </MantineProvider>
    </React.StrictMode>,
  )
}
