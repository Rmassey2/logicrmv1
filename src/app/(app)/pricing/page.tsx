'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Check, Sparkles, Users, ArrowLeft } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const PLANS = [
  {
    id: 'rep',
    name: 'Rep',
    price: 29,
    desc: '1 user, all core features',
    features: [
      'Contact management',
      'Pipeline & deals',
      'AI email sequences',
      'Campaign management',
      'Instantly.ai integration',
      'AI call prep & post-call',
      'Company intel',
      'Task management',
    ],
    cta: 'Start Free Trial',
  },
  {
    id: 'team',
    name: 'Team',
    price: 149,
    desc: 'Unlimited users, team management',
    popular: true,
    features: [
      'Everything in Rep, plus:',
      'Unlimited team members',
      'Sales Manager Portal',
      'Team activity dashboard',
      'Rep performance tracking',
      'Org-wide pipeline view',
      'Admin controls',
      'Priority support',
    ],
    cta: 'Start Free Trial',
  },
]

export default function PricingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function handleCheckout(plan: string) {
    setLoading(plan)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, user_id: user.id }),
      })
      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error ?? 'Failed to start checkout')
      }
    } catch {
      toast.error('Failed to start checkout')
    }
    setLoading(null)
  }

  return (
    <div className="px-8 py-10 max-w-4xl mx-auto">
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-white">Choose Your Plan</h2>
        <p className="text-blue-300 mt-2">14-day free trial on all plans. No credit card required.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {PLANS.map(plan => (
          <div
            key={plan.id}
            className={`relative rounded-2xl p-6 flex flex-col ${plan.popular ? 'border-2' : 'border'}`}
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderColor: plan.popular ? '#d4930e' : 'rgba(255,255,255,0.1)',
            }}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}>
                Most Popular
              </div>
            )}

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                {plan.id === 'team' ? <Users className="w-5 h-5" style={{ color: '#d4930e' }} /> : <Sparkles className="w-5 h-5" style={{ color: '#d4930e' }} />}
                <h3 className="text-xl font-bold text-white">{plan.name}</h3>
              </div>
              <p className="text-blue-300/60 text-sm">{plan.desc}</p>
              <div className="mt-4">
                <span className="text-4xl font-bold text-white">${plan.price}</span>
                <span className="text-blue-300/50 text-sm">/month</span>
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map(f => (
                <li key={f} className="flex items-start gap-2 text-sm text-blue-200">
                  <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#d4930e' }} />
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCheckout(plan.id)}
              disabled={loading !== null}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-colors hover:brightness-110 disabled:opacity-60"
              style={{
                backgroundColor: plan.popular ? '#d4930e' : 'rgba(255,255,255,0.08)',
                color: plan.popular ? '#0f1c35' : '#d4930e',
              }}
            >
              {loading === plan.id ? 'Redirecting...' : plan.cta}
            </button>
          </div>
        ))}
      </div>

      <p className="text-center text-blue-300/30 text-xs mt-12">
        Secure payment via Stripe. Cancel anytime.
      </p>
    </div>
  )
}
