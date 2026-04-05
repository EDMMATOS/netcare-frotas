import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, X, Pencil, Route } from 'lucide-react'
import toast from 'react-hot-toast'

const empty = {
  date: new Date().toISOString().split('T')[0],
  vehicle_id:'', driver_id:'', km_start:'', km_end:'', notes:''
}

export default function Mileage() {
  const [list, setList]         = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers]   = useState([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(empty)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: m }, { data: v }, { data: d }] = await Promise.all([
      supabase.from('mileage_records')
        .select('*, vehicles(plate, brand, model), drivers(name)')
        .order('date', { ascending: false }),
      supabase.from('vehicles').select('id, plate, brand, model, current_odometer')
        .eq('is_active', true).order('plate'),
      supabase.from('drivers').select('id, name').eq('is_active', true).order('name'),
    ])
    setList(m || [])
    setVehicles(v || [])
    setDrivers(d || [])
    setLoading(false)
  }

  const filtered = list.filter(r =>
    r.vehicles?.plate?.toLowerCase().includes(search.toLowerCase()) ||
    r.drivers?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalKmMonth = list
    .filter(r => {
      const d = new Date(r.date)
      const now = new Date()
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((s, r) => s + Number(r.total_km || 0), 0)

  const openNew  = () => { setForm(empty); setModal(true) }
  const openEdit = r => { setForm({ ...empty, ...r }); setModal(true) }
  const closeModal = () => { setModal(false); setForm(empty) }

  const onVehicleChange = (id) => {
    const veh = vehicles.find(v => v.id === id)
    setForm(p => ({ ...p, vehicle_id: id, km_start: veh?.current_odometer || '' }))
  }

  const totalKm = () => Math.max(0, Number(form.km_end || 0) - Number(form.km_start || 0))

  const save = async () => {
    if (!form.vehicle_id) return toast.error('Selecione o veículo')
    if (!form.km_start || !form.km_end) return toast.error('Informe KM inicial e final')
    if (Number(form.km_end) <= Number(form.km_start)) return toast.error('KM final deve ser maior que o inicial')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        vehicle_id: form.vehicle_id,
        driver_id:  form.driver_id || null,
        date:       form.date,
        km_start:   Number(form.km_start),
        km_end:     Number(form.km_end),
        notes:      form.notes,
      }
      if (form.id) {
        const { error } = await supabase.from('mileage_records').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('mileage_records').insert({ ...payload, created_by: user.id })
        if (error) throw error
        await supabase.from('vehicles').update({ current_odometer: Number(form.km_end) }).eq('id', form.vehicle_id)
      }
      toast.success('Quilometragem registrada!')
      closeModal(); load()
    } catch(e) { toast.error('Erro: ' + e.message) }
    setSaving(false)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const statsByVehicle = vehicles.map(v => {
    const records = list.filter(r => r.vehicle_id === v.id)
    const total   = records.reduce((s, r) => s + Number(r.total_km || 0), 0)
    return { ...v, total_km: total, trips: records.length }
  }).filter(v => v.total_km > 0).sort((a, b) => b.total_km - a.total_km)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Quilometragem</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {list.length} registro{list.length !== 1 ? 's' : ''} ·
            Mês atual: <span className="font-semibold text-slate-700">{totalKmMonth.toLocaleString('pt-BR')} km</span>
          </p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16}/> Novo Registro
        </button>
      </div>

      {/* Stats por veículo */}
      {statsByVehicle.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statsByVehicle.slice(0,4).map(v => (
            <div key={v.id} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
              <span className="font-mono font-bold text-slate-700 text-xs bg-slate-100 px-2 py-0.5 rounded">{v.plate}</span>
              <p className="text-slate-600 text-xs mt-1">{v.brand} {v.model}</p>
              <p className="text-indigo-600 font-bold text-lg mt-1">{v.total_km.toLocaleString('pt-BR')} km</p>
              <p className="text-slate-400 text-xs">{v.trips} percurso{v.trips !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por placa ou motorista..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-400"/>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Data</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Veículo</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Motorista</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">KM Inicial</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">KM Final</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Total KM</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                <Route size={32} className="mx-auto mb-2 opacity-30"/>
                Nenhum registro encontrado
              </td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5 text-slate-600 text-xs">{new Date(r.date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="px-5 py-3.5">
                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{r.vehicles?.plate}</span>
                  <p className="text-slate-400 text-xs mt-0.5">{r.vehicles?.brand} {r.vehicles?.model}</p>
                </td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{r.drivers?.name || '—'}</td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{Number(r.km_start).toLocaleString('pt-BR')} km</td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{Number(r.km_end).toLocaleString('pt-BR')} km</td>
                <td className="px-5 py-3.5">
                  <span className="font-bold text-indigo-600 text-sm">{Number(r.total_km).toLocaleString('pt-BR')} km</span>
                </td>
                <td className="px-5 py-3.5">
                  <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
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
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">{form.id ? 'Editar Registro' : 'Novo Registro de KM'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Data *</label>
                <input type="date" value={form.date} onChange={e => f('date', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Veículo *</label>
                <select value={form.vehicle_id} onChange={e => onVehicleChange(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Selecione</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Motorista</label>
                <select value={form.driver_id} onChange={e => f('driver_id', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Selecione</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">KM Inicial *</label>
                <input type="number" value={form.km_start} onChange={e => f('km_start', e.target.value)}
                  placeholder="Ex: 45000"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">KM Final *</label>
                <input type="number" value={form.km_end} onChange={e => f('km_end', e.target.value)}
                  placeholder="Ex: 45280"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>
              {totalKm() > 0 && (
                <div className="col-span-2 bg-indigo-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-indigo-700 text-sm font-medium">Total percorrido</span>
                  <span className="text-indigo-700 text-xl font-bold">{totalKm().toLocaleString('pt-BR')} km</span>
                </div>
              )}
              <div className="col-span-2">
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações</label>
                <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}