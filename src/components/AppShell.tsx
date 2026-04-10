'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Sidebar from '@/components/Sidebar'
import TrainingChat from '@/components/TrainingChat'
import { getSubscription, isExpired, trialDaysLeft, type OrgSubscription } from '@/lib/subscription'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const [sub, setSub] = useState<OrgSubscription | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/auth/login')
        return
      }

      // Hardcoded exempt emails — always bypass paywall
      const exemptEmails = ['rmassey@macotransport.com', 'jarrett@macoships.com']
      const userEmail = (user.email ?? '').toLowerCase()
      console.log('[AppShell] User email:', userEmail, 'exempt:', exemptEmails.includes(userEmail))
      if (exemptEmails.includes(userEmail)) {
        setSub({ subscription_status: 'exempt', plan: 'team', trial_ends_at: null })
        setReady(true)
        return
      }

      const subscription = await getSubscription(user.id)
      console.log('[AppShell] Subscription:', subscription)
      setSub(subscription)

      // Paywall: redirect to pricing if expired (but allow /pricing itself)
      if (pathname !== '/pricing' && isExpired(subscription)) {
        router.push('/pricing')
        return
      }

      setReady(true)
    })
  }, [router, pathname])

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

  const showTrialBanner = sub?.subscription_status === 'trial' && !!sub?.trial_ends_at && !isExpired(sub)
  const daysLeft = trialDaysLeft(sub)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0f1c35' }}>
      <Sidebar />
      <main className="ml-60 min-h-screen">
        {showTrialBanner && (
          <div
            className="px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-3"
            style={{ backgroundColor: 'rgba(212,147,14,0.12)', color: '#d4930e', borderBottom: '1px solid rgba(212,147,14,0.2)' }}
          >
            <span>{daysLeft} day{daysLeft !== 1 ? 's' : ''} left in your free trial</span>
            <button
              onClick={() => router.push('/pricing')}
              className="px-3 py-1 rounded-lg text-xs font-bold hover:brightness-110 transition-colors"
              style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}
            >
              Upgrade Now
            </button>
          </div>
        )}
        {children}
      </main>
      <TrainingChat />
    </div>
  )
}
