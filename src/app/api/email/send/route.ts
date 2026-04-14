import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// BUILD_MARKER: v7-outlook-only-2026-04-13
// This route uses ONLY Microsoft Graph API (Outlook) and Gmail OAuth.
// It does NOT use Resend. If you see Resend in logs, it's from a different route.

export async function POST(req: NextRequest) {
  try {
    console.log('[email/send] ██ BUILD v7-outlook-only ██ NO RESEND IN THIS FILE ██')

    const { to, subject, body, contact_id, user_id } = await req.json()

    console.log('[email/send] === START === user_id:', user_id, 'to:', to)

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 })
    }
    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── Look up Outlook connection for THIS user ──────────────────────
    const { data: outlookConn, error: outlookErr } = await supabase
      .from('outlook_connections')
      .select('access_token, refresh_token, expires_at, email, user_id')
      .eq('user_id', user_id)
      .maybeSingle()

    console.log('[email/send] Outlook lookup for user_id:', user_id, '=> found:', !!outlookConn, 'email:', outlookConn?.email, 'connUserId:', outlookConn?.user_id, 'error:', outlookErr?.message)

    if (outlookConn?.access_token) {
      let accessToken = outlookConn.access_token

      // Refresh if expired
      if (outlookConn.expires_at && new Date(outlookConn.expires_at) < new Date()) {
        console.log('[email/send] Token expired, refreshing...')
        const clientId = process.env.MICROSOFT_CLIENT_ID
        const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
        if (clientId && clientSecret && outlookConn.refresh_token) {
          const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId, client_secret: clientSecret,
              refresh_token: outlookConn.refresh_token, grant_type: 'refresh_token',
            }),
          })
          const tokenData = await tokenRes.json()
          if (tokenData.access_token) {
            accessToken = tokenData.access_token
            await supabase.from('outlook_connections').update({
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token || outlookConn.refresh_token,
              expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
            }).eq('user_id', user_id)
            console.log('[email/send] Token refreshed successfully')
          } else {
            console.error('[email/send] Token refresh failed:', tokenData.error, tokenData.error_description)
          }
        }
      }

      // Send via Microsoft Graph
      console.log('[email/send] Sending via Outlook Graph API from:', outlookConn.email)
      const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'Text', content: body },
            toRecipients: [{ emailAddress: { address: to } }],
          },
        }),
      })

      console.log('[email/send] Graph response status:', graphRes.status)

      if (graphRes.ok || graphRes.status === 202) {
        console.log('[email/send] SUCCESS via Outlook from:', outlookConn.email)

        // Auto-log activity
        if (contact_id) {
          await supabase.from('activities').insert({
            contact_id, user_id, type: 'email',
            subject: `Sent: ${subject}`,
            notes: body,
          })
        }

        return NextResponse.json({ success: true, sent_via: 'outlook', from: outlookConn.email })
      }

      const errText = await graphRes.text()
      console.error('[email/send] Outlook send FAILED:', graphRes.status, errText)
      return NextResponse.json({ error: `Outlook send failed (${graphRes.status}): ${errText.slice(0, 200)}` }, { status: 500 })
    }

    // ── Try Gmail ──────────────────────────────────────────────────────
    const { data: gmailConn } = await supabase
      .from('gmail_connections')
      .select('access_token, email')
      .eq('user_id', user_id)
      .maybeSingle()

    console.log('[email/send] Gmail lookup for user_id:', user_id, '=> found:', !!gmailConn)

    if (gmailConn?.access_token) {
      const emailLines = [
        `To: ${to}`, `Subject: ${subject}`,
        'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', body,
      ]
      const raw = Buffer.from(emailLines.join('\r\n')).toString('base64url')

      const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${gmailConn.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      })

      if (gmailRes.ok) {
        console.log('[email/send] SUCCESS via Gmail from:', gmailConn.email)
        if (contact_id) {
          await supabase.from('activities').insert({
            contact_id, user_id, type: 'email',
            subject: `Sent: ${subject}`, notes: body,
          })
        }
        return NextResponse.json({ success: true, sent_via: 'gmail', from: gmailConn.email })
      }

      const errText = await gmailRes.text()
      console.error('[email/send] Gmail send FAILED:', gmailRes.status, errText)
      return NextResponse.json({ error: `Gmail send failed (${gmailRes.status})` }, { status: 500 })
    }

    // ── No email connection ────────────────────────────────────────────
    console.log('[email/send] NO email connection found for user:', user_id)
    return NextResponse.json({
      error: 'No email connection found. Please connect your email in Settings → Email tab.',
    }, { status: 400 })

  } catch (err) {
    console.error('[email/send] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
