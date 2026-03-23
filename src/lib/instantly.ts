const API_BASE = 'https://api.instantly.ai/api/v2'
const API_KEY = process.env.INSTANTLY_API_KEY!

interface InstantlyResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<InstantlyResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        ...options.headers,
      },
    })

    const body = await res.json().catch(() => null)

    if (!res.ok) {
      const msg = body?.message ?? body?.error ?? `HTTP ${res.status}`
      console.error(`Instantly API error [${path}]:`, msg, body)
      return { ok: false, error: msg }
    }

    return { ok: true, data: body as T }
  } catch (err) {
    console.error(`Instantly API fetch error [${path}]:`, err)
    return { ok: false, error: String(err) }
  }
}

// ─── Create a campaign ───────────────────────────────────────────────────────

export async function createCampaign(
  name: string,
  subject: string,
  body: string
) {
  return request<{ id: string }>('/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name,
      subject,
      body,
      campaign_schedule: {
        schedules: [
          {
            name: "Default",
            timing: { from: "08:00", to: "17:00" },
            days: {
              monday: true,
              tuesday: true,
              wednesday: true,
              thursday: true,
              friday: true,
              saturday: false,
              sunday: false,
            },
            timezone: "America/Chicago",
          },
        ],
      },
    }),
  })
}

// ─── Add leads to a campaign ─────────────────────────────────────────────────

export interface InstantlyLead {
  email: string
  firstName?: string
  lastName?: string
  companyName?: string
}

export async function addLeadsToCampaign(
  campaignId: string,
  leads: InstantlyLead[]
) {
  return request('/leads', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: campaignId,
      leads,
    }),
  })
}

// ─── Launch (activate) a campaign ────────────────────────────────────────────

export async function launchCampaign(campaignId: string) {
  return request(`/campaigns/${campaignId}/activate`, {
    method: 'POST',
  })
}

// ─── Pause a campaign ────────────────────────────────────────────────────────

export async function pauseCampaign(campaignId: string) {
  return request(`/campaigns/${campaignId}/pause`, {
    method: 'POST',
  })
}

// ─── Get campaign analytics ──────────────────────────────────────────────────

interface CampaignAnalytics {
  total_leads?: number
  emails_sent?: number
  opens?: number
  replies?: number
  bounces?: number
}

export async function getCampaignAnalytics(campaignId: string) {
  return request<CampaignAnalytics>(
    `/analytics/campaign/summary?campaign_id=${campaignId}`
  )
}
