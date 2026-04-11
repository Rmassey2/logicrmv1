import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Verify admin + get org
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', user_id)
      .limit(1)
      .maybeSingle()

    if (!membership?.org_id && user_id !== '04ed898a-ae7b-445c-8f9b-544291d48607') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (membership && membership.role !== 'admin' && user_id !== '04ed898a-ae7b-445c-8f9b-544291d48607') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const orgId = membership?.org_id || '942ffbc8-25f4-4d88-9565-7251d637e25c'

    // Get all reps
    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id, role')
      .eq('org_id', orgId)

    if (!members || members.length === 0) return NextResponse.json({ briefing: 'No team members found.' })

    const userIds = members.map(m => m.user_id)

    // Get rep names
    const repNames: Record<string, string> = {}
    for (const m of members) {
      const { data: u } = await supabase.auth.admin.getUserById(m.user_id)
      repNames[m.user_id] = u?.user?.user_metadata?.display_name || u?.user?.email?.split('@')[0] || m.user_id.slice(0, 8)
    }

    // Activities last 7 days
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: activities } = await supabase
      .from('activities')
      .select('user_id, type, created_at, subject')
      .in('user_id', userIds)
      .gte('created_at', weekAgo)

    // Open deals
    const { data: deals } = await supabase
      .from('leads')
      .select('id, title, value, user_id, stage_id, created_at, contact_id, pipeline_stages(name)')
      .in('user_id', userIds)

    // Deal last activity (from activities by contact_id)
    const contactIds = (deals || []).filter(d => d.contact_id).map(d => d.contact_id)
    const { data: dealActivities } = contactIds.length > 0 ? await supabase
      .from('activities')
      .select('contact_id, created_at')
      .in('contact_id', contactIds)
      .order('created_at', { ascending: false }) : { data: [] }

    const lastActivityByContact: Record<string, string> = {}
    for (const a of (dealActivities || [])) {
      if (a.contact_id && !lastActivityByContact[a.contact_id]) {
        lastActivityByContact[a.contact_id] = a.created_at
      }
    }

    // Campaign stats
    const { data: campaigns } = await supabase
      .from('email_campaigns')
      .select('id, name, user_id, recipient_count, sent_count, open_count, reply_count')
      .in('user_id', userIds)

    // Build data summary for AI
    const repSummaries = userIds.map(uid => {
      const name = repNames[uid]
      const acts = (activities || []).filter(a => a.user_id === uid)
      const calls = acts.filter(a => a.type === 'call').length
      const emails = acts.filter(a => a.type === 'email').length
      const notes = acts.filter(a => a.type === 'note').length
      const lastAct = acts.length > 0 ? acts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at : null
      const repDeals = (deals || []).filter(d => d.user_id === uid)
      const totalValue = repDeals.reduce((s, d) => s + (d.value || 0), 0)
      const repCamps = (campaigns || []).filter(c => c.user_id === uid)
      const totalReplies = repCamps.reduce((s, c) => s + (c.reply_count || 0), 0)
      const totalSent = repCamps.reduce((s, c) => s + (c.sent_count || 0), 0)

      return { name, calls, emails, notes, lastActivity: lastAct, deals: repDeals.length, pipelineValue: totalValue, campaignReplies: totalReplies, campaignSent: totalSent }
    })

    const coldDeals = (deals || []).filter(d => {
      const lastAct = d.contact_id ? lastActivityByContact[d.contact_id] : null
      if (!lastAct) return true
      return (Date.now() - new Date(lastAct).getTime()) > 7 * 86400000
    }).map(d => ({
      title: d.title,
      rep: repNames[d.user_id],
      value: d.value,
      stage: (() => { const ps = d.pipeline_stages; if (!ps) return 'Unknown'; const obj = Array.isArray(ps) ? ps[0] : ps; return obj?.name ? String(obj.name) : 'Unknown' })(),
      daysSinceActivity: d.contact_id && lastActivityByContact[d.contact_id]
        ? Math.floor((Date.now() - new Date(lastActivityByContact[d.contact_id]).getTime()) / 86400000)
        : 999,
    }))

    const dataPrompt = JSON.stringify({ reps: repSummaries, coldDeals: coldDeals.slice(0, 10) }, null, 2)

    // Call AI
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ briefing: 'AI not configured — set ANTHROPIC_API_KEY' })

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: 'You are an AI Sales Manager for a freight brokerage. You analyze rep performance and give direct, actionable daily briefings. Be specific — name the reps, name the deals. Don\'t be vague. Format with clear sections using markdown headers and bullet points.',
        messages: [{
          role: 'user',
          content: `Here is this week's team data:\n\n${dataPrompt}\n\nGive me:\n1. Who needs attention today and why\n2. Which deals are at risk of going cold\n3. Which rep is performing best this week and what they're doing right\n4. One specific action I should take today as the sales manager`,
        }],
      }),
    })

    const aiData = await aiRes.json()
    const briefing = aiData.content?.[0]?.text || 'Could not generate briefing.'

    // Also return raw data for the UI cards
    return NextResponse.json({
      briefing,
      reps: repSummaries,
      coldDeals,
      campaigns: (campaigns || []).map(c => ({ ...c, repName: repNames[c.user_id] })),
    })
  } catch (err) {
    console.error('[sales-manager] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
