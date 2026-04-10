import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export interface OrgSubscription {
  subscription_status: 'trial' | 'active' | 'expired' | 'exempt' | null
  plan: 'rep' | 'team' | null
  trial_ends_at: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export async function getSubscription(userId: string): Promise<OrgSubscription | null> {
  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (!membership) return null

  const { data: org } = await supabase
    .from('organizations')
    .select('subscription_status, plan, trial_ends_at, stripe_customer_id, stripe_subscription_id')
    .eq('id', membership.org_id)
    .single()

  return org as OrgSubscription | null
}

export function isExpired(sub: OrgSubscription | null): boolean {
  if (!sub) return true
  if (sub.subscription_status === 'exempt') return false
  if (sub.subscription_status === 'active') return false
  if (sub.subscription_status === 'trial') {
    if (!sub.trial_ends_at) return true
    return new Date(sub.trial_ends_at) < new Date()
  }
  return true
}

export function trialDaysLeft(sub: OrgSubscription | null): number {
  if (!sub?.trial_ends_at) return 0
  const diff = new Date(sub.trial_ends_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / 86400000))
}
