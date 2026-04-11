import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

    // Get connection (includes user's email for direction matching)
    const { data: conn } = await supabase
      .from('outlook_connections')
      .select('*')
      .eq('user_id', user_id)
      .single()

    if (!conn) return NextResponse.json({ error: 'Outlook not connected' }, { status: 400 })

    const userEmail = (conn.email || '').toLowerCase()

    // Refresh token if expired
    let accessToken = conn.access_token
    if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
      accessToken = await refreshToken(conn)
      if (!accessToken) {
        return NextResponse.json({ error: 'Token refresh failed — reconnect Outlook' }, { status: 401 })
      }
    }

    // Fetch recent emails (100 for broader coverage)
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

    // Build exact email → contact_id map from user's contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email, email2')
      .eq('user_id', user_id)

    const emailToContact = new Map<string, string>()
    for (const c of (contacts || [])) {
      if (c.email) emailToContact.set(c.email.toLowerCase().trim(), c.id)
      if (c.email2) emailToContact.set(c.email2.toLowerCase().trim(), c.id)
    }

    // Delete previously synced outlook emails to re-sync cleanly
    // (only delete activities that were auto-synced, not manually logged)
    await supabase
      .from('activities')
      .delete()
      .eq('user_id', user_id)
      .eq('type', 'email')
      .like('notes', '%[outlook-sync]%')

    let synced = 0
    let skipped = 0

    for (const msg of messages) {
      // Skip drafts
      if (msg.isDraft) continue

      // Skip emails with no subject or common marketing patterns
      const subject = (msg.subject || '').trim()
      if (!subject) continue

      const fromAddr = (msg.from?.emailAddress?.address || '').toLowerCase().trim()
      const toAddrs = (msg.toRecipients || [])
        .map((r: { emailAddress?: { address?: string } }) => (r.emailAddress?.address || '').toLowerCase().trim())
        .filter(Boolean)

      // Determine direction and find the OTHER person's email
      let contactId: string | null = null

      if (fromAddr === userEmail) {
        // User SENT this email — match TO recipients against contacts
        for (const addr of toAddrs) {
          const match = emailToContact.get(addr)
          if (match) { contactId = match; break }
        }
      } else {
        // User RECEIVED this email — match FROM address against contacts
        contactId = emailToContact.get(fromAddr) || null
      }

      if (!contactId) {
        skipped++
        continue
      }

      // Get the email date
      const msgDate = msg.sentDateTime || msg.receivedDateTime
      if (!msgDate) continue

      // Tag with [outlook-sync] so we can identify auto-synced emails
      const notes = `${(msg.bodyPreview || '').slice(0, 500)}\n[outlook-sync]`
      const direction = fromAddr === userEmail ? 'Sent' : 'Received'

      await supabase.from('activities').insert({
        contact_id: contactId,
        user_id,
        type: 'email',
        subject: `${direction}: ${subject}`,
        notes,
        created_at: msgDate,
      })
      synced++
    }

    console.log('[outlook/sync] Synced', synced, 'emails, skipped', skipped, 'for user:', user_id)
    return NextResponse.json({ success: true, synced })
  } catch (err) {
    console.error('[outlook/sync] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
