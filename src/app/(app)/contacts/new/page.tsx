'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, AlertTriangle } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ROLES = [
  'Transportation Manager',
  'Procurement',
  'Owner-Operator',
  'Dispatcher',
  'Broker',
  'Other',
]

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

export default function NewContactPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    email2: '',
    phone: '',
    cell_phone: '',
    company: '',
    title: '',
    role: '',
    city: '',
    state: '',
    notes: '',
  })

  const [duplicates, setDuplicates] = useState<{ id: string; first_name: string; last_name: string; email: string | null; company: string | null; owner_name: string }[]>([])
  const [userId, setUserId] = useState('')
  const debounceRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) })
  }, [])

  // Debounced duplicate check
  useEffect(() => {
    if (!userId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!form.email && !(form.first_name && form.last_name && form.company)) {
        setDuplicates([])
        return
      }
      try {
        const res = await fetch('/api/contacts/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, firstName: form.first_name, lastName: form.last_name, company: form.company, user_id: userId }),
        })
        const data = await res.json()
        setDuplicates(data.duplicates || [])
      } catch { setDuplicates([]) }
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [form.email, form.first_name, form.last_name, form.company, userId])

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.first_name.trim() && !form.last_name.trim()) {
      toast.error('Please enter at least a first or last name.')
      return
    }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // Auto-link or create company
    let companyId: string | null = null
    const companyName = form.company.trim()
    if (companyName) {
      // Check if company already exists
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .ilike('name', companyName)
        .limit(1)
        .maybeSingle()

      if (existing) {
        companyId = existing.id
      } else {
        // Create new company
        const { data: newComp } = await supabase
          .from('companies')
          .insert({ user_id: user.id, name: companyName })
          .select('id')
          .single()
        companyId = newComp?.id ?? null
      }
    }

    const { error } = await supabase.from('contacts').insert({
      user_id: user.id,
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      email: form.email.trim() || null,
      email2: form.email2.trim() || null,
      phone: form.phone.trim() || null,
      cell_phone: form.cell_phone.trim() || null,
      company: companyName || null,
      company_id: companyId,
      title: form.title.trim() || null,
      role: form.role || null,
      city: form.city.trim() || null,
      state: form.state || null,
      notes: form.notes.trim() || null,
    })

    if (error) {
      toast.error('Failed to save contact. Please try again.')
      setSaving(false)
      return
    }

    toast.success('Contact added!')
    router.push('/contacts')
  }

  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'
  const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1.5'

  return (
    <div className="px-8 py-10 max-w-3xl">
      {/* Back link */}
      <button
        onClick={() => router.push('/contacts')}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Contacts
      </button>

      <h2 className="text-2xl font-bold text-white mb-1">Add Contact</h2>
      <p className="text-blue-300 text-sm mb-8">
        Add a new contact to your freight network.
      </p>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6">
        {/* Row: First / Last name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>First Name</label>
            <input
              type="text"
              placeholder="John"
              value={form.first_name}
              onChange={(e) => update('first_name', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Last Name</label>
            <input
              type="text"
              placeholder="Doe"
              value={form.last_name}
              onChange={(e) => update('last_name', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Row: Email / Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              placeholder="john@example.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="tel"
              placeholder="(555) 123-4567"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Duplicate Warning */}
        {duplicates.length > 0 && (
          <div className="rounded-xl p-4 border" style={{ backgroundColor: 'rgba(234,179,8,0.05)', borderColor: 'rgba(234,179,8,0.3)' }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <p className="text-sm font-semibold text-yellow-400">This contact may already exist in LogiCRM</p>
            </div>
            <div className="space-y-2">
              {duplicates.map(d => (
                <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  <div>
                    <p className="text-xs font-medium text-white">{d.first_name} {d.last_name}{d.company ? ` · ${d.company}` : ''}</p>
                    <p className="text-[10px] text-blue-300/40">{d.email || 'No email'} · Owned by {d.owner_name}</p>
                  </div>
                  <Link href={`/contacts/${d.id}`} className="text-[10px] font-medium px-2 py-1 rounded-lg" style={{ color: '#d4930e', backgroundColor: 'rgba(212,147,14,0.08)' }}>View</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Row: Secondary Email / Cell Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Secondary Email</label>
            <input
              type="email"
              placeholder="alt@example.com"
              value={form.email2}
              onChange={(e) => update('email2', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Cell Phone</label>
            <input
              type="tel"
              placeholder="(555) 987-6543"
              value={form.cell_phone}
              onChange={(e) => update('cell_phone', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Row: Company / Title */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Company</label>
            <input
              type="text"
              placeholder="Acme Freight LLC"
              value={form.company}
              onChange={(e) => update('company', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Title</label>
            <input
              type="text"
              placeholder="Operations Manager"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Role dropdown */}
        <div>
          <label className={labelClass}>Role</label>
          <select
            value={form.role}
            onChange={(e) => update('role', e.target.value)}
            className={`${inputClass} ${!form.role ? 'text-blue-300/40' : ''}`}
          >
            <option value="">Select a role...</option>
            {ROLES.map((r) => (
              <option key={r} value={r} className="bg-[#0f1c35] text-white">
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* Row: City / State */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>City</label>
            <input
              type="text"
              placeholder="Dallas"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>State</label>
            <select
              value={form.state}
              onChange={(e) => update('state', e.target.value)}
              className={`${inputClass} ${!form.state ? 'text-blue-300/40' : ''}`}
            >
              <option value="">Select state...</option>
              {US_STATES.map((s) => (
                <option key={s} value={s} className="bg-[#0f1c35] text-white">
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            rows={4}
            placeholder="Any additional details about this contact..."
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm transition-colors hover:brightness-110 disabled:opacity-60"
            style={{ backgroundColor: '#d4930e' }}
          >
            {saving ? 'Saving...' : 'Save Contact'}
          </button>
          <button
            onClick={() => router.push('/contacts')}
            className="px-6 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
