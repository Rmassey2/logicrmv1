'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, FileText, Trash2, Copy, Pencil } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Template {
  id: string
  name: string
  subject: string
  body: string
  created_at: string
}

export default function TemplatesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => { loadTemplates() }, [])

  async function loadTemplates() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('email_templates')
      .select('id, name, subject, body, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setTemplates(data ?? [])
    setLoading(false)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    const { error } = await supabase.from('email_templates').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete template.')
      setDeleting(null)
      return
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    toast.success('Template deleted.')
    setDeleting(null)
  }

  async function handleDuplicate(t: Template) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('email_templates').insert({
      user_id: user.id,
      name: `${t.name} (Copy)`,
      subject: t.subject,
      body: t.body,
    })
    if (error) { toast.error('Failed to duplicate.'); return }
    toast.success('Template duplicated.')
    loadTemplates()
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="px-8 py-10 max-w-4xl">
      <button
        onClick={() => router.push('/campaigns')}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaigns
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Email Templates</h2>
          <p className="text-blue-300 text-sm mt-1">
            {templates.length} template{templates.length !== 1 && 's'} saved
          </p>
        </div>
        <button
          onClick={() => router.push('/campaigns/templates/new')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm transition-colors hover:brightness-110"
          style={{ backgroundColor: '#d4930e' }}
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {loading ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <p className="text-blue-300/60 text-sm">Loading templates...</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <FileText className="w-10 h-10 mx-auto mb-4 text-blue-300/30" />
          <p className="text-white font-medium mb-1">No templates yet</p>
          <p className="text-blue-300/60 text-sm mb-6">
            Save reusable email templates to speed up your campaign creation.
          </p>
          <button
            onClick={() => router.push('/campaigns/templates/new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
            style={{ backgroundColor: '#d4930e' }}
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-white/5 border border-white/10 rounded-2xl p-5 group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-white font-medium truncate">{t.name}</p>
                  <p className="text-blue-300/60 text-xs mt-0.5">Subject: {t.subject}</p>
                  <p className="text-blue-300/40 text-sm mt-2 line-clamp-2 leading-relaxed">
                    {t.body.slice(0, 150)}{t.body.length > 150 && '...'}
                  </p>
                  <p className="text-blue-300/30 text-xs mt-2">{formatDate(t.created_at)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => router.push(`/campaigns/templates/${t.id}`)}
                    className="p-2 rounded-lg text-blue-300/60 hover:text-white hover:bg-white/5 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDuplicate(t)}
                    className="p-2 rounded-lg text-blue-300/60 hover:text-white hover:bg-white/5 transition-colors"
                    title="Duplicate"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deleting === t.id}
                    className="p-2 rounded-lg text-blue-300/60 hover:text-red-400 hover:bg-white/5 disabled:opacity-40 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
