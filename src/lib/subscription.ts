export interface OrgSubscription {
  subscription_status: 'trial' | 'active' | 'expired' | 'exempt' | null
  plan: 'rep' | 'team' | null
  trial_ends_at: string | null
}

export async function getSubscription(userId: string): Promise<OrgSubscription | null> {
  try {
    const res = await fetch(`/api/subscription?userId=${userId}`)
    if (!res.ok) {
      console.error('[subscription] API returned', res.status)
      // Infrastructure error — don't block user
      return { subscription_status: 'exempt', plan: null, trial_ends_at: null }
    }
    const data = await res.json()
    // API returned successfully — use the actual subscription (may be null)
    return data.subscription as OrgSubscription | null
  } catch (err) {
    console.error('[subscription] Fetch failed:', err)
    // Network error — don't block user
    return { subscription_status: 'exempt', plan: null, trial_ends_at: null }
  }
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
