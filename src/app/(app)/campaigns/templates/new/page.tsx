'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, Sparkles, Eye } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MERGE_TAGS = [
  '{{first_name}}', '{{last_name}}', '{{company}}',
  '{{email}}', '{{title}}', '{{city}}', '{{state}}',
]

const SAMPLE_CONTACT = {
  first_name: 'John',
  last_name: 'Doe',
  company: 'Acme Freight',
  email: 'john@acmefreight.com',
  title: 'Logistics Manager',
  city: 'Memphis',
  state: 'TN',
}

export default function NewTemplatePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  function insertTag(tag: string) {
    const textarea = document.getElementById('tpl-body') as HTMLTextAreaElement | null
    if (!textarea) { setBody((b) => b + tag); return }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    setBody(body.slice(0, start) + tag + body.slice(end))
    setTimeout(() => {
      textarea.focus()
      textarea.selectionStart = textarea.selectionEnd = start + tag.length
    }, 0)
  }

  function previewText(text: string) {
    return text
      .replace(/\{\{first_name\}\}/g, SAMPLE_CONTACT.first_name)
      .replace(/\{\{last_name\}\}/g, SAMPLE_CONTACT.last_name)
      .replace(/\{\{company\}\}/g, SAMPLE_CONTACT.company)
      .replace(/\{\{email\}\}/g, SAMPLE_CONTACT.email)
      .replace(/\{\{title\}\}/g, SAMPLE_CONTACT.title)
      .replace(/\{\{city\}\}/g, SAMPLE_CONTACT.city)
      .replace(/\{\{state\}\}/g, SAMPLE_CONTACT.state)
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Enter a template name.'); return }
    if (!subject.trim()) { toast.error('Enter a subject line.'); return }
    if (!body.trim()) { toast.error('Enter the email body.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { error } = await supabase.from('email_templates').insert({
      user_id: user.id,
      name: name.trim(),
      subject: subject.trim(),
      body: body.trim(),
    })

    if (error) {
      toast.error('Failed to save template.')
      setSaving(false)
      return
    }

    toast.success('Template saved!')
    router.push('/campaigns/templates')
  }

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5'

  return (
    <div className="px-8 py-10 max-w-5xl">
      <button
        onClick={() => router.push('/campaigns/templates')}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Templates
      </button>

      <h2 className="text-2xl font-bold text-white mb-1">New Template</h2>
      <p className="text-blue-300 text-sm mb-8">Create a reusable email template for your campaigns.</p>

      {/* Name + Subject */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5 mb-4">
        <div>
          <label className={labelClass}>Template Name</label>
          <input
            type="text"
            placeholder="Cold Outreach v1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
          <p className="text-blue-300/40 text-xs mt-1">Internal name to identify this template.</p>
        </div>
        <div>
          <label className={labelClass}>Subject Line</label>
          <input
            type="text"
            placeholder="Quick question about freight at {{company}}"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Merge tags */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles className="w-4 h-4" style={{ color: '#d4930e' }} />
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Merge Tags</p>
          <span className="text-blue-300/30 text-xs ml-1">— click to insert at cursor</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {MERGE_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => insertTag(tag)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono bg-white/5 border border-white/10 text-blue-200 hover:text-white hover:border-yellow-500/40 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Body + Preview side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <label className={labelClass}>Email Body</label>
          <textarea
            id="tpl-body"
            rows={16}
            placeholder={"Hi {{first_name}},\n\nQuick question — who handles freight at {{company}}?\n\n..."}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={`${inputClass} resize-none font-mono`}
          />
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2 shrink-0">
            <Eye className="w-3.5 h-3.5" style={{ color: '#d4930e' }} />
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Preview</p>
            <span className="text-blue-300/30 text-xs ml-1">— sample data</span>
          </div>
          <div className="p-5 flex-1 overflow-y-auto">
            <div className="mb-3">
              <p className="text-[10px] uppercase tracking-wide text-blue-300/40 mb-0.5">Subject</p>
              <p className="text-sm text-white font-medium">
                {subject.trim() ? previewText(subject) : <span className="text-blue-300/30 italic">Enter a subject line...</span>}
              </p>
            </div>
            <div className="border-t border-white/10 pt-3">
              {body.trim() ? (
                <p className="text-sm text-blue-200 whitespace-pre-wrap leading-relaxed">
                  {previewText(body)}
                </p>
              ) : (
                <p className="text-sm text-blue-300/30 italic">Start typing to see a preview...</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 disabled:opacity-60 transition-colors"
          style={{ backgroundColor: '#d4930e' }}
        >
          {saving ? 'Saving...' : 'Save Template'}
        </button>
        <button
          onClick={() => router.push('/campaigns/templates')}
          className="px-6 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
