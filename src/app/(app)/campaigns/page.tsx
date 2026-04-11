'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Mail, Send, CheckCircle2, FileEdit, FileText, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Campaign {
  id: string
  name: string
  status: string | null
  approval_status: string | null
  recipient_count: number | null
  sent_count: number | null
  open_count: number | null
  reply_count: number | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; class: string; icon: typeof FileEdit }> = {
  draft:     { label: 'Draft',     class: 'bg-blue-500/10 text-blue-400',   icon: FileEdit },
  active:    { label: 'Active',    class: 'bg-yellow-500/10 text-yellow-400', icon: Send },
  completed: { label: 'Completed', class: 'bg-emerald-500/10 text-emerald-400', icon: CheckCircle2 },
}

export default function CampaignsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [confirmModal, setConfirmModal] = useState<{ show: boolean; message: string; onConfirm: () => void }>({ show: false, message: '', onConfirm: () => {} })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('email_campaigns')
        .select('id, name, status, approval_status, recipient_count, sent_count, open_count, reply_count, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setCampaigns(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  function handleDelete(campaign: Campaign) {
    setConfirmModal({
      show: true,
      message: `Delete "${campaign.name}"? This cannot be undone.`,
      onConfirm: async () => {
        await supabase.from('email_sequences').delete().eq('campaign_id', campaign.id)
        await supabase.from('campaign_contacts').delete().eq('campaign_id', campaign.id)
        const { error } = await supabase.from('email_campaigns').delete().eq('id', campaign.id)
        if (error) { toast.error('Failed to delete campaign: ' + error.message); return }
        setCampaigns(prev => prev.filter(c => c.id !== campaign.id))
        toast.success(`"${campaign.name}" deleted`)
      },
    })
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="px-8 py-10 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Campaigns</h2>
          <p className="text-blue-300 text-sm mt-1">
            {campaigns.length} campaign{campaigns.length !== 1 && 's'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/campaigns/templates')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
          >
            <FileText className="w-4 h-4" />
            Templates
          </button>
          <button
            onClick={() => router.push('/campaigns/new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm transition-colors hover:brightness-110"
            style={{ backgroundColor: '#d4930e' }}
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <p className="text-blue-300/60 text-sm">Loading campaigns...</p>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <Mail className="w-10 h-10 mx-auto mb-4 text-blue-300/30" />
          <p className="text-white font-medium mb-1">No campaigns yet</p>
          <p className="text-blue-300/60 text-sm mb-6">
            Create your first email campaign to start reaching out to your contacts.
          </p>
          <button
            onClick={() => router.push('/campaigns/new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
            style={{ backgroundColor: '#d4930e' }}
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const cfg = STATUS_CONFIG[c.status ?? 'draft'] ?? STATUS_CONFIG.draft
            const StatusIcon = cfg.icon
            return (
              <div
                key={c.id}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 text-left hover:bg-white/[0.07] transition-colors group"
              >
                {/* Left: name + status */}
                <div className="flex-1 min-w-0">
                  <Link href={`/campaigns/${c.id}`} className="text-white font-medium hover:underline truncate block" style={{ color: '#d4930e' }}>{c.name}</Link>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cfg.class}`}>
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                    {c.approval_status && c.approval_status !== 'draft' && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        c.approval_status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' :
                        c.approval_status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                        c.approval_status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                        'bg-white/5 text-blue-300/40'
                      }`}>
                        {c.approval_status}
                      </span>
                    )}
                    <span className="text-blue-300/40 text-xs">{formatDate(c.created_at)}</span>
                  </div>
                </div>

                {/* Right: stats */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center min-w-[3.5rem]">
                    <p className="text-lg font-bold text-white">{c.recipient_count ?? 0}</p>
                    <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Recipients</p>
                  </div>
                  <div className="text-center min-w-[3.5rem]">
                    <p className="text-lg font-bold text-white">{c.sent_count ?? 0}</p>
                    <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Sent</p>
                  </div>
                  <div className="text-center min-w-[3.5rem]">
                    <p className="text-lg font-bold text-white">{c.open_count ?? 0}</p>
                    <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Opens</p>
                  </div>
                  <div className="text-center min-w-[3.5rem]">
                    <p className="text-lg font-bold text-white">{c.reply_count ?? 0}</p>
                    <p className="text-[10px] uppercase tracking-wide text-blue-300/50">Replies</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(c) }}
                    className="ml-2 p-2 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete campaign"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
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
