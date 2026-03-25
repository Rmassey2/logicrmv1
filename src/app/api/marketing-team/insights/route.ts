import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const AGENT_PROMPTS: Record<string, string> = {
  jordan: 'You are Jordan, a direct freight sales coach. Given this CRM pipeline data, give ONE specific sharp insight about what deal to focus on today and why. 2-3 sentences max. No fluff.',
  maya: 'You are Maya, a data-driven email strategist. Given this campaign data, give ONE specific sharp insight about email performance or what to send next. 2-3 sentences max. Reference actual numbers.',
  rex: 'You are Rex, a freight market analyst. Give ONE specific sharp insight about current freight market conditions and how it affects prospecting timing. 2-3 sentences max. Be confident and specific.',
  alex: 'You are Alex, a content writer for Maco Logistics. Given this contact/activity data, give ONE specific sharp insight about which contact needs a follow-up message and suggest the angle. 2-3 sentences max.',
}

async function getAgentData(agentId: string, userId: string): Promise<string> {
  switch (agentId) {
    case 'jordan': {
      const [leadsRes, stagesRes] = await Promise.all([
        supabase.from('leads').select('title, value, stage_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        supabase.from('pipeline_stages').select('id, name').eq('user_id', userId),
      ])
      const stageMap = new Map((stagesRes.data ?? []).map(s => [s.id, s.name]))
      const deals = (leadsRes.data ?? []).map(l => ({
        title: l.title,
        value: l.value,
        stage: stageMap.get(l.stage_id) ?? 'Unknown',
        days_old: Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400000),
      }))
      return `Pipeline deals (${deals.length}):\n${deals.map(d => `- "${d.title}" | $${d.value ?? 0} | Stage: ${d.stage} | ${d.days_old}d old`).join('\n')}`
    }
    case 'maya': {
      const { data } = await supabase.from('email_campaigns').select('name, status, recipient_count, sent_count, open_count, reply_count, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10)
      const campaigns = data ?? []
      return `Campaigns (${campaigns.length}):\n${campaigns.map(c => `- "${c.name}" | Status: ${c.status} | ${c.recipient_count ?? 0} recipients | ${c.sent_count ?? 0} sent | ${c.open_count ?? 0} opens | ${c.reply_count ?? 0} replies`).join('\n')}`
    }
    case 'rex':
      return 'No CRM data needed — use freight market knowledge, DAT trends, and seasonality patterns.'
    case 'alex': {
      const [contactsRes, activitiesRes] = await Promise.all([
        supabase.from('contacts').select('first_name, last_name, company').eq('user_id', userId).order('created_at', { ascending: false }).limit(15),
        supabase.from('activities').select('type, subject, created_at, contact_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(15),
      ])
      return `Recent contacts: ${(contactsRes.data ?? []).map(c => `${c.first_name} ${c.last_name} (${c.company})`).join(', ')}\n\nRecent activities:\n${(activitiesRes.data ?? []).map(a => `- ${a.type}: "${a.subject}" (${new Date(a.created_at).toLocaleDateString()})`).join('\n')}`
    }
    default:
      return ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const { agentId, userId } = await req.json()
    if (!agentId || !userId) return NextResponse.json({ error: 'agentId and userId required' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const crmData = await getAgentData(agentId, userId)
    const systemPrompt = AGENT_PROMPTS[agentId] ?? AGENT_PROMPTS.rex

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: `${systemPrompt}\n\nCRM Data:\n${crmData}`,
        messages: [{ role: 'user', content: 'Give me your top insight right now.' }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', err)
      return NextResponse.json({ error: 'AI error' }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''
    return NextResponse.json({ insight: text })
  } catch (err) {
    console.error('Insights error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
