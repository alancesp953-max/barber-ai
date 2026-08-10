import { createFileRoute } from '@tanstack/react-router'
import Usuarios from '../../pages/admin/Usuarios'

export const Route = createFileRoute('/admin/usuarios')({
  component: Usuarios,
})