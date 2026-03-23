'use client'

import { useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CONTACT_FIELDS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'lead_contact_name', label: 'Lead Contact Name → First + Last' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
  { key: 'title', label: 'Title' },
  { key: 'role', label: 'Role' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'location', label: 'Location → City + State' },
] as const

// The actual DB columns we insert into (no combo fields)
const DB_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'company', 'title', 'role', 'city', 'state'] as const

type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done'

export default function ImportContactsPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importedCount, setImportedCount] = useState(0)
  const [errorCount, setErrorCount] = useState(0)

  function autoMap(fileHeaders: string[]) {
    const auto: Record<string, string> = {}
    const lower = fileHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''))

    // Check for combo columns first so they take priority
    const leadContactIdx = lower.findIndex((h) => h === 'leadcontactname')
    if (leadContactIdx !== -1) {
      auto['lead_contact_name'] = fileHeaders[leadContactIdx]
    }

    const locationIdx = lower.findIndex((h) => h === 'location')
    if (locationIdx !== -1) {
      auto['location'] = fileHeaders[locationIdx]
    }

    for (const field of CONTACT_FIELDS) {
      // Skip combo fields in the normal loop (handled above)
      if (field.key === 'lead_contact_name' || field.key === 'location') continue
      // Skip first/last name if we already have lead_contact_name mapped
      if ((field.key === 'first_name' || field.key === 'last_name') && auto['lead_contact_name']) continue
      // Skip city/state if we already have location mapped
      if ((field.key === 'city' || field.key === 'state') && auto['location']) continue

      const fieldNorm = field.key.replace(/_/g, '')
      const idx = lower.findIndex((h) =>
        h === fieldNorm ||
        h === field.key ||
        h.includes(fieldNorm) ||
        (field.key === 'first_name' && (h === 'firstname' || h === 'first')) ||
        (field.key === 'last_name' && (h === 'lastname' || h === 'last')) ||
        (field.key === 'phone' && (h.includes('phone') || h.includes('tel'))) ||
        (field.key === 'email' && h.includes('email')) ||
        (field.key === 'company' && (h.includes('company') || h.includes('organization') || h.includes('org'))) ||
        (field.key === 'city' && h.includes('city')) ||
        (field.key === 'state' && (h === 'state' || h === 'st' || h === 'province'))
      )
      if (idx !== -1) auto[field.key] = fileHeaders[idx]
    }
    return auto
  }

  function parseFile(file: File) {
    setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete(results) {
          const data = results.data as Record<string, string>[]
          if (data.length === 0) { toast.error('No data found in CSV.'); return }
          const h = Object.keys(data[0])
          setHeaders(h)
          setRows(data)
          setMapping(autoMap(h))
          setStep('map')
        },
        error() { toast.error('Failed to parse CSV file.') },
      })
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const wb = XLSX.read(e.target?.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' })
        if (data.length === 0) { toast.error('No data found in spreadsheet.'); return }
        const h = Object.keys(data[0])
        setHeaders(h)
        setRows(data)
        setMapping(autoMap(h))
        setStep('map')
      }
      reader.readAsArrayBuffer(file)
    } else {
      toast.error('Please upload a .csv or .xlsx file.')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  function getMappedRows() {
    return rows.map((row) => {
      const mapped: Record<string, string | null> = {}

      // Start with direct field mappings
      for (const field of DB_FIELDS) {
        const srcCol = mapping[field]
        mapped[field] = srcCol ? (String(row[srcCol]).trim() || null) : null
      }

      // "Lead Contact Name" → split into first_name + last_name
      const nameCol = mapping['lead_contact_name']
      if (nameCol) {
        const fullName = String(row[nameCol]).trim()
        if (fullName) {
          const spaceIdx = fullName.indexOf(' ')
          if (spaceIdx === -1) {
            mapped['first_name'] = fullName
            mapped['last_name'] = null
          } else {
            mapped['first_name'] = fullName.slice(0, spaceIdx)
            mapped['last_name'] = fullName.slice(spaceIdx + 1).trim() || null
          }
        }
      }

      // "Location" → split into city + state
      const locCol = mapping['location']
      if (locCol) {
        const location = String(row[locCol]).trim()
        if (location) {
          const commaIdx = location.lastIndexOf(',')
          if (commaIdx === -1) {
            mapped['city'] = location
            mapped['state'] = null
          } else {
            mapped['city'] = location.slice(0, commaIdx).trim() || null
            mapped['state'] = location.slice(commaIdx + 1).trim() || null
          }
        }
      }

      return mapped
    })
  }

  async function handleImport() {
    setStep('importing')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const mapped = getMappedRows()
    const BATCH_SIZE = 100
    let success = 0
    let errors = 0

    for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
      const batch = mapped.slice(i, i + BATCH_SIZE).map((row) => {
        const clean: Record<string, string | null> = { user_id: user.id }
        for (const key of DB_FIELDS) clean[key] = row[key] ?? null
        return clean
      })
      const { error, data } = await supabase.from('contacts').insert(batch).select('id')
      if (error) {
        errors += batch.length
      } else {
        success += data?.length ?? batch.length
      }
    }

    setImportedCount(success)
    setErrorCount(errors)
    setStep('done')
  }

  const preview = getMappedRows().slice(0, 5)
  const mappedFieldCount = Object.values(mapping).filter(Boolean).length

  // Which DB columns will have data after mapping + splitting
  const activeDbFields = DB_FIELDS.filter((f) => {
    if (mapping[f]) return true
    if ((f === 'first_name' || f === 'last_name') && mapping['lead_contact_name']) return true
    if ((f === 'city' || f === 'state') && mapping['location']) return true
    return false
  })

  const selectClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-transparent transition-colors'

  return (
    <div className="px-8 py-10 max-w-4xl">
      <button
        onClick={() => router.push('/contacts')}
        className="flex items-center gap-1 text-blue-300 hover:text-white text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Contacts
      </button>

      <h2 className="text-2xl font-bold text-white mb-1">Import Contacts</h2>
      <p className="text-blue-300 text-sm mb-8">Upload a CSV or Excel file to bulk-add contacts.</p>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="bg-white/5 border-2 border-dashed border-white/15 rounded-2xl p-16 text-center cursor-pointer hover:border-yellow-500/40 transition-colors"
        >
          <Upload className="w-10 h-10 mx-auto mb-4" style={{ color: '#d4930e' }} />
          <p className="text-white font-medium mb-1">
            Drag & drop your file here, or click to browse
          </p>
          <p className="text-blue-300/60 text-sm">Supports .csv and .xlsx files</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) parseFile(e.target.files[0]) }}
          />
        </div>
      )}

      {/* Step: Map Columns */}
      {step === 'map' && (
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <FileSpreadsheet className="w-5 h-5" style={{ color: '#d4930e' }} />
              <div>
                <p className="text-white font-medium text-sm">{fileName}</p>
                <p className="text-blue-300/60 text-xs">{rows.length} rows &middot; {headers.length} columns</p>
              </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-blue-300 mb-3">
              Map your columns
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {CONTACT_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="block text-xs text-blue-300/70 mb-1">{field.label}</label>
                  <select
                    value={mapping[field.key] || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="" className="bg-[#0f1c35]">— Skip —</option>
                    {headers.map((h) => (
                      <option key={h} value={h} className="bg-[#0f1c35]">{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => { if (mappedFieldCount > 0) setStep('preview'); else toast.error('Map at least one column.') }}
              className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              Preview Import
            </button>
            <button
              onClick={() => { setStep('upload'); setRows([]); setHeaders([]) }}
              className="px-6 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/10">
              <p className="text-white font-medium text-sm">
                Preview — first {Math.min(5, rows.length)} of {rows.length} rows
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    {activeDbFields.map((f) => (
                      <th key={f} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-blue-300 whitespace-nowrap">
                        {f.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-white/5">
                      {activeDbFields.map((f) => (
                        <td key={f} className="px-4 py-3 text-sm text-blue-200 whitespace-nowrap">
                          {row[f] || <span className="text-blue-300/30">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              Import {rows.length} Contact{rows.length !== 1 && 's'}
            </button>
            <button
              onClick={() => setStep('map')}
              className="px-6 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
            >
              Back to Mapping
            </button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center">
          <div
            className="w-12 h-12 rounded-full border-4 border-white/10 border-t-[#d4930e] animate-spin mx-auto mb-4"
          />
          <p className="text-white font-medium">Importing contacts...</p>
          <p className="text-blue-300/60 text-sm mt-1">This may take a moment.</p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
          {errorCount === 0 ? (
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-yellow-400" />
          )}
          <p className="text-white font-bold text-lg mb-1">Import Complete</p>
          <p className="text-blue-300 text-sm mb-1">
            Successfully imported <span className="text-emerald-400 font-semibold">{importedCount}</span> contact{importedCount !== 1 && 's'}.
          </p>
          {errorCount > 0 && (
            <p className="text-red-400 text-sm">
              {errorCount} row{errorCount !== 1 && 's'} failed to import.
            </p>
          )}
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => router.push('/contacts')}
              className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm hover:brightness-110 transition-colors"
              style={{ backgroundColor: '#d4930e' }}
            >
              View Contacts
            </button>
            <button
              onClick={() => { setStep('upload'); setRows([]); setHeaders([]); setMapping({}) }}
              className="px-6 py-2.5 rounded-lg font-semibold text-sm text-blue-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors"
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
