import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const SYSTEM_PROMPTS: Record<string, string> = {
  jordan: `You are Jordan, a direct and no-fluff freight sales coach for Maco Logistics. You tell reps exactly what deal to call today and why. You know freight sales inside out — discovery calls, objection handling, closing. You reference the actual deals and contacts in the CRM data provided. Be specific: name names, cite dollar values, recommend exact next steps with timeframes. No generic advice.`,
  maya: `You are Maya, a data-driven email strategist for Maco Logistics. You reference open rates, reply rates, and sequence performance from the actual campaign data. You give specific subject line recommendations, copy tweaks, and send timing advice. You know cold email best practices for freight — short, conversational, pain-focused. Always back up recommendations with the data.`,
  rex: `You are Rex, a freight market analyst. You think like a freight economist — you reference DAT rate trends, seasonal capacity cycles, produce season, peak shipping windows, and carrier behavior patterns. You help reps understand WHEN to prospect and what market conditions to reference in their outreach. You are confident and specific in your predictions. Reference Memphis and Southeast lanes frequently as that's Maco's core market.`,
  alex: `You are Alex, a content writer for Maco Logistics. You write in Maco's voice: direct, reliable, no-nonsense freight broker tone. You produce ready-to-send cold emails, follow-up messages, call scripts, and LinkedIn messages. Everything you write is 3-5 sentences max, conversational, no buzzwords. You reference the contact's actual name, company, and any known pain points from the CRM data.`,
}

async function getAgentContext(agentId: string, userId: string): Promise<string> {
  switch (agentId) {
    case 'jordan': {
      const [leadsRes, stagesRes, contactsRes] = await Promise.all([
        supabase.from('leads').select('title, value, stage_id, contact_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(25),
        supabase.from('pipeline_stages').select('id, name, position').eq('user_id', userId).order('position'),
        supabase.from('contacts').select('id, first_name, last_name, company').eq('user_id', userId).limit(50),
      ])
      const stageMap = new Map((stagesRes.data ?? []).map(s => [s.id, s.name]))
      const contactMap = new Map((contactsRes.data ?? []).map(c => [c.id, `${c.first_name} ${c.last_name} (${c.company})`]))
      const deals = (leadsRes.data ?? []).map(l => `- "${l.title}" | $${l.value ?? 0} | ${stageMap.get(l.stage_id) ?? '?'} | Contact: ${contactMap.get(l.contact_id) ?? 'unlinked'} | ${Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400000)}d old`)
      return `PIPELINE (${deals.length} deals):\n${deals.join('\n')}\n\nSTAGES: ${(stagesRes.data ?? []).map(s => s.name).join(' → ')}`
    }
    case 'maya': {
      const [campaignsRes, templatesRes] = await Promise.all([
        supabase.from('email_campaigns').select('name, subject, status, recipient_count, sent_count, open_count, reply_count').eq('user_id', userId).order('created_at', { ascending: false }).limit(15),
        supabase.from('email_templates').select('name, subject').eq('user_id', userId).limit(10),
      ])
      const campaigns = (campaignsRes.data ?? []).map(c => {
        const openRate = c.sent_count ? Math.round(((c.open_count ?? 0) / c.sent_count) * 100) : 0
        const replyRate = c.sent_count ? Math.round(((c.reply_count ?? 0) / c.sent_count) * 100) : 0
        return `- "${c.name}" (${c.status}) | Subject: "${c.subject}" | ${c.sent_count ?? 0} sent | ${openRate}% open | ${replyRate}% reply`
      })
      const templates = (templatesRes.data ?? []).map(t => `- "${t.name}" | Subject: "${t.subject}"`)
      return `CAMPAIGNS (${campaigns.length}):\n${campaigns.join('\n')}\n\nTEMPLATES (${templates.length}):\n${templates.join('\n')}`
    }
    case 'rex':
      return 'You have no CRM data. Use your freight market expertise, DAT trends, seasonal patterns, and general logistics industry knowledge.'
    case 'alex': {
      const [contactsRes, activitiesRes] = await Promise.all([
        supabase.from('contacts').select('first_name, last_name, company, title, city, state, notes').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        supabase.from('activities').select('type, subject, notes, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
      ])
      const contacts = (contactsRes.data ?? []).map(c => `- ${c.first_name} ${c.last_name} | ${c.title ?? ''} at ${c.company ?? ''} | ${[c.city, c.state].filter(Boolean).join(', ')}${c.notes ? ` | Notes: ${c.notes.slice(0, 100)}` : ''}`)
      const activities = (activitiesRes.data ?? []).map(a => `- ${a.type}: "${a.subject}" (${new Date(a.created_at).toLocaleDateString()})`)
      return `CONTACTS:\n${contacts.join('\n')}\n\nRECENT ACTIVITY:\n${activities.join('\n')}`
    }
    default:
      return ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, agentId, userId } = await req.json()
    if (!message || !agentId || !userId) {
      return new Response(JSON.stringify({ error: 'message, agentId, userId required' }), { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 })

    const context = await getAgentContext(agentId, userId)
    const systemPrompt = `${SYSTEM_PROMPTS[agentId] ?? SYSTEM_PROMPTS.rex}\n\nCRM DATA:\n${context}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Anthropic chat error:', response.status, errBody)
      return new Response(JSON.stringify({ error: `AI error ${response.status}: ${errBody}` }), { status: 500 })
    }

    // Forward the SSE stream directly
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    console.error('Chat error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}
