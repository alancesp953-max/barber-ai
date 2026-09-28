import { createFileRoute } from '@tanstack/react-router'
import ConectarWhatsApp from '../../pages/admin/ConectarWhatsApp'

export const Route = createFileRoute('/admin/whatsapp-qr')({
  component: ConectarWhatsApp,
})
