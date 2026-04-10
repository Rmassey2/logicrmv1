import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const PRICE_IDS: Record<string, string> = {
      rep: process.env.STRIPE_PRICE_REP || '',
      team: process.env.STRIPE_PRICE_TEAM || '',
    }

    const { plan, user_id } = await req.json()

    if (!plan || !PRICE_IDS[plan]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user_id)
      .limit(1)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, stripe_customer_id, name')
      .eq('id', membership.org_id)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 400 })
    }

    let customerId = org.stripe_customer_id
    if (!customerId) {
      const { data: authUser } = await supabase.auth.admin.getUserById(user_id)
      const customer = await stripe.customers.create({
        email: authUser?.user?.email ?? undefined,
        name: org.name ?? undefined,
        metadata: { org_id: org.id },
      })
      customerId = customer.id
      await supabase.from('organizations').update({ stripe_customer_id: customerId }).eq('id', org.id)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://logicrmv1.vercel.app'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/pricing`,
      subscription_data: {
        trial_period_days: 14,
        metadata: { org_id: org.id, plan },
      },
      metadata: { org_id: org.id, plan },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[stripe/checkout] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
