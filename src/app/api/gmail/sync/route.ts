import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { user_id, gmail_email } = await req.json()

    if (!user_id || !gmail_email) {
      return NextResponse.json({ error: 'user_id and gmail_email required' }, { status: 400 })
    }

    // Get stored access token
    const { data: tokenRow } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', gmail_email)
      .eq('key', 'gmail_access_token')
      .single()

    if (!tokenRow?.value) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })
    }

    const accessToken = tokenRow.value

    // Fetch recent emails (last 50)
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&labelIds=SENT',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!listRes.ok) {
      const err = await listRes.text()
      console.error('Gmail list error:', err)
      return NextResponse.json({ error: 'Gmail API error — token may be expired' }, { status: 500 })
    }

    const listData = await listRes.json()
    const messageIds: string[] = (listData.messages ?? []).map((m: { id: string }) => m.id)

    if (messageIds.length === 0) {
      return NextResponse.json({ synced: 0 })
    }

    // Get user's contact emails for matching
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('user_id', user_id)
      .not('email', 'is', null)

    const emailToContactId = new Map<string, string>()
    for (const c of contacts ?? []) {
      if (c.email) emailToContactId.set(c.email.toLowerCase(), c.id)
    }

    let synced = 0

    // Process each message (limit to 20 to avoid timeout)
    for (const msgId of messageIds.slice(0, 20)) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )

      if (!msgRes.ok) continue
      const msg = await msgRes.json()

      const headers = msg.payload?.headers ?? []
      const to = (headers.find((h: { name: string }) => h.name === 'To')?.value ?? '').toLowerCase()
      const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value ?? '(No subject)'
      const date = headers.find((h: { name: string }) => h.name === 'Date')?.value

      // Match to a contact
      let matchedContactId: string | null = null
      for (const [email, contactId] of Array.from(emailToContactId.entries())) {
        if (to.includes(email)) {
          matchedContactId = contactId
          break
        }
      }

      if (!matchedContactId) continue

      // Check if already synced (by subject + contact)
      const { data: existing } = await supabase
        .from('activities')
        .select('id')
        .eq('contact_id', matchedContactId)
        .eq('subject', `[Gmail] ${subject}`)
        .limit(1)
        .maybeSingle()

      if (existing) continue

      // Insert as email activity
      await supabase.from('activities').insert({
        contact_id: matchedContactId,
        user_id,
        type: 'email',
        subject: `[Gmail] ${subject}`,
        notes: `Synced from Gmail. Sent to: ${to}${date ? `. Date: ${date}` : ''}`,
      })

      synced++
    }

    return NextResponse.json({ synced })
  } catch (err) {
    console.error('Gmail sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
