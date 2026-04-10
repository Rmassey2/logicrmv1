import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://logicrmv1.vercel.app'
  const errorRedirect = `${appUrl}/settings?tab=email&outlook=error`

  try {
    const code = req.nextUrl.searchParams.get('code')
    const error = req.nextUrl.searchParams.get('error')

    if (error || !code) {
      console.error('[outlook/callback] OAuth error:', error)
      return NextResponse.redirect(errorRedirect)
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${errorRedirect}&reason=missing_config`)
    }

    const redirectUri = `${appUrl}/api/outlook/callback`

    // Exchange code for tokens
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
    console.log('[outlook/callback] Token response status:', tokenRes.status)

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[outlook/callback] Token exchange failed:', tokenData)
      return NextResponse.redirect(errorRedirect)
    }

    // Get user profile from Graph API
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const profile = await profileRes.json()

    const email = profile.mail || profile.userPrincipalName || ''
    const displayName = profile.displayName || ''

    // Get the Supabase user from the auth cookie
    // Since this is a redirect callback, we need the user's session
    // We'll use the service role to find the user by looking at recent sessions
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Try to get user from Supabase auth cookie
    const authCookie = req.cookies.get('sb-access-token')?.value
      || req.cookies.getAll().find(c => c.name.includes('auth-token'))?.value

    let userId: string | null = null

    if (authCookie) {
      const { data: { user } } = await supabase.auth.getUser(authCookie)
      userId = user?.id || null
    }

    // Fallback: find user by email match
    if (!userId && email) {
      const { data: users } = await supabase.auth.admin.listUsers()
      const match = users?.users?.find(u => u.email === email)
      if (match) userId = match.id
    }

    // Last resort: get the most recently active user
    if (!userId) {
      const { data: recentConn } = await supabase
        .from('outlook_connections')
        .select('user_id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // If no connections exist, check gmail_connections as a hint
      if (!recentConn) {
        const { data: gmailConn } = await supabase
          .from('gmail_connections')
          .select('user_id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        userId = gmailConn?.user_id || null
      }
    }

    if (!userId) {
      console.error('[outlook/callback] Could not determine user_id')
      return NextResponse.redirect(`${errorRedirect}&reason=no_user`)
    }

    // Upsert outlook connection
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString()

    // Delete existing then insert (avoids unique constraint issues)
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
      console.error('[outlook/callback] Insert failed:', insertErr)
      return NextResponse.redirect(errorRedirect)
    }

    console.log('[outlook/callback] Connected:', email, 'for user:', userId)
    return NextResponse.redirect(`${appUrl}/settings?tab=email&outlook=connected`)
  } catch (err) {
    console.error('[outlook/callback] Error:', err)
    return NextResponse.redirect(errorRedirect)
  }
}
