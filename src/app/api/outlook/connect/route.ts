import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.Send',
].join(' ')

export async function GET(req: NextRequest) {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://logicrmv1.vercel.app'

  if (!clientId) {
    return NextResponse.json({ error: 'missing_config' }, { status: 500 })
  }

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'no_user' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

  const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(userId)
  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const userEmail = userRes.user.email
  if (!userEmail) {
    return NextResponse.json(
      { error: 'Please complete your profile before connecting email' },
      { status: 400 }
    )
  }

  const redirectUri = `${appUrl}/api/outlook/callback`
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64url')

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_mode: 'query',
    prompt: 'select_account',
    login_hint: userEmail,
    state,
  })

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`

  // If the client requests JSON (fetch), return the URL to navigate to.
  // Otherwise (direct browser navigation), redirect for backwards compatibility.
  if (req.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json({ authUrl })
  }
  return NextResponse.redirect(authUrl)
}
