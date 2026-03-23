import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { deal, stage, contact, activities, daysSinceCreated } = await req.json()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const systemPrompt = `You are an expert freight sales coach for Maco Logistics, a national freight brokerage. You help sales reps move deals through the pipeline. You know the freight industry deeply — shippers, carriers, brokers, lanes, RFPs, spot market, contract rates. Given a deal's current stage and activity history, give specific, actionable advice on exactly what to do next to move this deal forward. Be direct and specific. No generic sales advice. Reference the actual stage, contact name, company, and activity history in your response. Format your response with:
- A one-line summary of where this deal stands
- 2-3 specific next actions with timeframes
- One risk or thing to watch out for
Keep it under 200 words total.

IMPORTANT: Return your response as valid JSON with this exact structure:
{
  "summary": "one line summary",
  "actions": ["action 1 with timeframe", "action 2 with timeframe", "action 3 with timeframe"],
  "risk": "one risk or thing to watch out for"
}
Return ONLY the JSON object. No markdown, no code fences, no extra text.`

    const activityLog = (activities ?? [])
      .slice(0, 5)
      .map((a: { type: string; subject: string; notes: string | null; created_at: string }) =>
        `- ${a.type}: "${a.subject}"${a.notes ? ` (${a.notes})` : ''} — ${a.created_at}`
      )
      .join('\n')

    const userPrompt = `Deal: ${deal.title}
Value: ${deal.value ? `$${deal.value.toLocaleString()}` : 'Not set'}
Stage: ${stage ?? 'Unknown'}
Days in pipeline: ${daysSinceCreated}
Contact: ${contact?.name ?? 'No contact linked'}${contact?.company ? ` at ${contact.company}` : ''}${contact?.title ? ` (${contact.title})` : ''}

Recent activity (last 5):
${activityLog || 'No activities logged yet.'}

What should the rep do next?`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Anthropic API error:', response.status, errBody)
      return NextResponse.json({ error: `Anthropic API error: ${response.status}` }, { status: 500 })
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const advice = JSON.parse(cleaned)

    return NextResponse.json({ advice })
  } catch (err) {
    console.error('Deal coach error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
