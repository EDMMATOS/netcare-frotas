import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Car, Users, Fuel, Wrench,
  AlertTriangle, ClipboardCheck, BarChart3, Settings,
  Smartphone, LogOut, Bell, ChevronLeft, ChevronRight,
  Store, UserCog, FileText, Route, Menu, X
} from 'lucide-react'
import { supabase } from '../lib/supabase'

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
  { to: '/mileage',     icon: Route,           label: 'Quilometragem' },
  { to: '/orders',      icon: FileText,        label: 'Ordens de Compra' },
  { to: '/reports',     icon: BarChart3,       label: 'Relatórios' },
  { to: '/pdv',         icon: Smartphone,      label: 'PDV' },
  { to: '/signatories', icon: UserCog,         label: 'Responsáveis' },
  { to: '/admin',       icon: Settings,        label: 'Administração' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser]             = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    // Fecha menu ao redimensionar para desktop
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-slate-700 ${collapsed ? 'justify-center' : ''}`}>
        {!collapsed && (
          <div>
            <p className="text-white font-bold text-sm leading-tight">NetCare</p>
            <p className="text-slate-400 text-xs">Gestão de Frotas</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-white'
              } ${collapsed ? 'justify-center' : ''}`
            }>
            <Icon size={18} className="flex-shrink-0"/>
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className={`border-t border-slate-700 p-3 flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {user?.email?.[0]?.toUpperCase() || 'U'}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">Everton</p>
            <p className="text-slate-400 text-xs">Admin</p>
          </div>
        )}
        <button onClick={logout} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
          <LogOut size={16}/>
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className={`hidden md:flex flex-col bg-slate-900 transition-all duration-300 flex-shrink-0 ${collapsed ? 'w-16' : 'w-56'}`}>
        <SidebarContent/>
        {/* Botão colapsar */}
        <button onClick={() => setCollapsed(p => !p)}
          className="absolute top-5 -right-3 w-6 h-6 bg-slate-700 rounded-full flex items-center justify-center text-white hover:bg-indigo-600 transition-colors hidden md:flex"
          style={{ left: collapsed ? '52px' : '212px' }}>
          {collapsed ? <ChevronRight size={12}/> : <ChevronLeft size={12}/>}
        </button>
      </aside>

      {/* ── MOBILE OVERLAY ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)}/>
          {/* Drawer */}
          <aside className="absolute left-0 top-0 h-full w-64 bg-slate-900 flex flex-col z-50">
            <SidebarContent/>
          </aside>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="bg-white border-b border-slate-100 shadow-sm flex items-center px-4 h-14 flex-shrink-0 gap-3">
          {/* Botão hamburguer — só no mobile */}
          <button onClick={() => setMobileOpen(p => !p)}
            className="md:hidden text-slate-600 hover:text-slate-800 transition-colors">
            <Menu size={22}/>
          </button>

          <h1 className="text-slate-700 font-semibold text-sm flex-1 truncate">
            NetCare — Sistema de Gestão de Frotas
          </h1>

          <div className="flex items-center gap-3">
            <button className="relative text-slate-400 hover:text-slate-600 transition-colors">
              <Bell size={20}/>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">3</span>
            </button>
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
              E
            </div>
            <span className="text-slate-700 text-sm font-medium hidden sm:block">Everton</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet/>
        </main>
      </div>
    </div>
  )
}