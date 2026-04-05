import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, X, Pencil, CheckCircle, XCircle, Camera, Upload } from 'lucide-react'
import toast from 'react-hot-toast'

const empty = {
  name:'', role:'fleet_manager', role_label:'',
  department:'', email:'', phone:''
}

const ROLES = {
  ceo:               { label:'CEO / Diretor',         icon:'👑', color:'bg-yellow-50 text-yellow-700' },
  admin:             { label:'Administrativo',         icon:'🏢', color:'bg-blue-50 text-blue-700' },
  supervisor:        { label:'Supervisão',             icon:'👁️', color:'bg-purple-50 text-purple-700' },
  engineer:          { label:'Engenharia',             icon:'⚙️', color:'bg-teal-50 text-teal-700' },
  fleet_manager:     { label:'Gestor de Frotas',       icon:'🚛', color:'bg-indigo-50 text-indigo-700' },
  warehouse_manager: { label:'Gestor de Almoxarifado', icon:'📦', color:'bg-orange-50 text-orange-700' },
  financial:         { label:'Financeiro',             icon:'💰', color:'bg-green-50 text-green-700' },
  other:             { label:'Outro',                  icon:'👤', color:'bg-slate-100 text-slate-600' },
}

const maskPhone = v => { v=v.replace(/\D/g,'').slice(0,11); return v.length<=10?v.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3').replace(/-$/,''):v.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'') }

export default function Signatories() {
  const [list, setList]         = useState([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(empty)
  const [saving, setSaving]     = useState(false)
  const [photoFile, setPhotoFile]   = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const fileRef = useRef()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('signatories').select('*').order('name')
    setList(data || [])
    setLoading(false)
  }

  const filtered = list.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.role_label?.toLowerCase().includes(search.toLowerCase()) ||
    s.department?.toLowerCase().includes(search.toLowerCase())
  )

  const getPhotoUrl = path => {
    if (!path) return null
    if (path.startsWith('http')) return path
    const { data } = supabase.storage.from('user-photos').getPublicUrl(path)
    return data.publicUrl
  }

  const handlePhoto = e => {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const openNew  = () => { setForm(empty); setPhotoFile(null); setPhotoPreview(null); setModal(true) }
  const openEdit = s => {
    setForm({ ...empty, ...s })
    setPhotoFile(null)
    setPhotoPreview(s.photo_url ? getPhotoUrl(s.photo_url) : null)
    setModal(true)
  }
  const closeModal = () => { setModal(false); setForm(empty); setPhotoFile(null); setPhotoPreview(null) }

  const save = async () => {
    if (!form.name) return toast.error('Nome é obrigatório')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let photo_url = form.photo_url || null
      if (photoFile) {
        const ext  = photoFile.name.split('.').pop()
        const path = `signatories/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('user-photos').upload(path, photoFile)
        if (!upErr) photo_url = path
      }
      const payload = {
        name: form.name, role: form.role,
        role_label: form.role_label || ROLES[form.role]?.label,
        department: form.department, email: form.email,
        phone: form.phone, photo_url,
        updated_at: new Date().toISOString()
      }
      if (form.id) {
        const { error } = await supabase.from('signatories').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('signatories').insert({ ...payload, is_active: true, created_by: user.id })
        if (error) throw error
      }
      toast.success(form.id ? 'Responsável atualizado!' : 'Responsável cadastrado!')
      closeModal(); load()
    } catch(e) { toast.error('Erro: ' + e.message) }
    setSaving(false)
  }

  const toggleActive = async s => {
    await supabase.from('signatories').update({ is_active: !s.is_active }).eq('id', s.id)
    toast.success(!s.is_active ? '✅ Reativado!' : '⛔ Inativado')
    load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Responsáveis e Signatários</h2>
          <p className="text-slate-500 text-sm mt-0.5">{list.length} cadastrado{list.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16}/> Novo Responsável
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, cargo ou departamento..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-400"/>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 text-center py-12 text-slate-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-slate-400">
            <span className="text-4xl block mb-2">👤</span>
            Nenhum responsável cadastrado
          </div>
        ) : filtered.map(s => (
          <div key={s.id} className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ${!s.is_active ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-4">
              {s.photo_url ? (
                <img src={getPhotoUrl(s.photo_url)} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-slate-100"/>
              ) : (
                <div className="w-14 h-14 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg flex-shrink-0">
                  {s.name?.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{s.name}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLES[s.role]?.color || 'bg-slate-100 text-slate-600'}`}>
                  {ROLES[s.role]?.icon} {s.role_label || ROLES[s.role]?.label}
                </span>
                {s.department && <p className="text-slate-400 text-xs mt-1">{s.department}</p>}
                {s.email && <p className="text-slate-400 text-xs mt-0.5 truncate">{s.email}</p>}
                {s.phone && <p className="text-slate-400 text-xs mt-0.5">{s.phone}</p>}
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-50">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                {s.is_active ? <CheckCircle size={11}/> : <XCircle size={11}/>}
                {s.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                  <Pencil size={14}/>
                </button>
                <button onClick={() => toggleActive(s)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${s.is_active ? 'text-red-500 hover:bg-red-50 border border-red-200' : 'text-emerald-600 hover:bg-emerald-50 border border-emerald-200'}`}>
                  {s.is_active ? <><XCircle size={12}/> Inativar</> : <><CheckCircle size={12}/> Reativar</>}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">{form.id ? 'Editar Responsável' : 'Novo Responsável'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-5">

              {/* Foto */}
              <div className="flex items-center gap-5 pb-5 border-b border-slate-100">
                {photoPreview ? (
                  <img src={photoPreview} className="w-20 h-20 rounded-xl object-cover border-2 border-slate-200"/>
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <Camera size={28}/>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">Foto</p>
                  <button onClick={() => fileRef.current.click()}
                    className="flex items-center gap-2 text-xs font-medium text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                    <Upload size={12}/> Enviar foto
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto}/>
                </div>
              </div>

              {/* Cargo */}
              <div>
                <label className="text-slate-500 text-xs font-medium mb-2 block">Cargo / Função *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(ROLES).map(([key, r]) => (
                    <button key={key} onClick={() => f('role', key)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-medium border-2 transition-all text-left ${form.role === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <span className="mr-1">{r.icon}</span>{r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Nome Completo *</label>
                  <input value={form.name} onChange={e => f('name', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Título no documento</label>
                  <input value={form.role_label} onChange={e => f('role_label', e.target.value)}
                    placeholder={ROLES[form.role]?.label}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                  <p className="text-slate-400 text-xs mt-1">Como aparecerá nos documentos. Deixe vazio para usar o padrão.</p>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Departamento</label>
                  <input value={form.department} onChange={e => f('department', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Telefone</label>
                  <input value={form.phone} onChange={e => f('phone', maskPhone(e.target.value))}
                    placeholder="(44) 99999-9999"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">E-mail</label>
                  <input type="email" value={form.email} onChange={e => f('email', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                {saving ? 'Salvando...' : form.id ? 'Atualizar' : 'Salvar Responsável'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}