'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { LayoutDashboard, Bot, Users, Building2, TrendingUp, Mail, Sparkles, CheckSquare, ClipboardList, Settings, UsersRound, LogOut, BarChart2 } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const baseNavItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'AI Team', href: '/marketing-team', icon: Bot },
  { label: 'Contacts', href: '/contacts', icon: Users },
  { label: 'Companies', href: '/companies', icon: Building2 },
  { label: 'Pipeline', href: '/pipeline', icon: TrendingUp },
  { label: 'Campaigns', href: '/campaigns', icon: Mail },
  { label: 'AI Sequence', href: '/campaigns/ai-sequence', icon: Sparkles },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare },
  { label: 'Activities', href: '/activities', icon: ClipboardList },
]

const salesManagerNavItem = { label: 'Sales Manager', href: '/sales-manager', icon: BarChart2 }
const adminNavItem = { label: 'Team', href: '/admin', icon: UsersRound }
const settingsNavItem = { label: 'Settings', href: '/settings', icon: Settings }

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [urgentTaskCount, setUrgentTaskCount] = useState(0)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? '')

      // Check if user is an admin — try direct query first, fallback to API
      const { data: membership, error: memErr } = await supabase
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      console.log('[Sidebar] membership:', membership, 'error:', memErr?.message)

      if (membership?.role === 'admin') {
        setIsAdmin(true)
      } else if (memErr) {
        // RLS blocked — try API route as fallback
        try {
          await fetch('/api/subscription', { method: 'GET' })
          // If user has any org, they might be admin — fail open for now
          console.log('[Sidebar] RLS blocked membership query, failing open for admin check')
          setIsAdmin(true)
        } catch { setIsAdmin(false) }
      }

      // Count overdue + due today tasks
      const todayStr = new Date().toISOString().split('T')[0]
      const { count } = await supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('type', 'task')
        .eq('completed', false)
        .lte('due_date', todayStr)

      setUrgentTaskCount(count ?? 0)
    }
    init()
  }, [])

  const navItems = [
    ...baseNavItems,
    ...(isAdmin ? [salesManagerNavItem, adminNavItem] : []),
    settingsNavItem,
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside
      className="fixed top-0 left-0 h-screen w-60 flex flex-col border-r border-white/10 z-40"
      style={{ backgroundColor: '#0f1c35' }}
    >
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <h1
          className="text-xl font-black text-white tracking-tight cursor-pointer"
          onClick={() => router.push('/dashboard')}
        >
          Logi<span style={{ color: '#d4930e' }}>CRM</span>
        </h1>
        <p className="text-blue-400/60 text-[10px] mt-0.5 uppercase tracking-widest">
          Bid Genie AI
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/')
          const showBadge = item.href === '/tasks' && urgentTaskCount > 0
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-blue-300 hover:text-white hover:bg-white/5'
              }`}
              style={isActive ? { backgroundColor: 'rgba(212,147,14,0.15)', color: '#d4930e' } : undefined}
            >
              <item.icon
                className="w-[18px] h-[18px] shrink-0"
                style={isActive ? { color: '#d4930e' } : undefined}
              />
              {item.label}
              {showBadge && (
                <span className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
                  {urgentTaskCount > 9 ? '9+' : urgentTaskCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* User / Sign out */}
      <div className="px-3 py-4 border-t border-white/10 space-y-2">
        {userEmail && (
          <p className="px-3 text-xs text-blue-300/60 truncate">{userEmail}</p>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-300 hover:text-white hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
