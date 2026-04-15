'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Search, Plus, ChevronLeft, ChevronRight, Download, Trash2, Send, CheckSquare, Square } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Contact {
  id: string
  first_name: string | null
  last_name: string | null
  company: string | null
  title: string | null
  phone: string | null
  email: string | null
  city: string | null
  state: string | null
}

const PAGE_SIZE = 25
const EXPORT_COLUMNS = ['first_name', 'last_name', 'email', 'phone', 'company', 'title', 'role', 'city', 'state'] as const

export default function ContactsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [exportingInstantly, setExportingInstantly] = useState(false)
  const [deduping, setDeduping] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pushingInstantly, setPushingInstantly] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    fetchContacts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page])

  async function fetchContacts() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    setIsAdmin(membership?.role === 'admin')

    let query = supabase
      .from('contacts')
      .select('id, first_name, last_name, company, title, phone, email, city, state', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (search.trim()) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%`
      )
    }

    const from = page * PAGE_SIZE
    query = query.range(from, from + PAGE_SIZE - 1)

    const { data, count } = await query
    setContacts(data ?? [])
    setTotalCount(count ?? 0)
    setLoading(false)
  }

  async function handleExport() {
    setExporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('contacts')
      .select(EXPORT_COLUMNS.join(', '))
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!data || data.length === 0) {
      setExporting(false)
      return
    }

    const header = EXPORT_COLUMNS.join(',')
    const csvRows = (data as unknown as Record<string, string | null>[]).map((row) =>
      EXPORT_COLUMNS.map((col) => {
        const val = row[col] ?? ''
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val
      }).join(',')
    )
    const csv = [header, ...csvRows].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'logicrm-contacts.csv'
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  async function handleExportInstantly() {
    setExportingInstantly(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('contacts')
      .select('first_name, last_name, email, company, phone, city, state')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!data || data.length === 0) {
      setExportingInstantly(false)
      return
    }

    const instantlyColumns = [
      { db: 'first_name', header: 'firstName' },
      { db: 'last_name', header: 'lastName' },
      { db: 'email', header: 'email' },
      { db: 'company', header: 'companyName' },
      { db: 'phone', header: 'phone' },
      { db: 'city', header: 'city' },
      { db: 'state', header: 'state' },
    ]

    const header = instantlyColumns.map(c => c.header).join(',')
    const rows = (data as unknown as Record<string, string | null>[]).map((row) =>
      instantlyColumns.map(c => {
        const val = row[c.db] ?? ''
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val
      }).join(',')
    )
    const csv = [header, ...rows].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'logicrm-contacts-instantly.csv'
    a.click()
    URL.revokeObjectURL(url)
    setExportingInstantly(false)
  }

  async function handleDedup() {
    setDeduping(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Fetch all contacts with email, ordered newest first
    const { data: all } = await supabase
      .from('contacts')
      .select('id, email, created_at')
      .eq('user_id', user.id)
      .not('email', 'is', null)
      .order('created_at', { ascending: false })

    if (!all || all.length === 0) {
      toast('No duplicates found.')
      setDeduping(false)
      return
    }

    // Group by lowercase email, keep the first (newest) of each
    const seen = new Map<string, boolean>()
    const idsToDelete: string[] = []

    for (const c of all) {
      const key = (c.email as string).toLowerCase()
      if (seen.has(key)) {
        idsToDelete.push(c.id)
      } else {
        seen.set(key, true)
      }
    }

    if (idsToDelete.length === 0) {
      toast('No duplicates found.')
      setDeduping(false)
      return
    }

    // Delete in batches
    const BATCH = 100
    for (let i = 0; i < idsToDelete.length; i += BATCH) {
      const batch = idsToDelete.slice(i, i + BATCH)
      await supabase.from('contacts').delete().in('id', batch)
    }

    toast.success(`Removed ${idsToDelete.length} duplicate${idsToDelete.length !== 1 ? 's' : ''}.`)
    setDeduping(false)
    setPage(0)
    fetchContacts()
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (contacts.every(c => selectedIds.has(c.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)))
    }
  }

  async function handleBulkDelete() {
    if (!isAdmin || !userId) return
    if (selectedIds.size === 0) { toast.error('Select contacts first'); return }
    const count = selectedIds.size
    const ok = typeof window !== 'undefined' &&
      window.confirm(`Are you sure you want to delete ${count} contact${count !== 1 ? 's' : ''}? This cannot be undone.`)
    if (!ok) return

    setBulkDeleting(true)
    try {
      const res = await fetch('/api/contacts/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callerId: userId, contactIds: Array.from(selectedIds) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Delete failed')
      } else {
        toast.success(`Deleted ${data.deleted ?? count} contact${(data.deleted ?? count) !== 1 ? 's' : ''}`)
        setSelectedIds(new Set())
        await fetchContacts()
      }
    } catch {
      toast.error('Delete failed')
    }
    setBulkDeleting(false)
  }

  async function handlePushToInstantly() {
    if (selectedIds.size === 0) { toast.error('Select contacts first'); return }
    setPushingInstantly(true)
    try {
      const res = await fetch('/api/instantly/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: Array.from(selectedIds) }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Export failed') }
      else {
        toast.success(`${data.leads_exported} leads pushed to Instantly as "${data.campaign_name}"`)
        setSelectedIds(new Set())
      }
    } catch { toast.error('Export failed') }
    setPushingInstantly(false)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="px-8 py-10 max-w-6xl">
      {/* Page title row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Contacts</h2>
          <p className="text-blue-300 text-sm mt-1">
            {totalCount} contact{totalCount !== 1 && 's'} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDedup}
            disabled={deduping || totalCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-red-400 hover:border-red-400/30 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {deduping ? 'Removing...' : 'Remove Duplicates'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || totalCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting...' : 'Export'}
          </button>
          <button
            onClick={handleExportInstantly}
            disabled={exportingInstantly || totalCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <Download className="w-4 h-4" />
            {exportingInstantly ? 'Exporting...' : 'Export for Instantly'}
          </button>
          {isAdmin && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting || selectedIds.size === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              style={{ backgroundColor: '#dc2626' }}
            >
              <Trash2 className="w-4 h-4" />
              {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}
            </button>
          )}
          {selectedIds.size > 0 && (
            <button
              onClick={handlePushToInstantly}
              disabled={pushingInstantly}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white hover:brightness-110 disabled:opacity-60 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              <Send className="w-4 h-4" />
              {pushingInstantly ? 'Pushing...' : `Push ${selectedIds.size} to Instantly`}
            </button>
          )}
          <button
            onClick={() => router.push('/contacts/new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-white text-sm transition-colors hover:brightness-110"
            style={{ backgroundColor: '#d4930e' }}
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, company, email, or city..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-blue-300/50 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors"
        />
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-3 py-3.5 w-10">
                    <button onClick={toggleSelectAll} className="text-blue-300/40 hover:text-white transition-colors">
                      {contacts.length > 0 && contacts.every(c => selectedIds.has(c.id))
                        ? <CheckSquare className="w-4 h-4" style={{ color: '#d4930e' }} />
                        : <Square className="w-4 h-4" />
                      }
                    </button>
                  </th>
                  <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300">Name</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300">Company</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300 hidden md:table-cell">Title</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300 hidden lg:table-cell">Phone</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300">Email</th>
                <th className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-blue-300 hidden sm:table-cell">City / State</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-blue-300/60 text-sm">
                    Loading contacts...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-blue-300/60 text-sm">
                    {search ? 'No contacts match your search.' : 'No contacts yet. Click "Add Contact" to get started.'}
                  </td>
                </tr>
              ) : (
                contacts.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '\u2014'
                  const location = [c.city, c.state].filter(Boolean).join(', ') || '\u2014'
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="px-3 py-3.5 w-10">
                        <button onClick={() => toggleSelect(c.id)} className="text-blue-300/40 hover:text-white transition-colors">
                          {selectedIds.has(c.id)
                            ? <CheckSquare className="w-4 h-4" style={{ color: '#d4930e' }} />
                            : <Square className="w-4 h-4" />
                          }
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-medium whitespace-nowrap">
                        <Link href={`/contacts/${c.id}`} className="text-white hover:underline" style={{ color: '#d4930e' }}>
                          {name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-blue-200 whitespace-nowrap">{c.company || '\u2014'}</td>
                      <td className="px-5 py-3.5 text-sm text-blue-200 whitespace-nowrap hidden md:table-cell">{c.title || '\u2014'}</td>
                      <td className="px-5 py-3.5 text-sm text-blue-200 whitespace-nowrap hidden lg:table-cell">{c.phone || '\u2014'}</td>
                      <td className="px-5 py-3.5 text-sm text-blue-200 whitespace-nowrap">{c.email || '\u2014'}</td>
                      <td className="px-5 py-3.5 text-sm text-blue-200 whitespace-nowrap hidden sm:table-cell">{location}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/10">
            <p className="text-xs text-blue-300/60">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg border border-white/10 text-blue-300 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1.5 rounded-lg border border-white/10 text-blue-300 hover:text-white hover:border-white/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
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
