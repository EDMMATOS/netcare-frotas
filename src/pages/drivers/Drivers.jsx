import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, Users, CheckCircle, XCircle, Pencil, X, Upload, Camera } from 'lucide-react'
import toast from 'react-hot-toast'

const empty = {
  name:'', cpf:'', cnh:'', cnh_category:'', cnh_expiry:'',
  phone:'', email:'', notes:'', driver_type:'clt',
  cnpj:'', company_name:'', bank:'', pix:''
}

const TYPES = {
  clt:      { label:'CLT',         color:'bg-blue-50 text-blue-700',    icon:'👔' },
  pj_fixed: { label:'PJ Fixo',     color:'bg-purple-50 text-purple-700', icon:'🏢' },
  pj_fleet: { label:'PJ Frota',    color:'bg-orange-50 text-orange-700', icon:'🚛' },
  pdv:      { label:'Externo PDV', color:'bg-teal-50 text-teal-700',    icon:'📱' },
}

// Máscaras
const maskPhone = (v) => {
  v = v.replace(/\D/g, '').slice(0, 11)
  if (v.length <= 10) return v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
  return v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
}
const maskCPF  = (v) => v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/,'$1.$2.$3-$4').replace(/-$/,'')
const maskCNPJ = (v) => v.replace(/\D/g,'').slice(0,14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/,'$1.$2.$3/$4-$5').replace(/-$/,'')

export default function Drivers() {
  const [list, setList]             = useState([])
  const [search, setSearch]         = useState('')
  const [tab, setTab]               = useState('active')
  const [typeFilter, setTypeFilter] = useState('all')
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState(empty)
  const [saving, setSaving]         = useState(false)
  const [photoFile, setPhotoFile]   = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const fileRef = useRef()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('drivers').select('*').order('name')
    setList(data || [])
    setLoading(false)
  }

  const filtered = list
    .filter(d => tab === 'all' ? true : tab === 'active' ? d.is_active : !d.is_active)
    .filter(d => typeFilter === 'all' ? true : d.driver_type === typeFilter)
    .filter(d =>
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.cpf?.includes(search) ||
      d.cnh?.includes(search)
    )

  const countActive   = list.filter(d => d.is_active).length
  const countInactive = list.filter(d => !d.is_active).length

  const openNew = () => {
    setForm(empty); setPhotoFile(null); setPhotoPreview(null); setModal(true)
  }

  const openEdit = (d) => {
    setForm({ ...empty, ...d })
    setPhotoFile(null)
    setPhotoPreview(d.photo_url ? getPhotoUrl(d.photo_url) : null)
    setModal(true)
  }

  const closeModal = () => {
    setModal(false); setForm(empty); setPhotoFile(null); setPhotoPreview(null)
  }

  const getPhotoUrl = (path) => {
    if (!path) return null
    if (path.startsWith('http')) return path
    const { data } = supabase.storage.from('driver-photos').getPublicUrl(path)
    return data.publicUrl
  }

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const save = async () => {
    if (!form.name) return toast.error('Nome é obrigatório')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let photo_url = form.photo_url || null
      if (photoFile) {
        const ext  = photoFile.name.split('.').pop()
        const path = `${user.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('driver-photos').upload(path, photoFile)
        if (!upErr) photo_url = path
      }
      const payload = {
        name: form.name, cpf: form.cpf, cnh: form.cnh,
        cnh_category: form.cnh_category, cnh_expiry: form.cnh_expiry || null,
        phone: form.phone, email: form.email, notes: form.notes,
        driver_type: form.driver_type || 'clt',
        cnpj: form.cnpj, company_name: form.company_name,
        bank: form.bank, pix: form.pix,
        photo_url, updated_at: new Date().toISOString()
      }
      if (form.id) {
        const { error } = await supabase.from('drivers').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('drivers').insert({
          ...payload, is_active: true, created_by: user.id
        })
        if (error) throw error
      }
      toast.success(form.id ? 'Motorista atualizado!' : 'Motorista cadastrado!')
      closeModal(); load()
    } catch(e) {
      toast.error('Erro ao salvar: ' + e.message)
    }
    setSaving(false)
  }

  const toggleActive = async (d) => {
    const newStatus = !d.is_active
    if (!window.confirm(`${newStatus ? 'Reativar' : 'Inativar'} ${d.name}?`)) return
    await supabase.from('drivers').update({
      is_active: newStatus,
      activated_at:   newStatus ? new Date().toISOString() : d.activated_at,
      deactivated_at: !newStatus ? new Date().toISOString() : null
    }).eq('id', d.id)
    toast.success(newStatus ? '✅ Reativado!' : '⛔ Inativado')
    load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const cnhExpired = (d) => d.cnh_expiry && new Date(d.cnh_expiry) < new Date()

  const statusTabs = [
    { key:'active',   label:'Ativos',   count: countActive },
    { key:'inactive', label:'Inativos', count: countInactive },
    { key:'all',      label:'Todos',    count: list.length },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Motoristas</h2>
          <p className="text-slate-500 text-sm mt-0.5">{list.length} cadastrado{list.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16} /> Novo Motorista
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
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          Todos os tipos
        </button>
        {Object.entries(TYPES).map(([key, t]) => (
          <button key={key} onClick={() => setTypeFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF ou CNH..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 transition-colors" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Motorista</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Tipo</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">CPF</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">CNH</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Validade CNH</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                Nenhum motorista encontrado
              </td></tr>
            ) : filtered.map(d => (
              <tr key={d.id} className={`hover:bg-slate-50 transition-colors ${!d.is_active ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    {d.photo_url ? (
                      <img src={getPhotoUrl(d.photo_url)} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold flex-shrink-0">
                        {d.name?.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-slate-800">{d.name}</p>
                      {d.phone && <p className="text-slate-400 text-xs mt-0.5">{d.phone}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${TYPES[d.driver_type]?.color || 'bg-slate-100 text-slate-600'}`}>
                    {TYPES[d.driver_type]?.icon} {TYPES[d.driver_type]?.label || '—'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-600">{d.cpf || '—'}</td>
                <td className="px-5 py-3.5 text-slate-600">{d.cnh ? `${d.cnh} (${d.cnh_category || '?'})` : '—'}</td>
                <td className="px-5 py-3.5">
                  {d.cnh_expiry ? (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${cnhExpired(d) ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                      {cnhExpired(d) ? '⚠️ Vencida' : new Date(d.cnh_expiry).toLocaleDateString('pt-BR')}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${d.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {d.is_active ? <CheckCircle size={11} /> : <XCircle size={11} />}
                    {d.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(d)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => toggleActive(d)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${d.is_active ? 'text-red-500 hover:bg-red-50 border border-red-200' : 'text-emerald-600 hover:bg-emerald-50 border border-emerald-200'}`}>
                      {d.is_active ? <><XCircle size={12} /> Inativar</> : <><CheckCircle size={12} /> Reativar</>}
                    </button>
                  </div>
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
              <h3 className="font-semibold text-slate-800">{form.id ? 'Editar Motorista' : 'Novo Motorista'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-5">

              {/* Foto */}
              <div className="flex items-center gap-5 pb-5 border-b border-slate-100">
                {photoPreview ? (
                  <img src={photoPreview} className="w-20 h-20 rounded-full object-cover border-2 border-slate-200" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <Camera size={28} />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">Foto do Motorista</p>
                  <p className="text-xs text-slate-400 mb-2">JPG ou PNG, máx. 5MB</p>
                  <button onClick={() => fileRef.current.click()}
                    className="flex items-center gap-2 text-xs font-medium text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                    <Upload size={12} /> Enviar foto
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                </div>
              </div>

              {/* Tipo */}
              <div>
                <label className="text-slate-500 text-xs font-medium mb-2 block">Tipo de Motorista *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(TYPES).map(([key, t]) => (
                    <button key={key} onClick={() => f('driver_type', key)}
                      className={`py-3 px-4 rounded-xl text-sm font-medium border-2 transition-all text-left ${form.driver_type === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <span className="text-base mr-2">{t.icon}</span>{t.label}
                      <p className="text-xs mt-0.5 font-normal opacity-70">
                        {key === 'clt'      && 'Funcionário fixo, conduz frota'}
                        {key === 'pj_fixed' && 'Prestador, veículo próprio arquivado'}
                        {key === 'pj_fleet' && 'Prestador, usa veículos da frota'}
                        {key === 'pdv'      && 'Colaborador, reembolso por KM'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Campos básicos */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Nome Completo *</label>
                  <input value={form.name} onChange={e => f('name', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>

                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">CPF</label>
                  <input value={form.cpf} onChange={e => f('cpf', maskCPF(e.target.value))}
                    placeholder="000.000.000-00"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>

                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Telefone</label>
                  <input value={form.phone} onChange={e => f('phone', maskPhone(e.target.value))}
                    placeholder="(44) 99999-9999"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>

                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">E-mail</label>
                  <input type="email" value={form.email} onChange={e => f('email', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>

                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Nº CNH</label>
                  <input value={form.cnh} onChange={e => f('cnh', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>

                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Categoria CNH</label>
                  <select value={form.cnh_category} onChange={e => f('cnh_category', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Selecione</option>
                    {['A','B','AB','C','D','E'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Validade CNH</label>
                  <input type="date" value={form.cnh_expiry} onChange={e => f('cnh_expiry', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>

                {/* Campos PJ */}
                {(form.driver_type === 'pj_fixed' || form.driver_type === 'pj_fleet') && (
                  <>
                    <div>
                      <label className="text-slate-500 text-xs font-medium mb-1.5 block">CNPJ</label>
                      <input value={form.cnpj} onChange={e => f('cnpj', maskCNPJ(e.target.value))}
                        placeholder="00.000.000/0000-00"
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-slate-500 text-xs font-medium mb-1.5 block">Razão Social</label>
                      <input value={form.company_name} onChange={e => f('company_name', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                  </>
                )}

                {/* Campos PDV */}
                {form.driver_type === 'pdv' && (
                  <>
                    <div>
                      <label className="text-slate-500 text-xs font-medium mb-1.5 block">Banco</label>
                      <input value={form.bank} onChange={e => f('bank', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                    <div>
                      <label className="text-slate-500 text-xs font-medium mb-1.5 block">PIX / Conta</label>
                      <input value={form.pix} onChange={e => f('pix', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                    </div>
                  </>
                )}

                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações</label>
                  <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={3}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                {saving ? 'Salvando...' : form.id ? 'Atualizar Motorista' : 'Salvar Motorista'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}