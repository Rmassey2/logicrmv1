'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Sidebar from '@/components/Sidebar'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/auth/login')
      } else {
        setReady(true)
      }
    })
  }, [router])

  if (!ready) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#0f1c35' }}
      >
        <div className="text-center">
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">
            Logi<span style={{ color: '#d4930e' }}>CRM</span>
          </h1>
          <p className="text-blue-300 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f1c35' }}>
      <Sidebar />
      <main className="ml-60 min-h-screen">{children}</main>
    </div>
  )
}
