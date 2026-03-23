import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // Get user from auth header
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Decode user from token
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user } } = await anonClient.auth.getUser(token)
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const userId = user.id

    // Get all contacts with a company name
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, company, company_id')
      .eq('user_id', userId)
      .not('company', 'is', null)

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ companies_created: 0, contacts_linked: 0 })
    }

    // Get unique company names (case-insensitive)
    const uniqueNames = new Map<string, string>()
    for (const c of contacts) {
      if (c.company) {
        const key = c.company.toLowerCase().trim()
        if (!uniqueNames.has(key)) {
          uniqueNames.set(key, c.company.trim())
        }
      }
    }

    // Get existing companies for this user
    const { data: existingCompanies } = await supabase
      .from('companies')
      .select('id, name')
      .eq('user_id', userId)

    const existingMap = new Map<string, string>()
    for (const ec of existingCompanies ?? []) {
      existingMap.set(ec.name.toLowerCase().trim(), ec.id)
    }

    let companiesCreated = 0
    let contactsLinked = 0

    // Create missing companies
    for (const [key, name] of Array.from(uniqueNames.entries())) {
      if (!existingMap.has(key)) {
        const { data: newComp } = await supabase
          .from('companies')
          .insert({ user_id: userId, name })
          .select('id')
          .single()

        if (newComp) {
          existingMap.set(key, newComp.id)
          companiesCreated++
        }
      }
    }

    // Link contacts to companies
    for (const contact of contacts) {
      if (!contact.company) continue
      const key = contact.company.toLowerCase().trim()
      const companyId = existingMap.get(key)

      if (companyId && contact.company_id !== companyId) {
        const { error } = await supabase
          .from('contacts')
          .update({ company_id: companyId })
          .eq('id', contact.id)

        if (!error) contactsLinked++
      }
    }

    return NextResponse.json({ companies_created: companiesCreated, contacts_linked: contactsLinked })
  } catch (err) {
    console.error('Company sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
