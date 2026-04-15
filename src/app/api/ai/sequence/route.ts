import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { segment, contactTitle, painPoint, companyName, senderName, senderCompany, tone, toneDescription, cadence, targetTier } = await req.json()

    const TIER_INSTRUCTIONS: Record<string, string> = {
      Small: 'Write for a small shipper — casual and friendly, low pressure, quick value prop. Use "one load, no commitment" angle. Keep it short and conversational.',
      Medium: 'Write for a medium shipper — professional tone, reliability focused, backup capacity angle. "We specialize in covering your overflow" messaging.',
      Large: 'Write for a large shipper — consultative tone, capacity program focused. "Dedicated backup carrier relationship" positioning. Show freight industry expertise.',
      XL: 'Write for an enterprise/XL shipper — strategic partnership language, formal but not stiff. "We work with your logistics team to build a reliable carrier program" approach.',
    }
    const tierInstruction = TIER_INSTRUCTIONS[targetTier || 'Medium'] || TIER_INSTRUCTIONS.Medium

    const CADENCE_DAYS: Record<string, number[]> = {
      conservative: [1, 4, 9, 16, 26, 40, 61],
      standard: [1, 3, 5, 8, 12, 16, 21],
      aggressive: [1, 2, 4, 7, 12, 19, 29],
    }
    const days = CADENCE_DAYS[cadence || 'standard'] || CADENCE_DAYS.standard

    if (!segment || !contactTitle || !painPoint) {
      return NextResponse.json({ error: 'segment, contactTitle, and painPoint are required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const systemPrompt = `You are an expert cold email copywriter for freight brokers and logistics companies. You write short, punchy, conversational cold emails that get replies.

Rules:
- Each email MUST be 3-5 sentences max. No more.
- Never use buzzwords like "synergy", "leverage", "optimize", "streamline", "cutting-edge"
- Write like a real person texting a colleague, not a marketing department
- Every email references the prospect's specific pain point
- No bullet points, no bold text, no HTML
- Subject lines are 4-8 words, lowercase, curiosity-driven. NEVER use merge tags like {{first_name}} or {{company}} in subject lines — subject lines must be plain text only
- Always include a soft CTA (question, not a demand)
- Use the sender's real name and company
- In the email BODY only (not subject), include merge tags {{first_name}} and {{company}} where appropriate
- CRITICAL: Never mention the segment name or industry label in the email copy. Write naturally as if speaking directly to one person. Use "you", "your team", "your freight" — never say "manufacturers", "distributors", "retailers", or any industry category name. The segment only influences which pain points and context you use, it must never appear in the actual email text.
${tone ? `\nWrite all emails in this tone: ${tone}. ${toneDescription}. The tone should feel natural and human — never robotic or templated. Each email should sound like it was written by the same person but adapted to the context of that touch.` : ''}
\n${tierInstruction}

You must output valid JSON only — no markdown, no code fences, no explanation. Return an array of exactly 7 objects with this structure:
[
  {
    "touch": 1,
    "day": 1,
    "label": "Quick Question / Pattern Interrupt",
    "subject": "subject line here",
    "body": "email body here"
  }
]

The 7-touch cadence:
Touch 1 (Day ${days[0]}): Quick question / pattern interrupt — ask who handles freight, reference their pain point
Touch 2 (Day ${days[1]}): Pain point validation — show you understand their specific problem
Touch 3 (Day ${days[2]}): Social proof story — mention a similar company you helped (make it believable for freight)
Touch 4 (Day ${days[3]}): The "one lane" offer — ask for just one lane to prove yourself
Touch 5 (Day ${days[4]}): Market insight / rate trends — share a freight market observation relevant to their segment
Touch 6 (Day ${days[5]}): Case study or result — specific numbers (e.g. "saved 18% on their Memphis to Dallas lane")
Touch 7 (Day ${days[6]}): Graceful goodbye email. Tone: warm, professional, no pressure. Tell them you appreciate them reading your emails, you'll reach out again down the road when the timing might be better, and wish them well. Do NOT say "closing your file", "breaking up", or anything negative. Leave the door wide open. Example tone: "I appreciate you taking the time to read my emails. I'll circle back in a few months — timing is everything in freight. Wishing you smooth shipping in the meantime." Always end with Maco's tagline naturally woven in: "We don't book loads we can't cover. All 48 states."

IMPORTANT: Do NOT include a signature, sign-off name, company, phone, email, website, or "--" divider at the end of any email body. The system appends the sender's signature automatically. End each body with the closing line only (e.g. "Thanks,") — no name after it.`

    const userPrompt = `Write a 7-touch cold email sequence for:

Sender: ${senderName} at ${senderCompany}
Target segment (for context only — DO NOT mention this in the emails): ${segment}
Contact title: ${contactTitle}
Key pain point: ${painPoint}
${companyName ? `Prospect company: ${companyName} (use this in personalization, also keep {{company}} merge tags)` : 'Use {{company}} merge tag for the company name'}
Use {{first_name}} merge tag for the contact's first name.

IMPORTANT: The segment is only for your background knowledge of typical pain points and context. Never write the segment name, industry label, or category in any email. Write to one person using "you", "your team", "your freight program", "shippers like you".

Return the JSON array of 7 emails.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
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

    // Parse the JSON array from the response
    // Handle potential markdown code fences
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const sequence = JSON.parse(cleaned)

    return NextResponse.json({ sequence })
  } catch (err) {
    console.error('AI sequence error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
