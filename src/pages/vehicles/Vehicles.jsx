import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, Car, CheckCircle, XCircle, Pencil, X, Upload, Camera, UserCheck, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const empty = {
  plate:'', brand:'', model:'', year:'', color:'', fuel_type:'',
  chassis:'', renavam:'', ownership_type:'owned', company_id:'',
  rental_company:'', rental_monthly_value:'', rental_start_date:'', rental_end_date:'',
  has_insurance:false, has_taxes:false,
  oil_change_interval_km:5000, last_oil_change_km:'',
  next_review_date:'', crlv_expiry_date:'',
  current_odometer:'', notes:''
}

const OWNERSHIP = {
  owned:       { label:'Próprio',        color:'bg-blue-50 text-blue-700',   icon:'🏠' },
  rented:      { label:'Alugado',        color:'bg-purple-50 text-purple-700', icon:'🤝' },
  particular_pdv: { label:'Particular PDV', color:'bg-teal-50 text-teal-700', icon:'🚗' },
  particular_pj:  { label:'Particular PJ',  color:'bg-orange-50 text-orange-700', icon:'📦' },
}

const maskPlate = (v) => v.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,7)

export default function Vehicles() {
  const [list, setList]           = useState([])
  const [companies, setCompanies] = useState([])
  const [drivers, setDrivers]     = useState([])
  const [search, setSearch]       = useState('')
  const [tab, setTab]             = useState('active')
  const [typeFilter, setTypeFilter] = useState('all')
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [driverModal, setDriverModal] = useState(false)
  const [form, setForm]           = useState(empty)
  const [saving, setSaving]       = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [selectedDriver, setSelectedDriver] = useState('')
  const [senatranConfirmed, setSenatranConfirmed] = useState(null)
  const [assignLoading, setAssignLoading] = useState(false)
  const fileRef = useRef()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: v }, { data: c }, { data: d }] = await Promise.all([
      supabase.from('vehicles').select('*, companies(name)').order('plate'),
      supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
      supabase.from('drivers').select('id, name, cpf, driver_type').eq('is_active', true).order('name'),
    ])
    setList(v || [])
    setCompanies(c || [])
    setDrivers(d || [])
    setLoading(false)
  }

  const filtered = list
    .filter(v => tab === 'all' ? true : tab === 'active' ? v.is_active : !v.is_active)
    .filter(v => typeFilter === 'all' ? true : v.ownership_type === typeFilter)
    .filter(v =>
      v.plate?.toLowerCase().includes(search.toLowerCase()) ||
      v.model?.toLowerCase().includes(search.toLowerCase()) ||
      v.brand?.toLowerCase().includes(search.toLowerCase())
    )

  const countActive   = list.filter(v => v.is_active).length
  const countInactive = list.filter(v => !v.is_active).length

  const getPhotoUrl = (path) => {
    if (!path) return null
    if (path.startsWith('http')) return path
    const { data } = supabase.storage.from('vehicle-photos').getPublicUrl(path)
    return data.publicUrl
  }

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const openNew = () => {
    setForm(empty); setPhotoFile(null); setPhotoPreview(null); setModal(true)
  }

  const openEdit = (v) => {
    setForm({ ...empty, ...v })
    setPhotoFile(null)
    setPhotoPreview(v.photo_url ? getPhotoUrl(v.photo_url) : null)
    setModal(true)
  }

  const closeModal = () => {
    setModal(false); setForm(empty); setPhotoFile(null); setPhotoPreview(null)
  }

  const save = async () => {
    if (!form.plate) return toast.error('Placa é obrigatória')
    if (!form.company_id) return toast.error('Selecione a empresa')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let photo_url = form.photo_url || null
      if (photoFile) {
        const ext  = photoFile.name.split('.').pop()
        const path = `${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('vehicle-photos').upload(path, photoFile)
        if (!upErr) photo_url = path
      }
      const payload = {
        plate: form.plate, brand: form.brand, model: form.model,
        year: form.year || null, color: form.color, fuel_type: form.fuel_type,
        chassis: form.chassis, renavam: form.renavam,
        ownership_type: form.ownership_type, company_id: form.company_id,
        rental_company: form.rental_company, rental_monthly_value: form.rental_monthly_value || null,
        rental_start_date: form.rental_start_date || null, rental_end_date: form.rental_end_date || null,
        has_insurance: form.has_insurance, has_taxes: form.has_taxes,
        oil_change_interval_km: form.oil_change_interval_km || 5000,
        last_oil_change_km: form.last_oil_change_km || null,
        next_review_date: form.next_review_date || null,
        crlv_expiry_date: form.crlv_expiry_date || null,
        current_odometer: form.current_odometer || 0,
        notes: form.notes, photo_url, updated_at: new Date().toISOString()
      }
      if (form.id) {
        const { error } = await supabase.from('vehicles').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('vehicles').insert({ ...payload, is_active: true, created_by: user.id })
        if (error) throw error
      }
      toast.success(form.id ? 'Veículo atualizado!' : 'Veículo cadastrado!')
      closeModal(); load()
    } catch(e) {
      toast.error('Erro ao salvar: ' + e.message)
    }
    setSaving(false)
  }

  const toggleActive = async (v) => {
    const newStatus = !v.is_active
    if (!window.confirm(`${newStatus ? 'Reativar' : 'Inativar'} o veículo ${v.plate}?`)) return
    await supabase.from('vehicles').update({
      is_active: newStatus,
      activated_at:   newStatus ? new Date().toISOString() : v.activated_at,
      deactivated_at: !newStatus ? new Date().toISOString() : null
    }).eq('id', v.id)
    toast.success(newStatus ? '✅ Reativado!' : '⛔ Inativado')
    load()
  }

  const openDriverModal = async (v) => {
    setSelectedVehicle(v)
    setSelectedDriver('')
    setSenatranConfirmed(null)
    const { data } = await supabase
      .from('vehicle_driver_assignments')
      .select('*, drivers(name, cpf, driver_type)')
      .eq('vehicle_id', v.id)
      .order('start_date', { ascending: false })
    setAssignments(data || [])
    setDriverModal(true)
  }

  const currentAssignment = assignments.find(a => a.is_current)

  const assignDriver = async () => {
    if (!selectedDriver) return toast.error('Selecione um motorista')
    if (senatranConfirmed === null) return toast.error('Informe o status do SENATRAN')
    setAssignLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (currentAssignment) {
        await supabase.from('vehicle_driver_assignments').update({
          is_current: false,
          end_date: new Date().toISOString().split('T')[0],
        }).eq('id', currentAssignment.id)
      }
      await supabase.from('vehicle_driver_assignments').insert({
        vehicle_id: selectedVehicle.id,
        driver_id: selectedDriver,
        start_date: new Date().toISOString().split('T')[0],
        is_current: true,
        senatran_registered: senatranConfirmed,
        created_by: user.id
      })
      if (!senatranConfirmed) {
        const driver = drivers.find(d => d.id === selectedDriver)
        await supabase.from('reminders').insert({
          title: `SENATRAN pendente — ${driver?.name}`,
          description: `Cadastrar ${driver?.name} no SENATRAN para o veículo ${selectedVehicle.plate}`,
          type: 'senatran', priority: 'high',
          vehicle_id: selectedVehicle.id,
          driver_id: selectedDriver,
          created_by: user.id
        })
        toast('⚠️ Alerta criado: SENATRAN pendente', { icon: '⚠️' })
      }
      toast.success('Motorista vinculado!')
      openDriverModal(selectedVehicle)
      load()
    } catch(e) {
      toast.error('Erro: ' + e.message)
    }
    setAssignLoading(false)
  }

  const removeDriver = async () => {
    if (!currentAssignment) return
    if (!window.confirm(`Remover ${currentAssignment.drivers?.name} do veículo ${selectedVehicle.plate}?\n\n⚠️ Lembre-se de remover do SENATRAN!`)) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('vehicle_driver_assignments').update({
      is_current: false, end_date: new Date().toISOString().split('T')[0]
    }).eq('id', currentAssignment.id)
    await supabase.from('reminders').insert({
      title: `SENATRAN — Remover ${currentAssignment.drivers?.name}`,
      description: `Verificar remoção de ${currentAssignment.drivers?.name} do SENATRAN — veículo ${selectedVehicle.plate}`,
      type: 'senatran', priority: 'high',
      vehicle_id: selectedVehicle.id,
      driver_id: currentAssignment.driver_id,
      created_by: user.id
    })
    toast.success('Motorista removido!')
    toast('⚠️ Lembre-se de remover do SENATRAN!', { icon: '⚠️' })
    openDriverModal(selectedVehicle)
    load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const fuelTypes = ['Flex','Gasolina','Etanol','Diesel','Diesel S-10','GNV','Elétrico']

  // Motoristas elegíveis para vincular (CLT e PJ Frota)
  const eligibleDrivers = drivers.filter(d => d.driver_type === 'clt' || d.driver_type === 'pj_fleet')

  const statusTabs = [
    { key:'active',   label:'Ativos',   count: countActive },
    { key:'inactive', label:'Inativos', count: countInactive },
    { key:'all',      label:'Todos',    count: list.length },
  ]

  // Não mostra aba motorista para veículos particulares PJ (só arquivo)
  const showDriverBtn = (v) => v.ownership_type !== 'particular_pj'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Veículos</h2>
          <p className="text-slate-500 text-sm mt-0.5">{list.length} veículo{list.length !== 1 ? 's' : ''} cadastrado{list.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16} /> Novo Veículo
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {statusTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tab === t.key ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setTypeFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          Todos os tipos
        </button>
        {Object.entries(OWNERSHIP).map(([key, t]) => (
          <button key={key} onClick={() => setTypeFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por placa, modelo ou marca..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 transition-colors" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Veículo</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Placa</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Empresa</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Tipo</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">KM</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                <Car size={32} className="mx-auto mb-2 opacity-30" />
                Nenhum veículo encontrado
              </td></tr>
            ) : filtered.map(v => (
              <tr key={v.id} className={`hover:bg-slate-50 transition-colors ${!v.is_active ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    {v.photo_url ? (
                      <img src={getPhotoUrl(v.photo_url)} className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-slate-100" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                        <Car size={18} />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-slate-800">{v.brand} {v.model}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{v.year}{v.color ? ` · ${v.color}` : ''}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg text-xs">{v.plate}</span>
                </td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{v.companies?.name || '—'}</td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${OWNERSHIP[v.ownership_type]?.color || 'bg-slate-100 text-slate-600'}`}>
                    {OWNERSHIP[v.ownership_type]?.icon} {OWNERSHIP[v.ownership_type]?.label || v.ownership_type}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{v.current_odometer ? `${Number(v.current_odometer).toLocaleString('pt-BR')} km` : '—'}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${v.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {v.is_active ? <CheckCircle size={11} /> : <XCircle size={11} />}
                    {v.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5 justify-end">
                    {showDriverBtn(v) && (
                      <button onClick={() => openDriverModal(v)} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Motorista">
                        <UserCheck size={14} />
                      </button>
                    )}
                    <button onClick={() => openEdit(v)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => toggleActive(v)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${v.is_active ? 'text-red-500 hover:bg-red-50 border border-red-200' : 'text-emerald-600 hover:bg-emerald-50 border border-emerald-200'}`}>
                      {v.is_active ? <><XCircle size={12} /> Inativar</> : <><CheckCircle size={12} /> Reativar</>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL CADASTRO */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">{form.id ? 'Editar Veículo' : 'Novo Veículo'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5">

              {/* Foto */}
              <div className="flex items-center gap-5 pb-5 border-b border-slate-100">
                {photoPreview ? (
                  <img src={photoPreview} className="w-24 h-20 rounded-xl object-cover border border-slate-200" />
                ) : (
                  <div className="w-24 h-20 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <Camera size={28} />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">Foto do Veículo</p>
                  <button onClick={() => fileRef.current.click()}
                    className="flex items-center gap-2 text-xs font-medium text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                    <Upload size={12} /> Enviar foto
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                </div>
              </div>

              {/* Tipo de veículo */}
              <div>
                <label className="text-slate-500 text-xs font-medium mb-2 block">Tipo de Veículo *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(OWNERSHIP).map(([key, t]) => (
                    <button key={key} onClick={() => f('ownership_type', key)}
                      className={`py-3 px-4 rounded-xl text-sm font-medium border-2 transition-all text-left ${form.ownership_type === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <span className="text-base mr-2">{t.icon}</span>{t.label}
                      <p className="text-xs mt-0.5 font-normal opacity-70">
                        {key === 'owned'          && 'NetCare · paga IPVA, seguro, impostos'}
                        {key === 'rented'         && 'NetCare paga aluguel mensal'}
                        {key === 'particular_pdv' && 'Colaborador · elegível para reembolso KM'}
                        {key === 'particular_pj'  && 'Prestador PJ · apenas arquivado'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Empresa */}
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Empresa *</label>
                <select value={form.company_id || ''} onChange={e => f('company_id', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Selecione a empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Dados básicos */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Placa *</label>
                  <input value={form.plate} onChange={e => f('plate', maskPlate(e.target.value))}
                    placeholder="ABC1D23"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Marca</label>
                  <input value={form.brand} onChange={e => f('brand', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Modelo</label>
                  <input value={form.model} onChange={e => f('model', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Ano</label>
                  <input type="number" value={form.year} onChange={e => f('year', e.target.value)}
                    placeholder="2024"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Cor</label>
                  <input value={form.color} onChange={e => f('color', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Combustível</label>
                  <select value={form.fuel_type} onChange={e => f('fuel_type', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Selecione</option>
                    {fuelTypes.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Chassi</label>
                  <input value={form.chassis} onChange={e => f('chassis', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">RENAVAM</label>
                  <input value={form.renavam} onChange={e => f('renavam', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">KM Atual</label>
                  <input type="number" value={form.current_odometer} onChange={e => f('current_odometer', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
              </div>

              {/* Campos específicos por tipo */}
              {form.ownership_type === 'owned' && (
                <div className="bg-blue-50 rounded-xl p-4 space-y-4">
                  <p className="text-blue-700 text-sm font-semibold">Veículo Próprio</p>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.has_taxes || false} onChange={e => f('has_taxes', e.target.checked)} className="accent-indigo-600" />
                      <span className="text-sm text-blue-800">Paga Impostos (IPVA/DPVAT)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.has_insurance || false} onChange={e => f('has_insurance', e.target.checked)} className="accent-indigo-600" />
                      <span className="text-sm text-blue-800">Possui Seguro</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-slate-500 text-xs font-medium mb-1.5 block">Vencimento CRLV</label>
                      <input type="date" value={form.crlv_expiry_date || ''} onChange={e => f('crlv_expiry_date', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs font-medium mb-1.5 block">Próxima Revisão</label>
                      <input type="date" value={form.next_review_date || ''} onChange={e => f('next_review_date', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                  </div>
                </div>
              )}

              {form.ownership_type === 'rented' && (
                <div className="bg-purple-50 rounded-xl p-4 space-y-4">
                  <p className="text-purple-700 text-sm font-semibold">Veículo Alugado</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-slate-500 text-xs font-medium mb-1.5 block">Empresa Locadora</label>
                      <input value={form.rental_company || ''} onChange={e => f('rental_company', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs font-medium mb-1.5 block">Valor Mensal (R$)</label>
                      <input type="number" value={form.rental_monthly_value || ''} onChange={e => f('rental_monthly_value', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs font-medium mb-1.5 block">Início do Contrato</label>
                      <input type="date" value={form.rental_start_date || ''} onChange={e => f('rental_start_date', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs font-medium mb-1.5 block">Fim do Contrato</label>
                      <input type="date" value={form.rental_end_date || ''} onChange={e => f('rental_end_date', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                  </div>
                </div>
              )}

              {form.ownership_type === 'particular_pdv' && (
                <div className="bg-teal-50 rounded-xl p-4">
                  <p className="text-teal-700 text-sm font-semibold mb-2">Veículo Particular — PDV</p>
                  <p className="text-teal-600 text-xs">Este veículo está elegível para reembolso por KM. Configure o valor por KM no módulo PDV após o cadastro.</p>
                </div>
              )}

              {form.ownership_type === 'particular_pj' && (
                <div className="bg-orange-50 rounded-xl p-4">
                  <p className="text-orange-700 text-sm font-semibold mb-2">Veículo Particular — Prestador PJ</p>
                  <p className="text-orange-600 text-xs">Este veículo é apenas arquivado para referência. Não gera reembolso e não é vinculado à frota.</p>
                </div>
              )}

              {/* Alertas manutenção */}
              {(form.ownership_type === 'owned' || form.ownership_type === 'rented') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-500 text-xs font-medium mb-1.5 block">Intervalo Troca de Óleo (km)</label>
                    <input type="number" value={form.oil_change_interval_km || 5000} onChange={e => f('oil_change_interval_km', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs font-medium mb-1.5 block">KM Última Troca de Óleo</label>
                    <input type="number" value={form.last_oil_change_km || ''} onChange={e => f('last_oil_change_km', e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações</label>
                <textarea value={form.notes || ''} onChange={e => f('notes', e.target.value)} rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                {saving ? 'Salvando...' : form.id ? 'Atualizar Veículo' : 'Salvar Veículo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MOTORISTA */}
      {driverModal && selectedVehicle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-800">Motorista do Veículo</h3>
                <p className="text-slate-400 text-xs mt-0.5">{selectedVehicle.plate} — {selectedVehicle.brand} {selectedVehicle.model}</p>
              </div>
              <button onClick={() => setDriverModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5">

              {/* Motorista atual */}
              {currentAssignment ? (
                <div className="bg-teal-50 rounded-xl p-4 border border-teal-200">
                  <p className="text-teal-700 text-xs font-semibold mb-2">MOTORISTA ATUAL</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{currentAssignment.drivers?.name}</p>
                      <p className="text-slate-500 text-xs mt-0.5">Desde {new Date(currentAssignment.start_date).toLocaleDateString('pt-BR')}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${currentAssignment.senatran_registered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {currentAssignment.senatran_registered ? '✅ SENATRAN ok' : '⚠️ SENATRAN pendente'}
                      </span>
                    </div>
                    <button onClick={removeDriver} className="text-red-500 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-4 text-center text-slate-400 text-sm">
                  Nenhum motorista vinculado
                </div>
              )}

              {/* Vincular novo */}
              <div className="space-y-3">
                <p className="text-slate-700 text-sm font-semibold">
                  {currentAssignment ? 'Trocar motorista' : 'Vincular motorista'}
                </p>
                <select value={selectedDriver} onChange={e => { setSelectedDriver(e.target.value); setSenatranConfirmed(null) }}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Selecione o motorista (CLT ou PJ Frota)</option>
                  {eligibleDrivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}{d.cpf ? ` — ${d.cpf}` : ''} ({d.driver_type === 'clt' ? 'CLT' : 'PJ Frota'})
                    </option>
                  ))}
                </select>

                {selectedDriver && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                    <div className="flex items-start gap-2 mb-3">
                      <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-amber-800 text-sm font-medium">Motorista já cadastrado no SENATRAN para este veículo?</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => setSenatranConfirmed(true)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${senatranConfirmed === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
                        ✅ Sim, já registrado
                      </button>
                      <button onClick={() => setSenatranConfirmed(false)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${senatranConfirmed === false ? 'border-red-400 bg-red-50 text-red-600' : 'border-slate-200 text-slate-500'}`}>
                        ❌ Não, pendente
                      </button>
                    </div>
                    {senatranConfirmed === false && (
                      <p className="text-red-600 text-xs mt-2 font-medium">⚠️ Um alerta será criado automaticamente.</p>
                    )}
                  </div>
                )}

                <button onClick={assignDriver} disabled={assignLoading || !selectedDriver || senatranConfirmed === null}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium py-2.5 rounded-xl text-sm transition-colors">
                  {assignLoading ? 'Vinculando...' : 'Vincular Motorista'}
                </button>
              </div>

              {/* Histórico */}
              {assignments.filter(a => !a.is_current).length > 0 && (
                <div>
                  <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-3">Histórico de motoristas</p>
                  <div className="space-y-2">
                    {assignments.filter(a => !a.is_current).map(a => (
                      <div key={a.id} className="flex items-center justify-between text-xs py-2 border-b border-slate-50">
                        <span className="font-medium text-slate-700">{a.drivers?.name}</span>
                        <span className="text-slate-400">
                          {new Date(a.start_date).toLocaleDateString('pt-BR')} → {a.end_date ? new Date(a.end_date).toLocaleDateString('pt-BR') : 'hoje'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}