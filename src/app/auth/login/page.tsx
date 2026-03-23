'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
    } else {
      // Sign up
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) { setError(signUpError.message); setLoading(false); return }

      const newUser = signUpData.user
      if (newUser) {
        // Check if user was invited to an org (has pending membership)
        const { data: membership } = await supabase
          .from('organization_members')
          .select('id')
          .eq('user_id', newUser.id)
          .limit(1)
          .maybeSingle()

        if (!membership) {
          // No invite — create a new org and make them admin
          const { data: org } = await supabase
            .from('organizations')
            .insert({ name: `${email.split('@')[0]}'s Organization`, owner_id: newUser.id })
            .select('id')
            .single()

          if (org) {
            await supabase.from('organization_members').insert({
              org_id: org.id,
              user_id: newUser.id,
              role: 'admin',
            })
          }
        }
      }
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f1c35' }}>
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white tracking-tight">
            Logi<span style={{ color: '#d4930e' }}>CRM</span>
          </h1>
          <p className="text-blue-300 text-sm mt-2">Built for carriers and freight brokers</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {mode === 'login' ? 'Sign in to your LogiCRM account' : 'Start managing your freight relationships'}
          </p>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500" />
            </div>
            <button onClick={handleSubmit} disabled={loading}
              className="w-full py-3 rounded-lg font-bold text-white text-sm"
              style={{ backgroundColor: '#d4930e' }}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </div>
          <div className="mt-6 text-center">
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
              className="text-sm text-gray-500 hover:text-gray-700">
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
        <p className="text-center text-blue-400 text-xs mt-6">2026 Bid Genie AI · LogiCRM</p>
      </div>
    </div>
  )
}
