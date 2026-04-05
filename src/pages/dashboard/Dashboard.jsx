import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Car, Users, Fuel, Wrench, AlertTriangle, ClipboardCheck, Bell, TrendingUp, TrendingDown, CheckCircle, XCircle, Clock, DollarSign } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}`
const fmtN = (v) => Number(v || 0).toLocaleString('pt-BR')

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [user, setUser]       = useState(null)
  const [stats, setStats]     = useState({})
  const [reminders, setReminders]     = useState([])
  const [fuelChart, setFuelChart]     = useState([])
  const [maintChart, setMaintChart]   = useState([])
  const [costByVehicle, setCostByVehicle] = useState([])
  const [finesPie, setFinesPie]       = useState([])
  const [recentActivity, setRecentActivity] = useState([])

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile }  = await supabase.from('user_profiles').select('full_name, role').eq('id', user.id).single()
    setUser({ ...user, ...profile })
    loadDashboard()
  }

  const loadDashboard = async () => {
    setLoading(true)
    const now      = new Date()
    const y        = now.getFullYear()
    const m        = now.getMonth()
    const mStart   = new Date(y, m, 1).toISOString().split('T')[0]
    const mEnd     = new Date(y, m+1, 0).toISOString().split('T')[0]
    const yStart   = new Date(y, 0, 1).toISOString().split('T')[0]

    const [
      { data: vehicles },
      { data: drivers },
      { data: fuelAll },
      { data: maintAll },
      { data: fines },
      { data: inspections },
      { data: remindersData },
      { data: orders },
      { data: pdvTrips },
    ] = await Promise.all([
      supabase.from('vehicles').select('id, plate, brand, model, current_odometer, ownership_type, is_active'),
      supabase.from('drivers').select('id, driver_type, is_active'),
      supabase.from('fuel_records').select('date, total_cost, vehicle_id, vehicles(plate, brand, model)').gte('date', yStart),
      supabase.from('maintenance_records').select('date, total_cost, vehicle_id, status, vehicles(plate, brand, model)').gte('date', yStart),
      supabase.from('fines').select('status, actual_value, date').gte('date', yStart),
      supabase.from('inspections').select('date, score, result, vehicle_id').order('date', { ascending: false }).limit(10),
      supabase.from('reminders').select('*').eq('is_resolved', false).order('created_at', { ascending: false }).limit(20),
      supabase.from('purchase_orders').select('status, total_value').gte('created_at', yStart),
      supabase.from('pdv_trips').select('status, total_value, date').gte('date', yStart),
    ])

    // Stats gerais
    const activeVehicles  = vehicles?.filter(v => v.is_active).length || 0
    const activeDrivers   = drivers?.filter(d => d.is_active).length || 0
    const fuelMonth       = fuelAll?.filter(f => f.date >= mStart && f.date <= mEnd).reduce((s, f) => s + Number(f.total_cost || 0), 0) || 0
    const maintMonth      = maintAll?.filter(m => m.date >= mStart && m.date <= mEnd).reduce((s, m) => s + Number(m.total_cost || 0), 0) || 0
    const fuelYear        = fuelAll?.reduce((s, f) => s + Number(f.total_cost || 0), 0) || 0
    const maintYear       = maintAll?.reduce((s, m) => s + Number(m.total_cost || 0), 0) || 0
    const finesPending    = fines?.filter(f => f.status === 'pending').reduce((s, f) => s + Number(f.actual_value || 0), 0) || 0
    const pdvPending      = pdvTrips?.filter(t => t.status === 'pending').reduce((s, t) => s + Number(t.total_value || 0), 0) || 0
    const ordersApproved  = orders?.filter(o => o.status === 'approved').reduce((s, o) => s + Number(o.total_value || 0), 0) || 0
    const inspAvg         = inspections?.length ? Math.round(inspections.reduce((s, i) => s + (i.score || 0), 0) / inspections.length) : 0

    setStats({
      activeVehicles, activeDrivers,
      fuelMonth, maintMonth, fuelYear, maintYear,
      finesPending, pdvPending, ordersApproved, inspAvg,
      totalCostYear: fuelYear + maintYear,
      totalVehicles: vehicles?.length || 0,
      totalDrivers:  drivers?.length || 0,
    })

    setReminders(remindersData || [])

    // Gráfico combustível por mês (últimos 6 meses)
    const fuelByMonth = []
    for (let i = 5; i >= 0; i--) {
      const d     = new Date(y, m - i, 1)
      const ms    = new Date(y, m - i, 1).toISOString().split('T')[0]
      const me    = new Date(y, m - i + 1, 0).toISOString().split('T')[0]
      const total = fuelAll?.filter(f => f.date >= ms && f.date <= me).reduce((s, f) => s + Number(f.total_cost || 0), 0) || 0
      fuelByMonth.push({ mes: d.toLocaleDateString('pt-BR', { month:'short' }), Combustível: total })
    }
    setFuelChart(fuelByMonth)

    // Gráfico manutenção por mês
    const maintByMonth = []
    for (let i = 5; i >= 0; i--) {
      const ms    = new Date(y, m - i, 1).toISOString().split('T')[0]
      const me    = new Date(y, m - i + 1, 0).toISOString().split('T')[0]
      const d     = new Date(y, m - i, 1)
      const total = maintAll?.filter(f => f.date >= ms && f.date <= me).reduce((s, m) => s + Number(m.total_cost || 0), 0) || 0
      maintByMonth.push({ mes: d.toLocaleDateString('pt-BR', { month:'short' }), Manutenção: total })
    }
    setMaintChart(maintByMonth)

    // Custo por veículo (top 5)
    const byVehicle = {}
    fuelAll?.forEach(f => {
      const key = f.vehicle_id
      if (!byVehicle[key]) byVehicle[key] = { name: f.vehicles?.plate || 'N/A', fuel: 0, maint: 0 }
      byVehicle[key].fuel += Number(f.total_cost || 0)
    })
    maintAll?.forEach(m => {
      const key = m.vehicle_id
      if (!byVehicle[key]) byVehicle[key] = { name: m.vehicles?.plate || 'N/A', fuel: 0, maint: 0 }
      byVehicle[key].maint += Number(m.total_cost || 0)
    })
    const costArr = Object.values(byVehicle)
      .map(v => ({ ...v, total: v.fuel + v.maint }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
    setCostByVehicle(costArr)

    // Pizza multas
    const finesByStatus = {
      'Pendentes': fines?.filter(f => f.status === 'pending').length || 0,
      'Pagas':     fines?.filter(f => f.status === 'paid').length || 0,
      'Recorrendo':fines?.filter(f => f.status === 'appealing').length || 0,
    }
    setFinesPie(Object.entries(finesByStatus).map(([name, value]) => ({ name, value })).filter(v => v.value > 0))

    // Atividade recente
    const activity = []
    fuelAll?.slice(0, 3).forEach(f => activity.push({ type:'fuel', text:`Abastecimento — ${f.vehicles?.plate}`, value: fmt(f.total_cost), date: f.date }))
    maintAll?.slice(0, 3).forEach(m => activity.push({ type:'maint', text:`Manutenção — ${m.vehicles?.plate}`, value: fmt(m.total_cost), date: m.date }))
    fines?.slice(0, 2).forEach(f => activity.push({ type:'fine', text:`Multa registrada`, value: fmt(f.actual_value), date: f.date }))
    activity.sort((a, b) => new Date(b.date) - new Date(a.date))
    setRecentActivity(activity.slice(0, 8))

    setLoading(false)
  }

  const resolveReminder = async (id) => {
    await supabase.from('reminders').update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq('id', id)
    setReminders(p => p.filter(r => r.id !== id))
    toast?.success('Lembrete resolvido!')
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* Saudação */}
      <div>
        <h2 className="text-slate-800 text-xl font-bold">{greeting}, {user?.full_name?.split(' ')[0]}! 👋</h2>
        <p className="text-slate-500 text-sm mt-0.5">
          {new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
        </p>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Veículos Ativos',    value: stats.activeVehicles,  icon: Car,          color:'bg-blue-50 text-blue-600',    sub:`de ${stats.totalVehicles} cadastrados` },
          { label:'Motoristas Ativos',  value: stats.activeDrivers,   icon: Users,        color:'bg-indigo-50 text-indigo-600', sub:`de ${stats.totalDrivers} cadastrados` },
          { label:'Custo Combustível',  value: fmt(stats.fuelMonth),  icon: Fuel,         color:'bg-amber-50 text-amber-600',  sub:'no mês atual' },
          { label:'Custo Manutenção',   value: fmt(stats.maintMonth), icon: Wrench,       color:'bg-red-50 text-red-600',      sub:'no mês atual' },
        ].map(c => {
          const Icon = c.icon
          return (
            <div key={c.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${c.color}`}>
                  <Icon size={20}/>
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800">{c.value}</p>
              <p className="text-slate-600 text-xs font-medium mt-1">{c.label}</p>
              <p className="text-slate-400 text-xs mt-0.5">{c.sub}</p>
            </div>
          )
        })}
      </div>

      {/* Cards financeiros */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label:'Multas Pendentes',   value: fmt(stats.finesPending),  color:'text-red-600',    bg:'bg-red-50',    icon:'⚠️' },
          { label:'PDV a Pagar',        value: fmt(stats.pdvPending),    color:'text-amber-600',  bg:'bg-amber-50',  icon:'📱' },
          { label:'OC Aprovadas',       value: fmt(stats.ordersApproved),color:'text-purple-600', bg:'bg-purple-50', icon:'📄' },
          { label:'Custo Total no Ano', value: fmt(stats.totalCostYear), color:'text-slate-700',  bg:'bg-slate-50',  icon:'💰' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-2xl border border-white shadow-sm p-4`}>
            <p className="text-slate-500 text-xs mb-1">{c.icon} {c.label}</p>
            <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Combustível por mês */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-700 text-sm mb-4">⛽ Combustível — Últimos 6 meses</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={fuelChart} margin={{ top:0, right:10, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="mes" tick={{ fontSize:11, fill:'#94a3b8' }}/>
              <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`}/>
              <Tooltip formatter={v => fmt(v)} labelStyle={{ fontSize:12 }} contentStyle={{ borderRadius:12, border:'1px solid #e2e8f0' }}/>
              <Bar dataKey="Combustível" fill="#f59e0b" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Manutenção por mês */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-700 text-sm mb-4">🔧 Manutenção — Últimos 6 meses</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={maintChart} margin={{ top:0, right:10, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="mes" tick={{ fontSize:11, fill:'#94a3b8' }}/>
              <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`}/>
              <Tooltip formatter={v => fmt(v)} labelStyle={{ fontSize:12 }} contentStyle={{ borderRadius:12, border:'1px solid #e2e8f0' }}/>
              <Bar dataKey="Manutenção" fill="#ef4444" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Custo por veículo */}
        {costByVehicle.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-700 text-sm mb-4">🚗 Custo por Veículo — Top 5</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={costByVehicle} layout="vertical" margin={{ top:0, right:10, left:20, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis type="number" tick={{ fontSize:10, fill:'#94a3b8' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`}/>
                <YAxis type="category" dataKey="name" tick={{ fontSize:11, fill:'#64748b' }} width={50}/>
                <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius:12, border:'1px solid #e2e8f0' }}/>
                <Bar dataKey="fuel" name="Combustível" fill="#f59e0b" stackId="a" radius={[0,0,0,0]}/>
                <Bar dataKey="maint" name="Manutenção" fill="#ef4444" stackId="a" radius={[0,6,6,0]}/>
                <Legend wrapperStyle={{ fontSize:11 }}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Pizza multas */}
        {finesPie.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-slate-700 text-sm mb-4">⚠️ Multas por Status</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={finesPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}>
                  {finesPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius:12, border:'1px solid #e2e8f0' }}/>
                <Legend wrapperStyle={{ fontSize:11 }}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Score médio de vistorias */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-700 text-sm mb-4">📋 Score Médio de Vistorias</h3>
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <div className={`text-6xl font-black ${stats.inspAvg >= 80 ? 'text-emerald-500' : stats.inspAvg >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                {stats.inspAvg}%
              </div>
              <p className={`text-sm font-semibold mt-1 ${stats.inspAvg >= 80 ? 'text-emerald-600' : stats.inspAvg >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                {stats.inspAvg >= 80 ? '✅ Frota em boas condições' : stats.inspAvg >= 60 ? '⚠️ Atenção necessária' : '🚨 Frota precisa de atenção urgente'}
              </p>
              <p className="text-slate-400 text-xs mt-1">Média das últimas 10 vistorias</p>
            </div>
          </div>
        </div>

        {/* Atividade recente */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-semibold text-slate-700 text-sm mb-4">🕒 Atividade Recente</h3>
          {recentActivity.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Nenhuma atividade registrada</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span>{a.type === 'fuel' ? '⛽' : a.type === 'maint' ? '🔧' : '⚠️'}</span>
                    <span className="text-slate-700 font-medium">{a.text}</span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <span className="font-bold text-slate-700">{a.value}</span>
                    <p className="text-slate-400">{new Date(a.date+'T12:00:00').toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alertas e Lembretes */}
      {reminders.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={16} className="text-amber-500"/>
            <h3 className="font-semibold text-slate-700 text-sm">Alertas e Lembretes Pendentes</h3>
            <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{reminders.length}</span>
          </div>
          <div className="space-y-2">
            {reminders.map(r => (
              <div key={r.id} className={`flex items-start justify-between gap-4 p-3 rounded-xl border ${
                r.priority === 'critical' ? 'bg-red-50 border-red-200' :
                r.priority === 'high'     ? 'bg-amber-50 border-amber-200' :
                'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${r.priority === 'critical' ? 'text-red-700' : r.priority === 'high' ? 'text-amber-700' : 'text-slate-700'}`}>
                    {r.priority === 'critical' ? '🚨' : r.priority === 'high' ? '⚠️' : '🔔'} {r.title}
                  </p>
                  {r.description && <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>}
                  {r.due_date && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Prazo: {new Date(r.due_date+'T12:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
                <button onClick={() => resolveReminder(r.id)}
                  className="flex-shrink-0 text-xs text-emerald-600 border border-emerald-200 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium">
                  ✓ Resolver
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}