'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { LayoutDashboard, Users, TrendingUp, Mail, ClipboardList, Settings, UsersRound, LogOut } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const baseNavItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Contacts', href: '/contacts', icon: Users },
  { label: 'Pipeline', href: '/pipeline', icon: TrendingUp },
  { label: 'Campaigns', href: '/campaigns', icon: Mail },
  { label: 'Activities', href: '/activities', icon: ClipboardList },
]

const adminNavItem = { label: 'Team', href: '/admin', icon: UsersRound }
const settingsNavItem = { label: 'Settings', href: '/settings', icon: Settings }

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [userEmail, setUserEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? '')

      // Check if user is an admin in any org
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle()

      setIsAdmin(!!membership)
    }
    init()
  }, [])

  const navItems = [
    ...baseNavItems,
    ...(isAdmin ? [adminNavItem] : []),
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
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
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
