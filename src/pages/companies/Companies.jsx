import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, Building2, CheckCircle, XCircle, Pencil, X } from 'lucide-react'
import toast from 'react-hot-toast'

const empty = { name:'', trade_name:'', cnpj:'', ie:'', phone:'', email:'', address:'', city:'', state:'', zip:'', contact_name:'', notes:'' }

export default function Companies() {
  const [list, setList] = useState([])
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('active')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('companies').select('*').order('name')
    setList(data || [])
    setLoading(false)
  }

  const filtered = list
    .filter(c => tab === 'all' ? true : tab === 'active' ? c.is_active : !c.is_active)
    .filter(c =>
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.cnpj?.includes(search) ||
      c.city?.toLowerCase().includes(search.toLowerCase())
    )

  const countActive   = list.filter(c => c.is_active).length
  const countInactive = list.filter(c => !c.is_active).length

  const openNew  = () => { setForm(empty); setModal(true) }
  const openEdit = (c) => { setForm(c); setModal(true) }
  const closeModal = () => { setModal(false); setForm(empty) }

  const save = async () => {
    if (!form.name) return toast.error('Nome é obrigatório')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = { ...form, updated_at: new Date().toISOString() }
    if (payload.is_active === undefined) payload.is_active = true
    if (form.id) {
      const { error } = await supabase.from('companies').update(payload).eq('id', form.id)
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return }
    } else {
      const { error } = await supabase.from('companies').insert({ ...payload, created_by: user.id })
      if (error) { toast.error('Erro ao salvar'); setSaving(false); return }
    }
    toast.success('Empresa salva com sucesso!')
    setSaving(false)
    closeModal()
    load()
  }

  const toggleActive = async (c) => {
    const newStatus = !c.is_active
    await supabase.from('companies').update({
      is_active: newStatus,
      activated_at: newStatus ? new Date().toISOString() : c.activated_at,
      deactivated_at: !newStatus ? new Date().toISOString() : null
    }).eq('id', c.id)
    toast.success(newStatus ? '✅ Empresa reativada!' : '⛔ Empresa inativada')
    load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const tabs = [
    { key: 'active',   label: 'Ativas',   count: countActive },
    { key: 'inactive', label: 'Inativas', count: countInactive },
    { key: 'all',      label: 'Todas',    count: list.length },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Empresas</h2>
          <p className="text-slate-500 text-sm mt-0.5">{list.length} empresa{list.length !== 1 ? 's' : ''} cadastrada{list.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16} /> Nova Empresa
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === t.key
                ? t.key === 'inactive' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'
                : 'bg-slate-200 text-slate-500'
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, CNPJ ou cidade..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 transition-colors" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Empresa</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">CNPJ</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Cidade</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Contato</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-slate-400">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-slate-400">
                <Building2 size={32} className="mx-auto mb-2 opacity-30" />
                {tab === 'inactive' ? 'Nenhuma empresa inativa' : 'Nenhuma empresa encontrada'}
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${!c.is_active ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3.5">
                  <p className="font-medium text-slate-800">{c.name}</p>
                  {c.trade_name && <p className="text-slate-400 text-xs mt-0.5">{c.trade_name}</p>}
                </td>
                <td className="px-5 py-3.5 text-slate-600">{c.cnpj || '—'}</td>
                <td className="px-5 py-3.5 text-slate-600">{c.city ? `${c.city}/${c.state}` : '—'}</td>
                <td className="px-5 py-3.5 text-slate-600">{c.contact_name || c.phone || '—'}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${c.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {c.is_active ? <CheckCircle size={11} /> : <XCircle size={11} />}
                    {c.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(c)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => toggleActive(c)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        c.is_active
                          ? 'text-red-500 hover:bg-red-50 border border-red-200'
                          : 'text-emerald-600 hover:bg-emerald-50 border border-emerald-200'
                      }`}
                      title={c.is_active ? 'Inativar empresa' : 'Reativar empresa'}>
                      {c.is_active ? <><XCircle size={12} /> Inativar</> : <><CheckCircle size={12} /> Reativar</>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">{form.id ? 'Editar Empresa' : 'Nova Empresa'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {[
                { label:'Razão Social *', key:'name', col:'col-span-2' },
                { label:'Nome Fantasia', key:'trade_name', col:'col-span-2' },
                { label:'CNPJ', key:'cnpj' },
                { label:'Inscrição Estadual', key:'ie' },
                { label:'Telefone', key:'phone' },
                { label:'E-mail', key:'email' },
                { label:'Endereço', key:'address', col:'col-span-2' },
                { label:'Cidade', key:'city' },
                { label:'Estado (UF)', key:'state' },
                { label:'CEP', key:'zip' },
                { label:'Nome do Contato', key:'contact_name' },
                { label:'Observações', key:'notes', col:'col-span-2', area:true },
              ].map(({ label, key, col, area }) => (
                <div key={key} className={col || ''}>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">{label}</label>
                  {area ? (
                    <textarea value={form[key] || ''} onChange={e => f(key, e.target.value)} rows={3}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-indigo-400 transition-colors resize-none" />
                  ) : (
                    <input value={form[key] || ''} onChange={e => f(key, e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-indigo-400 transition-colors" />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                {saving ? 'Salvando...' : 'Salvar Empresa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}