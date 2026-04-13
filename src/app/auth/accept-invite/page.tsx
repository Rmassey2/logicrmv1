'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
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

  useEffect(() => {
    async function handleToken() {
      // Supabase sends tokens via URL hash fragment
      // The supabase client auto-detects hash tokens on load
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession()

      if (session) {
        // User has a valid session from the invite link
        console.log('[accept-invite] Session found:', session.user?.email)
        setStatus('set-password')
        return
      }

      // Try to exchange token from URL params (type=invite)
      if (typeof window !== 'undefined') {
        const hash = window.location.hash
        const params = new URLSearchParams(hash.replace('#', ''))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        const type = params.get('type')

        console.log('[accept-invite] URL params:', { type, hasAccess: !!accessToken, hasRefresh: !!refreshToken })

        if (accessToken && refreshToken) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (setErr) {
            console.error('[accept-invite] Session set failed:', setErr)
            setError('Invalid or expired invite link. Please ask your manager to resend the invite.')
            setStatus('error')
            return
          }
          setStatus('set-password')
          return
        }

        // Check for token_hash in query params (newer Supabase format)
        const urlParams = new URLSearchParams(window.location.search)
        const tokenHash = urlParams.get('token_hash')
        const tokenType = urlParams.get('type')

        if (tokenHash && tokenType === 'invite') {
          const { error: verifyErr } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'invite',
          })
          if (verifyErr) {
            console.error('[accept-invite] OTP verify failed:', verifyErr)
            setError('Invalid or expired invite link. Please ask your manager to resend the invite.')
            setStatus('error')
            return
          }
          setStatus('set-password')
          return
        }
      }

      // No token found — check if already logged in
      if (sessionErr) {
        console.error('[accept-invite] Session error:', sessionErr)
      }
      setError('No invite token found. Please use the link from your invite email.')
      setStatus('error')
    }

    handleToken()
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

    // Also set display name if provided via invite metadata
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.user_metadata?.display_name) {
      await supabase.auth.updateUser({ data: { display_name: user.user_metadata.display_name } })
    }

    setStatus('success')
    setTimeout(() => router.push('/dashboard'), 2000)
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
