import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const BLOCKED_PATTERNS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'newsletter', 'marketing', 'promotions', 'mailer-daemon',
  'notifications@', 'updates@', 'info@', 'support@', 'billing@',
]

function isBlockedSender(email: string): boolean {
  const lower = email.toLowerCase()
  return BLOCKED_PATTERNS.some(p => lower.includes(p))
}

async function refreshToken(conn: { id: string; refresh_token: string }) {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  if (!clientId || !clientSecret || !conn.refresh_token) return null

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json()
  if (!res.ok || !data.access_token) {
    console.error('[outlook/sync] Token refresh failed:', data)
    return null
  }

  const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  await supabase.from('outlook_connections').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token || conn.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', conn.id)

  return data.access_token
}

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const { data: conn } = await supabase
      .from('outlook_connections')
      .select('*')
      .eq('user_id', user_id)
      .single()

    if (!conn) return NextResponse.json({ error: 'Outlook not connected' }, { status: 400 })

    const userEmail = (conn.email || '').toLowerCase().trim()

    let accessToken = conn.access_token
    if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
      accessToken = await refreshToken(conn)
      if (!accessToken) {
        return NextResponse.json({ error: 'Token refresh failed — reconnect Outlook' }, { status: 401 })
      }
    }

    const graphRes = await fetch(
      'https://graph.microsoft.com/v1.0/me/messages?$top=100&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,isDraft,sentDateTime',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!graphRes.ok) {
      const err = await graphRes.text()
      console.error('[outlook/sync] Graph API error:', graphRes.status, err)
      return NextResponse.json({ error: `Graph API error: ${graphRes.status}` }, { status: 500 })
    }

    const graphData = await graphRes.json()
    const messages = graphData.value || []

    // Build exact email → contact_id map
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email, email2')
      .eq('user_id', user_id)

    const emailToContact = new Map<string, string>()
    for (const c of (contacts || [])) {
      if (c.email) emailToContact.set(c.email.toLowerCase().trim(), c.id)
      if (c.email2) emailToContact.set(c.email2.toLowerCase().trim(), c.id)
    }

    // Delete previously synced outlook activities
    await supabase
      .from('activities')
      .delete()
      .eq('user_id', user_id)
      .eq('type', 'email')
      .eq('source', 'outlook')

    let synced = 0

    for (const msg of messages) {
      if (msg.isDraft) continue

      const subject = (msg.subject || '').trim()
      if (!subject) continue

      const fromAddr = (msg.from?.emailAddress?.address || '').toLowerCase().trim()
      const toAddrs = (msg.toRecipients || [])
        .map((r: { emailAddress?: { address?: string } }) => (r.emailAddress?.address || '').toLowerCase().trim())
        .filter(Boolean)

      // Skip blocked senders
      if (isBlockedSender(fromAddr)) continue

      // Direction-aware matching: only match the OTHER party
      let contactId: string | null = null

      if (fromAddr === userEmail) {
        // User SENT — match TO recipients
        for (const addr of toAddrs) {
          if (isBlockedSender(addr)) continue
          const match = emailToContact.get(addr)
          if (match) { contactId = match; break }
        }
      } else {
        // User RECEIVED — match FROM against contacts only
        contactId = emailToContact.get(fromAddr) || null
      }

      if (!contactId) continue

      const msgDate = msg.sentDateTime || msg.receivedDateTime
      if (!msgDate) continue

      const direction = fromAddr === userEmail ? 'Sent' : 'Received'

      await supabase.from('activities').insert({
        contact_id: contactId,
        user_id,
        type: 'email',
        subject: `${direction}: ${subject}`,
        notes: (msg.bodyPreview || '').slice(0, 500),
        source: 'outlook',
        created_at: msgDate,
      })
      synced++
    }

    console.log('[outlook/sync] Synced', synced, 'emails for user:', user_id)
    return NextResponse.json({ success: true, synced })
  } catch (err) {
    console.error('[outlook/sync] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
