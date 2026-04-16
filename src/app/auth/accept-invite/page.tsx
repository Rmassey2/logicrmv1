'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AcceptInvitePage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'set-password' | 'error' | 'success'>('loading')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const resolved = useRef(false)

  useEffect(() => {
    function markReady() {
      if (resolved.current) return
      resolved.current = true
      setStatus('set-password')
    }

    function markError(msg: string) {
      if (resolved.current) return
      resolved.current = true
      setError(msg)
      setStatus('error')
    }

    // 1. Listen for auth state changes — Supabase auto-processes hash tokens
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'PASSWORD_RECOVERY') {
        markReady()
      }
    })

    async function handleToken() {
      // 2. Check if Supabase already established a session (auto-parsed hash)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { markReady(); return }

      if (typeof window === 'undefined') return

      // 3. Try PKCE code exchange (newer Supabase email links use ?code=)
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      if (code) {
        const { error: codeErr } = await supabase.auth.exchangeCodeForSession(code)
        if (codeErr) {
          console.error('[accept-invite] Code exchange failed:', codeErr)
          markError('Invalid or expired invite link. Please ask your admin to resend the invite.')
        } else {
          markReady()
        }
        return
      }

      // 4. Try hash fragment tokens (#access_token=...&refresh_token=...)
      const hash = window.location.hash
      if (hash) {
        const params = new URLSearchParams(hash.replace('#', ''))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        if (accessToken && refreshToken) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (setErr) {
            console.error('[accept-invite] setSession failed:', setErr)
            markError('Invalid or expired invite link. Please ask your admin to resend the invite.')
          } else {
            markReady()
          }
          return
        }
      }

      // 5. Try token_hash in query params (another Supabase format)
      const tokenHash = urlParams.get('token_hash')
      const tokenType = urlParams.get('type')
      if (tokenHash && (tokenType === 'invite' || tokenType === 'signup')) {
        const { error: verifyErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'invite',
        })
        if (verifyErr) {
          console.error('[accept-invite] OTP verify failed:', verifyErr)
          markError('Invalid or expired invite link. Please ask your admin to resend the invite.')
        } else {
          markReady()
        }
        return
      }

      // 6. Give the auth listener a moment to fire (hash auto-parsing is async)
      setTimeout(() => {
        if (!resolved.current) {
          markError('No invite token found. Please use the link from your invite email.')
        }
      }, 3000)
    }

    handleToken()

    return () => subscription.unsubscribe()
  }, [])

  async function handleSetPassword() {
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    setError('')
    setSaving(true)

    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setSaving(false)
      return
    }

    setStatus('success')
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f1c35' }}>
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white tracking-tight">
            Logi<span style={{ color: '#d4930e' }}>CRM</span>
          </h1>
          <p className="text-blue-300 text-sm mt-2">Welcome to the team</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {status === 'loading' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-yellow-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500 text-sm">Verifying your invite...</p>
            </div>
          )}

          {status === 'set-password' && (
            <>
              <h2 className="text-xl font-bold text-gray-800 mb-1">Set Your Password</h2>
              <p className="text-gray-400 text-sm mb-6">Choose a password for your LogiCRM account.</p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    onKeyDown={e => { if (e.key === 'Enter') handleSetPassword() }}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                </div>
                <button
                  onClick={handleSetPassword}
                  disabled={saving}
                  className="w-full py-3 rounded-lg font-bold text-white text-sm"
                  style={{ backgroundColor: '#d4930e' }}
                >
                  {saving ? 'Setting up...' : 'Set Password & Get Started'}
                </button>
              </div>
            </>
          )}

          {status === 'success' && (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">You&apos;re all set!</h2>
              <p className="text-gray-500 text-sm">Redirecting to your dashboard...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">Invite Issue</h2>
              <p className="text-gray-500 text-sm mb-4">{error}</p>
              <button
                onClick={() => router.push('/auth/login')}
                className="text-sm font-medium"
                style={{ color: '#d4930e' }}
              >
                Go to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
