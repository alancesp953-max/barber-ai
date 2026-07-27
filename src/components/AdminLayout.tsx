import { Outlet } from '@tanstack/react-router'

import { useTranslation } from 'react-i18next'

import { AdminSidebar } from './AdminSidebar'



export function AdminLayout() {

  const { t } = useTranslation()



  return (

    <div className="flex min-h-screen bg-barber-black">

      <AdminSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">

        <header className="border-b border-barber-gray bg-barber-gray/50 px-8 py-4 backdrop-blur">

          <p className="text-sm text-barber-white/60">

            {t('adminLayout.welcome')}

          </p>

        </header>

        <main className="flex-1 overflow-y-auto p-8">

          <Outlet />

        </main>

      </div>

    </div>

  )

}


