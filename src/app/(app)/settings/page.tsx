'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  GripVertical,
  Plus,
  Trash2,
  AlertTriangle,
  LogOut,
  UserPlus,
  Shield,
  User,
  CheckCircle2,
  Circle,
  ArrowRight,
  Key,
  Rocket,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Stage {
  id: string
  name: string
  position: number
}

interface TeamMember {
  user_id: string
  email: string
  role: string
  contacts_count: number
  deals_count: number
  campaigns_count: number
}

const COMPANY_KEYS = ['company_name', 'company_phone', 'company_website', 'company_address', 'sending_email'] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'
const inputReadonlyClass =
  'w-full bg-white/[0.03] border border-white/5 rounded-lg px-4 py-2.5 text-sm text-blue-300/60 cursor-not-allowed'
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5'

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300 mb-5">{title}</h3>
      {children}
    </div>
  )
}

// ─── Getting Started Component ───────────────────────────────────────────────

function GettingStarted({ checklist, instantlyKey, setInstantlyKey, savingKey, saveInstantlyKey, setActiveTab, router }: {
  checklist: { hasProfile: boolean; hasInstantlyKey: boolean; hasContacts: boolean; hasCampaign: boolean; hasTeamMember: boolean }
  instantlyKey: string
  setInstantlyKey: (v: string) => void
  savingKey: boolean
  saveInstantlyKey: () => void
  setActiveTab: (v: string) => void
  router: { push: (url: string) => void }
}) {
  type CheckItem = { key: string; label: string; desc: string; link: string | null; action: (() => void) | null }
  const items: CheckItem[] = [
    { key: 'hasProfile', label: 'Complete your profile', desc: 'Set your display name and phone number', link: null, action: () => setActiveTab('settings') },
    { key: 'hasInstantlyKey', label: 'Add your Instantly API key', desc: 'Connect to Instantly.ai for email campaigns', link: null, action: null },
    { key: 'hasContacts', label: 'Import your contacts', desc: 'Upload a CSV or Excel file with your leads', link: '/contacts/import', action: null },
    { key: 'hasCampaign', label: 'Build your first campaign', desc: 'Create a 7-touch email sequence with AI', link: '/campaigns/ai-sequence', action: null },
  ]
  // Always show invite team item (hidden only if explicitly on rep plan with no admin access)
  items.push({ key: 'hasTeamMember', label: 'Invite a team member', desc: 'Add reps to your organization', link: null, action: () => { setActiveTab('settings'); setTimeout(() => document.getElementById('team-section')?.scrollIntoView({ behavior: 'smooth' }), 100) } })
  const completed = items.filter(i => checklist[i.key as keyof typeof checklist]).length
  const total = items.length
  const allDone = completed === total

  return (
    <div className="space-y-6">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">{allDone ? 'All set!' : 'Getting Started'}</h3>
          <span className="text-xs text-blue-300/50">{completed} of {total} complete</span>
        </div>
        <div className="w-full h-2 rounded-full bg-white/10">
          <div className="h-2 rounded-full transition-all" style={{ width: `${(completed / total) * 100}%`, backgroundColor: '#d4930e' }} />
        </div>
        {allDone && (
          <div className="mt-4 flex items-center gap-2">
            <Rocket className="w-5 h-5" style={{ color: '#d4930e' }} />
            <p className="text-sm text-white font-medium">LogiCRM is ready to go.</p>
          </div>
        )}
      </div>
      <div className="space-y-3">
        {items.map(item => {
          const done = checklist[item.key as keyof typeof checklist]
          return (
            <div key={item.key} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
              {done ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" /> : <Circle className="w-5 h-5 shrink-0 mt-0.5 text-blue-300/20" />}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${done ? 'text-emerald-400' : 'text-white'}`}>{item.label}</p>
                <p className="text-xs text-blue-300/40 mt-0.5">{item.desc}</p>
                {item.key === 'hasInstantlyKey' && !done && (
                  <div className="mt-3 flex items-center gap-2">
                    <Key className="w-4 h-4 text-blue-300/30 shrink-0" />
                    <input type="password" value={instantlyKey} onChange={e => setInstantlyKey(e.target.value)} placeholder="Paste your Instantly API key" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-blue-300/30 focus:outline-none focus:ring-2 focus:ring-yellow-500/50" />
                    <button onClick={saveInstantlyKey} disabled={savingKey} className="px-3 py-2 rounded-lg text-xs font-semibold hover:brightness-110 disabled:opacity-60 transition-colors" style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}>{savingKey ? 'Saving...' : 'Save'}</button>
                  </div>
                )}
              </div>
              {!done && item.key !== 'hasInstantlyKey' && (
                <button onClick={() => item.link ? router.push(item.link) : item.action?.()} className="text-xs font-medium flex items-center gap-1 shrink-0 transition-colors" style={{ color: '#d4930e' }}>
                  Go <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  // Profile
  const [currentUserId, setCurrentUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Company
  const [company, setCompany] = useState<Record<string, string>>({
    company_name: '',
    company_phone: '',
    company_website: '',
    company_address: '',
    sending_email: '',
  })
  const [savingCompany, setSavingCompany] = useState(false)

  // Pipeline Stages
  const [stages, setStages] = useState<Stage[]>([])
  const [savingStages, setSavingStages] = useState(false)

  // Gmail
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState('')
  const [gmailSyncing, setGmailSyncing] = useState(false)

  // Outlook
  const [outlookConnected, setOutlookConnected] = useState(false)
  const [outlookEmail, setOutlookEmail] = useState('')
  const [outlookSyncing, setOutlookSyncing] = useState(false)

  // Team
  const [orgName, setOrgName] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  // Danger zone
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Tabs + Onboarding
  const [activeTab, setActiveTab] = useState('getting-started')
  const [checklist, setChecklist] = useState({ hasProfile: false, hasInstantlyKey: false, hasContacts: false, hasCampaign: false, hasTeamMember: false })
  const [userPlan, setUserPlan] = useState<string | null>(null) // used in onboarding fetch
  void userPlan // suppress unused warning — plan loaded for future gating
  const [instantlyKey, setInstantlyKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setCurrentUserId(user.id)
    setUserEmail(user.email ?? '')

    // Display name from user metadata
    setDisplayName(user.user_metadata?.display_name ?? '')

    // Company settings — load from organizations table via API
    const compRes = await fetch(`/api/settings?userId=${user.id}`)
    const compData = await compRes.json()
    if (compData.company) {
      const c = compData.company
      // Use org name as fallback for company_name (handles null AND empty string)
      if ((!c.company_name || !c.company_name.trim()) && c.name) c.company_name = c.name
      setCompany(prev => ({ ...prev, ...c }))
    }

    // Pipeline stages
    const { data: stageData } = await supabase
      .from('pipeline_stages')
      .select('id, name, position')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
    setStages(stageData ?? [])

    // Gmail connection check via POST API (bypasses RLS)
    try {
      const gmailRes = await fetch('/api/gmail/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) })
      const gmailData = await gmailRes.json()
      if (gmailData.connected) { setGmailConnected(true); setGmailEmail(gmailData.email) }
    } catch (_e) { /* ignore */ } // eslint-disable-line @typescript-eslint/no-unused-vars

    // Outlook connection check via POST API (bypasses RLS)
    try {
      const outlookRes = await fetch('/api/outlook/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) })
      const outlookData = await outlookRes.json()
      if (outlookData.connected) { setOutlookConnected(true); setOutlookEmail(outlookData.email) }
    } catch (_e) { /* ignore */ } // eslint-disable-line @typescript-eslint/no-unused-vars

    // Check URL params for Outlook connect result
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('outlook') === 'connected') {
        toast.success('Outlook connected successfully!')
        setOutlookConnected(true)
        try {
          const recheck = await fetch('/api/outlook/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) })
          const recheckData = await recheck.json()
          if (recheckData.connected) { setOutlookEmail(recheckData.email) }
        } catch (_e) { /* ignore */ } // eslint-disable-line @typescript-eslint/no-unused-vars
      } else if (params.get('outlook') === 'error') {
        toast.error('Failed to connect Outlook')
      }
      if (params.get('tab')) {
        setActiveTab(params.get('tab') || 'getting-started')
      }
    }

    // Organization & team
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (membership) {
      setOrgId(membership.org_id)
      setIsAdmin(membership.role === 'admin')

      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', membership.org_id)
        .single()
      setOrgName(org?.name ?? '')

      // Load all members
      const { data: allMembers } = await supabase
        .from('organization_members')
        .select('user_id, role')
        .eq('org_id', membership.org_id)

      if (allMembers) {
        const memberUserIds = allMembers.map((m) => m.user_id)

        // Fetch stats for each member
        const [contactsCounts, dealsCounts, campaignsCounts] = await Promise.all([
          supabase.from('contacts').select('user_id', { count: 'exact' }).in('user_id', memberUserIds),
          supabase.from('leads').select('user_id', { count: 'exact' }).in('user_id', memberUserIds),
          supabase.from('email_campaigns').select('user_id', { count: 'exact' }).in('user_id', memberUserIds),
        ])

        // Count per user
        const countBy = (data: { user_id: string }[] | null) => {
          const map = new Map<string, number>()
          for (const row of data ?? []) {
            map.set(row.user_id, (map.get(row.user_id) ?? 0) + 1)
          }
          return map
        }

        const cMap = countBy(contactsCounts.data as { user_id: string }[] | null)
        const dMap = countBy(dealsCounts.data as { user_id: string }[] | null)
        const campMap = countBy(campaignsCounts.data as { user_id: string }[] | null)

        const emailMap = new Map<string, string>()
        emailMap.set(user.id, user.email ?? '')

        setMembers(
          allMembers.map((m) => ({
            user_id: m.user_id,
            email: emailMap.get(m.user_id) ?? m.user_id.slice(0, 8) + '...',
            role: m.role,
            contacts_count: cMap.get(m.user_id) ?? 0,
            deals_count: dMap.get(m.user_id) ?? 0,
            campaigns_count: campMap.get(m.user_id) ?? 0,
          }))
        )
      }
    }

    // Load onboarding checklist
    try {
      const obRes = await fetch(`/api/onboarding?userId=${user.id}`)
      const obData = await obRes.json()
      if (obData.checklist) setChecklist(obData.checklist)
      if (obData.plan) setUserPlan(obData.plan)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) { /* ignore */ }

    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Profile ──────────────────────────────────────────────────────────────

  async function saveProfile() {
    setSavingProfile(true)
    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName.trim() },
    })
    if (error) {
      console.error('Profile save failed:', error)
      toast.error(`Failed to save: ${error.message}`)
    } else {
      toast.success('Profile updated.')
    }
    setSavingProfile(false)
  }

  // ── Company ──────────────────────────────────────────────────────────────

  async function saveInstantlyKey() {
    if (!instantlyKey.trim()) { toast.error('Enter an API key'); return }
    setSavingKey(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingKey(false); return }
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, instantly_api_key: instantlyKey.trim() }),
    })
    if (res.ok) {
      toast.success('Instantly API key saved!')
      setChecklist(prev => ({ ...prev, hasInstantlyKey: true }))
    } else {
      toast.error('Failed to save API key')
    }
    setSavingKey(false)
  }

  async function saveCompany() {
    setSavingCompany(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingCompany(false); return }

    const settings = COMPANY_KEYS.map(key => ({ key, value: company[key]?.trim() ?? '' }))

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, settings }),
    })
    const data = await res.json()

    if (!res.ok) {
      console.error('[settings] Save failed:', data.error)
      toast.error('Failed to save: ' + (data.error || 'Unknown error'))
    } else {
      toast.success('Company info saved.')
    }
    setSavingCompany(false)
  }

  // ── Team Invite ─────────────────────────────────────────────────────────

  async function handleInvite() {
    if (!inviteEmail.trim() || !orgId) return
    setInviting(true)

    const { data: { user } } = await supabase.auth.getUser()

    const res = await fetch('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim(), org_id: orgId, inviter_id: user?.id }),
    })
    const data = await res.json()

    if (!res.ok) {
      toast.error(data.error || 'Invite failed')
      setInviting(false)
      return
    }

    toast.success(data.message || `Invite sent to ${inviteEmail}`)
    setInviteEmail('')
    setInviting(false)
    loadData()
  }

  // ── Gmail Sync ──────────────────────────────────────────────────────────

  async function handleGmailSync() {
    if (!gmailEmail) return
    setGmailSyncing(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    try {
      const res = await fetch('/api/gmail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, gmail_email: gmailEmail }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Sync failed') }
      else { toast.success(`${data.synced} emails synced as activities`) }
    } catch { toast.error('Sync failed') }
    setGmailSyncing(false)
  }

  async function handleOutlookSync() {
    setOutlookSyncing(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setOutlookSyncing(false); return }
    try {
      const res = await fetch('/api/outlook/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Sync failed') }
      else { toast.success(`${data.synced} emails synced as activities`) }
    } catch { toast.error('Outlook sync failed') }
    setOutlookSyncing(false)
  }

  async function handleOutlookDisconnect() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await fetch('/api/outlook/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id }),
    })
    setOutlookConnected(false)
    setOutlookEmail('')
    toast.success('Outlook disconnected')
  }

  // ── Pipeline Stages ──────────────────────────────────────────────────────

  function updateStage(idx: number, name: string) {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, name } : s)))
  }

  function moveStage(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= stages.length) return
    setStages((prev) => {
      const next = [...prev]
      const temp = next[idx]
      next[idx] = next[target]
      next[target] = temp
      return next.map((s, i) => ({ ...s, position: i }))
    })
  }

  function addStage() {
    setStages((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, name: '', position: prev.length },
    ])
  }

  function removeStage(idx: number) {
    setStages((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i })))
  }

  async function saveStages() {
    setSavingStages(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get existing stage ids
    const { data: existing } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('user_id', user.id)
    const existingIds = new Set((existing ?? []).map((s) => s.id))

    // Determine deletes, updates, inserts
    const currentIds = new Set(stages.filter((s) => !s.id.startsWith('new-')).map((s) => s.id))
    const toDelete = Array.from(existingIds).filter((id) => !currentIds.has(id))

    let hasError = false

    // Delete removed stages
    if (toDelete.length > 0) {
      const { error } = await supabase.from('pipeline_stages').delete().in('id', toDelete)
      if (error) { console.error('Stage delete failed:', error); hasError = true }
    }

    // Upsert remaining + new
    for (const stage of stages) {
      if (!stage.name.trim()) continue
      if (stage.id.startsWith('new-')) {
        const { error } = await supabase.from('pipeline_stages').insert({
          user_id: user.id,
          name: stage.name.trim(),
          position: stage.position,
        })
        if (error) { console.error('Stage insert failed:', error); hasError = true }
      } else {
        const { error } = await supabase
          .from('pipeline_stages')
          .update({ name: stage.name.trim(), position: stage.position })
          .eq('id', stage.id)
        if (error) { console.error('Stage update failed:', error); hasError = true }
      }
    }

    if (hasError) {
      toast.error('Some changes failed to save.')
    } else {
      toast.success('Pipeline stages saved.')
    }

    // Reload to sync IDs
    loadData()
    setSavingStages(false)
  }

  // ── Danger Zone ──────────────────────────────────────────────────────────

  async function handleDeleteAllContacts() {
    setDeleting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('contacts').delete().eq('user_id', user.id)
    if (error) {
      console.error('Delete all contacts failed:', error)
      toast.error(`Failed: ${error.message}`)
    } else {
      toast.success('All contacts deleted.')
    }
    setConfirmDelete(false)
    setDeleting(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <p className="text-blue-300 text-sm">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-10 max-w-3xl">
      <h2 className="text-2xl font-bold text-white mb-1">Settings</h2>
      <p className="text-blue-300 text-sm mb-6">Manage your account, company info, and pipeline.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10 pb-px">
        {[
          { id: 'getting-started', label: 'Getting Started' },
          { id: 'email', label: 'Email' },
          { id: 'settings', label: 'Settings' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id ? 'text-white' : 'text-blue-300/50 hover:text-blue-300'
            }`}
            style={activeTab === tab.id ? { backgroundColor: 'rgba(212,147,14,0.15)', color: '#d4930e' } : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Getting Started Tab */}
      {activeTab === 'getting-started' && <GettingStarted checklist={checklist} instantlyKey={instantlyKey} setInstantlyKey={setInstantlyKey} savingKey={savingKey} saveInstantlyKey={saveInstantlyKey} setActiveTab={setActiveTab} router={router} />}

      {/* Email Tab */}
      {activeTab === 'email' && (
      <div className="space-y-6">
        {/* Email Sync */}
        <SectionCard title="Email Sync">
          <p className="text-sm text-blue-300/60 mb-5">Connect your email to automatically log sent and received messages to your contacts.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Gmail */}
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
              <p className="text-sm font-semibold text-white mb-3">Gmail</p>
              {gmailConnected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <p className="text-xs text-blue-200">Connected as <span style={{ color: '#d4930e' }}>{gmailEmail}</span></p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleGmailSync} disabled={gmailSyncing} className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:brightness-110 disabled:opacity-60 transition-colors" style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}>
                      {gmailSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                  </div>
                </div>
              ) : (
                <a href="/api/gmail/connect" className="inline-block px-4 py-2 rounded-lg text-xs font-semibold hover:brightness-110 transition-colors" style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}>
                  Connect Gmail
                </a>
              )}
            </div>

            {/* Outlook */}
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
              <p className="text-sm font-semibold text-white mb-3">Outlook</p>
              {outlookConnected ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <p className="text-xs text-blue-200">Connected as <span style={{ color: '#d4930e' }}>{outlookEmail}</span></p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleOutlookSync} disabled={outlookSyncing} className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:brightness-110 disabled:opacity-60 transition-colors" style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}>
                      {outlookSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <button onClick={handleOutlookDisconnect} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400 border border-red-400/20 hover:bg-red-500/10 transition-colors">
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <a href={`/api/outlook/connect?userId=${currentUserId}`} className="inline-block px-4 py-2 rounded-lg text-xs font-semibold hover:brightness-110 transition-colors" style={{ backgroundColor: '#0078d4', color: '#fff' }}>
                  Connect Outlook
                </a>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Email Signature */}
        <SectionCard title="Email Signature">
          <div className="space-y-4">
            <div className="rounded-lg p-4 text-sm leading-relaxed" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-white font-medium">{displayName || 'Your Name'}</p>
              <p className="text-blue-300/60">{company.company_name || orgName || 'Your Company'}</p>
              {company.company_phone && <p className="text-blue-300/50 text-xs">{company.company_phone}</p>}
              <p className="text-blue-300/40 text-xs">{userEmail || 'you@company.com'}</p>
              {company.company_website && <p className="text-blue-300/40 text-xs">{company.company_website}</p>}
            </div>
            <p className="text-[10px] text-blue-300/30">Edit your name in the Profile tab and company info in Settings to update this signature.</p>
          </div>
        </SectionCard>

        {/* Sending Address */}
        <SectionCard title="Outreach Sending Address">
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Sending Email</label>
              <input
                type="email"
                value={company.sending_email || ''}
                onChange={e => setCompany(p => ({ ...p, sending_email: e.target.value }))}
                placeholder="yourname@yourdomain.com"
                className={inputClass}
              />
              <p className="text-[10px] text-blue-300/30 mt-1">Used for Instantly campaigns. Usually your warmed-up outreach domain.</p>
            </div>
            <button
              onClick={saveCompany}
              disabled={savingCompany}
              className="px-4 py-2 rounded-lg font-semibold text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
              style={{ backgroundColor: '#d4930e', color: '#0f1c35' }}
            >
              {savingCompany ? 'Saving...' : 'Save'}
            </button>
          </div>
        </SectionCard>
      </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
      <div className="space-y-6">
        {/* ── Profile ─────────────────────────────────────────────────────── */}
        <SectionCard title="Profile">
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" value={userEmail} readOnly className={inputReadonlyClass} />
            </div>
            <div>
              <label className={labelClass}>Display Name</label>
              <input
                type="text"
                placeholder="Jarrett Bailey"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputClass}
              />
            </div>
            {/* Signature preview */}
            <div>
              <label className={labelClass}>Email Signature Preview</label>
              <div className="rounded-lg p-4 text-sm leading-relaxed" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-white font-medium">{displayName || 'Your Name'}</p>
                <p className="text-blue-300/60">{company.company_name || orgName || 'Your Company'}</p>
                {company.company_phone && <p className="text-blue-300/50 text-xs">{company.company_phone}</p>}
                <p className="text-blue-300/40 text-xs">{userEmail || 'you@company.com'}</p>
                {company.company_website && <p className="text-blue-300/40 text-xs">{company.company_website}</p>}
              </div>
              <p className="text-[10px] text-blue-300/30 mt-1">This signature is automatically appended to AI-generated email sequences.</p>
            </div>

            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </SectionCard>

        {/* ── Company Info ────────────────────────────────────────────────── */}
        <SectionCard title="Company Info">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Company Name</label>
                <input
                  type="text"
                  placeholder="Bid Genie AI"
                  value={company.company_name}
                  onChange={(e) => setCompany((p) => ({ ...p, company_name: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  type="tel"
                  placeholder="(901) 555-0100"
                  value={company.company_phone}
                  onChange={(e) => setCompany((p) => ({ ...p, company_phone: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Website</label>
              <input
                type="url"
                placeholder="https://macologistics.com"
                value={company.company_website}
                onChange={(e) => setCompany((p) => ({ ...p, company_website: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Address</label>
              <input
                type="text"
                placeholder="123 Freight Blvd, Memphis, TN 38103"
                value={company.company_address}
                onChange={(e) => setCompany((p) => ({ ...p, company_address: e.target.value }))}
                className={inputClass}
              />
            </div>
            <button
              onClick={saveCompany}
              disabled={savingCompany}
              className="px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              {savingCompany ? 'Saving...' : 'Save Company Info'}
            </button>
          </div>
        </SectionCard>

        {/* ── Team ───────────────────────────────────────────────────────── */}
        {orgId && (
          <div id="team-section"><SectionCard title={`Team — ${orgName}`}>
            <div className="space-y-4">
              {/* Members list */}
              <div className="space-y-2">
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: m.role === 'admin' ? 'rgba(212,147,14,0.15)' : 'rgba(96,165,250,0.1)' }}>
                      {m.role === 'admin' ? (
                        <Shield className="w-4 h-4" style={{ color: '#d4930e' }} />
                      ) : (
                        <User className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate">{m.email}</p>
                      <span className={`text-[10px] font-semibold uppercase ${
                        m.role === 'admin' ? 'text-yellow-400' : 'text-blue-400'
                      }`}>
                        {m.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-center">
                      <div>
                        <p className="text-sm font-bold text-white">{m.contacts_count}</p>
                        <p className="text-[9px] uppercase tracking-wide text-blue-300/40">Contacts</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{m.deals_count}</p>
                        <p className="text-[9px] uppercase tracking-wide text-blue-300/40">Deals</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{m.campaigns_count}</p>
                        <p className="text-[9px] uppercase tracking-wide text-blue-300/40">Campaigns</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Invite */}
              {isAdmin && (
                <div className="pt-2">
                  <label className={labelClass}>Invite Team Member</label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="teammate@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                      className={inputClass}
                    />
                    <button
                      onClick={handleInvite}
                      disabled={inviting || !inviteEmail.trim()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors shrink-0"
                      style={{ backgroundColor: '#d4930e' }}
                    >
                      <UserPlus className="w-4 h-4" />
                      {inviting ? 'Sending...' : 'Invite'}
                    </button>
                  </div>
                  <p className="text-blue-300/40 text-xs mt-1.5">They&apos;ll receive a login link and be added as a rep.</p>
                </div>
              )}
            </div>
          </SectionCard></div>
        )}

        {/* ── Pipeline Stages ─────────────────────────────────────────────── */}
        <SectionCard title="Pipeline Stages">
          <div className="space-y-2 mb-4">
            {stages.length === 0 && (
              <p className="text-blue-300/40 text-sm py-4 text-center">No stages yet. Add one below.</p>
            )}
            {stages.map((stage, idx) => (
              <div
                key={stage.id}
                className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2"
              >
                <GripVertical className="w-4 h-4 text-blue-300/30 shrink-0" />
                <span className="text-xs text-blue-300/40 w-5 shrink-0">{idx + 1}</span>
                <input
                  type="text"
                  value={stage.name}
                  onChange={(e) => updateStage(idx, e.target.value)}
                  placeholder="Stage name"
                  className="flex-1 bg-transparent border-none text-sm text-white placeholder-blue-300/30 focus:outline-none"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => moveStage(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded text-blue-300/40 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-colors text-xs"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveStage(idx, 1)}
                    disabled={idx === stages.length - 1}
                    className="p-1 rounded text-blue-300/40 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-colors text-xs"
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => removeStage(idx)}
                    className="p-1 rounded text-blue-300/40 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={addStage}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Stage
            </button>
            <button
              onClick={saveStages}
              disabled={savingStages}
              className="px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              {savingStages ? 'Saving...' : 'Save Stages'}
            </button>
          </div>
        </SectionCard>

        {/* ── Danger Zone ─────────────────────────────────────────────────── */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 sm:p-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-red-400 mb-5">Danger Zone</h3>

          <div className="space-y-4">
            {/* Delete All Contacts */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white font-medium">Delete all contacts</p>
                <p className="text-xs text-blue-300/50">Permanently removes every contact from your account.</p>
              </div>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete All
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleDeleteAllContacts}
                    disabled={deleting}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-blue-300 border border-white/10 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Sign Out */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-red-500/10">
              <div>
                <p className="text-sm text-white font-medium">Sign out</p>
                <p className="text-xs text-blue-300/50">End your current session.</p>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors shrink-0"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
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
