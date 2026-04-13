import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, contact_id, user_id } = await req.json()

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    let sent = false
    let sentVia = ''

    // ── Try Outlook first ──────────────────────────────────────────────
    if (user_id) {
      const { data: outlookConn } = await supabase
        .from('outlook_connections')
        .select('access_token, refresh_token, expires_at, email')
        .eq('user_id', user_id)
        .maybeSingle()

      if (outlookConn?.access_token) {
        let accessToken = outlookConn.access_token

        // Refresh if expired
        if (outlookConn.expires_at && new Date(outlookConn.expires_at) < new Date()) {
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
            }
          }
        }

        // Send via Microsoft Graph
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

        if (graphRes.ok || graphRes.status === 202) {
          sent = true
          sentVia = 'outlook'
          console.log('[email/send] Sent via Outlook from:', outlookConn.email)
        } else {
          const errText = await graphRes.text()
          console.error('[email/send] Outlook send failed:', graphRes.status, errText)
        }
      }
    }

    // ── Try Gmail if Outlook didn't work ────────────────────────────────
    if (!sent && user_id) {
      const { data: gmailConn } = await supabase
        .from('gmail_connections')
        .select('access_token, refresh_token, email')
        .eq('user_id', user_id)
        .maybeSingle()

      if (gmailConn?.access_token) {
        // Build RFC 2822 email
        const emailLines = [
          `To: ${to}`,
          `Subject: ${subject}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=utf-8',
          '',
          body,
        ]
        const raw = Buffer.from(emailLines.join('\r\n')).toString('base64url')

        const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${gmailConn.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        })

        if (gmailRes.ok) {
          sent = true
          sentVia = 'gmail'
          console.log('[email/send] Sent via Gmail from:', gmailConn.email)
        } else {
          const errText = await gmailRes.text()
          console.error('[email/send] Gmail send failed:', gmailRes.status, errText)
        }
      }
    }

    // ── Fallback to Resend (system emails only) ────────────────────────
    if (!sent) {
      const resendKey = process.env.RESEND_API_KEY
      if (!resendKey) {
        return NextResponse.json({ error: 'Please connect your email in Settings → Email tab to send emails' }, { status: 400 })
      }

      // Get sender info
      let senderName = 'LogiCRM'
      let senderEmail = 'jarrett@macoships.com'
      if (user_id) {
        const { data: authUser } = await supabase.auth.admin.getUserById(user_id)
        if (authUser?.user) {
          senderName = authUser.user.user_metadata?.display_name || senderName
          senderEmail = authUser.user.user_metadata?.sending_email || senderEmail
        }
      }

      const resend = new Resend(resendKey)
      const { error: resendErr } = await resend.emails.send({
        from: `${senderName} <${senderEmail}>`,
        to: [to], subject, text: body,
      })

      if (resendErr) {
        // Try fallback sender
        const { error: fallbackErr } = await resend.emails.send({
          from: `${senderName} <jarrett@macoships.com>`,
          to: [to], subject, text: body,
        })
        if (fallbackErr) return NextResponse.json({ error: fallbackErr.message }, { status: 500 })
      }

      sentVia = 'resend'
      console.log('[email/send] Sent via Resend fallback')
    }

    // Auto-log as activity
    if (contact_id && user_id) {
      await supabase.from('activities').insert({
        contact_id, user_id, type: 'email',
        subject: `Sent: ${subject}`,
        notes: body,
      })
    }

    return NextResponse.json({ success: true, sent_via: sentVia })
  } catch (err) {
    console.error('[email/send] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
