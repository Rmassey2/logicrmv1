'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
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

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: typeof FileEdit }> = {
  draft:     { label: 'Draft',     cls: 'bg-blue-500/10 text-blue-400',     icon: FileEdit },
  active:    { label: 'Active',    cls: 'bg-yellow-500/10 text-yellow-400', icon: Send },
  completed: { label: 'Completed', cls: 'bg-emerald-500/10 text-emerald-400', icon: CheckCircle2 },
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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      // Fetch campaign
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

      // Fetch enrolled contacts via campaign_contacts join
      const { data: enrollments } = await supabase
        .from('campaign_contacts')
        .select('id, contact_id, status')
        .eq('campaign_id', id)

      if (enrollments && enrollments.length > 0) {
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
      }

      setLoading(false)
    }
    load()
  }, [id, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <p className="text-blue-300 text-sm">Loading campaign...</p>
      </div>
    )
  }

  if (!campaign) return null

  const cfg = STATUS_CONFIG[campaign.status ?? 'draft'] ?? STATUS_CONFIG.draft
  const StatusIcon = cfg.icon

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
        </div>

        {/* Subject line */}
        <div className="mt-5 pt-5 border-t border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50 mb-1">Subject Line</p>
          <p className="text-sm text-white">{campaign.subject}</p>
        </div>

        {/* Body preview */}
        {campaign.body && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300/50 mb-1">Email Body</p>
            <p className="text-sm text-blue-200/70 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {campaign.body}
            </p>
          </div>
        )}
      </div>

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
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed'
                  return (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
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
                        <span className={`text-xs px-2 py-0.5 rounded font-semibold capitalize ${
                          c.status === 'sent'    ? 'bg-emerald-500/10 text-emerald-400' :
                          c.status === 'opened'  ? 'bg-blue-500/10 text-blue-400' :
                          c.status === 'replied'  ? 'bg-yellow-500/10 text-yellow-400' :
                          c.status === 'bounced' ? 'bg-red-500/10 text-red-400' :
                          'bg-white/5 text-blue-300/50'
                        }`}>
                          {c.status ?? 'enrolled'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-center text-blue-400/50 text-xs mt-16">
        2026 Bid Genie AI · LogiCRM
      </p>
    </div>
  )
}
