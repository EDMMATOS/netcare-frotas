import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, Building2, Car, Users, Fuel, Wrench,
  AlertTriangle, ClipboardCheck, BarChart3, Settings,
  Smartphone, LogOut, Bell, ChevronLeft, ChevronRight,
  Store, UserCog, FileText, Route
} from 'lucide-react'

const navItems = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/companies',   icon: Building2,       label: 'Empresas' },
  { to: '/vehicles',    icon: Car,             label: 'Veículos' },
  { to: '/drivers',     icon: Users,           label: 'Motoristas' },
  { to: '/suppliers',   icon: Store,           label: 'Fornecedores' },
  { to: '/fuel',        icon: Fuel,            label: 'Abastecimento' },
  { to: '/maintenance', icon: Wrench,          label: 'Manutenção' },
  { to: '/fines',       icon: AlertTriangle,   label: 'Multas' },
  { to: '/inspections', icon: ClipboardCheck,  label: 'Vistoria' },
  { to: '/reports',     icon: BarChart3,       label: 'Relatórios' },
  { to: '/pdv',         icon: Smartphone,      label: 'PDV' },
  { to: '/admin',       icon: Settings,        label: 'Administração' },
  { to: '/signatories', icon: UserCog, label: 'Responsáveis' },
  { to: '/orders', icon: FileText, label: 'Ordens de Compra' },
  { to: '/mileage', icon: Route, label: 'Quilometragem' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [profile, setProfile] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: p } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()
      setProfile(p)
      if (p?.photo_url) {
        const { data: url } = supabase.storage
          .from('user-photos')
          .getPublicUrl(p.photo_url)
        setPhotoUrl(url.publicUrl)
      }
    })
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* SIDEBAR */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-slate-900 flex flex-col transition-all duration-300 flex-shrink-0`}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-5 border-b border-slate-800">
          {!collapsed && (
            <div>
              <p className="text-white font-bold text-sm leading-tight">NetCare</p>
              <p className="text-indigo-400 text-xs">Gestão de Frotas</p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="text-slate-400 hover:text-white transition-colors ml-auto">
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-150 border-l-2 ${
                  isActive
                    ? 'bg-indigo-600/20 text-white border-indigo-500 font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800 border-transparent'
                }`
              }
            >
              <Icon size={17} className="flex-shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-3">
            {photoUrl ? (
              <img src={photoUrl} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {initials}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{profile?.full_name || 'Usuário'}</p>
                <p className="text-slate-500 text-xs truncate capitalize">{profile?.role || ''}</p>
              </div>
            )}
            {!collapsed && (
              <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors">
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <h1 className="text-slate-800 font-semibold text-base">NetCare — Sistema de Gestão de Frotas</h1>
          <div className="flex items-center gap-3">
            <button className="relative text-slate-500 hover:text-slate-800 transition-colors">
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">3</span>
            </button>
            {photoUrl ? (
              <img src={photoUrl} className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                {initials}
              </div>
            )}
            <span className="text-sm text-slate-700 font-medium">{profile?.full_name || 'Usuário'}</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}