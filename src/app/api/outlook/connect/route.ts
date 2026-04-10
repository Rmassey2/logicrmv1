import { NextResponse } from 'next/server'

const SCOPES = [
  'openid',
  'email',
  'profile',
  'offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.Send',
].join(' ')

export async function GET() {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://logicrmv1.vercel.app'

  if (!clientId) {
    return NextResponse.redirect(`${appUrl}/settings?tab=email&outlook=error&reason=missing_config`)
  }

  const redirectUri = `${appUrl}/api/outlook/callback`
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_mode: 'query',
    prompt: 'consent',
  })

  return NextResponse.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  )
}
