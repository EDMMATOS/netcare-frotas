import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, Wrench, X, Pencil, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react'
import toast from 'react-hot-toast'

const empty = {
  date: new Date().toISOString().split('T')[0],
  vehicle_id:'', supplier_id:'', type:'preventive',
  description:'', parts_cost:0, labor_cost:0,
  odometer:'', next_maintenance_km:'', next_maintenance_date:'',
  status:'completed', notes:''
}

const TYPES = {
  oil:         { label:'Troca de Óleo',      icon:'🛢️', color:'bg-amber-50 text-amber-700' },
  belt:        { label:'Correia Dentada',    icon:'⚙️', color:'bg-orange-50 text-orange-700' },
  tires:       { label:'Pneus',             icon:'🔄', color:'bg-slate-100 text-slate-700' },
  brakes:      { label:'Freios',            icon:'🛑', color:'bg-red-50 text-red-700' },
  review:      { label:'Revisão',           icon:'📋', color:'bg-blue-50 text-blue-700' },
  preventive:  { label:'Preventiva',        icon:'🔧', color:'bg-green-50 text-green-700' },
  corrective:  { label:'Corretiva',         icon:'🔨', color:'bg-red-50 text-red-700' },
  suspension:  { label:'Suspensão',         icon:'🚗', color:'bg-purple-50 text-purple-700' },
  electrical:  { label:'Elétrica',          icon:'⚡', color:'bg-yellow-50 text-yellow-700' },
  bodywork:    { label:'Funilaria',         icon:'🎨', color:'bg-pink-50 text-pink-700' },
  ac:          { label:'Ar-condicionado',   icon:'❄️', color:'bg-cyan-50 text-cyan-700' },
  other:       { label:'Outros',            icon:'🔩', color:'bg-slate-100 text-slate-600' },
}

const STATUS = {
  scheduled:   { label:'Agendada',     color:'bg-blue-50 text-blue-700' },
  in_progress: { label:'Em Andamento', color:'bg-amber-50 text-amber-700' },
  completed:   { label:'Concluída',    color:'bg-emerald-50 text-emerald-700' },
}

export default function Maintenance() {
  const [list, setList]           = useState([])
  const [vehicles, setVehicles]   = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [search, setSearch]       = useState('')
  const [tab, setTab]             = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(empty)
  const [saving, setSaving]       = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: m }, { data: v }, { data: s }] = await Promise.all([
      supabase.from('maintenance_records')
        .select('*, vehicles(plate, brand, model), suppliers(name)')
        .order('date', { ascending: false }),
      supabase.from('vehicles').select('id, plate, brand, model').eq('is_active', true).order('plate'),
      supabase.from('suppliers').select('id, name, category')
        .in('category', ['mechanic','electrical','tire','body_paint','parts'])
        .eq('is_active', true).order('name'),
    ])
    setList(m || [])
    setVehicles(v || [])
    setSuppliers(s || [])
    setLoading(false)
  }

  const filtered = list
    .filter(m => tab === 'all' ? true : m.status === tab)
    .filter(m => typeFilter === 'all' ? true : m.type === typeFilter)
    .filter(m =>
      m.vehicles?.plate?.toLowerCase().includes(search.toLowerCase()) ||
      m.description?.toLowerCase().includes(search.toLowerCase()) ||
      m.suppliers?.name?.toLowerCase().includes(search.toLowerCase())
    )

  const totalMonth = list
    .filter(m => {
      const d = new Date(m.date)
      const now = new Date()
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((s, m) => s + Number(m.total_cost || 0), 0)

  const openNew  = () => { setForm(empty); setModal(true) }
  const openEdit = m => { setForm({ ...empty, ...m, supplier_id: m.supplier_id || '', vehicle_id: m.vehicle_id || '' }); setModal(true) }
  const closeModal = () => { setModal(false); setForm(empty) }

  const totalCost = () => (Number(form.parts_cost || 0) + Number(form.labor_cost || 0)).toFixed(2)

  const save = async () => {
    if (!form.vehicle_id) return toast.error('Selecione o veículo')
    if (!form.description) return toast.error('Descrição é obrigatória')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        vehicle_id: form.vehicle_id,
        supplier_id: form.supplier_id || null,
        type: form.type, description: form.description,
        parts_cost: Number(form.parts_cost || 0),
        labor_cost: Number(form.labor_cost || 0),
        total_cost: Number(totalCost()),
        odometer: form.odometer ? Number(form.odometer) : null,
        next_maintenance_km: form.next_maintenance_km ? Number(form.next_maintenance_km) : null,
        next_maintenance_date: form.next_maintenance_date || null,
        status: form.status, notes: form.notes,
        date: form.date, updated_at: new Date().toISOString()
      }

      if (form.id) {
        const { error } = await supabase.from('maintenance_records').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('maintenance_records').insert({ ...payload, created_by: user.id })
        if (error) throw error

        // Cria lembretes automáticos
        if (form.next_maintenance_date || form.next_maintenance_km) {
          const vehicle = vehicles.find(v => v.id === form.vehicle_id)
          const typeLabel = TYPES[form.type]?.label || form.type
          await supabase.from('reminders').insert({
            title: `Próxima ${typeLabel} — ${vehicle?.plate}`,
            description: `${typeLabel} programada${form.next_maintenance_km ? ' aos ' + Number(form.next_maintenance_km).toLocaleString('pt-BR') + ' km' : ''}`,
            type: 'review',
            priority: 'normal',
            vehicle_id: form.vehicle_id,
            due_date: form.next_maintenance_date || null,
            due_km: form.next_maintenance_km ? Number(form.next_maintenance_km) : null,
            created_by: user.id
          })
          toast('🔔 Lembrete de próxima manutenção criado!', { icon: '🔔' })
        }

        // Atualiza odômetro do veículo
        if (form.odometer) {
          await supabase.from('vehicles').update({ current_odometer: Number(form.odometer) }).eq('id', form.vehicle_id)
        }
      }

      toast.success(form.id ? 'Manutenção atualizada!' : 'Manutenção registrada!')
      closeModal(); load()
    } catch(e) { toast.error('Erro: ' + e.message) }
    setSaving(false)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const statusTabs = [
    { key:'all',         label:'Todas',        count: list.length },
    { key:'scheduled',   label:'Agendadas',    count: list.filter(m => m.status === 'scheduled').length },
    { key:'in_progress', label:'Em Andamento', count: list.filter(m => m.status === 'in_progress').length },
    { key:'completed',   label:'Concluídas',   count: list.filter(m => m.status === 'completed').length },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Manutenção</h2>
          <p className="text-slate-500 text-sm mt-0.5">{list.length} registro{list.length !== 1 ? 's' : ''} · Mês atual: <span className="font-semibold text-slate-700">R$ {totalMonth.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16}/> Nova Manutenção
        </button>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {statusTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tab === t.key ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setTypeFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
          Todos os tipos
        </button>
        {Object.entries(TYPES).map(([key, t]) => (
          <button key={key} onClick={() => setTypeFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por placa, descrição ou fornecedor..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-400"/>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Data</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Veículo</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Tipo</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Descrição</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Fornecedor</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Total</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400">
                <Wrench size={32} className="mx-auto mb-2 opacity-30"/>
                Nenhuma manutenção encontrada
              </td></tr>
            ) : filtered.map(m => (
              <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5 text-slate-600 text-xs">{new Date(m.date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="px-5 py-3.5">
                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{m.vehicles?.plate}</span>
                  <p className="text-slate-400 text-xs mt-0.5">{m.vehicles?.brand} {m.vehicles?.model}</p>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${TYPES[m.type]?.color || 'bg-slate-100 text-slate-600'}`}>
                    {TYPES[m.type]?.icon} {TYPES[m.type]?.label || m.type}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-700 text-xs max-w-xs truncate">{m.description}</td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{m.suppliers?.name || '—'}</td>
                <td className="px-5 py-3.5 text-slate-800 text-xs font-bold">R$ {Number(m.total_cost).toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS[m.status]?.color || 'bg-slate-100 text-slate-600'}`}>
                    {STATUS[m.status]?.label || m.status}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <button onClick={() => openEdit(m)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    <Pencil size={14}/>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">{form.id ? 'Editar Manutenção' : 'Nova Manutenção'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-5">

              {/* Tipo */}
              <div>
                <label className="text-slate-500 text-xs font-medium mb-2 block">Tipo de Manutenção *</label>
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(TYPES).map(([key, t]) => (
                    <button key={key} onClick={() => f('type', key)}
                      className={`py-2 px-2 rounded-xl text-xs font-medium border-2 transition-all text-center ${form.type === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <span className="block text-base mb-0.5">{t.icon}</span>{t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Data *</label>
                  <input type="date" value={form.date} onChange={e => f('date', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Veículo *</label>
                  <select value={form.vehicle_id} onChange={e => f('vehicle_id', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Selecione</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Fornecedor / Oficina</label>
                  <select value={form.supplier_id} onChange={e => f('supplier_id', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Selecione</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">KM Atual</label>
                  <input type="number" value={form.odometer} onChange={e => f('odometer', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Descrição do Serviço *</label>
                  <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Valor Peças (R$)</label>
                  <input type="number" step="0.01" value={form.parts_cost} onChange={e => f('parts_cost', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Valor Mão de Obra (R$)</label>
                  <input type="number" step="0.01" value={form.labor_cost} onChange={e => f('labor_cost', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>

                {(Number(form.parts_cost || 0) + Number(form.labor_cost || 0)) > 0 && (
                  <div className="col-span-2 bg-indigo-50 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-indigo-700 text-sm font-medium">Total da Manutenção</span>
                    <span className="text-indigo-700 text-lg font-bold">R$ {Number(totalCost()).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                  </div>
                )}

                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Status</label>
                  <select value={form.status} onChange={e => f('status', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Próxima Manutenção (KM)</label>
                  <input type="number" value={form.next_maintenance_km} onChange={e => f('next_maintenance_km', e.target.value)}
                    placeholder="Ex: 55000"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Próxima Manutenção (Data)</label>
                  <input type="date" value={form.next_maintenance_date} onChange={e => f('next_maintenance_date', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações</label>
                  <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
                </div>
              </div>

              {(form.next_maintenance_date || form.next_maintenance_km) && (
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5"/>
                  <p className="text-amber-800 text-xs">Um lembrete automático será criado para a próxima manutenção programada.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                {saving ? 'Salvando...' : form.id ? 'Atualizar' : 'Salvar Manutenção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}