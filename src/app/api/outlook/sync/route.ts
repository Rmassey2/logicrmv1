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

    // Get connection
    const { data: conn } = await supabase
      .from('outlook_connections')
      .select('*')
      .eq('user_id', user_id)
      .single()

    if (!conn) return NextResponse.json({ error: 'Outlook not connected' }, { status: 400 })

    // Refresh token if expired
    let accessToken = conn.access_token
    if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
      accessToken = await refreshToken(conn)
      if (!accessToken) {
        return NextResponse.json({ error: 'Token refresh failed — reconnect Outlook' }, { status: 401 })
      }
    }

    // Fetch recent emails
    const graphRes = await fetch(
      'https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,isDraft,sentDateTime',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!graphRes.ok) {
      const err = await graphRes.text()
      console.error('[outlook/sync] Graph API error:', graphRes.status, err)
      return NextResponse.json({ error: `Graph API error: ${graphRes.status}` }, { status: 500 })
    }

    const graphData = await graphRes.json()
    const messages = graphData.value || []

    // Get user's contacts for email matching
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email, email2')
      .eq('user_id', user_id)

    const emailToContact = new Map<string, string>()
    for (const c of (contacts || [])) {
      if (c.email) emailToContact.set(c.email.toLowerCase(), c.id)
      if (c.email2) emailToContact.set(c.email2.toLowerCase(), c.id)
    }

    let synced = 0

    for (const msg of messages) {
      if (msg.isDraft) continue

      // Collect all email addresses from this message
      const addresses: string[] = []
      if (msg.from?.emailAddress?.address) addresses.push(msg.from.emailAddress.address.toLowerCase())
      for (const r of (msg.toRecipients || [])) {
        if (r.emailAddress?.address) addresses.push(r.emailAddress.address.toLowerCase())
      }

      // Find matching contact
      let contactId: string | null = null
      for (const addr of addresses) {
        const match = emailToContact.get(addr)
        if (match) { contactId = match; break }
      }
      if (!contactId) continue

      // Check if already logged (same subject + contact + same day)
      const msgDate = msg.receivedDateTime || msg.sentDateTime
      if (!msgDate) continue
      const dayStr = msgDate.split('T')[0]

      const { data: existing } = await supabase
        .from('activities')
        .select('id')
        .eq('contact_id', contactId)
        .eq('user_id', user_id)
        .eq('type', 'email')
        .eq('subject', msg.subject || '(no subject)')
        .gte('created_at', `${dayStr}T00:00:00`)
        .lte('created_at', `${dayStr}T23:59:59`)
        .limit(1)
        .maybeSingle()

      if (existing) continue

      // Log as activity
      await supabase.from('activities').insert({
        contact_id: contactId,
        user_id,
        type: 'email',
        subject: msg.subject || '(no subject)',
        notes: (msg.bodyPreview || '').slice(0, 500),
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
