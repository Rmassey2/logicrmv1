import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')
    if (!code) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?error=no_code`)
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenRes.json()
    if (!tokens.access_token) {
      console.error('Gmail token exchange failed:', tokens)
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?error=token_failed`)
    }

    // Get user email from Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const profile = await profileRes.json()

    // Store tokens keyed by Gmail email
    const gmailEmail = profile.email

    // Store tokens keyed by email for lookup
    await supabase.from('user_settings').upsert(
      { user_id: gmailEmail, key: 'gmail_access_token', value: tokens.access_token },
      { onConflict: 'user_id,key' }
    )
    await supabase.from('user_settings').upsert(
      { user_id: gmailEmail, key: 'gmail_refresh_token', value: tokens.refresh_token ?? '' },
      { onConflict: 'user_id,key' }
    )
    await supabase.from('user_settings').upsert(
      { user_id: gmailEmail, key: 'gmail_email', value: gmailEmail },
      { onConflict: 'user_id,key' }
    )

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?gmail=connected`)
  } catch (err) {
    console.error('Gmail callback error:', err)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?error=callback_failed`)
  }
}
