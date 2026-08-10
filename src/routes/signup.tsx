import { createFileRoute, redirect } from '@tanstack/react-router'
import { requireSession } from '../lib/api'
import Signup from '../pages/Signup'

// TanStack equivalent of: <Route path="/signup" element={<Signup />} />
export const Route = createFileRoute('/signup')({
  beforeLoad: async () => {
    const session = await requireSession()
    if (session) {
      throw redirect({ to: '/admin/dashboard' })
    }
  },
  component: Signup,
})
