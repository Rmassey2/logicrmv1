import { NextRequest, NextResponse } from 'next/server'

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
    return NextResponse.redirect(`${appUrl}/settings?tab=email&outlook=error&reason=missing_config`)
  }

  // Get user_id from query param (passed by the client)
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) {
    return NextResponse.redirect(`${appUrl}/settings?tab=email&outlook=error&reason=no_user`)
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
    login_hint: 'rmassey@macotransport.com',
    state,
  })

  return NextResponse.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  )
}
