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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function buildSignature(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  fallbackName: string | null,
  fallbackEmail: string
): Promise<{ text: string; html: string }> {
  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, string | undefined>

  const name =
    meta.display_name ||
    [meta.first_name, meta.last_name].filter(Boolean).join(' ') ||
    fallbackName ||
    ''
  const phone = meta.phone || ''
  const website = meta.website || ''
  const email = meta.sending_email || authUser?.user?.email || fallbackEmail || ''

  let company = ''
  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (membership) {
    const { data: org } = await supabase
      .from('organizations')
      .select('company_name, name')
      .eq('id', (membership as { org_id: string }).org_id)
      .single()
    const o = org as { company_name?: string; name?: string } | null
    company = o?.company_name || o?.name || ''
  }

  const lines = [name, company, phone, email, website].filter(Boolean)
  if (lines.length === 0) return { text: '', html: '' }

  const text = '\n\n--\n' + lines.join('\n')
  const html = '<br><br>--<br>' + lines.map(escapeHtml).join('<br>')
  return { text, html }
}

// Strip any existing plain-text or HTML signature block starting at a "--" divider.
function stripExistingSignature(body: string): string {
  let out = body
  // Plain-text divider: line that is just "--" or "-- "
  out = out.replace(/\n[ \t]*-{2,}[ \t]*\n[\s\S]*$/i, '')
  // HTML divider: "--<br>" or "<br>--<br>"
  out = out.replace(/(<br\s*\/?>\s*){1,}\s*-{2,}\s*(<br\s*\/?>[\s\S]*)?$/i, '')
  return out.trimEnd()
}

// Convert plain-text body to HTML (newlines → <br>) unless it already looks like HTML.
function toHtmlBody(body: string): string {
  const looksLikeHtml = /<\/?(p|br|div|span|table|body|html|ul|ol|li|h[1-6])\b/i.test(body)
  if (looksLikeHtml) return body
  return escapeHtml(body).replace(/\r?\n/g, '<br>')
}

function appendSignature(body: string, sigHtml: string): string {
  const stripped = stripExistingSignature(body)
  const htmlBody = toHtmlBody(stripped)
  if (!sigHtml) return htmlBody
  const closingBodyIdx = htmlBody.toLowerCase().lastIndexOf('</body>')
  if (closingBodyIdx !== -1) {
    return htmlBody.slice(0, closingBodyIdx) + sigHtml + htmlBody.slice(closingBodyIdx)
  }
  return htmlBody + sigHtml
}

async function sendViaGraph(
  accessToken: string,
  to: string,
  subject: string,
  htmlBody: string,
  fromAddress: string,
  fromName: string | null
) {
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
        from: {
          emailAddress: {
            address: fromAddress,
            name: fromName || fromAddress,
          },
        },
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
      .select('access_token, refresh_token, expires_at, email, display_name')
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

    // Step 2b: Normalize body + always append signature (applies to direct + AI-drafted sends)
    const { html: sigHtml } = await buildSignature(supabase, user_id, conn.display_name, conn.email)
    const finalBody = appendSignature(body, sigHtml)
    console.log('[email/send] signature appended, final length:', finalBody.length)

    // Step 3: Send via Microsoft Graph API
    console.log('[email/send] Sending via graph.microsoft.com from:', conn.email)
    const graphRes = await sendViaGraph(accessToken, to, subject, finalBody, conn.email, conn.display_name)
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
