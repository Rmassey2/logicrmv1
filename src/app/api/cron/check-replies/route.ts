import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2'

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const instantlyKey = process.env.INSTANTLY_API_KEY
    if (!instantlyKey) return NextResponse.json({ error: 'INSTANTLY_API_KEY not set' }, { status: 500 })

    // Get last check timestamp
    const { data: lastCheck } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'last_reply_check')
      .maybeSingle()

    const since = lastCheck?.value || new Date(Date.now() - 5 * 60000).toISOString()
    console.log('[check-replies] Checking since:', since)

    // Fetch replies from Instantly
    const events = []
    for (const eventType of ['reply_received', 'email_opened', 'link_clicked', 'email_bounced']) {
      try {
        const res = await fetch(`${INSTANTLY_BASE}/emails?event_type=${eventType}&timestamp_from=${encodeURIComponent(since)}&limit=50`, {
          headers: { Authorization: `Bearer ${instantlyKey}` },
        })
        if (res.ok) {
          const data = await res.json()
          const items = (data.data || data.items || data || [])
          if (Array.isArray(items)) {
            for (const item of items) events.push({ ...item, event_type: eventType })
          }
        }
      } catch (err) {
        console.error(`[check-replies] Failed to fetch ${eventType}:`, err)
      }
    }

    console.log('[check-replies] Total events:', events.length)

    // Build contact email lookup
    const { data: allContacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, email2, company, user_id')

    const emailToContact = new Map<string, typeof allContacts extends (infer T)[] | null ? T : never>()
    for (const c of (allContacts || [])) {
      if (c.email) emailToContact.set(c.email.toLowerCase(), c)
      if (c.email2) emailToContact.set(c.email2.toLowerCase(), c)
    }

    let processed = 0
    const resendKey = process.env.RESEND_API_KEY
    const resend = resendKey ? new Resend(resendKey) : null
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://logicrmv1.vercel.app'

    for (const event of events) {
      const leadEmail = (event.lead_email || event.email || event.from_email || '').toLowerCase().trim()
      if (!leadEmail) continue

      const contact = emailToContact.get(leadEmail)
      const contactName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : leadEmail
      const replySnippet = (event.body || event.text || event.subject || '').slice(0, 300)

      // Determine activity type
      let activityType = 'email'
      let activitySubject = ''
      const et = event.event_type

      if (et === 'reply_received') {
        activityType = 'email'
        activitySubject = `Campaign Reply: ${contactName}`
      } else if (et === 'email_opened') {
        activityType = 'email'
        activitySubject = `Campaign Email Opened: ${contactName}`
      } else if (et === 'link_clicked') {
        activityType = 'email'
        activitySubject = `Campaign Link Clicked: ${contactName}`
      } else if (et === 'email_bounced') {
        activityType = 'email'
        activitySubject = `Campaign Email Bounced: ${contactName}`
      }

      // Insert activity if we have a contact match
      if (contact) {
        await supabase.from('activities').insert({
          contact_id: contact.id,
          user_id: contact.user_id,
          type: activityType,
          subject: activitySubject,
          notes: replySnippet || null,
          source: 'instantly',
          created_at: event.timestamp || new Date().toISOString(),
        })
      }

      // Send email notification for replies and bounces
      if (resend && (et === 'reply_received' || et === 'email_bounced')) {
        let repEmail = 'rmassey@macotransport.com'
        if (contact?.user_id) {
          const { data: repUser } = await supabase.auth.admin.getUserById(contact.user_id)
          repEmail = repUser?.user?.email || repEmail
        }

        const emoji = et === 'reply_received' ? '🔥' : '⚠️'
        const typeLabel = et === 'reply_received' ? 'New Reply' : 'Email Bounced'
        const contactLink = contact ? `${appUrl}/contacts/${contact.id}` : appUrl

        try {
          await resend.emails.send({
            from: 'LogiCRM <jarrett@macoships.com>',
            to: [repEmail],
            subject: `${emoji} ${typeLabel} from ${contactName}`,
            html: `
              <div style="background:#0f1c35;color:#e2e8f0;padding:32px;border-radius:12px;font-family:sans-serif;max-width:500px">
                <h2 style="color:#d4930e;margin:0 0 8px">${typeLabel}</h2>
                <p style="margin:0 0 4px;font-size:18px;color:#fff;font-weight:bold">${contactName}</p>
                ${contact?.company ? `<p style="margin:0 0 16px;font-size:14px;color:#94a3b8">${contact.company}</p>` : ''}
                ${replySnippet ? `<div style="background:rgba(255,255,255,0.05);border-left:3px solid #d4930e;padding:12px;border-radius:8px;margin:16px 0;font-size:14px;color:#cbd5e1">${replySnippet}</div>` : ''}
                <a href="${contactLink}" style="display:inline-block;background:#d4930e;color:#0f1c35;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;margin-top:8px">View Contact</a>
                <p style="margin:16px 0 0;font-size:11px;color:#475569">LogiCRM · Automated notification</p>
              </div>
            `,
          })
        } catch (emailErr) {
          console.error('[check-replies] Email notification failed:', emailErr)
        }
      }

      processed++
    }

    // Update last check timestamp
    await supabase.from('system_settings').upsert(
      { key: 'last_reply_check', value: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

    console.log('[check-replies] Processed:', processed, 'events')
    return NextResponse.json({ success: true, processed })
  } catch (err) {
    console.error('[check-replies] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
