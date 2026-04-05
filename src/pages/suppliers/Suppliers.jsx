import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, X, Pencil, CheckCircle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const empty = {
  name:'', trade_name:'', cnpj:'', ie:'', category:'outros',
  phone:'', email:'', address:'', city:'', state:'', zip:'',
  contact_name:'', notes:''
}

const CATEGORIES = {
  fuel_station: { label:'Posto de Combustível', icon:'⛽', color:'bg-amber-50 text-amber-700' },
  mechanic:     { label:'Mecânica',             icon:'🔧', color:'bg-blue-50 text-blue-700' },
  electrical:   { label:'Elétrica / Auto Elétrica', icon:'⚡', color:'bg-yellow-50 text-yellow-700' },
  tire:         { label:'Borracharia',          icon:'🔄', color:'bg-slate-100 text-slate-700' },
  body_paint:   { label:'Funilaria / Pintura',  icon:'🎨', color:'bg-pink-50 text-pink-700' },
  parts:        { label:'Peças e Acessórios',   icon:'⚙️', color:'bg-indigo-50 text-indigo-700' },
  insurance:    { label:'Seguradora',           icon:'🛡️', color:'bg-green-50 text-green-700' },
  dispatcher:   { label:'Despachante',          icon:'📋', color:'bg-purple-50 text-purple-700' },
  outros:       { label:'Outros',               icon:'🏢', color:'bg-slate-100 text-slate-600' },
}

const maskCNPJ  = v => v.replace(/\D/g,'').slice(0,14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/,'$1.$2.$3/$4-$5').replace(/-$/,'')
const maskPhone = v => { v=v.replace(/\D/g,'').slice(0,11); return v.length<=10?v.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3').replace(/-$/,''):v.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'') }

export default function Suppliers() {
  const [list, setList]         = useState([])
  const [search, setSearch]     = useState('')
  const [tab, setTab]           = useState('active')
  const [catFilter, setCatFilter] = useState('all')
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(empty)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').order('name')
    setList(data || [])
    setLoading(false)
  }

  const filtered = list
    .filter(s => tab === 'all' ? true : tab === 'active' ? s.is_active : !s.is_active)
    .filter(s => catFilter === 'all' ? true : s.category === catFilter)
    .filter(s =>
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.cnpj?.includes(search) ||
      s.city?.toLowerCase().includes(search.toLowerCase())
    )

  const countActive   = list.filter(s => s.is_active).length
  const countInactive = list.filter(s => !s.is_active).length

  const openNew  = () => { setForm(empty); setModal(true) }
  const openEdit = s => { setForm({ ...empty, ...s }); setModal(true) }
  const closeModal = () => { setModal(false); setForm(empty) }

  const save = async () => {
    if (!form.name) return toast.error('Nome é obrigatório')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        name: form.name, trade_name: form.trade_name, cnpj: form.cnpj,
        ie: form.ie, category: form.category, phone: form.phone,
        email: form.email, address: form.address, city: form.city,
        state: form.state, zip: form.zip, contact_name: form.contact_name,
        notes: form.notes, updated_at: new Date().toISOString()
      }
      if (form.id) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('suppliers').insert({ ...payload, is_active: true, created_by: user.id })
        if (error) throw error
      }
      toast.success(form.id ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!')
      closeModal(); load()
    } catch(e) { toast.error('Erro: ' + e.message) }
    setSaving(false)
  }

  const toggleActive = async s => {
    const newStatus = !s.is_active
    if (!window.confirm(`${newStatus ? 'Reativar' : 'Inativar'} ${s.name}?`)) return
    await supabase.from('suppliers').update({
      is_active: newStatus,
      deactivated_at: !newStatus ? new Date().toISOString() : null
    }).eq('id', s.id)
    toast.success(newStatus ? '✅ Reativado!' : '⛔ Inativado')
    load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const statusTabs = [
    { key:'active',   label:'Ativos',   count: countActive },
    { key:'inactive', label:'Inativos', count: countInactive },
    { key:'all',      label:'Todos',    count: list.length },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Fornecedores</h2>
          <p className="text-slate-500 text-sm mt-0.5">{list.length} fornecedor{list.length !== 1 ? 'es' : ''} cadastrado{list.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16} /> Novo Fornecedor
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
        <button onClick={() => setCatFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${catFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          Todas categorias
        </button>
        {Object.entries(CATEGORIES).map(([key, c]) => (
          <button key={key} onClick={() => setCatFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${catFilter === key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, CNPJ ou cidade..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 transition-colors" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Fornecedor</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Categoria</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">CNPJ</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Cidade</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Contato</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                <span className="text-4xl block mb-2">🏢</span>
                Nenhum fornecedor encontrado
              </td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${!s.is_active ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-slate-800">{s.name}</p>
                  {s.trade_name && <p className="text-slate-400 text-xs mt-0.5">{s.trade_name}</p>}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CATEGORIES[s.category]?.color || 'bg-slate-100 text-slate-600'}`}>
                    {CATEGORIES[s.category]?.icon} {CATEGORIES[s.category]?.label || s.category}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{s.cnpj || '—'}</td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{s.city ? `${s.city}/${s.state}` : '—'}</td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{s.contact_name || s.phone || '—'}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {s.is_active ? <CheckCircle size={11}/> : <XCircle size={11}/>}
                    {s.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      <Pencil size={14}/>
                    </button>
                    <button onClick={() => toggleActive(s)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${s.is_active ? 'text-red-500 hover:bg-red-50 border border-red-200' : 'text-emerald-600 hover:bg-emerald-50 border border-emerald-200'}`}>
                      {s.is_active ? <><XCircle size={12}/> Inativar</> : <><CheckCircle size={12}/> Reativar</>}
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
              <h3 className="font-semibold text-slate-800">{form.id ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-5">

              {/* Categoria */}
              <div>
                <label className="text-slate-500 text-xs font-medium mb-2 block">Categoria *</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(CATEGORIES).map(([key, c]) => (
                    <button key={key} onClick={() => f('category', key)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-medium border-2 transition-all text-left ${form.category === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <span className="text-base mr-1">{c.icon}</span>{c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Razão Social *</label>
                  <input value={form.name} onChange={e => f('name', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Nome Fantasia</label>
                  <input value={form.trade_name} onChange={e => f('trade_name', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">CNPJ</label>
                  <input value={form.cnpj} onChange={e => f('cnpj', maskCNPJ(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Inscrição Estadual</label>
                  <input value={form.ie} onChange={e => f('ie', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Telefone</label>
                  <input value={form.phone} onChange={e => f('phone', maskPhone(e.target.value))}
                    placeholder="(44) 99999-9999"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">E-mail</label>
                  <input type="email" value={form.email} onChange={e => f('email', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Endereço</label>
                  <input value={form.address} onChange={e => f('address', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Cidade</label>
                  <input value={form.city} onChange={e => f('city', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Estado (UF)</label>
                  <input value={form.state} onChange={e => f('state', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">CEP</label>
                  <input value={form.zip} onChange={e => f('zip', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Nome do Contato</label>
                  <input value={form.contact_name} onChange={e => f('contact_name', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
                </div>
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
                {saving ? 'Salvando...' : form.id ? 'Atualizar' : 'Salvar Fornecedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}