import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, X, CheckCircle, XCircle, Camera, Settings, Clock, DollarSign, Car, User, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS = {
  pending:  { label:'Pendente',  color:'bg-amber-50 text-amber-700' },
  approved: { label:'Aprovado',  color:'bg-blue-50 text-blue-700' },
  paid:     { label:'Pago',      color:'bg-emerald-50 text-emerald-700' },
  rejected: { label:'Reprovado', color:'bg-red-50 text-red-600' },
}

export default function PDV() {
  const [trips, setTrips]         = useState([])
  const [configs, setConfigs]     = useState([])
  const [drivers, setDrivers]     = useState([])
  const [vehicles, setVehicles]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('trips')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modal, setModal]         = useState(false)
  const [configModal, setConfigModal] = useState(false)
  const [form, setForm]           = useState({
    driver_id:'', vehicle_id:'', date: new Date().toISOString().split('T')[0],
    km_start:'', km_end:'', origin:'', destination:'', description:'', notes:''
  })
  const [configForm, setConfigForm] = useState({ driver_id:'', vehicle_id:'', rate_per_km:'', notes:'' })
  const [photoStart, setPhotoStart] = useState(null)
  const [photoEnd, setPhotoEnd]     = useState(null)
  const [previewStart, setPreviewStart] = useState(null)
  const [previewEnd, setPreviewEnd]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [isAdmin, setIsAdmin]     = useState(false)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    setIsAdmin(profile?.role === 'admin' || profile?.role === 'manager')
    load()
  }

  const load = async () => {
    setLoading(true)
    const [{ data: t }, { data: c }, { data: d }, { data: v }] = await Promise.all([
      supabase.from('pdv_trips')
        .select('*, drivers(name, phone, pix, bank), vehicles(plate, brand, model)')
        .order('date', { ascending: false }),
      supabase.from('pdv_configs')
        .select('*, drivers(name), vehicles(plate, brand, model)')
        .eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('drivers').select('id, name, driver_type, pix, bank')
        .eq('driver_type', 'pdv').eq('is_active', true).order('name'),
      supabase.from('vehicles').select('id, plate, brand, model')
        .eq('ownership_type', 'particular_pdv').eq('is_active', true).order('plate'),
    ])
    setTrips(t || [])
    setConfigs(c || [])
    setDrivers(d || [])
    setVehicles(v || [])
    setLoading(false)
  }

  const getPhotoUrl = (path) => {
    if (!path) return null
    if (path.startsWith('http')) return path
    const { data } = supabase.storage.from('pdv-trip-photos').getPublicUrl(path)
    return data.publicUrl
  }

  const openCamera = (type) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      if (type === 'start') {
        setPhotoStart(file)
        setPreviewStart(URL.createObjectURL(file))
      } else {
        setPhotoEnd(file)
        setPreviewEnd(URL.createObjectURL(file))
      }
      toast.success('📷 Foto registrada!')
    }
    input.click()
  }

  const getRateForDriver = (driverId) => {
    const config = configs.find(c => c.driver_id === driverId)
    return config?.rate_per_km || 0
  }

  const totalKm = () => Math.max(0, Number(form.km_end || 0) - Number(form.km_start || 0))
  const totalValue = () => (totalKm() * getRateForDriver(form.driver_id)).toFixed(2)

  const openNew = () => {
    setForm({ driver_id:'', vehicle_id:'', date: new Date().toISOString().split('T')[0], km_start:'', km_end:'', origin:'', destination:'', description:'', notes:'' })
    setPhotoStart(null); setPhotoEnd(null)
    setPreviewStart(null); setPreviewEnd(null)
    setModal(true)
  }

  const save = async () => {
    if (!form.driver_id) return toast.error('Selecione o colaborador')
    if (!form.km_start || !form.km_end) return toast.error('Informe KM inicial e final')
    if (Number(form.km_end) <= Number(form.km_start)) return toast.error('KM final deve ser maior que o inicial')
    if (!photoStart) return toast.error('Foto do hodômetro na SAÍDA é obrigatória')
    if (!photoEnd)   return toast.error('Foto do hodômetro na CHEGADA é obrigatória')

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const rate  = getRateForDriver(form.driver_id)
      const km    = totalKm()
      const value = (km * rate).toFixed(2)

      // Upload fotos
      let photoStartUrl = null, photoEndUrl = null
      const ts = Date.now()
      if (photoStart) {
        const ext  = photoStart.name.split('.').pop()
        const path = `${form.driver_id}/${ts}_start.${ext}`
        const { error: e1 } = await supabase.storage.from('pdv-trip-photos').upload(path, photoStart)
        if (!e1) photoStartUrl = path
      }
      if (photoEnd) {
        const ext  = photoEnd.name.split('.').pop()
        const path = `${form.driver_id}/${ts}_end.${ext}`
        const { error: e2 } = await supabase.storage.from('pdv-trip-photos').upload(path, photoEnd)
        if (!e2) photoEndUrl = path
      }

      const { error } = await supabase.from('pdv_trips').insert({
        driver_id:       form.driver_id,
        vehicle_id:      form.vehicle_id || null,
        date:            form.date,
        km_start:        Number(form.km_start),
        km_end:          Number(form.km_end),
        rate_per_km:     rate,
        total_value:     Number(value),
        photo_start_url: photoStartUrl,
        photo_end_url:   photoEndUrl,
        origin:          form.origin,
        destination:     form.destination,
        description:     form.description,
        notes:           form.notes,
        status:          'pending',
        created_by:      user.id
      })
      if (error) throw error

      toast.success(`✅ Percurso registrado! ${km.toFixed(1)} km · R$ ${Number(value).toLocaleString('pt-BR', {minimumFractionDigits:2})}`)
      setModal(false); load()
    } catch(e) { toast.error('Erro: ' + e.message) }
    setSaving(false)
  }

  const updateStatus = async (id, status) => {
    const { data: { user } } = await supabase.auth.getUser()
    const update = { status }
    if (status === 'approved') { update.approved_at = new Date().toISOString(); update.approved_by = user.id }
    if (status === 'paid')     { update.paid_at = new Date().toISOString(); update.paid_by = user.id }
    await supabase.from('pdv_trips').update(update).eq('id', id)
    toast.success(status === 'approved' ? '✅ Aprovado!' : status === 'paid' ? '💰 Pago!' : '⛔ Reprovado')
    load()
  }

  const saveConfig = async () => {
    if (!configForm.driver_id) return toast.error('Selecione o colaborador')
    if (!configForm.rate_per_km || Number(configForm.rate_per_km) <= 0) return toast.error('Informe o valor por KM')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // Desativa config anterior
      await supabase.from('pdv_configs').update({ is_active: false }).eq('driver_id', configForm.driver_id)
      // Cria nova
      await supabase.from('pdv_configs').insert({
        driver_id:   configForm.driver_id,
        vehicle_id:  configForm.vehicle_id || null,
        rate_per_km: Number(configForm.rate_per_km),
        notes:       configForm.notes,
        is_active:   true,
        created_by:  user.id
      })
      toast.success('Configuração salva!')
      setConfigModal(false)
      setConfigForm({ driver_id:'', vehicle_id:'', rate_per_km:'', notes:'' })
      load()
    } catch(e) { toast.error('Erro: ' + e.message) }
    setSaving(false)
  }

  const filtered = trips.filter(t => statusFilter === 'all' ? true : t.status === statusFilter)

  const totalPending  = trips.filter(t => t.status === 'pending').reduce((s, t) => s + Number(t.total_value || 0), 0)
  const totalApproved = trips.filter(t => t.status === 'approved').reduce((s, t) => s + Number(t.total_value || 0), 0)
  const totalPaid     = trips.filter(t => t.status === 'paid').reduce((s, t) => s + Number(t.total_value || 0), 0)

  const f  = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const cf = (k, v) => setConfigForm(p => ({ ...p, [k]: v }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">PDV — Percursos e Reembolsos</h2>
          <p className="text-slate-500 text-sm mt-0.5">{trips.length} percurso{trips.length !== 1 ? 's' : ''} registrado{trips.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => setConfigModal(true)}
              className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
              <Settings size={16}/> Configurar R$/KM
            </button>
          )}
          <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
            <Plus size={16}/> Novo Percurso
          </button>
        </div>
      </div>

      {/* Cards de totais */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Pendente de Aprovação', value: totalPending,  color:'text-amber-600',   bg:'bg-amber-50',   icon:'⏳' },
          { label:'Aprovado / A Pagar',    value: totalApproved, color:'text-blue-600',    bg:'bg-blue-50',    icon:'✅' },
          { label:'Total Pago no Período', value: totalPaid,     color:'text-emerald-600', bg:'bg-emerald-50', icon:'💰' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 border border-white`}>
            <p className="text-slate-500 text-xs mb-1">{c.icon} {c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>R$ {c.value.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
          </div>
        ))}
      </div>

      {/* Tabs internas */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { key:'trips',   label:'Percursos' },
          { key:'configs', label:'Configurações R$/KM' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ABA PERCURSOS */}
      {tab === 'trips' && (
        <>
          {/* Filtro status */}
          <div className="flex items-center gap-2 flex-wrap">
            {[['all','Todos'],['pending','Pendentes'],['approved','Aprovados'],['paid','Pagos'],['rejected','Reprovados']].map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                {label}
                {key !== 'all' && <span className="ml-1 opacity-70">({trips.filter(t => t.status === key).length})</span>}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-slate-400">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-100">
                <Car size={32} className="mx-auto mb-2 opacity-30"/>
                Nenhum percurso encontrado
              </div>
            ) : filtered.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS[t.status]?.color}`}>
                        {STATUS[t.status]?.label}
                      </span>
                      <span className="text-slate-400 text-xs">{new Date(t.date+'T12:00:00').toLocaleDateString('pt-BR')}</span>
                    </div>

                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-400"/>
                        <span className="text-slate-800 font-semibold text-sm">{t.drivers?.name}</span>
                      </div>
                      {t.vehicles && (
                        <div className="flex items-center gap-1">
                          <Car size={12} className="text-slate-400"/>
                          <span className="font-mono text-xs text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{t.vehicles.plate}</span>
                        </div>
                      )}
                    </div>

                    {(t.origin || t.destination) && (
                      <p className="text-slate-500 text-xs mb-2">
                        {t.origin && <span>📍 {t.origin}</span>}
                        {t.origin && t.destination && <span className="mx-1">→</span>}
                        {t.destination && <span>🏁 {t.destination}</span>}
                      </p>
                    )}

                    {t.description && <p className="text-slate-500 text-xs mb-2 italic">"{t.description}"</p>}

                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-slate-500">KM: <span className="font-semibold text-slate-700">{Number(t.km_start).toLocaleString('pt-BR')} → {Number(t.km_end).toLocaleString('pt-BR')}</span></span>
                      <span className="text-indigo-600 font-bold">{Number(t.total_km).toFixed(1)} km</span>
                      <span className="text-slate-400">R$ {Number(t.rate_per_km).toFixed(4)}/km</span>
                      <span className="text-emerald-600 font-bold text-sm">R$ {Number(t.total_value).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                    </div>

                    {/* Fotos */}
                    {(t.photo_start_url || t.photo_end_url) && (
                      <div className="flex gap-2 mt-3">
                        {t.photo_start_url && (
                          <div className="relative">
                            <img src={getPhotoUrl(t.photo_start_url)} className="h-16 w-auto rounded-lg border border-slate-200 object-cover cursor-pointer"
                              onClick={() => window.open(getPhotoUrl(t.photo_start_url), '_blank')}/>
                            <span className="absolute -top-1 -left-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">Saída</span>
                          </div>
                        )}
                        {t.photo_end_url && (
                          <div className="relative">
                            <img src={getPhotoUrl(t.photo_end_url)} className="h-16 w-auto rounded-lg border border-slate-200 object-cover cursor-pointer"
                              onClick={() => window.open(getPhotoUrl(t.photo_end_url), '_blank')}/>
                            <span className="absolute -top-1 -left-1 bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded-full">Chegada</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* PIX info para pagamento */}
                    {t.status === 'approved' && t.drivers?.pix && (
                      <div className="mt-2 bg-emerald-50 rounded-lg px-3 py-2 text-xs text-emerald-700">
                        💰 PIX: <span className="font-semibold">{t.drivers.pix}</span>
                        {t.drivers.bank && <span className="ml-2 text-emerald-600">· {t.drivers.bank}</span>}
                      </div>
                    )}
                  </div>

                  {/* Ações admin */}
                  {isAdmin && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {t.status === 'pending' && (
                        <>
                          <button onClick={() => updateStatus(t.id, 'approved')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
                            <CheckCircle size={12}/> Aprovar
                          </button>
                          <button onClick={() => updateStatus(t.id, 'rejected')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50 rounded-lg transition-colors">
                            <XCircle size={12}/> Reprovar
                          </button>
                        </>
                      )}
                      {t.status === 'approved' && (
                        <button onClick={() => updateStatus(t.id, 'paid')}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
                          <DollarSign size={12}/> Marcar Pago
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ABA CONFIGURAÇÕES */}
      {tab === 'configs' && (
        <div className="space-y-3">
          {configs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-100">
              <Settings size={32} className="mx-auto mb-2 opacity-30"/>
              Nenhuma configuração cadastrada
            </div>
          ) : configs.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">{c.drivers?.name}</p>
                {c.vehicles && (
                  <p className="text-slate-500 text-xs mt-0.5">
                    <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{c.vehicles.plate}</span>
                    {' '}{c.vehicles.brand} {c.vehicles.model}
                  </p>
                )}
                {c.notes && <p className="text-slate-400 text-xs mt-1 italic">{c.notes}</p>}
              </div>
              <div className="text-right">
                <p className="text-indigo-600 font-bold text-lg">R$ {Number(c.rate_per_km).toFixed(4)}</p>
                <p className="text-slate-400 text-xs">por KM</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL NOVO PERCURSO */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Registrar Percurso PDV</h3>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Data *</label>
                  <input type="date" value={form.date} onChange={e => f('date', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Colaborador *</label>
                  <select value={form.driver_id} onChange={e => f('driver_id', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Selecione</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              {form.driver_id && getRateForDriver(form.driver_id) > 0 && (
                <div className="bg-indigo-50 rounded-xl px-4 py-2 flex items-center justify-between">
                  <span className="text-indigo-600 text-xs">Valor configurado</span>
                  <span className="text-indigo-700 font-bold">R$ {Number(getRateForDriver(form.driver_id)).toFixed(4)}/km</span>
                </div>
              )}

              {form.driver_id && getRateForDriver(form.driver_id) === 0 && (
                <div className="bg-red-50 rounded-xl px-4 py-2 text-red-600 text-xs font-medium">
                  ⚠️ Este colaborador não tem valor por KM configurado. Configure em "Configurar R$/KM".
                </div>
              )}

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Veículo</label>
                <select value={form.vehicle_id} onChange={e => f('vehicle_id', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Selecione</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Origem</label>
                  <input value={form.origin} onChange={e => f('origin', e.target.value)}
                    placeholder="Ex: Maringá"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Destino</label>
                  <input value={form.destination} onChange={e => f('destination', e.target.value)}
                    placeholder="Ex: Sarandi"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Descrição do percurso</label>
                <input value={form.description} onChange={e => f('description', e.target.value)}
                  placeholder="Ex: Visita técnica cliente, instalação de fibra..."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">KM Inicial *</label>
                  <input type="number" value={form.km_start} onChange={e => f('km_start', e.target.value)}
                    placeholder="Ex: 45000"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">KM Final *</label>
                  <input type="number" value={form.km_end} onChange={e => f('km_end', e.target.value)}
                    placeholder="Ex: 45180"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
              </div>

              {totalKm() > 0 && getRateForDriver(form.driver_id) > 0 && (
                <div className="bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-emerald-700 text-xs font-medium">Total calculado</p>
                      <p className="text-emerald-600 text-xs">{totalKm().toFixed(1)} km × R$ {Number(getRateForDriver(form.driver_id)).toFixed(4)}/km</p>
                    </div>
                    <p className="text-emerald-700 text-2xl font-bold">R$ {Number(totalValue()).toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                  </div>
                </div>
              )}

              {/* Fotos obrigatórias */}
              <div className="space-y-3">
                <p className="text-slate-700 text-sm font-semibold">Fotos do Hodômetro *</p>

                {/* Foto saída */}
                <div className={`rounded-xl border-2 p-4 ${previewStart ? 'border-blue-300 bg-blue-50' : 'border-dashed border-slate-300'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-slate-700">📸 Hodômetro na Saída</p>
                      <p className="text-xs text-slate-400">Foto obrigatória antes de iniciar</p>
                    </div>
                    <button onClick={() => openCamera('start')}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${previewStart ? 'border-blue-400 bg-blue-100 text-blue-700' : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'}`}>
                      <Camera size={14}/>{previewStart ? '✓ Tirada' : '📷 Tirar foto'}
                    </button>
                  </div>
                  {previewStart && (
                    <img src={previewStart} className="h-24 w-auto rounded-lg border-2 border-blue-300 object-cover"/>
                  )}
                </div>

                {/* Foto chegada */}
                <div className={`rounded-xl border-2 p-4 ${previewEnd ? 'border-emerald-300 bg-emerald-50' : 'border-dashed border-slate-300'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-slate-700">📸 Hodômetro na Chegada</p>
                      <p className="text-xs text-slate-400">Foto obrigatória ao finalizar</p>
                    </div>
                    <button onClick={() => openCamera('end')}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${previewEnd ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'}`}>
                      <Camera size={14}/>{previewEnd ? '✓ Tirada' : '📷 Tirar foto'}
                    </button>
                  </div>
                  {previewEnd && (
                    <img src={previewEnd} className="h-24 w-auto rounded-lg border-2 border-emerald-300 object-cover"/>
                  )}
                </div>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações</label>
                <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex justify-end gap-3">
              <button onClick={() => setModal(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving}
                className="px-6 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                {saving ? 'Salvando...' : 'Registrar Percurso'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURAÇÃO R$/KM */}
      {configModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Configurar Valor por KM</h3>
              <button onClick={() => setConfigModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Colaborador PDV *</label>
                <select value={configForm.driver_id} onChange={e => cf('driver_id', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Selecione</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Veículo (opcional)</label>
                <select value={configForm.vehicle_id} onChange={e => cf('vehicle_id', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Qualquer veículo</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Valor por KM (R$) *</label>
                <input type="number" step="0.0001" value={configForm.rate_per_km} onChange={e => cf('rate_per_km', e.target.value)}
                  placeholder="Ex: 0.7500"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                <p className="text-slate-400 text-xs mt-1">Ex: R$ 0,75 por KM → digite 0.75</p>
              </div>
              {configForm.rate_per_km && Number(configForm.rate_per_km) > 0 && (
                <div className="bg-indigo-50 rounded-xl px-4 py-3 text-center">
                  <p className="text-indigo-600 text-xs">Exemplo: 100 km = <span className="font-bold">R$ {(100 * Number(configForm.rate_per_km)).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></p>
                </div>
              )}
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações</label>
                <textarea value={configForm.notes} onChange={e => cf('notes', e.target.value)} rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setConfigModal(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={saveConfig} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                {saving ? 'Salvando...' : 'Salvar Configuração'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}