'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, X, DollarSign, TrendingUp, GripVertical, Search, Filter } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stage {
  id: string
  name: string
  position: number
}

interface Lead {
  id: string
  title: string
  stage_id: string
  value: number | null
  contact_id: string | null
  created_at: string
  user_id?: string
  last_activity_at?: string | null
  rep_name?: string
  contact?: {
    first_name: string | null
    last_name: string | null
    company: string | null
  }
}

interface OrgMember {
  user_id: string
  name: string
  role: string
}

interface ContactOption {
  id: string
  first_name: string | null
  last_name: string | null
  company: string | null
}

// ─── Sortable Lead Card ──────────────────────────────────────────────────────

function LeadCard({ lead, isDragOverlay }: { lead: Lead; isDragOverlay?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { type: 'lead', stageId: lead.stage_id } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const contactName = lead.contact
    ? [lead.contact.first_name, lead.contact.last_name].filter(Boolean).join(' ')
    : null

  const inner = (
    <div className={`bg-white/5 border border-white/10 rounded-xl p-3.5 ${isDragOverlay ? 'shadow-2xl ring-1 ring-yellow-500/30' : 'hover:bg-white/[0.07]'} transition-colors`}>
      <div className="flex items-start gap-2">
        <div
          className="mt-0.5 cursor-grab active:cursor-grabbing text-blue-300/30 hover:text-blue-300/60 transition-colors shrink-0"
          {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/pipeline/${lead.id}`} className="text-sm font-medium text-white truncate block hover:underline" onClick={e => { if (isDragging) e.preventDefault() }}>
            {lead.title}
          </Link>
          {contactName && lead.contact_id ? (
            <Link
              href={`/contacts/${lead.contact_id}`}
              className="block text-xs mt-0.5 truncate underline decoration-[#d4930e]/40 underline-offset-2 hover:decoration-[#d4930e] transition-colors"
              style={{ color: '#d4930e' }}
              onClick={e => { if (isDragging) e.preventDefault() }}
            >
              {contactName}
            </Link>
          ) : contactName ? (
            <p className="text-xs text-blue-300/60 mt-0.5 truncate">{contactName}</p>
          ) : null}
          {lead.contact?.company && (
            <p className="text-xs text-blue-300/40 truncate">{lead.contact.company}</p>
          )}
          {lead.value != null && lead.value > 0 && (
            <p className="text-xs font-semibold mt-1.5" style={{ color: '#d4930e' }}>
              ${lead.value.toLocaleString()}
            </p>
          )}
          {lead.rep_name && (
            <p className="text-[10px] text-blue-300/40 mt-1 truncate">{lead.rep_name}</p>
          )}
        </div>
      </div>
    </div>
  )

  if (isDragOverlay) return inner

  return (
    <div ref={setNodeRef} style={style}>
      {inner}
    </div>
  )
}

// ─── Droppable Stage Column ──────────────────────────────────────────────────

function StageColumn({
  stage,
  leads,
  onAddDeal,
}: {
  stage: Stage
  leads: Lead[]
  onAddDeal: (stageId: string) => void
}) {
  // Make the entire column a drop target so empty columns accept cards
  const { setNodeRef } = useDroppable({ id: stage.id, data: { type: 'stage' } })
  const stageValue = leads.reduce((sum, l) => sum + (l.value ?? 0), 0)

  return (
    <div ref={setNodeRef} className="bg-white/[0.03] border border-white/10 rounded-2xl flex flex-col min-w-[280px] w-[280px] shrink-0">
      {/* Column header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{stage.name}</p>
          <p className="text-[10px] text-blue-300/50 mt-0.5">
            {leads.length} deal{leads.length !== 1 && 's'}
            {stageValue > 0 && ` · $${stageValue.toLocaleString()}`}
          </p>
        </div>
        <button
          onClick={() => onAddDeal(stage.id)}
          className="p-1.5 rounded-lg text-blue-300/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Add deal"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Cards */}
      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 min-h-[120px] overflow-y-auto max-h-[calc(100vh-280px)]">
          {leads.length === 0 && (
            <p className="text-center text-blue-300/20 text-xs py-8">No deals</p>
          )}
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── Add Deal Modal ──────────────────────────────────────────────────────────

function AddDealModal({
  stageId,
  stageName,
  contacts,
  onClose,
  onSave,
}: {
  stageId: string
  stageName: string
  contacts: ContactOption[]
  onClose: () => void
  onSave: (deal: { title: string; contact_id: string | null; value: number | null; stage_id: string }) => void
}) {
  const [title, setTitle] = useState('')
  const [contactId, setContactId] = useState('')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!title.trim()) { toast.error('Enter a deal title.'); return }
    setSaving(true)
    await onSave({
      title: title.trim(),
      contact_id: contactId || null,
      value: value ? parseFloat(value) : null,
      stage_id: stageId,
    })
    setSaving(false)
  }

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[#0f1c35] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">Add Deal</h3>
            <p className="text-blue-300/60 text-xs mt-0.5">Adding to: {stageName}</p>
          </div>
          <button onClick={onClose} className="text-blue-300/50 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Deal Title</label>
            <input
              type="text"
              placeholder="FTL Memphis → Dallas"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className={inputClass}
              autoFocus
            />
          </div>
          <div>
            <label className={labelClass}>Contact</label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className={`${inputClass} ${!contactId ? 'text-blue-300/40' : ''}`}
            >
              <option value="" className="bg-[#0f1c35]">— None —</option>
              {contacts.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'
                return (
                  <option key={c.id} value={c.id} className="bg-[#0f1c35]">
                    {name}{c.company ? ` — ${c.company}` : ''}
                  </option>
                )
              })}
            </select>
          </div>
          <div>
            <label className={labelClass}>Monthly Value ($)</label>
            <input
              type="number"
              placeholder="5000"
              min="0"
              step="100"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
            style={{ backgroundColor: '#d4930e' }}
          >
            {saving ? 'Saving...' : 'Add Deal'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Pipeline Page ──────────────────────────────────────────────────────

export default function PipelinePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stages, setStages] = useState<Stage[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [modalStageId, setModalStageId] = useState<string | null>(null)
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([])
  const [filterRep, setFilterRep] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [filterActivity, setFilterActivity] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // Check role via API
    const orgRes = await fetch('/api/pipeline/org-deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id }),
    })
    const orgData = await orgRes.json()
    const userIsAdmin = orgData.role === 'admin'
    setIsAdmin(userIsAdmin)

    if (userIsAdmin && orgData.members) {
      setOrgMembers(orgData.members)
    }

    // Stages + contacts always from own user (stages are per-user, contacts for add-deal modal)
    const [stagesRes, contactsRes] = await Promise.all([
      supabase
        .from('pipeline_stages')
        .select('id, name, position')
        .eq('user_id', user.id)
        .order('position', { ascending: true }),
      supabase
        .from('contacts')
        .select('id, first_name, last_name, company')
        .eq('user_id', user.id)
        .order('first_name', { ascending: true }),
    ])

    setStages(stagesRes.data ?? [])
    setContacts(contactsRes.data ?? [])

    if (userIsAdmin && orgData.leads) {
      // Admin: use org-wide leads from API
      const repNameMap = new Map<string, string>(
        (orgData.members as OrgMember[]).map((m: OrgMember) => [m.user_id, m.name])
      )

      const activityMap = new Map<string, string>()
      for (const a of (orgData.activities ?? [])) {
        if (a.contact_id && !activityMap.has(a.contact_id)) {
          activityMap.set(a.contact_id, a.created_at)
        }
      }

      const rawLeads = (orgData.leads ?? []) as Array<Record<string, unknown>>
      setLeads(
        rawLeads.map((l) => ({
          id: l.id as string,
          title: l.title as string,
          stage_id: l.stage_id as string,
          value: l.value as number | null,
          contact_id: l.contact_id as string | null,
          created_at: l.created_at as string,
          user_id: l.user_id as string,
          last_activity_at: l.contact_id ? activityMap.get(l.contact_id as string) ?? null : null,
          rep_name: repNameMap.get(l.user_id as string) ?? undefined,
          contact: l.contact
            ? Array.isArray(l.contact)
              ? (l.contact[0] as Lead['contact'])
              : (l.contact as Lead['contact'])
            : undefined,
        }))
      )
    } else {
      // Rep: own deals only
      const [leadsRes, activitiesRes] = await Promise.all([
        supabase
          .from('leads')
          .select('id, title, stage_id, value, contact_id, created_at, contact:contacts(first_name, last_name, company)')
          .eq('user_id', user.id),
        supabase
          .from('activities')
          .select('contact_id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      const activityMap = new Map<string, string>()
      for (const a of (activitiesRes.data ?? [])) {
        if (a.contact_id && !activityMap.has(a.contact_id)) {
          activityMap.set(a.contact_id, a.created_at)
        }
      }

      const rawLeads = (leadsRes.data ?? []) as Array<Record<string, unknown>>
      setLeads(
        rawLeads.map((l) => ({
          id: l.id as string,
          title: l.title as string,
          stage_id: l.stage_id as string,
          value: l.value as number | null,
          contact_id: l.contact_id as string | null,
          created_at: l.created_at as string,
          last_activity_at: l.contact_id ? activityMap.get(l.contact_id as string) ?? null : null,
          contact: l.contact
            ? Array.isArray(l.contact)
              ? (l.contact[0] as Lead['contact'])
              : (l.contact as Lead['contact'])
            : undefined,
        }))
      )
    }

    setLoading(false)
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // ── Drag handlers ────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const lead = leads.find((l) => l.id === event.active.id)
    if (lead) setActiveLead(lead)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeLeadId = active.id as string
    const overId = over.id as string

    // Determine the target stage
    const overLead = leads.find((l) => l.id === overId)
    const overStage = stages.find((s) => s.id === overId)
    const targetStageId = overLead?.stage_id ?? overStage?.id
    if (!targetStageId) return

    // Move card to new stage in state
    setLeads((prev) =>
      prev.map((l) => (l.id === activeLeadId ? { ...l, stage_id: targetStageId } : l))
    )
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return

    const activeLeadId = active.id as string
    const lead = leads.find((l) => l.id === activeLeadId)
    if (!lead) return

    // Persist stage change
    const { error } = await supabase
      .from('leads')
      .update({ stage_id: lead.stage_id })
      .eq('id', activeLeadId)

    if (error) {
      console.error('Lead stage update failed:', error)
      toast.error(`Failed to move deal: ${error.message}`)
      loadData()
    }
  }

  // ── Add deal ─────────────────────────────────────────────────────────────

  async function handleAddDeal(deal: { title: string; contact_id: string | null; value: number | null; stage_id: string }) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      user_id: user.id,
      title: deal.title,
      stage_id: deal.stage_id,
      contact_id: deal.contact_id,
      value: deal.value,
    }

    const { error } = await supabase.from('leads').insert(payload)

    if (error) {
      console.error('Lead insert failed:', error)
      toast.error(`Failed to add deal: ${error.message}`)
      return
    }

    toast.success('Deal added!')
    setModalStageId(null)
    loadData()
  }

  // ── Filter & sort logic ─────────────────────────────────────────────────

  const hasFilters = search || filterValue || sortBy !== 'newest' || filterActivity || filterRep

  function clearFilters() {
    setSearch('')
    setFilterValue('')
    setSortBy('newest')
    setFilterActivity('')
    setFilterRep('')
  }

  const filteredLeads = leads.filter(l => {
    // Salesperson
    if (filterRep && l.user_id !== filterRep) return false
    // Search
    if (search) {
      const q = search.toLowerCase()
      const contactName = l.contact ? [l.contact.first_name, l.contact.last_name].filter(Boolean).join(' ').toLowerCase() : ''
      const company = (l.contact?.company || '').toLowerCase()
      const title = l.title.toLowerCase()
      if (!contactName.includes(q) && !company.includes(q) && !title.includes(q)) return false
    }
    // Value
    if (filterValue) {
      const v = l.value ?? 0
      if (filterValue === 'under10k' && v >= 10000) return false
      if (filterValue === '10k-50k' && (v < 10000 || v > 50000)) return false
      if (filterValue === '50k-100k' && (v < 50000 || v > 100000)) return false
      if (filterValue === 'over100k' && v <= 100000) return false
    }
    // Activity
    if (filterActivity) {
      const days = parseInt(filterActivity)
      const cutoff = Date.now() - days * 86400000
      if (l.last_activity_at && new Date(l.last_activity_at).getTime() > cutoff) return false
      // If no activity at all, it counts as "no activity"
    }
    return true
  })

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (sortBy === 'highest') return (b.value ?? 0) - (a.value ?? 0)
    if (sortBy === 'lowest') return (a.value ?? 0) - (b.value ?? 0)
    if (sortBy === 'activity') {
      const aTime = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0
      const bTime = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0
      return bTime - aTime
    }
    // newest (default)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const totalValue = sortedLeads.reduce((sum, l) => sum + (l.value ?? 0), 0)
  const totalDeals = sortedLeads.length
  const modalStage = stages.find((s) => s.id === modalStageId)

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <p className="text-blue-300 text-sm">Loading pipeline...</p>
      </div>
    )
  }

  const selectClass = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-2 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Pipeline</h2>
            <div className="flex items-center gap-4 mt-1">
              <span className="flex items-center gap-1 text-blue-300 text-sm">
                <TrendingUp className="w-4 h-4" />
                {totalDeals} deal{totalDeals !== 1 && 's'}
                {totalDeals !== leads.length && <span className="text-blue-300/40">of {leads.length}</span>}
              </span>
              <span className="flex items-center gap-1 text-sm" style={{ color: '#d4930e' }}>
                <DollarSign className="w-4 h-4" />
                ${totalValue.toLocaleString()} total value
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-8 py-3 shrink-0 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-blue-300/40" />
          <input
            type="text"
            placeholder="Search deals..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 w-48"
          />
        </div>
        <select value={filterValue} onChange={e => setFilterValue(e.target.value)} className={selectClass}>
          <option value="" className="bg-[#0f1c35]">Any Value</option>
          <option value="under10k" className="bg-[#0f1c35]">Under $10k</option>
          <option value="10k-50k" className="bg-[#0f1c35]">$10k – $50k</option>
          <option value="50k-100k" className="bg-[#0f1c35]">$50k – $100k</option>
          <option value="over100k" className="bg-[#0f1c35]">Over $100k</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={selectClass}>
          <option value="newest" className="bg-[#0f1c35]">Newest First</option>
          <option value="oldest" className="bg-[#0f1c35]">Oldest First</option>
          <option value="highest" className="bg-[#0f1c35]">Highest Value</option>
          <option value="lowest" className="bg-[#0f1c35]">Lowest Value</option>
          <option value="activity" className="bg-[#0f1c35]">Last Activity</option>
        </select>
        <select value={filterActivity} onChange={e => setFilterActivity(e.target.value)} className={selectClass}>
          <option value="" className="bg-[#0f1c35]">Any Activity</option>
          <option value="7" className="bg-[#0f1c35]">No activity 7d</option>
          <option value="14" className="bg-[#0f1c35]">No activity 14d</option>
          <option value="30" className="bg-[#0f1c35]">No activity 30d</option>
        </select>
        {isAdmin && orgMembers.length > 0 && (
          <select value={filterRep} onChange={e => setFilterRep(e.target.value)} className={selectClass}>
            <option value="" className="bg-[#0f1c35]">All Reps</option>
            {orgMembers.map(m => (
              <option key={m.user_id} value={m.user_id} className="bg-[#0f1c35]">{m.name}</option>
            ))}
          </select>
        )}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-red-400/70 border border-red-400/20 hover:text-red-400 hover:border-red-400/40 transition-colors"
          >
            <Filter className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-8 pb-8">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full">
            {stages.map((stage) => {
              const stageLeads = sortedLeads.filter((l) => l.stage_id === stage.id)
              return (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  leads={stageLeads}
                  onAddDeal={setModalStageId}
                />
              )
            })}

            {stages.length === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <TrendingUp className="w-10 h-10 mx-auto mb-4 text-blue-300/30" />
                  <p className="text-white font-medium mb-1">No pipeline stages</p>
                  <p className="text-blue-300/60 text-sm">
                    Create pipeline stages in Supabase to get started.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeLead ? <LeadCard lead={activeLead} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Add Deal Modal */}
      {modalStageId && modalStage && (
        <AddDealModal
          stageId={modalStageId}
          stageName={modalStage.name}
          contacts={contacts}
          onClose={() => setModalStageId(null)}
          onSave={handleAddDeal}
        />
      )}
    </div>
  )
}
