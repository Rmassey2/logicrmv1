'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase auto-detects the recovery token from the URL hash and establishes a session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // Also check if we already have a session (token already processed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleReset = async () => {
    setError('')
    if (!password.trim()) { setError('Enter a new password'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
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
          <h2 className="text-xl font-bold text-gray-800 mb-1">Set new password</h2>
          <p className="text-gray-400 text-sm mb-6">Enter your new password below.</p>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
          )}
          {!ready ? (
            <div className="text-center py-6">
              <p className="text-gray-500 text-sm">Verifying your reset link...</p>
              <p className="text-gray-400 text-xs mt-2">If this takes too long, your link may have expired. <button onClick={() => router.push('/auth/login')} className="underline hover:text-gray-600">Request a new one.</button></p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">New Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === 'Enter' && handleReset()}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500" />
              </div>
              <button onClick={handleReset} disabled={loading}
                className="w-full py-3 rounded-lg font-bold text-white text-sm"
                style={{ backgroundColor: '#d4930e' }}>
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-blue-400 text-xs mt-6">2026 Bid Genie AI · LogiCRM</p>
      </div>
    </div>
  )
}
