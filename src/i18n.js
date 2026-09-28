import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslation from './i18n/en.json';
import ptBRTranslation from './i18n/pt-BR.json';

i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: enTranslation
    },
    'pt-BR': {
      translation: ptBRTranslation
    }
  },
  lng: 'pt-BR',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
