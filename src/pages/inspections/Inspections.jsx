import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, ClipboardCheck, X, ChevronDown, ChevronUp, Camera, CheckCircle, AlertTriangle, XCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import toast from 'react-hot-toast'

const SECTIONS = {
  external: {
    label: 'Parte Externa',
    items: [
      'Pneus dianteiros — estado geral e calibragem',
      'Pneus traseiros — estado geral e calibragem',
      'Pneu estepe — presença e condição',
      'Rodas — parafusos, aperto, trincas',
      'Lataria — amassados, ferrugem, riscos',
      'Para-choques dianteiro',
      'Para-choques traseiro',
      'Faróis dianteiros (alto e baixo)',
      'Lanternas traseiras',
      'Setas / Indicadores de direção',
      'Pisca-alerta',
      'Luz de ré',
      'Luz de freio',
      'Terceira luz de freio',
      'Iluminação da placa',
      'Para-brisa — trincas, visibilidade',
      'Vidros laterais',
      'Limpadores de para-brisa',
      'Esguicho do para-brisa',
      'Retrovisores externos (ambos)',
      'Portas — abertura, fechamento, travas',
      'Tampa do tanque de combustível',
      'Escapamento — ruído, fixação',
      'Vazamentos sob o veículo',
      'Para-lama / Proteção de rodas',
    ]
  },
  cabin: {
    label: 'Cabine / Interior',
    items: [
      'Painel de instrumentos — funcionamento',
      'Luzes de advertência no painel',
      'Velocímetro',
      'Hodômetro',
      'Indicador de combustível',
      'Indicador de temperatura',
      'Buzina',
      'Pedal de freio — curso e firmeza',
      'Freio de estacionamento / mão',
      'Embreagem — curso e funcionamento',
      'Acelerador — resposta',
      'Direção — folga, ruído, alinhamento',
      'Câmbio — engrenamento das marchas',
      'Cintos de segurança — todos os bancos',
      'Encosto de cabeça — todos os bancos',
      'Banco do motorista — ajuste e fixação',
      'Espelhos retrovisores internos',
      'Ar-condicionado — funcionamento',
      'Ventilação / Desembaçador',
      'Limpeza geral da cabine',
      'Chave reserva presente',
    ]
  },
  engine: {
    label: 'Motor e Mecânica',
    items: [
      'Nível de óleo do motor',
      'Cor / Aspecto do óleo',
      'Nível de água do radiador',
      'Estado do líquido de arrefecimento',
      'Nível de fluido de freio',
      'Nível de fluido da direção hidráulica',
      'Nível do fluido do limpador',
      'Bateria — terminais, fixação, oxidação',
      'Correias — desgaste, trincas, tensão',
      'Mangueiras — ressecamento, vazamento',
      'Filtro de ar — visual externo',
      'Caixas de fusíveis — visual',
      'Motor — partida (ruídos, falhas)',
      'Motor — marcha lenta (estabilidade)',
      'Fumaça no escapamento (cor, excesso)',
      'Temperatura de trabalho',
      'Ruídos anormais (batidas, assobios)',
      'Sistema de freio ABS',
      'Amortecedores — vazamento visual',
    ]
  },
  safety: {
    label: 'Segurança e Equipamentos',
    items: [
      'Extintor de incêndio — presença',
      'Extintor — validade',
      'Triângulo de segurança — presença',
      'Macaco — presença e funcionamento',
      'Chave de roda — presença',
      'CRLV — presente e válido',
      'CNH do motorista — válida',
    ]
  }
}

const STATUS_ITEM = {
  ok:        { label:'OK',      color:'border-emerald-400 bg-emerald-50 text-emerald-700' },
  attention: { label:'Atenção', color:'border-amber-400 bg-amber-50 text-amber-700' },
  critical:  { label:'Crítico', color:'border-red-400 bg-red-50 text-red-600' },
  na:        { label:'N/A',     color:'border-slate-300 bg-slate-50 text-slate-400' },
}

const RESULT = {
  approved:                   { label:'Aprovado',                 color:'bg-emerald-50 text-emerald-700' },
  approved_with_restrictions: { label:'Aprovado c/ Restrições',  color:'bg-amber-50 text-amber-700' },
  rejected:                   { label:'Reprovado',                color:'bg-red-50 text-red-700' },
}

export default function Inspections() {
  const [list, setList]           = useState([])
  const [vehicles, setVehicles]   = useState([])
  const [drivers, setDrivers]     = useState([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [histModal, setHistModal] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [vehicleHistory, setVehicleHistory]   = useState([])
  const [form, setForm]           = useState({
    vehicle_id:'', driver_id:'',
    date: new Date().toISOString().split('T')[0],
    type:'monthly', odometer:'', general_observations:'', result:''
  })
  const [checkItems, setCheckItems]     = useState({})
  const [photoFiles, setPhotoFiles]     = useState({})
  const [photoPreviews, setPhotoPreviews] = useState({})
  const [openSections, setOpenSections] = useState({ external:true, cabin:false, engine:false, safety:false })
  const [saving, setSaving]             = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: i }, { data: v }, { data: d }] = await Promise.all([
      supabase.from('inspections')
        .select('*, vehicles(plate, brand, model), drivers(name), inspection_items(*)')
        .order('date', { ascending: false }),
      supabase.from('vehicles').select('id, plate, brand, model').eq('is_active', true).order('plate'),
      supabase.from('drivers').select('id, name').eq('is_active', true).order('name'),
    ])
    setList(i || [])
    setVehicles(v || [])
    setDrivers(d || [])
    setLoading(false)
  }

  const filtered = list.filter(i =>
    i.vehicles?.plate?.toLowerCase().includes(search.toLowerCase()) ||
    i.drivers?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const initCheckItems = () => {
    const items = {}
    Object.entries(SECTIONS).forEach(([sec, { items: secItems }]) => {
      secItems.forEach((item, idx) => {
        items[`${sec}_${idx}`] = { status:'ok', observations:'', section:sec, item_name:item }
      })
    })
    return items
  }

  const openNew = () => {
    setForm({ vehicle_id:'', driver_id:'', date: new Date().toISOString().split('T')[0], type:'monthly', odometer:'', general_observations:'', result:'' })
    setCheckItems(initCheckItems())
    setPhotoFiles({})
    setPhotoPreviews({})
    setOpenSections({ external:true, cabin:false, engine:false, safety:false })
    setModal(true)
  }

  const updateItem = (key, field, value) => {
    setCheckItems(p => ({ ...p, [key]: { ...p[key], [field]: value } }))
  }

  // Abre câmera do dispositivo diretamente
  const openCamera = (key) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment' // câmera traseira no celular
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      setPhotoFiles(p => ({ ...p, [key]: file }))
      setPhotoPreviews(p => ({ ...p, [key]: URL.createObjectURL(file) }))
      toast.success('📷 Foto registrada!')
    }
    input.click()
  }

  const removePhoto = (key) => {
    setPhotoFiles(p => { const n = { ...p }; delete n[key]; return n })
    setPhotoPreviews(p => { const n = { ...p }; delete n[key]; return n })
  }

  const calcScore = () => {
    const values = Object.values(checkItems)
    const total  = values.filter(v => v.status !== 'na').length
    if (total === 0) return 100
    const ok  = values.filter(v => v.status === 'ok').length
    const att = values.filter(v => v.status === 'attention').length
    return Math.round((ok + att * 0.5) / total * 100)
  }

  const autoResult = () => {
    const values    = Object.values(checkItems)
    const criticals = values.filter(v => v.status === 'critical').length
    const attentions = values.filter(v => v.status === 'attention').length
    if (criticals >= 3) return 'rejected'
    if (criticals > 0 || attentions > 2) return 'approved_with_restrictions'
    return 'approved'
  }

  const counts = {
    ok:        Object.values(checkItems).filter(v => v.status === 'ok').length,
    attention: Object.values(checkItems).filter(v => v.status === 'attention').length,
    critical:  Object.values(checkItems).filter(v => v.status === 'critical').length,
    na:        Object.values(checkItems).filter(v => v.status === 'na').length,
  }

  const save = async () => {
    if (!form.vehicle_id) return toast.error('Selecione o veículo')

    // Verifica fotos obrigatórias para itens críticos
    const criticalWithoutPhoto = Object.entries(checkItems)
      .filter(([key, item]) => item.status === 'critical' && !photoFiles[key])
    if (criticalWithoutPhoto.length > 0) {
      toast.error(`⚠️ ${criticalWithoutPhoto.length} item(ns) crítico(s) sem foto. Adicione as fotos antes de salvar.`)
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const score  = calcScore()
      const result = form.result || autoResult()

      const { data: inspection, error } = await supabase.from('inspections').insert({
        vehicle_id:  form.vehicle_id,
        driver_id:   form.driver_id || null,
        inspector_id: user.id,
        date:   form.date,
        type:   form.type,
        odometer: form.odometer ? Number(form.odometer) : null,
        result,
        total_items:     Object.values(checkItems).filter(v => v.status !== 'na').length,
        ok_count:        counts.ok,
        attention_count: counts.attention,
        critical_count:  counts.critical,
        score,
        general_observations: form.general_observations,
      }).select().single()
      if (error) throw error

      // Salva itens
      await supabase.from('inspection_items').insert(
        Object.entries(checkItems).map(([, item], idx) => ({
          inspection_id: inspection.id,
          section:       item.section,
          item_name:     item.item_name,
          status:        item.status,
          observations:  item.observations,
          sort_order:    idx,
        }))
      )

      // Upload fotos
      for (const [key, file] of Object.entries(photoFiles)) {
        const ext  = file.name.split('.').pop()
        const path = `${inspection.id}/${key}_${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('inspection-photos').upload(path, file)
        if (!upErr) {
          await supabase.from('inspection_photos').insert({
            inspection_id: inspection.id,
            photo_url:     path,
            caption:       checkItems[key]?.item_name,
            section:       checkItems[key]?.section,
          })
        }
      }

      // Lembrete próxima vistoria
      const vehicle  = vehicles.find(v => v.id === form.vehicle_id)
      const nextDate = new Date()
      if (form.type === 'weekly')   nextDate.setDate(nextDate.getDate() + 7)
      if (form.type === 'monthly')  nextDate.setMonth(nextDate.getMonth() + 1)
      if (form.type === 'complete') nextDate.setMonth(nextDate.getMonth() + 3)
      await supabase.from('reminders').insert({
        title:       `Próxima Vistoria — ${vehicle?.plate}`,
        description: `Vistoria ${form.type === 'weekly' ? 'semanal' : form.type === 'monthly' ? 'mensal' : 'completa'} programada`,
        type:        'inspection',
        priority:    'normal',
        vehicle_id:  form.vehicle_id,
        due_date:    nextDate.toISOString().split('T')[0],
        created_by:  user.id
      })

      toast.success(`✅ Vistoria salva! Score: ${score}%`)
      setModal(false); load()
    } catch(e) { toast.error('Erro: ' + e.message) }
    setSaving(false)
  }

  const openHistory = async (vehicleId) => {
    const veh = list.find(i => i.vehicle_id === vehicleId)?.vehicles
    setSelectedVehicle(veh)
    const { data } = await supabase.from('inspections')
      .select('*, drivers(name), inspection_items(*)')
      .eq('vehicle_id', vehicleId)
      .order('date', { ascending: false })
    setVehicleHistory(data || [])
    setHistModal(true)
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const scoreColor = s => s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-amber-600' : 'text-red-600'
  const scoreBg    = s => s >= 80 ? 'bg-emerald-50 border-emerald-200' : s >= 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'

  const sectionAttCount = (secKey) => Object.values(checkItems).filter(v => v.section === secKey && v.status === 'attention').length
  const sectionCritCount = (secKey) => Object.values(checkItems).filter(v => v.section === secKey && v.status === 'critical').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Vistoria Veicular</h2>
          <p className="text-slate-500 text-sm mt-0.5">{list.length} vistoria{list.length !== 1 ? 's' : ''} realizadas</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16}/> Nova Vistoria
        </button>
      </div>

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
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Tipo</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Score</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Itens</th>
              <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Resultado</th>
              <th className="px-5 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400">Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400">
                <ClipboardCheck size={32} className="mx-auto mb-2 opacity-30"/>
                Nenhuma vistoria encontrada
              </td></tr>
            ) : filtered.map(i => (
              <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5 text-slate-600 text-xs">{new Date(i.date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                <td className="px-5 py-3.5">
                  <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{i.vehicles?.plate}</span>
                  <p className="text-slate-400 text-xs mt-0.5">{i.vehicles?.brand} {i.vehicles?.model}</p>
                </td>
                <td className="px-5 py-3.5 text-slate-600 text-xs">{i.drivers?.name || '—'}</td>
                <td className="px-5 py-3.5">
                  <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                    {i.type === 'weekly' ? 'Semanal' : i.type === 'monthly' ? 'Mensal' : 'Completa'}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  {i.score !== null && i.score !== undefined ? (
                    <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${i.score >= 80 ? 'bg-emerald-50 text-emerald-600' : i.score >= 60 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                      {i.score}%
                    </span>
                  ) : '—'}
                </td>
                <td className="px-5 py-3.5 text-xs">
                  <div className="flex items-center gap-2">
                    {i.ok_count > 0        && <span className="text-emerald-600">✓ {i.ok_count}</span>}
                    {i.attention_count > 0 && <span className="text-amber-600">⚠ {i.attention_count}</span>}
                    {i.critical_count > 0  && <span className="text-red-600">✗ {i.critical_count}</span>}
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  {i.result && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${RESULT[i.result]?.color || 'bg-slate-100 text-slate-600'}`}>
                      {RESULT[i.result]?.label}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <button onClick={() => openHistory(i.vehicle_id)}
                    className="text-xs text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg transition-colors">
                    Histórico
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== MODAL VISTORIA ===== */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl">

            {/* Header fixo */}
            <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Nova Vistoria</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ {counts.ok} OK</span>
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⚠ {counts.attention} Atenção</span>
                    <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">✗ {counts.critical} Crítico</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreBg(calcScore())} ${scoreColor(calcScore())}`}>
                      Score: {calcScore()}%
                    </span>
                  </div>
                </div>
                <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600 mt-1"><X size={20}/></button>
              </div>
            </div>

            <div className="p-6 space-y-5">

              {/* Dados gerais */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Data *</label>
                  <input type="date" value={form.date} onChange={e => f('date', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Tipo de Vistoria</label>
                  <select value={form.type} onChange={e => f('type', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                    <option value="complete">Completa</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Veículo *</label>
                  <select value={form.vehicle_id} onChange={e => f('vehicle_id', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Selecione o veículo</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Motorista do Período</label>
                  <select value={form.driver_id} onChange={e => f('driver_id', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Selecione</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">KM Atual</label>
                  <input type="number" value={form.odometer} onChange={e => f('odometer', e.target.value)}
                    placeholder="Ex: 106127"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Resultado Final</label>
                  <select value={form.result} onChange={e => f('result', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Calcular automaticamente pelo score</option>
                    {Object.entries(RESULT).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Aviso de foto obrigatória */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                <Camera size={16} className="text-blue-600 flex-shrink-0 mt-0.5"/>
                <p className="text-blue-700 text-xs">
                  <strong>Fotos obrigatórias para itens Críticos.</strong> Itens marcados como Atenção ou Crítico exibem o botão 📷. No celular, a câmera abre automaticamente.
                </p>
              </div>

              {/* Checklist por seção */}
              {Object.entries(SECTIONS).map(([secKey, section]) => {
                const attC  = sectionAttCount(secKey)
                const critC = sectionCritCount(secKey)
                return (
                  <div key={secKey} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setOpenSections(p => ({ ...p, [secKey]: !p[secKey] }))}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-700">{section.label}</span>
                        <span className="text-xs text-slate-400">{section.items.length} itens</span>
                        {attC  > 0 && <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⚠ {attC}</span>}
                        {critC > 0 && <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">✗ {critC}</span>}
                      </div>
                      {openSections[secKey] ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
                    </button>

                    {openSections[secKey] && (
                      <div className="divide-y divide-slate-50">
                        {section.items.map((item, idx) => {
                          const key      = `${secKey}_${idx}`
                          const itemData = checkItems[key] || {}
                          const needPhoto = itemData.status === 'attention' || itemData.status === 'critical'
                          const hasPhoto  = !!photoPreviews[key]
                          const isCriticalNoPhoto = itemData.status === 'critical' && !hasPhoto

                          return (
                            <div key={key} className={`px-4 py-3 transition-colors ${itemData.status === 'critical' ? 'bg-red-50/60' : itemData.status === 'attention' ? 'bg-amber-50/40' : ''}`}>

                              <div className="flex items-start gap-3 flex-wrap">
                                {/* Nome do item */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-slate-700 font-medium">{item}</p>
                                </div>

                                {/* Botões de status */}
                                <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                                  {Object.entries(STATUS_ITEM).map(([status, s]) => (
                                    <button key={status} onClick={() => updateItem(key, 'status', status)}
                                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${itemData.status === status ? s.color : 'border-slate-200 text-slate-400 hover:border-slate-300 bg-white'}`}>
                                      {s.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Campo de observação para atenção/crítico */}
                              {needPhoto && (
                                <div className="mt-2 space-y-2">
                                  <input
                                    value={itemData.observations || ''}
                                    onChange={e => updateItem(key, 'observations', e.target.value)}
                                    placeholder="Descreva o problema encontrado..."
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-indigo-400 bg-white"/>

                                  {/* Botão de câmera */}
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => openCamera(key)}
                                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${
                                        hasPhoto
                                          ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                                          : isCriticalNoPhoto
                                            ? 'border-red-400 bg-red-50 text-red-700 animate-pulse'
                                            : 'border-amber-400 bg-amber-50 text-amber-700 hover:border-amber-500'
                                      }`}>
                                      <Camera size={14}/>
                                      {hasPhoto ? '✓ Foto registrada' : isCriticalNoPhoto ? '📷 Foto OBRIGATÓRIA' : '📷 Tirar foto'}
                                    </button>
                                    {hasPhoto && (
                                      <button onClick={() => removePhoto(key)}
                                        className="text-xs text-red-400 hover:text-red-600 transition-colors">
                                        remover
                                      </button>
                                    )}
                                  </div>

                                  {/* Preview da foto */}
                                  {hasPhoto && (
                                    <div className="relative w-fit">
                                      <img src={photoPreviews[key]}
                                        className="h-28 w-auto rounded-xl border-2 border-emerald-300 object-cover shadow-sm"/>
                                      <span className="absolute top-1 right-1 bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded-full">✓</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Observações gerais */}
              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações Gerais e Providências</label>
                <textarea value={form.general_observations} onChange={e => f('general_observations', e.target.value)} rows={3}
                  placeholder="Descreva os problemas encontrados, providências necessárias e prazo para resolução..."
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
              </div>

              {/* Resumo final */}
              <div className={`rounded-xl p-4 border ${scoreBg(calcScore())}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xl font-bold ${scoreColor(calcScore())}`}>Score: {calcScore()}%</p>
                    <p className="text-slate-600 text-xs mt-1">
                      Resultado automático: <span className="font-semibold">{RESULT[autoResult()]?.label}</span>
                    </p>
                  </div>
                  <div className="text-right space-y-1 text-xs">
                    <div className="text-emerald-600 font-medium">✓ {counts.ok} itens OK</div>
                    <div className="text-amber-600 font-medium">⚠ {counts.attention} com atenção</div>
                    <div className="text-red-600 font-medium">✗ {counts.critical} críticos</div>
                    <div className="text-slate-400">{counts.na} não aplicável</div>
                  </div>
                </div>
                {Object.entries(photoFiles).length > 0 && (
                  <p className="text-slate-600 text-xs mt-2 font-medium">
                    📷 {Object.entries(photoFiles).length} foto(s) registrada(s)
                  </p>
                )}
              </div>
            </div>

            {/* Footer fixo */}
            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex justify-end gap-3">
              <button onClick={() => setModal(false)} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                className="px-6 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors">
                {saving ? 'Salvando vistoria...' : `Salvar Vistoria (Score: ${calcScore()}%)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL HISTÓRICO ===== */}
      {histModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-800">Histórico de Vistorias</h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  {selectedVehicle?.plate} — {selectedVehicle?.brand} {selectedVehicle?.model}
                </p>
              </div>
              <button onClick={() => setHistModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              {vehicleHistory.length === 0 ? (
                <p className="text-center text-slate-400 py-8">Nenhuma vistoria registrada para este veículo</p>
              ) : vehicleHistory.map((h, idx) => {
                const prev = vehicleHistory[idx + 1]
                const diff = prev && prev.score !== null ? h.score - prev.score : null
                return (
                  <div key={h.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold text-slate-800">
                            {new Date(h.date+'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                          <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                            {h.type === 'weekly' ? 'Semanal' : h.type === 'monthly' ? 'Mensal' : 'Completa'}
                          </span>
                          {h.result && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RESULT[h.result]?.color}`}>
                              {RESULT[h.result]?.label}
                            </span>
                          )}
                        </div>
                        {h.drivers?.name && (
                          <p className="text-slate-500 text-xs mb-2">
                            Motorista: <span className="font-semibold text-slate-700">{h.drivers.name}</span>
                          </p>
                        )}
                        <div className="flex gap-3 text-xs">
                          <span className="text-emerald-600 font-medium">✓ {h.ok_count} OK</span>
                          <span className="text-amber-600 font-medium">⚠ {h.attention_count} Atenção</span>
                          <span className="text-red-600 font-medium">✗ {h.critical_count} Crítico</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <span className={`text-2xl font-bold ${scoreColor(h.score)}`}>{h.score}%</span>
                        {diff !== null && (
                          <div className={`flex items-center gap-1 text-xs mt-1 justify-end font-semibold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            {diff > 0 ? <TrendingUp size={12}/> : diff < 0 ? <TrendingDown size={12}/> : <Minus size={12}/>}
                            {diff > 0 ? '+' : ''}{diff}% vs anterior
                          </div>
                        )}
                      </div>
                    </div>
                    {h.general_observations && (
                      <p className="text-slate-500 text-xs mt-2 italic border-t border-slate-200 pt-2">
                        "{h.general_observations}"
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}