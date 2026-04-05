import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, Fuel, X, Pencil, TrendingDown, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'

const empty = {
  date: new Date().toISOString().split('T')[0],
  vehicle_id:'', driver_id:'', fuel_type:'',
  liters:'', price_per_liter:'', odometer:'', station:'', notes:''
}

const FUELS = ['Flex','Gasolina','Gasolina Aditivada','Etanol','Diesel','Diesel S-10','GNV','Elétrico']

export default function FuelPage() {
  const [list, setList]         = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers]   = useState([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(empty)
  const [saving, setSaving]     = useState(false)
  const [stats, setStats]       = useState([])

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: f }, { data: v }, { data: d }] = await Promise.all([
      supabase.from('fuel_records')
        .select('*, vehicles(plate, brand, model), drivers(name)')
        .order('date', { ascending: false }),
      supabase.from('vehicles').select('id, plate, brand, model, fuel_type')
        .eq('is_active', true).order('plate'),
      supabase.from('drivers').select('id, name')
        .eq('is_active', true).order('name'),
    ])
    setList(f || [])
    setVehicles(v || [])
    setDrivers(d || [])
    calcStats(f || [])
    setLoading(false)
  }

  const calcStats = (data) => {
    const byVehicle = {}
    data.forEach(r => {
      const key = r.vehicle_id
      if (!byVehicle[key]) byVehicle[key] = {
        vehicle_id: key,
        plate: r.vehicles?.plate,
        model: `${r.vehicles?.brand} ${r.vehicles?.model}`,
        total_cost: 0, total_liters: 0, records: [], km_per_liter: []
      }
      byVehicle[key].total_cost   += Number(r.total_cost || 0)
      byVehicle[key].total_liters += Number(r.liters || 0)
      byVehicle[key].records.push(r)
      if (r.km_per_liter) byVehicle[key].km_per_liter.push(Number(r.km_per_liter))
    })
    const arr = Object.values(byVehicle).map(v => ({
      ...v,
      avg_km_per_liter: v.km_per_liter.length
        ? (v.km_per_liter.reduce((a,b) => a+b, 0) / v.km_per_liter.length).toFixed(2)
        : null
    })).sort((a,b) => b.total_cost - a.total_cost)
    setStats(arr)
  }

  const filtered = list.filter(r =>
    r.vehicles?.plate?.toLowerCase().includes(search.toLowerCase()) ||
    r.drivers?.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.station?.toLowerCase().includes(search.toLowerCase()) ||
    r.fuel_type?.toLowerCase().includes(search.toLowerCase())
  )

  const totalMonth = list
    .filter(r => {
      const d = new Date(r.date)
      const now = new Date()
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((s, r) => s + Number(r.total_cost || 0), 0)

  const openNew = () => {
    setForm(empty); setModal(true)
  }
  const openEdit = (r) => {
    setForm({ ...empty, ...r, vehicle_id: r.vehicle_id, driver_id: r.driver_id || '' })
    setModal(true)
  }
  const closeModal = () => { setModal(false); setForm(empty) }

  const totalCalc = () => {
    const l = parseFloat(form.liters) || 0
    const p = parseFloat(form.price_per_liter) || 0
    return (l * p).toFixed(2)
  }

  const save = async () => {
    if (!form.vehicle_id) return toast.error('Selecione o veículo')
    if (!form.liters || !form.price_per_liter) return toast.error('Informe litros e valor por litro')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Calcula KM/L se tiver odômetro
      let km_per_liter = null
      let km_driven    = null
      let prev_odometer = null
      if (form.odometer && form.vehicle_id) {
        const { data: prev } = await supabase
          .from('fuel_records')
          .select('odometer')
          .eq('vehicle_id', form.vehicle_id)
          .lt('date', form.date)
          .order('date', { ascending: false })
          .limit(1)
        if (prev?.length && prev[0].odometer) {
          prev_odometer = prev[0].odometer
          km_driven     = Number(form.odometer) - Number(prev[0].odometer)
          if (km_driven > 0 && form.liters > 0) {
            km_per_liter = (km_driven / Number(form.liters)).toFixed(3)
          }
        }
      }

      const total_cost = totalCalc()
      const payload = {
        date: form.date,
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id || null,
        fuel_type: form.fuel_type,
        liters: Number(form.liters),
        price_per_liter: Number(form.price_per_liter),
        total_cost: Number(total_cost),
        odometer: form.odometer ? Number(form.odometer) : null,
        prev_odometer, km_driven, km_per_liter,
        station: form.station,
        notes: form.notes,
      }

      if (form.id) {
        const { error } = await supabase.from('fuel_records').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('fuel_records').insert({ ...payload, created_by: user.id })
        if (error) throw error
        // Atualiza odômetro do veículo
        if (form.odometer) {
          await supabase.from('vehicles').update({ current_odometer: Number(form.odometer) }).eq('id', form.vehicle_id)
        }
      }

      toast.success('Abastecimento salvo!')
      closeModal(); load()
    } catch(e) {
      toast.error('Erro: ' + e.message)
    }
    setSaving(false)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Auto-preenche combustível ao selecionar veículo
  const onVehicleChange = (id) => {
    f('vehicle_id', id)
    const veh = vehicles.find(v => v.id === id)
    if (veh?.fuel_type) f('fuel_type', veh.fuel_type)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Abastecimento</h2>
          <p className="text-slate-500 text-sm mt-0.5">{list.length} registro{list.length !== 1 ? 's' : ''} · Mês atual: <span className="font-semibold text-slate-700">R$ {totalMonth.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16} /> Novo Abastecimento
        </button>
      </div>

      {/* Stats por veículo */}
      {stats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {stats.slice(0,3).map(s => (
            <div key={s.vehicle_id} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono font-bold text-slate-700 text-xs bg-slate-100 px-2 py-0.5 rounded">{s.plate}</p>
                  <p className="text-slate-600 text-xs mt-1">{s.model}</p>
                </div>
                {s.avg_km_per_liter && (
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${Number(s.avg_km_per_liter) >= 10 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {s.avg_km_per_liter} km/L
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{s.total_liters.toFixed(1)} L abastecidos</span>
                <span className="font-semibold text-slate-700">R$ {s.total_cost.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por placa, motorista ou posto..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 transition-colors" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Data</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Veículo</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Motorista</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Combustível</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Litros</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">R$/L</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Total</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">KM/L</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={9} className="text-center py-12 text-slate-400">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-slate-400">
                <Fuel size={32} className="mx-auto mb-2 opacity-30" />
                Nenhum abastecimento registrado
              </td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5 text-slate-600 text-xs">{new Date(r.date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="px-5 py-3.5">
                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.vehicles?.plate}</span>
                </td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{r.drivers?.name || '—'}</td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{r.fuel_type || '—'}</td>
                <td className="px-5 py-3.5 text-slate-700 text-xs font-medium">{Number(r.liters).toFixed(2)} L</td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">R$ {Number(r.price_per_liter).toFixed(3)}</td>
                <td className="px-5 py-3.5 text-slate-800 text-xs font-bold">R$ {Number(r.total_cost).toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                <td className="px-5 py-3.5">
                  {r.km_per_liter ? (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${Number(r.km_per_liter) >= 10 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {Number(r.km_per_liter) >= 10 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                      {Number(r.km_per_liter).toFixed(1)}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-5 py-3.5">
                  <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">{form.id ? 'Editar Abastecimento' : 'Novo Abastecimento'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Data *</label>
                <input type="date" value={form.date} onChange={e => f('date', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Veículo *</label>
                <select value={form.vehicle_id} onChange={e => onVehicleChange(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Selecione</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                </select>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Motorista</label>
                <select value={form.driver_id} onChange={e => f('driver_id', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Selecione</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Combustível</label>
                <select value={form.fuel_type} onChange={e => f('fuel_type', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Selecione</option>
                  {FUELS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Litros *</label>
                <input type="number" step="0.001" value={form.liters} onChange={e => f('liters', e.target.value)}
                  placeholder="0.000"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">R$ por Litro *</label>
                <input type="number" step="0.001" value={form.price_per_liter} onChange={e => f('price_per_liter', e.target.value)}
                  placeholder="0.000"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>

              {/* Total calculado */}
              {form.liters && form.price_per_liter && (
                <div className="col-span-2 bg-indigo-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-indigo-700 text-sm font-medium">Total do abastecimento</span>
                  <span className="text-indigo-700 text-lg font-bold">R$ {Number(totalCalc()).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                </div>
              )}

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">KM Atual do Veículo</label>
                <input type="number" value={form.odometer} onChange={e => f('odometer', e.target.value)}
                  placeholder="Ex: 45230"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Posto / Local</label>
                <input value={form.station} onChange={e => f('station', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
              </div>

              <div className="col-span-2">
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações</label>
                <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                {saving ? 'Salvando...' : form.id ? 'Atualizar' : 'Salvar Abastecimento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}