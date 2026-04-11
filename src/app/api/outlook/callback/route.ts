import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://logicrmv1.vercel.app'
  const errorRedirect = `${appUrl}/settings?tab=email&outlook=error`

  try {
    const code = req.nextUrl.searchParams.get('code')
    const state = req.nextUrl.searchParams.get('state')
    const error = req.nextUrl.searchParams.get('error')

    if (error || !code) {
      console.error('[outlook/callback] OAuth error:', error, req.nextUrl.searchParams.get('error_description'))
      return NextResponse.redirect(errorRedirect)
    }

    // Extract user_id from state
    let userId: string | null = null
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
        userId = decoded.userId
      } catch (e) {
        console.error('[outlook/callback] Failed to decode state:', e)
      }
    }

    if (!userId) {
      console.error('[outlook/callback] No user_id in state')
      return NextResponse.redirect(`${errorRedirect}&reason=no_user`)
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      console.error('[outlook/callback] Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET')
      return NextResponse.redirect(`${errorRedirect}&reason=missing_config`)
    }

    const redirectUri = `${appUrl}/api/outlook/callback`

    // Exchange code for tokens
    console.log('[outlook/callback] Exchanging code for tokens...')
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[outlook/callback] Token exchange failed:', JSON.stringify(tokenData))
      return NextResponse.redirect(errorRedirect)
    }

    console.log('[outlook/callback] Token exchange successful')

    // Get user profile from Graph API
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json()
    const email = profile.mail || profile.userPrincipalName || ''
    const displayName = profile.displayName || ''

    console.log('[outlook/callback] Profile:', { email, displayName })

    // Save to Supabase using service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString()

    // Delete existing then insert (reliable regardless of constraints)
    await supabase.from('outlook_connections').delete().eq('user_id', userId)
    const { error: insertErr } = await supabase.from('outlook_connections').insert({
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      email,
      display_name: displayName,
    })

    if (insertErr) {
      console.error('[outlook/callback] DB insert failed:', insertErr.message)
      return NextResponse.redirect(errorRedirect)
    }

    console.log('[outlook/callback] Saved connection for user:', userId, email)
    return NextResponse.redirect(`${appUrl}/settings?tab=email&outlook=connected`)
  } catch (err) {
    console.error('[outlook/callback] Unhandled error:', err)
    return NextResponse.redirect(errorRedirect)
  }
}
