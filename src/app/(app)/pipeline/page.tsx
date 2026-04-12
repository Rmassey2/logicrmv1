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
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, X, DollarSign, TrendingUp, GripVertical, Search, Filter,
  ChevronDown, ChevronRight, Clock,
} from 'lucide-react'

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
  potential_revenue?: string | null
  loads_per_month?: number | null
  equipment_type?: string | null
  contact?: {
    first_name: string | null
    last_name: string | null
    company: string | null
    shipper_tier: string | null
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

const STAGE_COLORS: Record<string, string> = {
  'cold lead':        '#6b7280',
  'contacted':        '#1e3a5f',
  'discovery call':   '#d4930e',
  'trial lane':       '#8b5cf6',
  'active customer':  '#22c55e',
  'closed lost':      '#ef4444',
}

function getStageColor(name: string): string {
  return STAGE_COLORS[name.toLowerCase()] ?? '#6b7280'
}

function daysAgo(iso: string | null | undefined): string {
  if (!iso) return 'No activity'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}

// ─── Sortable Deal Row ──────────────────────────────────────────────────────

function DealRow({
  lead,
  stages,
  isDragOverlay,
  onMoveStage,
}: {
  lead: Lead
  stages: Stage[]
  isDragOverlay?: boolean
  onMoveStage?: (leadId: string, stageId: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { type: 'lead', stageId: lead.stage_id } })

  const style = isDragOverlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
      }

  const contactName = lead.contact
    ? [lead.contact.first_name, lead.contact.last_name].filter(Boolean).join(' ')
    : null

  const activityText = daysAgo(lead.last_activity_at)
  const activityDays = lead.last_activity_at
    ? Math.floor((Date.now() - new Date(lead.last_activity_at).getTime()) / 86400000)
    : 999

  const row = (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-colors group ${isDragOverlay ? 'bg-[#0f1c35] shadow-2xl ring-1 ring-yellow-500/30 border border-white/10' : 'hover:bg-white/5'}`}>
      {/* Drag handle */}
      <div
        className="cursor-grab active:cursor-grabbing text-blue-300/20 hover:text-blue-300/50 transition-colors shrink-0"
        {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Deal title */}
      <div className="min-w-0 flex-1">
        <Link
          href={`/pipeline/${lead.id}`}
          className="text-sm font-medium text-white hover:underline truncate block"
          onClick={e => { if (isDragging) e.preventDefault() }}
        >
          {lead.title}
        </Link>
      </div>

      {/* Contact */}
      <div className="w-36 shrink-0 hidden sm:block">
        {contactName && lead.contact_id ? (
          <Link
            href={`/contacts/${lead.contact_id}`}
            className="text-xs truncate block hover:underline"
            style={{ color: '#d4930e' }}
            onClick={e => { if (isDragging) e.preventDefault() }}
          >
            {contactName}
          </Link>
        ) : (
          <span className="text-xs text-blue-300/30">—</span>
        )}
      </div>

      {/* Company */}
      <div className="w-32 shrink-0 hidden md:block">
        <p className="text-xs text-blue-300/50 truncate">{lead.contact?.company || '—'}</p>
      </div>

      {/* Revenue / Equipment */}
      <div className="w-28 shrink-0 text-right">
        {lead.potential_revenue ? (
          <span className="text-[10px] font-semibold" style={{ color: '#d4930e' }}>{lead.potential_revenue}</span>
        ) : lead.value != null && lead.value > 0 ? (
          <span className="text-xs font-semibold" style={{ color: '#d4930e' }}>${lead.value.toLocaleString()}</span>
        ) : null}
        {lead.equipment_type && <p className="text-[9px] text-blue-300/40">{lead.equipment_type}</p>}
        {lead.loads_per_month && <p className="text-[9px] text-blue-300/30">~{lead.loads_per_month} loads/mo</p>}
      </div>

      {/* Activity */}
      <div className="w-28 shrink-0 text-right hidden lg:block">
        <span className={`text-xs ${activityDays > 7 ? 'text-orange-400' : 'text-blue-300/40'}`}>
          <Clock className="w-3 h-3 inline mr-1" />
          {activityText}
        </span>
      </div>

      {/* Rep name (admin) */}
      {lead.rep_name && (
        <div className="w-24 shrink-0 text-right hidden xl:block">
          <span className="text-[10px] text-blue-300/40">{lead.rep_name}</span>
        </div>
      )}

      {/* Move stage */}
      <div className="w-28 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <select
          value={lead.stage_id}
          onChange={e => onMoveStage?.(lead.id, e.target.value)}
          onClick={e => e.stopPropagation()}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-blue-300 w-full focus:outline-none"
        >
          {stages.map(s => (
            <option key={s.id} value={s.id} className="bg-[#0f1c35]">{s.name}</option>
          ))}
        </select>
      </div>
    </div>
  )

  if (isDragOverlay) return row

  return (
    <div ref={setNodeRef} style={style}>
      {row}
    </div>
  )
}

// ─── Droppable Stage Accordion ──────────────────────────────────────────────

function StageAccordion({
  stage,
  leads,
  allStages,
  isOpen,
  onToggle,
  onAddDeal,
  onMoveStage,
}: {
  stage: Stage
  leads: Lead[]
  allStages: Stage[]
  isOpen: boolean
  onToggle: () => void
  onAddDeal: (stageId: string) => void
  onMoveStage: (leadId: string, stageId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { type: 'stage' } })
  const stageValue = leads.reduce((sum, l) => sum + (l.value ?? 0), 0)
  const color = getStageColor(stage.name)

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border transition-colors ${isOver ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-white/10 bg-white/[0.02]'}`}
    >
      {/* Header — always visible, acts as drop target */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left group"
      >
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-blue-300/40 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-blue-300/40 shrink-0" />
        )}
        <span className="text-sm font-semibold text-white flex-1">{stage.name}</span>
        <span className="text-xs text-blue-300/50">
          {leads.length} deal{leads.length !== 1 && 's'}
        </span>
        {stageValue > 0 && (
          <span className="text-xs font-semibold" style={{ color: '#d4930e' }}>
            ${stageValue.toLocaleString()}
          </span>
        )}
        <span
          onClick={e => { e.stopPropagation(); onAddDeal(stage.id) }}
          className="p-1 rounded-lg text-blue-300/30 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
          title="Add deal"
        >
          <Plus className="w-4 h-4" />
        </span>
      </button>

      {/* Expanded deals list */}
      {isOpen && (
        <div className="px-3 pb-3">
          {/* Column headers */}
          {leads.length > 0 && (
            <div className="flex items-center gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-blue-300/30">
              <div className="w-4 shrink-0" />
              <div className="flex-1">Deal</div>
              <div className="w-36 shrink-0 hidden sm:block">Contact</div>
              <div className="w-32 shrink-0 hidden md:block">Company</div>
              <div className="w-24 shrink-0 text-right">Value</div>
              <div className="w-28 shrink-0 text-right hidden lg:block">Activity</div>
              <div className="w-28 shrink-0" />
            </div>
          )}
          <div className="space-y-1">
            {leads.length === 0 && (
              <p className="text-center text-blue-300/20 text-xs py-6">No deals in this stage</p>
            )}
            {leads.map(lead => (
              <DealRow
                key={lead.id}
                lead={lead}
                stages={allStages}
                onMoveStage={onMoveStage}
              />
            ))}
          </div>
        </div>
      )}
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
  onSave: (deal: { title: string; contact_id: string | null; value: number | null; stage_id: string; potential_revenue?: string; loads_per_month?: number; equipment_type?: string; bid_due_date?: string }) => void
}) {
  const [title, setTitle] = useState('')
  const [contactId, setContactId] = useState('')
  const [potentialRevenue, setPotentialRevenue] = useState('')
  const [loadsPerMonth, setLoadsPerMonth] = useState('')
  const [equipmentType, setEquipmentType] = useState('')
  const [bidDueDate, setBidDueDate] = useState('')
  // value removed — using potentialRevenue instead
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!title.trim()) { toast.error('Enter a deal title.'); return }
    setSaving(true)
    await onSave({
      title: title.trim(),
      contact_id: contactId || null,
      value: null,
      stage_id: stageId,
      potential_revenue: potentialRevenue || undefined,
      loads_per_month: loadsPerMonth ? parseInt(loadsPerMonth) : undefined,
      equipment_type: equipmentType || undefined,
      bid_due_date: bidDueDate || undefined,
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
            <label className={labelClass}>Potential Revenue</label>
            <select value={potentialRevenue} onChange={e => setPotentialRevenue(e.target.value)} className={inputClass}>
              <option value="" className="bg-[#0f1c35]">Not set</option>
              <option value="Under $10K/yr" className="bg-[#0f1c35]">Under $10K/yr</option>
              <option value="$10K-$50K/yr" className="bg-[#0f1c35]">$10K-$50K/yr</option>
              <option value="$50K-$200K/yr" className="bg-[#0f1c35]">$50K-$200K/yr</option>
              <option value="$200K-$500K/yr" className="bg-[#0f1c35]">$200K-$500K/yr</option>
              <option value="$500K+/yr" className="bg-[#0f1c35]">$500K+/yr</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Est. Loads/Month</label>
            <input type="number" placeholder="e.g. 25" min="0" value={loadsPerMonth} onChange={e => setLoadsPerMonth(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Equipment Type</label>
            <select value={equipmentType} onChange={e => setEquipmentType(e.target.value)} className={inputClass}>
              <option value="" className="bg-[#0f1c35]">Not set</option>
              <option value="Dry Van" className="bg-[#0f1c35]">Dry Van</option>
              <option value="Reefer" className="bg-[#0f1c35]">Reefer</option>
              <option value="Flatbed" className="bg-[#0f1c35]">Flatbed</option>
              <option value="Step Deck" className="bg-[#0f1c35]">Step Deck</option>
              <option value="LTL" className="bg-[#0f1c35]">LTL</option>
              <option value="Intermodal" className="bg-[#0f1c35]">Intermodal</option>
              <option value="Tanker" className="bg-[#0f1c35]">Tanker</option>
              <option value="Mixed" className="bg-[#0f1c35]">Mixed</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Bid Due Date</label>
            <input type="date" value={bidDueDate} onChange={e => setBidDueDate(e.target.value)} className={inputClass} />
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
  const [openStages, setOpenStages] = useState<Set<string>>(new Set())

  // Filters
  const [search, setSearch] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [filterActivity, setFilterActivity] = useState('')
  const [filterTier, setFilterTier] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function toggleStage(stageId: string) {
    setOpenStages(prev => {
      const next = new Set(prev)
      if (next.has(stageId)) next.delete(stageId); else next.add(stageId)
      return next
    })
  }

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
          potential_revenue: l.potential_revenue as string | null ?? undefined,
          loads_per_month: l.loads_per_month as number | null ?? undefined,
          equipment_type: l.equipment_type as string | null ?? undefined,
          contact: l.contact
            ? Array.isArray(l.contact)
              ? (l.contact[0] as Lead['contact'])
              : (l.contact as Lead['contact'])
            : undefined,
        }))
      )
    } else {
      const [leadsRes, activitiesRes] = await Promise.all([
        supabase
          .from('leads')
          .select('id, title, stage_id, value, contact_id, created_at, potential_revenue, loads_per_month, equipment_type, contact:contacts(first_name, last_name, company, shipper_tier)')
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
          potential_revenue: l.potential_revenue as string | null ?? undefined,
          loads_per_month: l.loads_per_month as number | null ?? undefined,
          equipment_type: l.equipment_type as string | null ?? undefined,
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

  async function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return

    const activeLeadId = active.id as string
    const overId = over.id as string

    // Determine target stage: could be a stage header or a lead in a stage
    const overLead = leads.find((l) => l.id === overId)
    const overStage = stages.find((s) => s.id === overId)
    const targetStageId = overStage?.id ?? overLead?.stage_id
    if (!targetStageId) return

    const currentLead = leads.find(l => l.id === activeLeadId)
    if (!currentLead || currentLead.stage_id === targetStageId) return

    // Update in state
    setLeads(prev => prev.map(l => l.id === activeLeadId ? { ...l, stage_id: targetStageId } : l))

    // Persist
    const { error } = await supabase
      .from('leads')
      .update({ stage_id: targetStageId })
      .eq('id', activeLeadId)

    if (error) {
      toast.error(`Failed to move deal: ${error.message}`)
      loadData()
    } else {
      const stageName = stages.find(s => s.id === targetStageId)?.name ?? 'stage'
      toast.success(`Moved to ${stageName}`)
    }
  }

  // ── Move stage (dropdown) ──────────────────────────────────────────────

  async function handleMoveStage(leadId: string, newStageId: string) {
    const current = leads.find(l => l.id === leadId)
    if (!current || current.stage_id === newStageId) return

    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage_id: newStageId } : l))

    const { error } = await supabase
      .from('leads')
      .update({ stage_id: newStageId })
      .eq('id', leadId)

    if (error) {
      toast.error(`Failed to move deal: ${error.message}`)
      loadData()
    } else {
      const stageName = stages.find(s => s.id === newStageId)?.name ?? 'stage'
      toast.success(`Moved to ${stageName}`)
    }
  }

  // ── Add deal ─────────────────────────────────────────────────────────────

  async function handleAddDeal(deal: { title: string; contact_id: string | null; value: number | null; stage_id: string; potential_revenue?: string; loads_per_month?: number; equipment_type?: string; bid_due_date?: string }) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('leads').insert({
      user_id: user.id,
      title: deal.title,
      stage_id: deal.stage_id,
      contact_id: deal.contact_id,
      value: deal.value,
      potential_revenue: deal.potential_revenue || null,
      loads_per_month: deal.loads_per_month || null,
      equipment_type: deal.equipment_type || null,
      bid_due_date: deal.bid_due_date || null,
    })

    if (error) {
      toast.error(`Failed to add deal: ${error.message}`)
      return
    }

    toast.success('Deal added!')
    setModalStageId(null)
    // Auto-open the stage
    setOpenStages(prev => new Set(prev).add(deal.stage_id))
    loadData()
  }

  // ── Filter & sort logic ─────────────────────────────────────────────────

  const hasFilters = search || filterValue || sortBy !== 'newest' || filterActivity || filterRep || filterTier

  function clearFilters() {
    setSearch('')
    setFilterValue('')
    setSortBy('newest')
    setFilterActivity('')
    setFilterRep('')
    setFilterTier('')
  }

  const filteredLeads = leads.filter(l => {
    if (filterRep && l.user_id !== filterRep) return false
    if (search) {
      const q = search.toLowerCase()
      const contactName = l.contact ? [l.contact.first_name, l.contact.last_name].filter(Boolean).join(' ').toLowerCase() : ''
      const company = (l.contact?.company || '').toLowerCase()
      const title = l.title.toLowerCase()
      if (!contactName.includes(q) && !company.includes(q) && !title.includes(q)) return false
    }
    if (filterValue) {
      const v = l.value ?? 0
      if (filterValue === 'under10k' && v >= 10000) return false
      if (filterValue === '10k-50k' && (v < 10000 || v > 50000)) return false
      if (filterValue === '50k-100k' && (v < 50000 || v > 100000)) return false
      if (filterValue === 'over100k' && v <= 100000) return false
    }
    if (filterActivity) {
      const days = parseInt(filterActivity)
      const cutoff = Date.now() - days * 86400000
      if (l.last_activity_at && new Date(l.last_activity_at).getTime() > cutoff) return false
    }
    // Tier filter
    if (filterTier) {
      const tier = l.contact?.shipper_tier || ''
      if (filterTier === 'none' && tier) return false
      if (filterTier !== 'none' && tier !== filterTier) return false
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
                {totalDeals !== leads.length && <span className="text-blue-300/40"> of {leads.length}</span>}
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
        <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className={selectClass}>
          <option value="" className="bg-[#0f1c35]">All Tiers</option>
          <option value="Small" className="bg-[#0f1c35]">Small</option>
          <option value="Medium" className="bg-[#0f1c35]">Medium</option>
          <option value="Large" className="bg-[#0f1c35]">Large</option>
          <option value="XL" className="bg-[#0f1c35]">XL</option>
          <option value="none" className="bg-[#0f1c35]">Not Set</option>
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

      {/* Accordion Board */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-3">
            {stages.map((stage) => {
              const stageLeads = sortedLeads.filter((l) => l.stage_id === stage.id)
              return (
                <StageAccordion
                  key={stage.id}
                  stage={stage}
                  leads={stageLeads}
                  allStages={stages}
                  isOpen={openStages.has(stage.id)}
                  onToggle={() => toggleStage(stage.id)}
                  onAddDeal={setModalStageId}
                  onMoveStage={handleMoveStage}
                />
              )
            })}

            {stages.length === 0 && (
              <div className="text-center py-16">
                <TrendingUp className="w-10 h-10 mx-auto mb-4 text-blue-300/30" />
                <p className="text-white font-medium mb-1">No pipeline stages</p>
                <p className="text-blue-300/60 text-sm">
                  Create pipeline stages in Supabase to get started.
                </p>
              </div>
            )}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeLead ? <DealRow lead={activeLead} stages={stages} isDragOverlay /> : null}
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
