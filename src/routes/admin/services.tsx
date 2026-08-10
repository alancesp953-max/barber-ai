import { createFileRoute } from '@tanstack/react-router'
import Services from '../../pages/admin/Services'

export const Route = createFileRoute('/admin/services')({
  component: Services,
})
