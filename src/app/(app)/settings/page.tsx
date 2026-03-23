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

    // Company settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('key, value')
      .eq('user_id', user.id)
      .in('key', [...COMPANY_KEYS])

    if (settings) {
      const map: Record<string, string> = {}
      for (const s of settings) map[s.key] = s.value ?? ''
      setCompany((prev) => ({ ...prev, ...map }))
    }

    // Pipeline stages
    const { data: stageData } = await supabase
      .from('pipeline_stages')
      .select('id, name, position')
      .eq('user_id', user.id)
      .order('position', { ascending: true })
    setStages(stageData ?? [])

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
    if (!user) return

    for (const key of COMPANY_KEYS) {
      const value = company[key]?.trim() ?? ''
      await supabase
        .from('user_settings')
        .upsert(
          { user_id: user.id, key, value },
          { onConflict: 'user_id,key' }
        )
    }

    toast.success('Company info saved.')
    setSavingCompany(false)
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
    const toDelete = [...existingIds].filter((id) => !currentIds.has(id))

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
                placeholder="Randall Massey"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputClass}
              />
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
                  placeholder="Maco Logistics"
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
        2026 Maco Logistics · LogiCRM
      </p>
    </div>
  )
}
