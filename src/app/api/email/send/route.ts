import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const fetchCache = 'force-no-store'

// v8 COMPLETE REWRITE 2026-04-13 — Outlook Graph API ONLY, zero Resend

async function refreshOutlookToken(refreshToken: string) {
  const res = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    }
  )
  return res.json()
}

async function sendViaGraph(accessToken: string, to: string, subject: string, htmlBody: string) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: [{ emailAddress: { address: to } }],
      },
    }),
  })
  return res
}

export async function POST(req: NextRequest) {
  console.log('[email/send] ████ v8 REWRITE — OUTLOOK GRAPH ONLY — NO RESEND ████')

  try {
    const { to, subject, body, contact_id, user_id } = await req.json()
    console.log('[email/send] to:', to, 'user_id:', user_id)

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 })
    }
    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Step 1: Look up Outlook connection
    const { data: conn, error: connErr } = await supabase
      .from('outlook_connections')
      .select('access_token, refresh_token, expires_at, email')
      .eq('user_id', user_id)
      .maybeSingle()

    console.log('[email/send] outlook_connections lookup:', {
      found: !!conn,
      email: conn?.email,
      hasToken: !!conn?.access_token,
      expiresAt: conn?.expires_at,
      error: connErr?.message,
    })

    if (!conn || !conn.access_token) {
      return NextResponse.json(
        { error: 'No email connection. Connect in Settings.' },
        { status: 400 }
      )
    }

    let accessToken = conn.access_token

    // Step 2: Refresh token if expired
    const isExpired = conn.expires_at && new Date(conn.expires_at) < new Date()
    if (isExpired) {
      console.log('[email/send] Token expired, refreshing...')
      if (!conn.refresh_token) {
        return NextResponse.json({ error: 'Outlook token expired and no refresh token. Reconnect in Settings.' }, { status: 400 })
      }
      const tokenData = await refreshOutlookToken(conn.refresh_token)
      if (!tokenData.access_token) {
        console.error('[email/send] Refresh failed:', tokenData.error, tokenData.error_description)
        return NextResponse.json({ error: 'Outlook token refresh failed. Reconnect in Settings.' }, { status: 401 })
      }
      accessToken = tokenData.access_token
      await supabase
        .from('outlook_connections')
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || conn.refresh_token,
          expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
        })
        .eq('user_id', user_id)
      console.log('[email/send] Token refreshed OK')
    }

    // Step 3: Send via Microsoft Graph API
    console.log('[email/send] Sending via graph.microsoft.com from:', conn.email)
    const graphRes = await sendViaGraph(accessToken, to, subject, body)
    console.log('[email/send] Graph status:', graphRes.status)

    if (!graphRes.ok && graphRes.status !== 202) {
      const errBody = await graphRes.text()
      console.error('[email/send] Graph FAILED:', graphRes.status, errBody)
      return NextResponse.json(
        { error: `Outlook send failed (${graphRes.status}): ${errBody.slice(0, 300)}` },
        { status: 500 }
      )
    }

    console.log('[email/send] SUCCESS via Outlook from:', conn.email)

    // Step 4: Log activity
    if (contact_id) {
      await supabase.from('activities').insert({
        contact_id,
        user_id,
        type: 'email',
        subject: `Sent: ${subject}`,
        notes: body,
      })
    }

    return NextResponse.json({ success: true, sent_via: 'outlook', from: conn.email })
  } catch (err) {
    console.error('[email/send] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
