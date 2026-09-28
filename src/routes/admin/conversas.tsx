import { createFileRoute } from '@tanstack/react-router'
import ConversasReais from '../../pages/admin/ConversasReais'

export const Route = createFileRoute('/admin/conversas')({
  component: ConversasReais,
})
