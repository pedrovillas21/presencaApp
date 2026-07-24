'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    setLoading(true)
    await createClient().auth.signOut()
    router.replace('/admin/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="flex items-center gap-3 rounded-full px-4 py-3 text-label-md text-error/80 transition-colors hover:bg-white/5 hover:text-error disabled:opacity-60"
    >
      <Icon name="logout" />
      {loading ? 'Saindo…' : 'Sair'}
    </button>
  )
}
