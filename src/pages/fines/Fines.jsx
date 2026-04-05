import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, AlertTriangle, X, Pencil, CheckCircle, XCircle, Upload, Paperclip } from 'lucide-react'
import toast from 'react-hot-toast'

const empty = {
  date: new Date().toISOString().split('T')[0],
  vehicle_id:'', driver_id:'', violation_type_id:'',
  description:'', location:'', actual_value:'',
  points:'', due_date:'', status:'pending',
  conductor_indicated: false, notes:''
}

const STATUS = {
  pending:    { label:'Pendente',    color:'bg-amber-50 text-amber-700' },
  paid:       { label:'Pago',        color:'bg-emerald-50 text-emerald-700' },
  appealing:  { label:'Recorrendo',  color:'bg-blue-50 text-blue-700' },
  cancelled:  { label:'Cancelada',   color:'bg-slate-100 text-slate-500' },
  doubled:    { label:'Dobrada',     color:'bg-red-100 text-red-700' },
}

export default function Fines() {
  const [list, setList]             = useState([])
  const [vehicles, setVehicles]     = useState([])
  const [drivers, setDrivers]       = useState([])
  const [violations, setViolations] = useState([])
  const [search, setSearch]         = useState('')
  const [tab, setTab]               = useState('pending')
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState(empty)
  const [saving, setSaving]         = useState(false)
  const [files, setFiles]           = useState([])
  const fileRef = useRef()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: fi }, { data: v }, { data: d }, { data: vt }] = await Promise.all([
      supabase.from('fines')
        .select('*, vehicles(plate, brand, model, ownership_type), drivers(name), violation_types(code, description, points, base_value), fine_attachments(*)')
        .order('date', { ascending: false }),
      supabase.from('vehicles').select('id, plate, brand, model, ownership_type').eq('is_active', true).order('plate'),
      supabase.from('drivers').select('id, name').eq('is_active', true).order('name'),
      supabase.from('violation_types').select('*').eq('is_active', true).order('description'),
    ])
    setList(fi || [])
    setVehicles(v || [])
    setDrivers(d || [])
    setViolations(vt || [])
    setLoading(false)
  }

  const filtered = list
    .filter(f => tab === 'all' ? true : f.status === tab)
    .filter(f =>
      f.vehicles?.plate?.toLowerCase().includes(search.toLowerCase()) ||
      f.drivers?.name?.toLowerCase().includes(search.toLowerCase()) ||
      f.description?.toLowerCase().includes(search.toLowerCase()) ||
      f.location?.toLowerCase().includes(search.toLowerCase())
    )

  const totalPending = list.filter(f => f.status === 'pending').reduce((s, f) => s + Number(f.actual_value || 0), 0)
  const totalPaid    = list.filter(f => f.status === 'paid').reduce((s, f) => s + Number(f.actual_value || 0), 0)

  const openNew  = () => { setForm(empty); setFiles([]); setModal(true) }
  const openEdit = f => { setForm({ ...empty, ...f, driver_id: f.driver_id || '', violation_type_id: f.violation_type_id || '', vehicle_id: f.vehicle_id || '' }); setFiles([]); setModal(true) }
  const closeModal = () => { setModal(false); setForm(empty); setFiles([]) }

  const onViolationChange = (id) => {
    const vt = violations.find(v => v.id === id)
    if (vt) {
      setForm(p => ({
        ...p,
        violation_type_id: id,
        description: vt.description,
        points: vt.points,
        actual_value: vt.base_value,
      }))
    } else {
      setForm(p => ({ ...p, violation_type_id: id }))
    }
  }

  // Verifica se veículo é PJ e se alerta de dobramento é necessário
  const selectedVehicle = vehicles.find(v => v.id === form.vehicle_id)
  const isPJ = selectedVehicle?.ownership_type !== 'owned' || false
  const showDoubleAlert = !form.conductor_indicated && form.vehicle_id

  const save = async () => {
    if (!form.vehicle_id) return toast.error('Selecione o veículo')
    if (!form.date) return toast.error('Data é obrigatória')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        vehicle_id: form.vehicle_id,
        driver_id: form.driver_id || null,
        violation_type_id: form.violation_type_id || null,
        date: form.date,
        description: form.description,
        location: form.location,
        base_value: form.actual_value || null,
        actual_value: form.actual_value || null,
        points: form.points ? Number(form.points) : null,
        due_date: form.due_date || null,
        status: form.status,
        conductor_indicated: form.conductor_indicated || false,
        conductor_indicated_at: form.conductor_indicated ? new Date().toISOString() : null,
        pj_double_alert: !!showDoubleAlert,
        notes: form.notes,
        updated_at: new Date().toISOString()
      }

      let fineId = form.id
      if (form.id) {
        const { error } = await supabase.from('fines').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const { data: newFine, error } = await supabase.from('fines').insert({ ...payload, created_by: user.id }).select().single()
        if (error) throw error
        fineId = newFine.id

        // Alerta de dobramento para PJ sem condutor
        if (showDoubleAlert) {
          await supabase.from('reminders').insert({
            title: `⚠️ Multa sem condutor — ${selectedVehicle?.plate}`,
            description: `Veículo ${selectedVehicle?.plate} possui multa sem condutor indicado. Veículo em nome de PJ pode ter valor DOBRADO!`,
            type: 'other', priority: 'critical',
            vehicle_id: form.vehicle_id,
            created_by: user.id
          })
          toast('🚨 Alerta crítico: multa sem condutor em veículo PJ!', { icon: '🚨' })
        }
      }

      // Upload de arquivos
      if (files.length > 0) {
        for (const file of files) {
          const ext  = file.name.split('.').pop()
          const path = `fines/${fineId}/${Date.now()}.${ext}`
          const { error: upErr } = await supabase.storage.from('fine-attachments').upload(path, file)
          if (!upErr) {
            await supabase.from('fine_attachments').insert({
              fine_id: fineId, file_url: path,
              file_name: file.name, file_type: file.type,
              uploaded_by: user.id
            })
          }
        }
      }

      toast.success(form.id ? 'Multa atualizada!' : 'Multa registrada!')
      closeModal(); load()
    } catch(e) { toast.error('Erro: ' + e.message) }
    setSaving(false)
  }

  const markPaid = async (fine) => {
    if (!window.confirm(`Marcar multa como PAGA?\nValor: R$ ${Number(fine.actual_value).toLocaleString('pt-BR', {minimumFractionDigits:2})}`)) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('fines').update({
      status: 'paid', paid_at: new Date().toISOString(), paid_by: user.id
    }).eq('id', fine.id)
    toast.success('✅ Multa quitada!')
    load()
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const isOverdue = fine => fine.due_date && new Date(fine.due_date) < new Date() && fine.status === 'pending'

  const statusTabs = [
    { key:'all',      label:'Todas',      count: list.length },
    { key:'pending',  label:'Pendentes',  count: list.filter(f => f.status === 'pending').length },
    { key:'paid',     label:'Pagas',      count: list.filter(f => f.status === 'paid').length },
    { key:'appealing',label:'Recorrendo', count: list.filter(f => f.status === 'appealing').length },
    { key:'doubled',  label:'Dobradas',   count: list.filter(f => f.status === 'doubled').length },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Multas</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Pendentes: <span className="font-semibold text-red-600">R$ {totalPending.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
            <span className="mx-2">·</span>
            Pagas: <span className="font-semibold text-emerald-600">R$ {totalPaid.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
          </p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16}/> Nova Multa
        </button>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {statusTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${tab === t.key ? t.key === 'pending' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por placa, motorista ou local..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-400"/>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Data</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Veículo</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Infração</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Condutor</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Pontos</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Valor</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Vencimento</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={9} className="text-center py-12 text-slate-400">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-slate-400">
                <AlertTriangle size={32} className="mx-auto mb-2 opacity-30"/>
                Nenhuma multa encontrada
              </td></tr>
            ) : filtered.map(fine => (
              <tr key={fine.id} className={`hover:bg-slate-50 transition-colors ${isOverdue(fine) ? 'bg-red-50/30' : ''}`}>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{new Date(fine.date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="px-5 py-3.5">
                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{fine.vehicles?.plate}</span>
                  {fine.pj_double_alert && !fine.conductor_indicated && (
                    <span className="ml-1 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">⚠️ Dobro</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-slate-700 text-xs max-w-xs">
                  <p className="truncate">{fine.description || fine.violation_types?.description || '—'}</p>
                  {fine.location && <p className="text-slate-400 mt-0.5 truncate">{fine.location}</p>}
                </td>
                <td className="px-5 py-3.5 text-xs">
                  {fine.drivers?.name ? (
                    <span className="text-slate-700">{fine.drivers.name}</span>
                  ) : (
                    <span className="text-red-500 font-medium">⚠️ Sem condutor</span>
                  )}
                  {fine.conductor_indicated && <span className="ml-1 text-emerald-600 text-xs">✓ Indicado</span>}
                </td>
                <td className="px-5 py-3.5 text-center">
                  {fine.points ? (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${Number(fine.points) >= 7 ? 'bg-red-100 text-red-700' : Number(fine.points) >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {fine.points} pts
                    </span>
                  ) : '—'}
                </td>
                <td className="px-5 py-3.5 text-slate-800 text-xs font-bold">
                  R$ {Number(fine.actual_value || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}
                </td>
                <td className="px-5 py-3.5 text-xs">
                  {fine.due_date ? (
                    <span className={isOverdue(fine) ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                      {isOverdue(fine) ? '⚠️ ' : ''}{new Date(fine.due_date+'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS[fine.status]?.color || 'bg-slate-100 text-slate-600'}`}>
                    {STATUS[fine.status]?.label || fine.status}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5 justify-end">
                    {fine.fine_attachments?.length > 0 && (
                      <span className="text-slate-400" title={`${fine.fine_attachments.length} anexo(s)`}><Paperclip size={13}/></span>
                    )}
                    <button onClick={() => openEdit(fine)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      <Pencil size={14}/>
                    </button>
                    {fine.status === 'pending' && (
                      <button onClick={() => markPaid(fine)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-600 border border-emerald-200 hover:bg-emerald-50 rounded-lg transition-colors">
                        <CheckCircle size={12}/> Pagar
                      </button>
                    )}
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
              <h3 className="font-semibold text-slate-800">{form.id ? 'Editar Multa' : 'Nova Multa'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Data da Infração *</label>
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

              <div className="col-span-2">
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Infração (Tabela DENATRAN)</label>
                <select value={form.violation_type_id} onChange={e => onViolationChange(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Selecione a infração</option>
                  {violations.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.code ? `[${v.code}] ` : ''}{v.description} — {v.points} pts — R$ {Number(v.base_value).toLocaleString('pt-BR', {minimumFractionDigits:2})}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Descrição</label>
                <input value={form.description} onChange={e => f('description', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Condutor Responsável</label>
                <select value={form.driver_id} onChange={e => f('driver_id', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  <option value="">Sem condutor identificado</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Local / Cidade</label>
                <input value={form.location} onChange={e => f('location', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Valor (R$)</label>
                <input type="number" step="0.01" value={form.actual_value} onChange={e => f('actual_value', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Pontos</label>
                <input type="number" value={form.points} onChange={e => f('points', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Vencimento</label>
                <input type="date" value={form.due_date} onChange={e => f('due_date', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Status</label>
                <select value={form.status} onChange={e => f('status', e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                  {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              </div>

              {/* Indicação de condutor */}
              <div className="col-span-2">
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${form.conductor_indicated ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                  <input type="checkbox" checked={form.conductor_indicated || false}
                    onChange={e => f('conductor_indicated', e.target.checked)}
                    className="accent-emerald-600 w-4 h-4"/>
                  <div>
                    <p className="text-sm font-medium text-slate-800">Condutor indicado ao DETRAN</p>
                    <p className="text-xs text-slate-400">Marque quando o condutor responsável for formalmente indicado</p>
                  </div>
                </label>
              </div>

              {/* Alerta dobramento */}
              {showDoubleAlert && (
                <div className="col-span-2 bg-red-50 rounded-xl p-3 border border-red-200 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5"/>
                  <div>
                    <p className="text-red-700 text-xs font-bold">⚠️ ATENÇÃO — Risco de dobramento!</p>
                    <p className="text-red-600 text-xs mt-0.5">Veículo em nome de pessoa jurídica sem condutor indicado pode ter o valor da multa DOBRADO. Indique o condutor o quanto antes!</p>
                  </div>
                </div>
              )}

              {/* Upload de arquivos */}
              <div className="col-span-2">
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Anexos (notificação, comprovantes)</label>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-300 transition-colors"
                  onClick={() => fileRef.current.click()}>
                  <Upload size={20} className="mx-auto text-slate-400 mb-1"/>
                  <p className="text-xs text-slate-400">Clique para anexar arquivos</p>
                  <input ref={fileRef} type="file" multiple className="hidden"
                    onChange={e => setFiles(Array.from(e.target.files))}/>
                </div>
                {files.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                        <Paperclip size={12}/> {f.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações</label>
                <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                {saving ? 'Salvando...' : form.id ? 'Atualizar' : 'Registrar Multa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}