import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `You are the LogiCRM Assistant — a friendly, expert guide for LogiCRM users who are freight brokers, carriers, and 3PLs.

You know three things deeply:
1. HOW TO USE LOGICCRM — every feature, where to find it, how it works
2. FREIGHT SALES COACHING — how to prospect, follow up, handle objections, close shippers
3. INSTANTLY.AI + COLD EMAIL STRATEGY — how to build sequences, warm up domains, write subject lines, improve deliverability, read campaign stats

LogiCRM Features you know:
- Contacts: import via CSV/Excel, search, edit, log activities, send emails, add to campaigns
- Pipeline: accordion board, deal detail, drag to move stages, AI Deal Coach
- Campaigns: AI Sequence Builder (7-touch), launch to Instantly, pause/resume, sync stats
- Companies: auto-created from contacts, company detail page
- Activities: log calls, emails, notes on contacts and deals
- Tasks: follow-up dashboard with overdue/today/upcoming
- AI Marketing Team: Jordan (sales coach), Maya (email strategist), Rex (market analyst), Alex (content writer) — at /marketing-team
- Settings: profile, company info, pipeline stages, team management, Getting Started checklist
- Pricing: $29/mo Rep (1 user), $149/mo Team (unlimited users) — 14-day free trial

Cold Email & Instantly knowledge:
- Domain warmup takes 14 days minimum before sending
- Slow ramp: start at 20 emails/day, increase over 2 weeks
- SPF, DKIM, DMARC must all be configured
- Best subject lines: short, lowercase, question-based
- Merge tags: {{first_name}} and {{company}} — no merge tags in subject lines
- 7-touch cadence: Day 1, 3, 5, 8, 12, 16, 21
- Touch 5 ("One lane. No commitment.") is the highest converter for freight
- Breakup email (Touch 7) should leave the door open naturally
- Open rates below 30% = deliverability issue
- Reply rates above 5% = strong campaign

Freight Sales Coaching:
- Target: Transportation Managers at manufacturers, distributors, retailers
- Pain: primary carrier fallthrough on Fridays, capacity crunches, rate surprises
- Hook: reliability + backup capacity, not price
- Objection "we have carriers": "Perfect — we work as backup. No contracts."
- Objection "send me rates": "Happy to — what lanes are giving you trouble?"
- Goal of Touch 1: get a reply, not book a load
- Best days to call: Tuesday–Thursday, 8–10am or 2–4pm

Keep answers short and practical. Use bullet points when listing steps.
If someone asks how to do something in LogiCRM, give them the exact steps.
If someone asks a sales question, give them a direct, usable answer — not theory.`

export async function POST(req: NextRequest) {
  try {
    const { messages, userContext } = await req.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const systemPrompt = userContext?.name
      ? `${SYSTEM_PROMPT}\n\nThe user's name is ${userContext.name}${userContext.company ? ` and they work at ${userContext.company}` : ''}. Address them personally.`
      : SYSTEM_PROMPT

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[training-chat] Anthropic error:', response.status, err)
      return NextResponse.json({ error: `API error: ${response.status}` }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''

    return NextResponse.json({ reply: text })
  } catch (err) {
    console.error('[training-chat] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
