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
      console.error(`Instantly API error [${path}]:`, {
        status: res.status,
        statusText: res.statusText,
        message: msg,
        fullBody: JSON.stringify(body),
      })
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
      email_list: ['jarrett@macoships.com'],
      open_tracking: false,
      link_tracking: false,
      campaign_schedule: {
        schedules: [
          {
            name: "Default",
            timing: { from: "08:00", to: "17:00" },
            days: {
              "0": false,
              "1": true,
              "2": true,
              "3": true,
              "4": true,
              "5": true,
              "6": false,
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
  // Filter out leads without email
  const validLeads = leads.filter(l => l.email && l.email.trim())
  if (validLeads.length === 0) {
    return { ok: false, error: 'No leads with email addresses' }
  }

  // Push leads one at a time to /leads endpoint (Instantly v2)
  console.log('[instantly] addLeadsToCampaign: pushing', validLeads.length, 'leads to campaign', campaignId)

  let lastError = ''
  let successCount = 0
  for (const l of validLeads) {
    const payload = {
      email: l.email.trim(),
      first_name: l.firstName ?? '',
      last_name: l.lastName ?? '',
      company_name: l.companyName ?? '',
      company: l.companyName ?? '',
      campaign: campaignId,
    }
    console.log('[instantly] Pushing lead:', payload.email)
    const result = await request('/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (result.ok) {
      successCount++
    } else {
      lastError = result.error ?? 'Unknown'
      console.error('[instantly] Lead push failed:', l.email, lastError)
    }
  }

  console.log('[instantly] addLeadsToCampaign result:', { successCount, failed: validLeads.length - successCount })

  if (successCount > 0) {
    return { ok: true, data: { added: successCount, failed: validLeads.length - successCount } }
  }
  return { ok: false, error: lastError || 'All leads failed to push' }
}

// ─── Launch (activate) a campaign ────────────────────────────────────────────
// Instantly v2: PATCH /campaigns/:id with status=1 (Active)

export async function launchCampaign(campaignId: string) {
  return request(`/campaigns/${campaignId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 1 }),
  })
}

// ─── Pause a campaign ────────────────────────────────────────────────────────
// Instantly v2: PATCH /campaigns/:id with status=2 (Paused)

export async function pauseCampaign(campaignId: string) {
  return request(`/campaigns/${campaignId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 2 }),
  })
}

// ─── Get campaign analytics ──────────────────────────────────────────────────
// Instantly v2: GET /campaigns/analytics?id={campaign_id}

interface CampaignAnalytics {
  total_leads?: number
  leads_contacted?: number
  sent?: number
  open?: number
  unique_open?: number
  reply?: number
  unique_reply?: number
  bounce?: number
  click?: number
  unique_click?: number
}

export async function getCampaignAnalytics(campaignId: string) {
  return request<CampaignAnalytics[]>(
    `/campaigns/analytics?id=${campaignId}`
  )
}

// ─── Get leads for a campaign ────────────────────────────────────────────────
// Instantly v2: POST /leads/list (non-standard POST for listing)

export interface InstantlyLeadStatus {
  email: string
  first_name?: string
  last_name?: string
  company_name?: string
  lead_status?: string
  email_open_count?: number
  email_reply_count?: number
  email_click_count?: number
}

export async function getCampaignLeads(campaignId: string) {
  return request<{ items: InstantlyLeadStatus[] }>('/leads/list', {
    method: 'POST',
    body: JSON.stringify({
      campaign_id: campaignId,
      limit: 100,
    }),
  })
}
