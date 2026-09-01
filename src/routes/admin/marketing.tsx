import { createFileRoute } from '@tanstack/react-router'
import Marketing from '../../pages/admin/Marketing'

export const Route = createFileRoute('/admin/marketing')({
  component: Marketing,
})
