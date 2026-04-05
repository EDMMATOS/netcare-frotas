import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, X, Pencil, Shield, Eye, EyeOff, CheckCircle, XCircle, Key, Camera, Upload, Lock, Unlock, User, Settings } from 'lucide-react'
import toast from 'react-hot-toast'

const ROLES = {
  admin:    { label:'Administrador',    color:'bg-red-50 text-red-700',      icon:'👑', desc:'Acesso total ao sistema' },
  manager:  { label:'Gerente',          color:'bg-purple-50 text-purple-700', icon:'🏢', desc:'Gerencia equipes e aprova lançamentos' },
  fleet:    { label:'Gestor de Frotas', color:'bg-blue-50 text-blue-700',    icon:'🚛', desc:'Gerencia veículos e motoristas' },
  financial:{ label:'Financeiro',       color:'bg-green-50 text-green-700',  icon:'💰', desc:'Acessa relatórios e financeiro' },
  operator: { label:'Operador',         color:'bg-amber-50 text-amber-700',  icon:'⚙️', desc:'Lança dados operacionais' },
  viewer:   { label:'Visualizador',     color:'bg-slate-100 text-slate-600', icon:'👁️', desc:'Somente visualização' },
  pdv:      { label:'PDV Externo',      color:'bg-teal-50 text-teal-700',    icon:'📱', desc:'Acesso somente ao módulo PDV' },
}

const MODULES = [
  { key:'dashboard',   label:'Dashboard',          icon:'📊' },
  { key:'companies',   label:'Empresas',            icon:'🏢' },
  { key:'vehicles',    label:'Veículos',            icon:'🚗' },
  { key:'drivers',     label:'Motoristas',          icon:'👤' },
  { key:'suppliers',   label:'Fornecedores',        icon:'🏪' },
  { key:'fuel',        label:'Abastecimento',       icon:'⛽' },
  { key:'maintenance', label:'Manutenção',          icon:'🔧' },
  { key:'fines',       label:'Multas',              icon:'⚠️' },
  { key:'inspections', label:'Vistoria',            icon:'📋' },
  { key:'mileage',     label:'Quilometragem',       icon:'🛣️' },
  { key:'orders',      label:'Ordens de Compra',    icon:'📄' },
  { key:'pdv',         label:'PDV',                 icon:'📱' },
  { key:'reports',     label:'Relatórios',          icon:'📈' },
  { key:'signatories', label:'Responsáveis',        icon:'✍️' },
  { key:'admin',       label:'Administração',       icon:'⚙️' },
]

const ROLE_DEFAULTS = {
  admin:     { can_view:true, can_create:true, can_edit:true, can_delete:true, can_approve:true, can_export:true },
  manager:   { can_view:true, can_create:true, can_edit:true, can_delete:false, can_approve:true, can_export:true },
  fleet:     { can_view:true, can_create:true, can_edit:true, can_delete:false, can_approve:false, can_export:false },
  financial: { can_view:true, can_create:false, can_edit:false, can_delete:false, can_approve:false, can_export:true },
  operator:  { can_view:true, can_create:true, can_edit:true, can_delete:false, can_approve:false, can_export:false },
  viewer:    { can_view:true, can_create:false, can_edit:false, can_delete:false, can_approve:false, can_export:false },
  pdv:       { can_view:false, can_create:false, can_edit:false, can_delete:false, can_approve:false, can_export:false },
}

const PDV_ONLY_MODULES = ['pdv']
const PERM_LABELS = [
  { key:'can_view',    label:'Ver',      color:'text-slate-600' },
  { key:'can_create',  label:'Criar',    color:'text-emerald-600' },
  { key:'can_edit',    label:'Editar',   color:'text-blue-600' },
  { key:'can_delete',  label:'Excluir',  color:'text-red-600' },
  { key:'can_approve', label:'Aprovar',  color:'text-purple-600' },
  { key:'can_export',  label:'Exportar', color:'text-amber-600' },
]

export default function Admin() {
  const [users, setUsers]           = useState([])
  const [search, setSearch]         = useState('')
  const [tab, setTab]               = useState('users')
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [permModal, setPermModal]   = useState(false)
  const [passModal, setPassModal]   = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [permissions, setPermissions]   = useState({})
  const [form, setForm]             = useState({
    full_name:'', email:'', password:'', role:'operator',
    phone:'', notes:''
  })
  const [newPass, setNewPass]       = useState('')
  const [showPass, setShowPass]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [photoFile, setPhotoFile]   = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [logs, setLogs]             = useState([])
  const fileRef = useRef()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .order('full_name')
    setUsers(profiles || [])
    setLoading(false)
  }

  const loadLogs = async () => {
    const { data } = await supabase
      .from('access_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setLogs(data || [])
  }

  const loadPermissions = async (userId) => {
    const { data } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('user_id', userId)
    const perms = {}
    MODULES.forEach(m => {
      const existing = data?.find(p => p.module === m.key)
      perms[m.key] = existing || {
        module: m.key, user_id: userId,
        can_view:false, can_create:false, can_edit:false,
        can_delete:false, can_approve:false, can_export:false
      }
    })
    setPermissions(perms)
  }

  const getPhotoUrl = path => {
    if (!path) return null
    if (path.startsWith('http')) return path
    const { data } = supabase.storage.from('user-photos').getPublicUrl(path)
    return data.publicUrl
  }

  const filtered = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  )

  const openNew = () => {
    setForm({ full_name:'', email:'', password:'', role:'operator', phone:'', notes:'' })
    setPhotoFile(null); setPhotoPreview(null)
    setModal(true)
  }

  const openEdit = u => {
    setForm({ ...u, password:'' })
    setPhotoFile(null)
    setPhotoPreview(u.photo_url ? getPhotoUrl(u.photo_url) : null)
    setModal(true)
  }

  const openPermissions = async u => {
    setSelectedUser(u)
    await loadPermissions(u.id)
    setPermModal(true)
  }

  const openResetPass = u => {
    setSelectedUser(u)
    setNewPass('')
    setShowPass(false)
    setPassModal(true)
  }

  const save = async () => {
    if (!form.full_name) return toast.error('Nome é obrigatório')
    if (!form.email)     return toast.error('E-mail é obrigatório')
    if (!form.id && !form.password) return toast.error('Senha é obrigatória para novo usuário')
    if (!form.id && form.password.length < 6) return toast.error('Senha deve ter no mínimo 6 caracteres')
    setSaving(true)
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      let userId = form.id
      let photo_url = form.photo_url || null

      if (!form.id) {
        // Cria usuário no Auth
        const { data: authData, error: authError } = await supabase.auth.admin
          ? await supabase.auth.signUp({ email: form.email, password: form.password })
          : await supabase.auth.signUp({ email: form.email, password: form.password })
        if (authError) throw authError
        userId = authData.user?.id
        if (!userId) throw new Error('Erro ao criar usuário')
      }

      // Upload foto
      if (photoFile) {
        const ext  = photoFile.name.split('.').pop()
        const path = `users/${userId}.${ext}`
        const { error: upErr } = await supabase.storage.from('user-photos').upload(path, photoFile, { upsert: true })
        if (!upErr) photo_url = path
      }

      // Salva/atualiza perfil
      const payload = {
        id: userId,
        full_name:  form.full_name,
        email:      form.email,
        role:       form.role,
        phone:      form.phone,
        notes:      form.notes,
        photo_url,
        is_active:  form.is_active !== false,
        updated_at: new Date().toISOString(),
        created_by: currentUser.id,
      }

      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert(payload)
      if (profileError) throw profileError

      // Cria permissões padrão para novo usuário
      if (!form.id) {
        await applyRoleDefaults(userId, form.role, false)
      }

      toast.success(form.id ? 'Usuário atualizado!' : 'Usuário criado com sucesso!')
      setModal(false); load()
    } catch(e) {
      toast.error('Erro: ' + (e.message || 'Verifique os dados'))
    }
    setSaving(false)
  }

  const applyRoleDefaults = async (userId, role, showToast = true) => {
    const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.viewer
    const isPdv    = role === 'pdv'
    const isAdmin  = role === 'admin'

    const permsToInsert = MODULES.map(m => {
      let perm = { ...defaults }
      if (isPdv) {
        perm = PDV_ONLY_MODULES.includes(m.key)
          ? { can_view:true, can_create:true, can_edit:false, can_delete:false, can_approve:false, can_export:false }
          : { can_view:false, can_create:false, can_edit:false, can_delete:false, can_approve:false, can_export:false }
      }
      return { user_id: userId, module: m.key, ...perm, updated_at: new Date().toISOString() }
    })

    await supabase.from('user_permissions').delete().eq('user_id', userId)
    await supabase.from('user_permissions').insert(permsToInsert)
    if (showToast) toast.success('Permissões aplicadas com sucesso!')
    await loadPermissions(userId)
  }

  const savePermissions = async () => {
    setSaving(true)
    try {
      const permsToUpsert = Object.values(permissions).map(p => ({
        ...p,
        user_id: selectedUser.id,
        updated_at: new Date().toISOString()
      }))
      await supabase.from('user_permissions').delete().eq('user_id', selectedUser.id)
      await supabase.from('user_permissions').insert(permsToUpsert)
      toast.success('Permissões salvas com sucesso!')
      setPermModal(false)
    } catch(e) { toast.error('Erro: ' + e.message) }
    setSaving(false)
  }

  const resetPassword = async () => {
    if (!newPass || newPass.length < 6) return toast.error('Senha deve ter no mínimo 6 caracteres')
    setSaving(true)
    try {
      const { error } = await supabase.auth.admin?.updateUserById
        ? await supabase.auth.admin.updateUserById(selectedUser.id, { password: newPass })
        : { error: null }

      if (!error) {
        toast.success('Senha alterada com sucesso!')
        setPassModal(false)
        setNewPass('')
      } else {
        // Fallback: envia email de reset
        await supabase.auth.resetPasswordForEmail(selectedUser.email)
        toast.success('Link de redefinição enviado para o e-mail!')
        setPassModal(false)
      }
    } catch(e) {
      await supabase.auth.resetPasswordForEmail(selectedUser.email)
      toast.success('Link de redefinição enviado para o e-mail!')
      setPassModal(false)
    }
    setSaving(false)
  }

  const toggleUserStatus = async u => {
    const newStatus = !u.is_active
    if (!window.confirm(`${newStatus ? 'Reativar' : 'Bloquear'} o acesso de ${u.full_name}?`)) return
    await supabase.from('user_profiles').update({ is_active: newStatus, updated_at: new Date().toISOString() }).eq('id', u.id)
    toast.success(newStatus ? '✅ Acesso liberado!' : '🔒 Usuário bloqueado!')
    load()
  }

  const togglePerm = (module, permKey) => {
    setPermissions(p => ({
      ...p,
      [module]: { ...p[module], [permKey]: !p[module][permKey] }
    }))
  }

  const toggleModuleAll = (module, value) => {
    setPermissions(p => ({
      ...p,
      [module]: {
        ...p[module],
        can_view: value, can_create: value, can_edit: value,
        can_delete: value, can_approve: value, can_export: value
      }
    }))
  }

  const togglePermAll = (permKey, value) => {
    const newPerms = { ...permissions }
    MODULES.forEach(m => {
      newPerms[m.key] = { ...newPerms[m.key], [permKey]: value }
    })
    setPermissions(newPerms)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const countActive   = users.filter(u => u.is_active !== false).length
  const countInactive = users.filter(u => u.is_active === false).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Administração do Sistema</h2>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} usuário{users.length !== 1 ? 's' : ''} · {countActive} ativo{countActive !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16}/> Novo Usuário
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { key:'users', label:'Usuários' },
          { key:'roles', label:'Perfis de Acesso' },
          { key:'logs',  label:'Log de Atividades' },
        ].map(t => (
          <button key={t.key}
            onClick={() => { setTab(t.key); if (t.key === 'logs') loadLogs() }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ABA USUÁRIOS */}
      {tab === 'users' && (
        <>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome, e-mail ou perfil..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-400"/>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Usuário</th>
                  <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Perfil</th>
                  <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Contato</th>
                  <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400">Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-slate-400">
                    <User size={32} className="mx-auto mb-2 opacity-30"/>
                    Nenhum usuário encontrado
                  </td></tr>
                ) : filtered.map(u => (
                  <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${u.is_active === false ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {u.photo_url ? (
                          <img src={getPhotoUrl(u.photo_url)} className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-slate-100"/>
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-bold flex-shrink-0">
                            {u.full_name?.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-slate-800">{u.full_name}</p>
                          <p className="text-slate-400 text-xs mt-0.5">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLES[u.role]?.color || 'bg-slate-100 text-slate-600'}`}>
                        {ROLES[u.role]?.icon} {ROLES[u.role]?.label || u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 text-xs">{u.phone || '—'}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${u.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                        {u.is_active !== false ? <CheckCircle size={11}/> : <XCircle size={11}/>}
                        {u.is_active !== false ? 'Ativo' : 'Bloqueado'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button onClick={() => openPermissions(u)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-600 border border-purple-200 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Gerenciar permissões">
                          <Shield size={12}/> Permissões
                        </button>
                        <button onClick={() => openResetPass(u)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Redefinir senha">
                          <Key size={14}/>
                        </button>
                        <button onClick={() => openEdit(u)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Editar">
                          <Pencil size={14}/>
                        </button>
                        <button onClick={() => toggleUserStatus(u)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                            u.is_active !== false
                              ? 'text-red-500 border-red-200 hover:bg-red-50'
                              : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                          }`}
                          title={u.is_active !== false ? 'Bloquear acesso' : 'Liberar acesso'}>
                          {u.is_active !== false ? <><Lock size={12}/> Bloquear</> : <><Unlock size={12}/> Liberar</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ABA PERFIS */}
      {tab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(ROLES).map(([key, role]) => (
            <div key={key} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-2xl">{role.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800">{role.label}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${role.color}`}>{key}</span>
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5">{role.desc}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PERM_LABELS.map(p => {
                  const hasIt = ROLE_DEFAULTS[key]?.[p.key]
                  return (
                    <div key={p.key} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${hasIt ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}>
                      {hasIt ? <CheckCircle size={10}/> : <XCircle size={10}/>}
                      {p.label}
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-50">
                <p className="text-xs text-slate-400 font-medium">
                  {users.filter(u => u.role === key).length} usuário{users.filter(u => u.role === key).length !== 1 ? 's' : ''} com este perfil
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ABA LOGS */}
      {tab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Settings size={32} className="mx-auto mb-2 opacity-30"/>
              Nenhum log registrado ainda
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Data/Hora</th>
                  <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Ação</th>
                  <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Módulo</th>
                  <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-lg">{log.action}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 text-xs">{log.module || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{log.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ===== MODAL CRIAR/EDITAR USUÁRIO ===== */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">{form.id ? 'Editar Usuário' : 'Novo Usuário'}</h3>
              <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-5">

              {/* Foto */}
              <div className="flex items-center gap-5 pb-5 border-b border-slate-100">
                {photoPreview ? (
                  <img src={photoPreview} className="w-20 h-20 rounded-full object-cover border-2 border-slate-200"/>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-400">
                    <Camera size={28}/>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">Foto do Usuário</p>
                  <button onClick={() => fileRef.current.click()}
                    className="flex items-center gap-2 text-xs font-medium text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                    <Upload size={12}/> Enviar foto
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const file = e.target.files[0]
                      if (!file) return
                      setPhotoFile(file)
                      setPhotoPreview(URL.createObjectURL(file))
                    }}/>
                </div>
              </div>

              {/* Perfil de acesso */}
              <div>
                <label className="text-slate-500 text-xs font-medium mb-2 block">Perfil de Acesso *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(ROLES).map(([key, role]) => (
                    <button key={key} onClick={() => f('role', key)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-medium border-2 transition-all text-left ${form.role === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <span className="mr-1">{role.icon}</span>{role.label}
                      <p className="text-xs mt-0.5 opacity-60 font-normal">{role.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dados pessoais */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Nome Completo *</label>
                  <input value={form.full_name} onChange={e => f('full_name', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">E-mail *</label>
                  <input type="email" value={form.email} onChange={e => f('email', e.target.value)}
                    disabled={!!form.id}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"/>
                  {form.id && <p className="text-slate-400 text-xs mt-1">E-mail não pode ser alterado após criação</p>}
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Telefone</label>
                  <input value={form.phone} onChange={e => f('phone', e.target.value)}
                    placeholder="(44) 99999-9999"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>

                {/* Senha — apenas para novo usuário */}
                {!form.id && (
                  <div>
                    <label className="text-slate-500 text-xs font-medium mb-1.5 block">Senha *</label>
                    <div className="relative">
                      <input type={showPass ? 'text' : 'password'} value={form.password} onChange={e => f('password', e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 pr-10"/>
                      <button onClick={() => setShowPass(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                      </button>
                    </div>
                    {form.password && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className={`h-1 flex-1 rounded-full ${form.password.length >= 8 ? 'bg-emerald-400' : form.password.length >= 6 ? 'bg-amber-400' : 'bg-red-400'}`}/>
                        <span className="text-xs text-slate-400">
                          {form.password.length >= 8 ? 'Forte' : form.password.length >= 6 ? 'Regular' : 'Fraca'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações</label>
                  <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
                </div>
              </div>

              {!form.id && (
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
                  <p className="text-blue-700 text-xs font-medium">ℹ️ As permissões padrão do perfil selecionado serão aplicadas automaticamente. Você pode ajustá-las depois em "Permissões".</p>
                </div>
              )}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex justify-end gap-3">
              <button onClick={() => setModal(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-6 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                {saving ? 'Salvando...' : form.id ? 'Atualizar Usuário' : 'Criar Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL PERMISSÕES ===== */}
      {permModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">Permissões de Acesso</h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {selectedUser.full_name} ·
                    <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-medium ${ROLES[selectedUser.role]?.color}`}>
                      {ROLES[selectedUser.role]?.icon} {ROLES[selectedUser.role]?.label}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => applyRoleDefaults(selectedUser.id, selectedUser.role)}
                    className="text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                    Restaurar padrão do perfil
                  </button>
                  <button onClick={() => setPermModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                </div>
              </div>

              {/* Header das colunas */}
              <div className="mt-3 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500">
                <div className="col-span-3">Módulo</div>
                <div className="col-span-1 text-center">
                  <button onClick={() => togglePermAll('can_view', true)} className="hover:text-indigo-600 transition-colors">Ver</button>
                </div>
                <div className="col-span-1 text-center">
                  <button onClick={() => togglePermAll('can_create', true)} className="hover:text-emerald-600 transition-colors">Criar</button>
                </div>
                <div className="col-span-1 text-center">
                  <button onClick={() => togglePermAll('can_edit', true)} className="hover:text-blue-600 transition-colors">Editar</button>
                </div>
                <div className="col-span-1 text-center">
                  <button onClick={() => togglePermAll('can_delete', true)} className="hover:text-red-600 transition-colors">Excluir</button>
                </div>
                <div className="col-span-1 text-center">
                  <button onClick={() => togglePermAll('can_approve', true)} className="hover:text-purple-600 transition-colors">Aprovar</button>
                </div>
                <div className="col-span-1 text-center">
                  <button onClick={() => togglePermAll('can_export', true)} className="hover:text-amber-600 transition-colors">Exportar</button>
                </div>
                <div className="col-span-3 text-center text-slate-400">Ações rápidas</div>
              </div>
            </div>

            <div className="px-6 py-4 space-y-1">
              {MODULES.map(m => {
                const perm = permissions[m.key] || {}
                const allOn = PERM_LABELS.every(p => perm[p.key])
                return (
                  <div key={m.key} className={`grid grid-cols-12 gap-2 items-center py-2.5 px-3 rounded-xl transition-colors hover:bg-slate-50 ${allOn ? 'bg-emerald-50/30' : ''}`}>
                    <div className="col-span-3 flex items-center gap-2">
                      <span className="text-base">{m.icon}</span>
                      <span className="text-sm font-medium text-slate-700">{m.label}</span>
                    </div>
                    {PERM_LABELS.map(p => (
                      <div key={p.key} className="col-span-1 flex justify-center">
                        <button onClick={() => togglePerm(m.key, p.key)}
                          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${perm[p.key] ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                          {perm[p.key] && <CheckCircle size={13} className="text-emerald-600"/>}
                        </button>
                      </div>
                    ))}
                    <div className="col-span-3 flex items-center gap-1.5 justify-center">
                      <button onClick={() => toggleModuleAll(m.key, true)}
                        className="text-xs text-emerald-600 border border-emerald-200 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-colors">
                        Tudo
                      </button>
                      <button onClick={() => toggleModuleAll(m.key, false)}
                        className="text-xs text-red-500 border border-red-200 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                        Nada
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex justify-end gap-3">
              <button onClick={() => setPermModal(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={savePermissions} disabled={saving}
                className="px-6 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                {saving ? 'Salvando...' : 'Salvar Permissões'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL REDEFINIR SENHA ===== */}
      {passModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800">Redefinir Senha</h3>
                <p className="text-slate-400 text-xs mt-0.5">{selectedUser.full_name}</p>
              </div>
              <button onClick={() => setPassModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <p className="text-amber-700 text-xs font-medium">⚠️ A nova senha será aplicada imediatamente. O usuário deverá usar a nova senha no próximo acesso.</p>
              </div>
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Nova Senha *</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={newPass} onChange={e => setNewPass(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 pr-10"/>
                  <button onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
                {newPass && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex gap-1 flex-1">
                      <div className={`h-1.5 flex-1 rounded-full ${newPass.length >= 1 ? (newPass.length >= 6 ? 'bg-amber-400' : 'bg-red-400') : 'bg-slate-200'}`}/>
                      <div className={`h-1.5 flex-1 rounded-full ${newPass.length >= 6 ? 'bg-amber-400' : 'bg-slate-200'}`}/>
                      <div className={`h-1.5 flex-1 rounded-full ${newPass.length >= 8 ? 'bg-emerald-400' : 'bg-slate-200'}`}/>
                    </div>
                    <span className={`text-xs font-medium ${newPass.length >= 8 ? 'text-emerald-600' : newPass.length >= 6 ? 'text-amber-600' : 'text-red-600'}`}>
                      {newPass.length >= 8 ? 'Forte' : newPass.length >= 6 ? 'Regular' : 'Fraca'}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-slate-500 text-xs mb-2">Ou envie um link de redefinição por e-mail:</p>
                <button onClick={async () => {
                  await supabase.auth.resetPasswordForEmail(selectedUser.email)
                  toast.success('Link enviado para ' + selectedUser.email)
                  setPassModal(false)
                }}
                  className="w-full py-2.5 text-sm text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-xl transition-colors font-medium">
                  📧 Enviar link por e-mail
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setPassModal(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={resetPassword} disabled={saving || newPass.length < 6}
                className="px-6 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                {saving ? 'Alterando...' : 'Alterar Senha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}