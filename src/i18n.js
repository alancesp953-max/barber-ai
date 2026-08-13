import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBRTranslation from './i18n/pt-BR.json'

i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': {
      translation: ptBRTranslation,
    },
  },
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
