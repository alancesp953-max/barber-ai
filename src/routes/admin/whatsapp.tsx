import { createFileRoute } from '@tanstack/react-router'
import WhatsAppIA from '../../pages/admin/WhatsAppIA'

export const Route = createFileRoute('/admin/whatsapp')({
  component: WhatsAppIA,
})
