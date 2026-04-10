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

const COMPANY_KEYS = ['company_name', 'company_phone', 'company_website', 'company_address'] as const

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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  // Profile
  const [userEmail, setUserEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // Company
  const [company, setCompany] = useState<Record<string, string>>({
    company_name: '',
    company_phone: '',
    company_website: '',
    company_address: '',
  })
  const [savingCompany, setSavingCompany] = useState(false)

  // Pipeline Stages
  const [stages, setStages] = useState<Stage[]>([])
  const [savingStages, setSavingStages] = useState(false)

  // Gmail
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState('')
  const [gmailSyncing, setGmailSyncing] = useState(false)

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

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserEmail(user.email ?? '')

    // Display name from user metadata
    setDisplayName(user.user_metadata?.display_name ?? '')

    // Company settings — load from organizations table via API
    const compRes = await fetch(`/api/settings?userId=${user.id}`)
    const compData = await compRes.json()
    if (compData.company) {
      setCompany(prev => ({ ...prev, ...compData.company }))
    }

    // Pipeline stages
    const { data: stageData } = await supabase
      .from('pipeline_stages')
      .select('id, name, position')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
    setStages(stageData ?? [])

    // Gmail connection check
    const { data: gmailSetting } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', user.email ?? '')
      .eq('key', 'gmail_email')
      .maybeSingle()
    if (gmailSetting?.value) {
      setGmailConnected(true)
      setGmailEmail(gmailSetting.value)
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

    // Send a magic link invite via Supabase auth
    const { error: inviteError } = await supabase.auth.signInWithOtp({
      email: inviteEmail.trim(),
      options: { shouldCreateUser: true },
    })

    if (inviteError) {
      console.error('Invite failed:', inviteError)
      toast.error(`Invite failed: ${inviteError.message}`)
      setInviting(false)
      return
    }

    // Store a pending invite record so the signup flow can match them to this org
    const { error: inviteRecordError } = await supabase.from('user_settings').upsert(
      { user_id: orgId, key: `invite:${inviteEmail.trim().toLowerCase()}`, value: 'rep' },
      { onConflict: 'user_id,key' }
    )
    if (inviteRecordError) {
      console.error('Invite record failed:', inviteRecordError)
    }

    toast.success(`Invite sent to ${inviteEmail}`)
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
      <p className="text-blue-300 text-sm mb-8">Manage your account, company info, and pipeline.</p>

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
                <p className="text-blue-300/60">{company.company_name || 'Your Company'}</p>
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

        {/* ── Gmail Integration ─────────────────────────────────────────── */}
        <SectionCard title="Gmail Integration">
          {gmailConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                <p className="text-sm text-white">Connected as <span style={{ color: '#d4930e' }}>{gmailEmail}</span></p>
              </div>
              <button
                onClick={handleGmailSync}
                disabled={gmailSyncing}
                className="px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
                style={{ backgroundColor: '#d4930e' }}
              >
                {gmailSyncing ? 'Syncing...' : 'Sync Emails Now'}
              </button>
              <p className="text-blue-300/40 text-xs">Syncs sent emails and matches them to your contacts as activities.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-blue-300/60">Connect your Gmail to automatically sync email activity with your contacts.</p>
              <a
                href="/api/gmail/connect"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
                style={{ backgroundColor: '#d4930e' }}
              >
                Connect Gmail
              </a>
            </div>
          )}
        </SectionCard>

        {/* ── Team ───────────────────────────────────────────────────────── */}
        {orgId && (
          <SectionCard title={`Team — ${orgName}`}>
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
          </SectionCard>
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

      {/* Footer */}
      <p className="text-center text-blue-400/50 text-xs mt-16">
        2026 Bid Genie AI · LogiCRM
      </p>
    </div>
  )
}
