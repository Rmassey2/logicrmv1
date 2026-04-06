'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  FileEdit,
  Send,
  CheckCircle2,
  Users,
  Eye,
  MessageSquare,
  Rocket,
  Pause,
  RefreshCw,
  Trash2,
  Plus,
  Search,
  X,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Campaign {
  id: string
  name: string
  subject: string
  body: string | null
  status: string | null
  instantly_campaign_id: string | null
  recipient_count: number | null
  sent_count: number | null
  open_count: number | null
  reply_count: number | null
  created_at: string
}

interface EnrolledContact {
  id: string
  contact_id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  email: string | null
  status: string | null
}

const CAMPAIGN_STATUS_CONFIG: Record<string, { label: string; cls: string; icon: typeof FileEdit }> = {
  draft:     { label: 'Draft',     cls: 'bg-blue-500/10 text-blue-400',       icon: FileEdit },
  active:    { label: 'Active',    cls: 'bg-yellow-500/10 text-yellow-400',   icon: Send },
  paused:    { label: 'Paused',    cls: 'bg-orange-500/10 text-orange-400',   icon: Pause },
  completed: { label: 'Completed', cls: 'bg-emerald-500/10 text-emerald-400', icon: CheckCircle2 },
}

const CONTACT_STATUS_STYLES: Record<string, string> = {
  enrolled:      'bg-white/5 text-blue-300/50',
  sent:          'bg-blue-500/10 text-blue-400',
  opened:        'bg-yellow-500/10 text-yellow-400',
  replied:       'bg-emerald-500/10 text-emerald-400',
  converted:     'bg-purple-500/10 text-purple-400',
  bounced:       'bg-red-500/10 text-red-400',
  unsubscribed:  'bg-red-500/10 text-red-400',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [contacts, setContacts] = useState<EnrolledContact[]>([])
  const [launching, setLaunching] = useState(false)
  const [pausing, setPausing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [sequences, setSequences] = useState<{ touch: number; day: number; label: string; subject: string; body: string }[]>([])

  // Add contacts modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [allContacts, setAllContacts] = useState<{ id: string; first_name: string; last_name: string; company: string; email: string }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [contactSearch, setContactSearch] = useState('')
  const [addingContacts, setAddingContacts] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [activeCampaignMap, setActiveCampaignMap] = useState<Map<string, string>>(new Map())
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; message: string; onConfirm: () => void }>({ show: false, message: '', onConfirm: () => {} })

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: camp, error } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !camp) {
      toast.error('Campaign not found')
      router.push('/campaigns')
      return
    }
    setCampaign(camp as Campaign)

    const { data: rawEnrollments, error: enrollErr } = await supabase
      .from('campaign_contacts')
      .select('id, contact_id, status, user_id')
      .eq('campaign_id', id)

    console.log('[campaign] Raw enrollments:', rawEnrollments, 'error:', enrollErr)

    // Filter in JS so NULL status rows are included (only exclude 'removed')
    const enrollments = (rawEnrollments ?? []).filter(e => e.status !== 'removed')

    if (enrollments.length > 0) {
      const contactIds = enrollments.map(e => e.contact_id)
      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, company, email')
        .in('id', contactIds)

      const contactMap = new Map(
        (contactData ?? []).map(c => [c.id, c])
      )

      setContacts(
        enrollments.map(e => {
          const c = contactMap.get(e.contact_id)
          return {
            id: e.id,
            contact_id: e.contact_id,
            first_name: c?.first_name ?? null,
            last_name: c?.last_name ?? null,
            company: c?.company ?? null,
            email: c?.email ?? null,
            status: e.status ?? 'enrolled',
          }
        })
      )
    } else {
      setContacts([])
    }

    // Fetch email sequences
    const { data: seqData } = await supabase
      .from('email_sequences')
      .select('touch_number, day_number, label, subject, body')
      .eq('campaign_id', id)
      .order('touch_number', { ascending: true })

    if (seqData && seqData.length > 0) {
      setSequences(seqData.map(s => ({
        touch: s.touch_number,
        day: s.day_number,
        label: s.label ?? '',
        subject: s.subject ?? '',
        body: s.body ?? '',
      })))
    } else if (camp.body) {
      // Parse legacy concatenated body format: "--- Touch X (Day Y): Label ---\nSubject: ...\n\n..."
      const touches = camp.body.split(/---\s*Touch\s+/).filter(Boolean)
      const parsed: typeof sequences = []
      for (const block of touches) {
        const headerMatch = block.match(/^(\d+)\s*\(Day\s*(\d+)\):\s*(.+?)\s*---\s*\n/)
        if (!headerMatch) continue
        const touchNum = parseInt(headerMatch[1])
        const dayNum = parseInt(headerMatch[2])
        const label = headerMatch[3].trim()
        const rest = block.slice(headerMatch[0].length)
        const subjectMatch = rest.match(/^Subject:\s*(.+)\n\n/)
        const subject = subjectMatch ? subjectMatch[1].trim() : ''
        const body = subjectMatch ? rest.slice(subjectMatch[0].length).trim() : rest.trim()
        parsed.push({ touch: touchNum, day: dayNum, label, subject, body })
      }
      if (parsed.length > 0) setSequences(parsed)
    }

    setLoading(false)
  }, [id, router])

  useEffect(() => { loadData() }, [loadData])

  // ── Launch campaign ────────────────────────────────────────────────────────

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    }
  }

  async function handleLaunch() {
    setLaunching(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/campaigns/launch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ campaign_id: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error('Launch failed:', data)
        toast.error(data.error ?? 'Launch failed')
      } else {
        toast.success(`Campaign launched! ${data.leads_added} leads added to Instantly.`)
        loadData()
      }
    } catch (err) {
      console.error('Launch error:', err)
      toast.error('Launch failed')
    }
    setLaunching(false)
  }

  // ── Pause campaign ─────────────────────────────────────────────────────────

  async function handlePause() {
    setPausing(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/campaigns/launch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ campaign_id: id, action: 'pause' }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Pause failed')
      } else {
        toast.success('Campaign paused')
        loadData()
      }
    } catch {
      toast.error('Pause failed')
    }
    setPausing(false)
  }

  // ── Sync stats ─────────────────────────────────────────────────────────────

  async function handleSync() {
    setSyncing(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/campaigns/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ campaign_id: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Sync failed')
      } else {
        toast.success('Stats synced from Instantly')
        loadData()
      }
    } catch {
      toast.error('Sync failed')
    }
    setSyncing(false)
  }

  // ── Remove contact ─────────────────────────────────────────────────────────

  function handleRemoveContact(enrollmentId: string, contactName: string) {
    setConfirmModal({
      show: true,
      message: `Remove ${contactName} from this campaign?`,
      onConfirm: async () => {
        const { error } = await supabase
          .from('campaign_contacts')
          .update({ status: 'removed' })
          .eq('id', enrollmentId)

        if (error) {
          toast.error('Failed to remove contact')
        } else {
          setContacts(prev => prev.filter(c => c.id !== enrollmentId))
          toast.success('Contact removed from campaign')
        }
      },
    })
  }

  // ── Add contacts modal ─────────────────────────────────────────────────────

  async function openAddModal() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const [contactsRes, enrollmentsRes] = await Promise.all([
      supabase.from('contacts').select('id, first_name, last_name, company, email').eq('user_id', user.id).order('first_name'),
      supabase.from('campaign_contacts').select('contact_id, campaign_id').eq('status', 'active'),
    ])

    setAllContacts(contactsRes.data ?? [])

    // Build map: contact_id → campaign name (for contacts in OTHER campaigns)
    const enrollments = (enrollmentsRes.data ?? []).filter(e => e.campaign_id !== id)
    if (enrollments.length > 0) {
      const campIds = Array.from(new Set(enrollments.map(e => e.campaign_id)))
      const { data: camps } = await supabase.from('email_campaigns').select('id, name').in('id', campIds)
      const campNameMap = new Map((camps ?? []).map(c => [c.id, c.name]))
      const map = new Map<string, string>()
      for (const e of enrollments) {
        if (!map.has(e.contact_id)) {
          map.set(e.contact_id, campNameMap.get(e.campaign_id) || 'another campaign')
        }
      }
      setActiveCampaignMap(map)
    } else {
      setActiveCampaignMap(new Map())
    }

    setSelectedIds(new Set())
    setContactSearch('')
    setShowAddModal(true)
  }

  function toggleContactSelection(cid: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid); else next.add(cid)
      return next
    })
  }

  function handleAddContactsClick() {
    if (selectedIds.size === 0) return
    // If campaign is live on Instantly, show confirmation
    if (campaign?.instantly_campaign_id) {
      setShowConfirm(true)
    } else {
      doAddContacts()
    }
  }

  async function doAddContacts() {
    setShowConfirm(false)
    if (selectedIds.size === 0) return
    setAddingContacts(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Server-side dedup: fetch ALL existing rows for this campaign + selected contacts
    const selectedArr = Array.from(selectedIds)
    const { data: existingRows, error: dedupErr } = await supabase
      .from('campaign_contacts')
      .select('contact_id, status')
      .eq('campaign_id', id)
      .in('contact_id', selectedArr)

    console.log('[add-contacts] Dedup check:', { selectedArr, existingRows, dedupErr })

    // Build map — if multiple rows exist for same contact, prefer 'active'
    const existingMap = new Map<string, string>()
    for (const r of (existingRows ?? [])) {
      const current = existingMap.get(r.contact_id)
      if (!current || r.status === 'active') {
        existingMap.set(r.contact_id, r.status)
      }
    }

    const toReactivate: string[] = []
    const toInsert: string[] = []
    let alreadyActive = 0

    for (const cid of selectedArr) {
      const status = existingMap.get(cid)
      if (status === 'active') { alreadyActive++; continue }
      if (status === 'removed') toReactivate.push(cid)
      else toInsert.push(cid)
    }

    if (toReactivate.length === 0 && toInsert.length === 0) {
      toast.error(`All ${alreadyActive} selected contact${alreadyActive !== 1 ? 's are' : ' is'} already enrolled`)
      setAddingContacts(false)
      return
    }

    // Remove contacts from any other active campaign first (one-campaign rule)
    const allMoving = [...toReactivate, ...toInsert]
    if (allMoving.length > 0) {
      await supabase
        .from('campaign_contacts')
        .update({ status: 'removed' })
        .eq('status', 'active')
        .neq('campaign_id', id)
        .in('contact_id', allMoving)
    }

    // Re-activate removed contacts
    for (const cid of toReactivate) {
      await supabase.from('campaign_contacts').update({ status: 'active' }).eq('campaign_id', id).eq('contact_id', cid)
    }

    // Insert new contacts one at a time to avoid dupe constraint violations
    let insertFailed = 0
    for (const contact_id of toInsert) {
      const { error } = await supabase.from('campaign_contacts').insert({
        campaign_id: id,
        contact_id,
        user_id: user.id,
        status: 'active',
      })
      if (error) {
        console.error('[add-contacts] Insert failed for', contact_id, error.message)
        insertFailed++
      }
    }

    if (insertFailed > 0 && insertFailed === toInsert.length && toReactivate.length === 0) {
      toast.error('Failed to add contacts — they may already be enrolled')
      setAddingContacts(false)
      return
    }

    const allAdded = [...toReactivate, ...toInsert]
    const totalAdded = allAdded.length

    // Push to Instantly if campaign is live
    if (campaign?.instantly_campaign_id) {
      let pushFailed = 0
      let lastError = ''
      for (const contactId of allAdded) {
        try {
          const res = await fetch('/api/instantly/push-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact_id: contactId, instantly_campaign_id: campaign.instantly_campaign_id }),
          })
          if (!res.ok) {
            const errData = await res.json().catch(() => ({ error: 'Unknown' }))
            lastError = errData.error || `HTTP ${res.status}`
            console.error('[campaign] Instantly push failed:', lastError)
            pushFailed++
          }
        } catch (err) { lastError = String(err); pushFailed++ }
      }
      if (pushFailed > 0) {
        toast.error(`Instantly push failed: ${lastError}`, { duration: 8000 })
      } else {
        toast.success(`${totalAdded} contact${totalAdded !== 1 ? 's' : ''} added and live on Instantly!`)
      }
    } else {
      toast.success(`${totalAdded} contact${totalAdded !== 1 ? 's' : ''} added (not pushed to Instantly — campaign not launched yet)`)
    }

    setShowAddModal(false)
    loadData()
    setAddingContacts(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <p className="text-blue-300 text-sm">Loading campaign...</p>
      </div>
    )
  }

  if (!campaign) return null

  const cfg = CAMPAIGN_STATUS_CONFIG[campaign.status ?? 'draft'] ?? CAMPAIGN_STATUS_CONFIG.draft
  const StatusIcon = cfg.icon
  const isDraft = campaign.status === 'draft' || !campaign.status
  const isActive = campaign.status === 'active'
  const hasInstantly = !!campaign.instantly_campaign_id

  const recipientCount = campaign.recipient_count ?? contacts.length
  const sentCount = campaign.sent_count ?? 0
  const openCount = campaign.open_count ?? 0
  const replyCount = campaign.reply_count ?? 0
  const openRate = sentCount > 0 ? Math.round((openCount / sentCount) * 100) : 0
  const replyRate = sentCount > 0 ? Math.round((replyCount / sentCount) * 100) : 0

  const stats = [
    { label: 'Recipients', value: recipientCount, icon: Users },
    { label: 'Sent', value: sentCount, icon: Send },
    { label: 'Open Rate', value: `${openRate}%`, icon: Eye },
    { label: 'Reply Rate', value: `${replyRate}%`, icon: MessageSquare },
  ]

  return (
    <div className="px-8 py-10 max-w-5xl">
      {/* Back link */}
      <button
        onClick={() => router.push('/campaigns')}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaigns
      </button>

      {/* Header card */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{campaign.name}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cfg.cls}`}>
                <StatusIcon className="w-3 h-3" />
                {cfg.label}
              </span>
              <span className="text-xs text-blue-300/40">Created {formatDate(campaign.created_at)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Contacts
            </button>
            {isDraft && (
              <button
                onClick={handleLaunch}
                disabled={launching}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
                style={{ backgroundColor: '#d4930e' }}
              >
                <Rocket className="w-4 h-4" />
                {launching ? 'Launching...' : 'Launch Campaign'}
              </button>
            )}
            {isActive && (
              <button
                onClick={handlePause}
                disabled={pausing}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-orange-400 border border-orange-500/30 hover:bg-orange-500/10 disabled:opacity-60 transition-colors"
              >
                <Pause className="w-4 h-4" />
                {pausing ? 'Pausing...' : 'Pause'}
              </button>
            )}
            {hasInstantly && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 disabled:opacity-60 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Stats'}
              </button>
            )}
          </div>
        </div>

        {/* Subject line */}
        <div className="mt-5 pt-5 border-t border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50 mb-1">Subject Line</p>
          <p className="text-sm text-white">{campaign.subject}</p>
        </div>

        {/* Body preview — show as sequence cards if parsed, or raw fallback */}
        {sequences.length > 0 ? null : campaign.body && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50 mb-1">Email Body</p>
            <p className="text-sm text-blue-200/70 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {campaign.body}
            </p>
          </div>
        )}
      </div>

      {/* Sequence touches */}
      {sequences.length > 0 && (
        <div className="space-y-3 mb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">Email Sequence ({sequences.length} touches)</h3>
          {sequences.map(s => (
            <div key={s.touch} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/10 flex items-center gap-3">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{ backgroundColor: 'rgba(212,147,14,0.15)', color: '#d4930e' }}
                >
                  {s.touch}
                </span>
                <div>
                  <p className="text-xs font-medium text-white">Touch {s.touch}</p>
                  <p className="text-[10px] text-blue-300/40">Day {s.day}{s.label ? ` · ${s.label}` : ''}</p>
                </div>
              </div>
              <div className="p-5 space-y-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-300/40 mb-0.5">Subject</p>
                  <p className="text-sm text-white">{s.subject}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-300/40 mb-0.5">Body</p>
                  <p className="text-xs text-blue-200/70 whitespace-pre-wrap leading-relaxed">{s.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {stats.map(s => (
          <div
            key={s.label}
            className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center"
          >
            <s.icon className="w-5 h-5 mx-auto mb-2" style={{ color: '#d4930e' }} />
            <p className="text-2xl font-bold text-white">{s.value}</p>
            <p className="text-[10px] uppercase tracking-wide text-blue-300/50 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Enrolled contacts table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">
            Enrolled Contacts ({contacts.length})
          </h3>
        </div>

        {contacts.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Users className="w-8 h-8 mx-auto mb-3 text-blue-300/30" />
            <p className="text-blue-300/50 text-sm">No contacts enrolled in this campaign.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300">Name</th>
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300">Company</th>
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300 hidden sm:table-cell">Email</th>
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300">Status</th>
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'
                  const statusStyle = CONTACT_STATUS_STYLES[c.status ?? 'enrolled'] ?? CONTACT_STATUS_STYLES.enrolled
                  return (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                      <td className="px-5 py-3.5 text-sm whitespace-nowrap">
                        <Link
                          href={`/contacts/${c.contact_id}`}
                          className="font-medium hover:underline"
                          style={{ color: '#d4930e' }}
                        >
                          {name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-blue-200 whitespace-nowrap">
                        {c.company || '\u2014'}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-blue-200 whitespace-nowrap hidden sm:table-cell">
                        {c.email || '\u2014'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold capitalize ${statusStyle}`}>
                          {c.status ?? 'enrolled'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <button
                          onClick={() => handleRemoveContact(c.id, [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed')}
                          className="text-blue-300/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          title="Remove from campaign"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Contacts Modal ── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}
        >
          <div className="w-full max-w-lg rounded-2xl p-6 space-y-4 max-h-[80vh] flex flex-col" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Add Contacts to Campaign</h3>
              <button onClick={() => setShowAddModal(false)} className="text-blue-300/50 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-300/40" />
              <input
                type="text"
                placeholder="Search by name, company, or email..."
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {(() => {
                const enrolledIds = new Set(contacts.map(c => c.contact_id))
                const q = contactSearch.toLowerCase()
                const filtered = allContacts.filter(c => {
                  const name = `${c.first_name} ${c.last_name}`.toLowerCase()
                  return name.includes(q) || (c.company || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
                })
                if (filtered.length === 0) return <p className="text-blue-300/40 text-sm text-center py-6">No contacts found</p>
                return filtered.map(c => {
                  const already = enrolledIds.has(c.id)
                  const otherCampaign = activeCampaignMap.get(c.id)
                  const selected = selectedIds.has(c.id)
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${already ? 'opacity-40' : selected ? 'bg-white/10' : 'hover:bg-white/5'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={already}
                        onChange={() => toggleContactSelection(c.id)}
                        className="accent-[#d4930e] w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{c.first_name} {c.last_name}</p>
                        <p className="text-xs text-blue-300/50 truncate">{c.company || ''}{c.company && c.email ? ' · ' : ''}{c.email || ''}</p>
                      </div>
                      {already ? (
                        <span className="text-[10px] text-blue-300/40 shrink-0">Enrolled</span>
                      ) : otherCampaign ? (
                        <span className="text-[10px] text-orange-400/70 shrink-0">In: {otherCampaign}</span>
                      ) : null}
                    </label>
                  )
                })
              })()}
            </div>

            <button
              onClick={handleAddContactsClick}
              disabled={selectedIds.size === 0 || addingContacts}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-40 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              <Plus className="w-4 h-4" />
              {addingContacts ? 'Adding...' : `Add ${selectedIds.size} Contact${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Confirm Launch Modal ── */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false) }}
        >
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ backgroundColor: '#0f1c35', border: '1px solid rgba(255,255,255,0.1)' }}>
            <p className="text-2xl text-center">🚀</p>
            <h3 className="text-lg font-bold text-white text-center">This contact will go live immediately</h3>
            <p className="text-sm text-blue-300/70 text-center">
              {selectedIds.size} contact{selectedIds.size !== 1 ? 's' : ''} will be added to <strong className="text-white">{campaign?.name}</strong> and their email sequence will start within 24 hours on Instantly.ai.
            </p>
            <p className="text-xs text-blue-300/50 text-center">Are you sure you want to proceed?</p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={doAddContacts}
                disabled={addingContacts}
                className="flex-1 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
                style={{ backgroundColor: '#d4930e' }}
              >
                {addingContacts ? 'Adding...' : 'Yes, Add & Launch'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: '#162847', border: '1px solid rgba(212,147,14,0.3)' }}>
            <p className="text-sm mb-6" style={{ color: '#f4f1eb' }}>{confirmModal.message}</p>
            <div className="flex gap-3">
              <button onClick={() => { confirmModal.onConfirm(); setConfirmModal({ show: false, message: '', onConfirm: () => {} }) }} className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ background: '#d4930e', color: '#0f1c35' }}>Confirm</button>
              <button onClick={() => setConfirmModal({ show: false, message: '', onConfirm: () => {} })} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'rgba(138,154,181,0.1)', color: '#8a9ab5' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-blue-400/50 text-xs mt-16">
        2026 Bid Genie AI · LogiCRM
      </p>
    </div>
  )
}
