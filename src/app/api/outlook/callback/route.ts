import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://logicrmv1.vercel.app'
  const errorRedirect = `${appUrl}/settings?tab=email&outlook=error`

  console.log('=== OUTLOOK CALLBACK START ===')

  try {
    const code = req.nextUrl.searchParams.get('code')
    const state = req.nextUrl.searchParams.get('state')
    const errorParam = req.nextUrl.searchParams.get('error')
    const errorDesc = req.nextUrl.searchParams.get('error_description')

    console.log('code:', code ? 'present (' + code.slice(0, 20) + '...)' : 'MISSING')
    console.log('state:', state ? state.slice(0, 30) + '...' : 'MISSING')
    console.log('error param:', errorParam)
    console.log('error_description:', errorDesc)

    if (errorParam || !code) {
      console.error('OAUTH ERROR:', errorParam, errorDesc)
      return NextResponse.redirect(errorRedirect)
    }

    // Decode user_id from state
    let userId: string | null = null
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
        userId = decoded.userId
        console.log('Decoded userId from state:', userId)
      } catch (e) {
        console.error('STATE DECODE FAILED:', e, 'raw state:', state)
        // Try plain base64 fallback
        try {
          userId = Buffer.from(state, 'base64').toString('utf-8')
          console.log('Fallback base64 decode userId:', userId)
        } catch (e2) {
          console.error('FALLBACK DECODE ALSO FAILED:', e2)
        }
      }
    }

    if (!userId) {
      console.error('NO USER_ID — cannot save connection')
      return NextResponse.redirect(`${errorRedirect}&reason=no_user`)
    }

    // Check env vars
    const clientId = process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    console.log('ENV CHECK — clientId:', !!clientId, 'clientSecret:', !!clientSecret, 'supabaseUrl:', !!supabaseUrl, 'serviceKey:', !!serviceKey)

    if (!clientId || !clientSecret) {
      console.error('MISSING MICROSOFT ENV VARS')
      return NextResponse.redirect(`${errorRedirect}&reason=missing_config`)
    }

    // Exchange code for tokens
    const redirectUri = `${appUrl}/api/outlook/callback`
    console.log('TOKEN EXCHANGE — redirectUri:', redirectUri)

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

    const tokenText = await tokenRes.text()
    console.log('TOKEN RESPONSE STATUS:', tokenRes.status)
    console.log('TOKEN RESPONSE BODY:', tokenText.slice(0, 500))

    let tokenData: Record<string, unknown>
    try {
      tokenData = JSON.parse(tokenText)
    } catch {
      console.error('TOKEN RESPONSE NOT JSON:', tokenText.slice(0, 200))
      return NextResponse.redirect(errorRedirect)
    }

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('TOKEN EXCHANGE FAILED — status:', tokenRes.status, 'error:', tokenData.error, 'description:', tokenData.error_description)
      return NextResponse.redirect(errorRedirect)
    }

    console.log('TOKEN EXCHANGE SUCCESS — has access_token:', !!tokenData.access_token, 'has refresh_token:', !!tokenData.refresh_token, 'expires_in:', tokenData.expires_in)

    // Get user profile from Graph API
    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    const graphText = await graphRes.text()
    console.log('GRAPH RESPONSE STATUS:', graphRes.status)
    console.log('GRAPH RESPONSE BODY:', graphText.slice(0, 500))

    let profile: Record<string, unknown>
    try {
      profile = JSON.parse(graphText)
    } catch {
      console.error('GRAPH RESPONSE NOT JSON')
      profile = {}
    }

    const email = (profile.mail || profile.userPrincipalName || '') as string
    const displayName = (profile.displayName || '') as string
    console.log('PROFILE:', { email, displayName })

    // Save to Supabase
    console.log('SAVING TO DB for user:', userId)
    const supabase = createClient(supabaseUrl!, serviceKey!)

    const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString()

    // Delete existing
    const { error: delErr } = await supabase.from('outlook_connections').delete().eq('user_id', userId)
    console.log('DELETE existing result — error:', delErr?.message || 'none')

    // Insert new
    const { data: insertData, error: insertErr } = await supabase.from('outlook_connections').insert({
      user_id: userId,
      access_token: tokenData.access_token as string,
      refresh_token: (tokenData.refresh_token || '') as string,
      expires_at: expiresAt,
      email,
      display_name: displayName,
    }).select('id')

    console.log('INSERT result — data:', JSON.stringify(insertData), 'error:', insertErr?.message || 'none')

    if (insertErr) {
      console.error('DB INSERT FAILED:', insertErr.message, insertErr.details, insertErr.hint)
      return NextResponse.redirect(errorRedirect)
    }

    console.log('=== OUTLOOK CALLBACK SUCCESS ===', { userId, email })
    return NextResponse.redirect(`${appUrl}/settings?tab=email&outlook=connected`)
  } catch (err) {
    console.error('=== OUTLOOK CALLBACK UNHANDLED ERROR ===', err)
    return NextResponse.redirect(errorRedirect)
  }
}
