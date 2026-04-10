import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' })
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log('[stripe/webhook] Event:', event.type)

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.org_id
        const plan = sub.metadata?.plan as 'rep' | 'team' | undefined
        if (!orgId) break

        const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : 'expired'

        await supabase.from('organizations').update({
          subscription_status: status,
          plan: plan || null,
          stripe_subscription_id: sub.id,
        }).eq('id', orgId)

        console.log('[stripe/webhook] Updated org:', orgId, { status, plan })
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.org_id
        if (!orgId) break

        await supabase.from('organizations').update({
          subscription_status: 'expired',
          stripe_subscription_id: null,
        }).eq('id', orgId)

        console.log('[stripe/webhook] Subscription canceled for org:', orgId)
        break
      }
    }
  } catch (err) {
    console.error('[stripe/webhook] Handler error:', err)
  }

  return NextResponse.json({ received: true })
}
