'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PhoneCall,
  MailOpen,
  StickyNote,
  CalendarDays,
  CheckSquare,
  Clock,
  TrendingUp,
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Activity {
  id: string
  contact_id: string | null
  lead_id: string | null
  user_id: string
  type: string
  subject: string
  notes: string | null
  completed: boolean
  created_at: string
}

interface ContactInfo {
  id: string
  first_name: string | null
  last_name: string | null
}

interface LeadInfo {
  id: string
  title: string
}

const ACTIVITY_TYPES = [
  { value: 'all',     label: 'All',      icon: Clock,        color: 'text-blue-300' },
  { value: 'call',    label: 'Calls',    icon: PhoneCall,    color: 'text-blue-400' },
  { value: 'email',   label: 'Emails',   icon: MailOpen,     color: 'text-purple-400' },
  { value: 'note',    label: 'Notes',    icon: StickyNote,   color: 'text-yellow-400' },
  { value: 'meeting', label: 'Meetings', icon: CalendarDays, color: 'text-green-400' },
  { value: 'task',    label: 'Tasks',    icon: CheckSquare,  color: 'text-orange-400' },
]

function getTypeMeta(type: string) {
  return ACTIVITY_TYPES.find(t => t.value === type) ?? ACTIVITY_TYPES[0]
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function ActivitiesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activities, setActivities] = useState<Activity[]>([])
  const [contactMap, setContactMap] = useState<Map<string, ContactInfo>>(new Map())
  const [leadMap, setLeadMap] = useState<Map<string, LeadInfo>>(new Map())
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      // Fetch all activities for this user
      const { data: acts } = await supabase
        .from('activities')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      const allActivities = (acts ?? []) as Activity[]
      setActivities(allActivities)

      // Collect unique contact_ids and lead_ids
      const contactIds = Array.from(new Set(
        allActivities.map(a => a.contact_id).filter(Boolean) as string[]
      ))
      const leadIds = Array.from(new Set(
        allActivities.map(a => a.lead_id).filter(Boolean) as string[]
      ))

      // Fetch contact names
      if (contactIds.length > 0) {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, first_name, last_name')
          .in('id', contactIds)
        const map = new Map<string, ContactInfo>()
        for (const c of contacts ?? []) map.set(c.id, c)
        setContactMap(map)
      }

      // Fetch lead titles
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, title')
          .in('id', leadIds)
        const map = new Map<string, LeadInfo>()
        for (const l of leads ?? []) map.set(l.id, l)
        setLeadMap(map)
      }

      setLoading(false)
    }
    load()
  }, [router])

  const filtered = filter === 'all'
    ? activities
    : activities.filter(a => a.type === filter)

  // Count per type for badges
  const typeCounts = new Map<string, number>()
  for (const a of activities) {
    typeCounts.set(a.type, (typeCounts.get(a.type) ?? 0) + 1)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <p className="text-blue-300 text-sm">Loading activities...</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-10 max-w-4xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Activities</h2>
        <p className="text-blue-300 text-sm mt-1">
          {activities.length} activit{activities.length !== 1 ? 'ies' : 'y'} logged
        </p>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {ACTIVITY_TYPES.map(t => {
          const active = filter === t.value
          const count = t.value === 'all' ? activities.length : (typeCounts.get(t.value) ?? 0)
          const Icon = t.icon
          return (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={active
                ? { backgroundColor: 'rgba(212,147,14,0.15)', color: '#d4930e', border: '1px solid rgba(212,147,14,0.3)' }
                : { backgroundColor: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid transparent' }
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              <span className="opacity-50">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Activity list */}
      {filtered.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <Clock className="w-10 h-10 mx-auto mb-4 text-blue-300/30" />
          <p className="text-white font-medium mb-1">No activities yet</p>
          <p className="text-blue-300/60 text-sm">
            Log calls, emails, notes, meetings, and tasks from contact or deal detail pages.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(activity => {
            const meta = getTypeMeta(activity.type)
            const Icon = meta.icon
            const contact = activity.contact_id ? contactMap.get(activity.contact_id) : null
            const lead = activity.lead_id ? leadMap.get(activity.lead_id) : null
            const cName = contact
              ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unnamed'
              : null

            return (
              <div
                key={activity.id}
                className="bg-white/5 border border-white/10 rounded-xl px-5 py-4 flex gap-4"
                style={{ opacity: activity.completed ? 0.55 : 1 }}
              >
                {/* Icon */}
                <div className={`shrink-0 mt-0.5 ${meta.color}`}>
                  <Icon className="w-[18px] h-[18px]" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium text-white ${activity.completed ? 'line-through' : ''}`}>
                    {activity.subject}
                  </p>

                  {activity.notes && (
                    <p className="text-xs text-blue-300/50 mt-1 leading-relaxed line-clamp-2">
                      {activity.notes}
                    </p>
                  )}

                  {/* Links + meta */}
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {cName && contact && (
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="text-xs font-medium hover:underline"
                        style={{ color: '#d4930e' }}
                      >
                        {cName}
                      </Link>
                    )}
                    {lead && (
                      <Link
                        href={`/pipeline/${lead.id}`}
                        className="text-xs font-medium flex items-center gap-1 hover:underline"
                        style={{ color: '#d4930e' }}
                      >
                        <TrendingUp className="w-3 h-3" />
                        {lead.title}
                      </Link>
                    )}
                    <span className="text-xs text-blue-300/30 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(activity.created_at)}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded capitalize bg-white/5 text-blue-300/50">
                      {activity.type}
                    </span>
                    {activity.completed && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                        Done
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-blue-400/50 text-xs mt-16">
        2026 Bid Genie AI · LogiCRM
      </p>
    </div>
  )
}
