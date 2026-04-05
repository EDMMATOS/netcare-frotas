import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, Search, X, Pencil, FileText, Printer, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const STATUS = {
  draft:              { label:'Rascunho',             color:'bg-slate-100 text-slate-600',   icon: Clock },
  issued:             { label:'Emitida',              color:'bg-blue-50 text-blue-700',      icon: FileText },
  awaiting_signature: { label:'Aguard. Assinatura',  color:'bg-amber-50 text-amber-700',    icon: AlertTriangle },
  approved:           { label:'Aprovada',             color:'bg-emerald-50 text-emerald-700', icon: CheckCircle },
  rejected:           { label:'Reprovada',            color:'bg-red-50 text-red-600',        icon: XCircle },
  cancelled:          { label:'Cancelada',            color:'bg-slate-100 text-slate-400',   icon: XCircle },
}

const emptyItem = { description:'', unit:'UN', quantity:1, unit_value:0 }

export default function Orders() {
  const [list, setList]           = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [vehicles, setVehicles]   = useState([])
  const [signatories, setSignatories] = useState([])
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState({
    title:'', type:'service', supplier_id:'', vehicle_id:'',
    start_days:'', completion_days:'', payment_condition:'Mediante emissão de Nota Fiscal, após validação dos serviços.',
    warranty_days:90, notes:'', status:'draft'
  })
  const [items, setItems]         = useState([{ ...emptyItem }])
  const [selectedSignatories, setSelectedSignatories] = useState([])
  const [saving, setSaving]       = useState(false)
  const [viewOrder, setViewOrder] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: o }, { data: s }, { data: v }, { data: sg }] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, suppliers(name, cnpj, address, city, state, phone, email), vehicles(plate, brand, model), purchase_order_items(*), purchase_order_signatories(*, signatories(name, role_label, role))')
        .order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name, category, cnpj, address, city, state, phone, email, contact_name').eq('is_active', true).order('name'),
      supabase.from('vehicles').select('id, plate, brand, model').eq('is_active', true).order('plate'),
      supabase.from('signatories').select('*').eq('is_active', true).order('name'),
    ])
    setList(o || [])
    setSuppliers(s || [])
    setVehicles(v || [])
    setSignatories(sg || [])
    setLoading(false)
  }

  const filtered = list
    .filter(o => statusFilter === 'all' ? true : o.status === statusFilter)
    .filter(o =>
      o.order_number?.includes(search) ||
      o.title?.toLowerCase().includes(search.toLowerCase()) ||
      o.suppliers?.name?.toLowerCase().includes(search.toLowerCase())
    )

  const openNew = () => {
    setForm({ title:'', type:'service', supplier_id:'', vehicle_id:'', start_days:'', completion_days:'', payment_condition:'Mediante emissão de Nota Fiscal, após validação dos serviços.', warranty_days:90, notes:'', status:'draft' })
    setItems([{ ...emptyItem }])
    setSelectedSignatories([])
    setModal(true)
  }

  const openEdit = o => {
    setForm({ ...o })
    setItems(o.purchase_order_items?.map(i => ({ ...i })) || [{ ...emptyItem }])
    setSelectedSignatories(o.purchase_order_signatories?.map(s => s.signatory_id) || [])
    setModal(true)
  }

  const closeModal = () => { setModal(false) }

  const totalValue = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unit_value)), 0)

  const addItem = () => setItems(p => [...p, { ...emptyItem }])
  const removeItem = idx => setItems(p => p.filter((_, i) => i !== idx))
  const updateItem = (idx, k, v) => setItems(p => p.map((item, i) => i === idx ? { ...item, [k]: v } : item))

  const toggleSignatory = id => {
    setSelectedSignatories(p => p.includes(id) ? p.filter(s => s !== id) : [...p, id])
  }

  const save = async () => {
    if (!form.title) return toast.error('Título é obrigatório')
    if (items.filter(i => i.description).length === 0) return toast.error('Adicione pelo menos um item')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        title: form.title, type: form.type,
        supplier_id: form.supplier_id || null,
        vehicle_id: form.vehicle_id || null,
        start_days: form.start_days || null,
        completion_days: form.completion_days || null,
        payment_condition: form.payment_condition,
        warranty_days: form.warranty_days || 90,
        notes: form.notes, status: form.status,
        total_value: totalValue,
        updated_at: new Date().toISOString()
      }

      let orderId = form.id
      if (form.id) {
        const { error } = await supabase.from('purchase_orders').update(payload).eq('id', form.id)
        if (error) throw error
        // Limpa itens e signatários antigos
        await supabase.from('purchase_order_items').delete().eq('purchase_order_id', form.id)
        await supabase.from('purchase_order_signatories').delete().eq('purchase_order_id', form.id)
      } else {
        // Gera número automático
        const { data: numData } = await supabase.rpc('next_order_number')
        const { data: newOrder, error } = await supabase.from('purchase_orders').insert({
          ...payload, order_number: numData, created_by: user.id
        }).select().single()
        if (error) throw error
        orderId = newOrder.id
      }

      // Salva itens
      const validItems = items.filter(i => i.description)
      if (validItems.length > 0) {
        await supabase.from('purchase_order_items').insert(
          validItems.map((item, idx) => ({
            purchase_order_id: orderId,
            item_number: idx + 1,
            description: item.description,
            unit: item.unit || 'UN',
            quantity: Number(item.quantity) || 1,
            unit_value: Number(item.unit_value) || 0,
          }))
        )
      }

      // Salva signatários
      if (selectedSignatories.length > 0) {
        const sig = signatories.filter(s => selectedSignatories.includes(s.id))
        await supabase.from('purchase_order_signatories').insert(
          sig.map(s => ({
            purchase_order_id: orderId,
            signatory_id: s.id,
            role_in_document: s.role_label || s.role
          }))
        )
      }

      toast.success(form.id ? 'Ordem atualizada!' : 'Ordem criada!')
      closeModal(); load()
    } catch(e) { toast.error('Erro: ' + e.message) }
    setSaving(false)
  }

  const updateStatus = async (id, status) => {
    await supabase.from('purchase_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    toast.success('Status atualizado!')
    load()
  }

  const generatePDF = async (order) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const W = 210, margin = 15

    // Tenta carregar o timbrado
    let headerImg = null
    try {
      const { data } = supabase.storage.from('company-assets').getPublicUrl('timbrado.jpg')
      if (data.publicUrl) {
        const response = await fetch(data.publicUrl)
        if (response.ok) {
          const blob = await response.blob()
          headerImg = await new Promise(resolve => {
            const reader = new FileReader()
            reader.onload = e => resolve(e.target.result)
            reader.readAsDataURL(blob)
          })
        }
      }
    } catch(e) {}

    let y = margin

    // Header com timbrado ou cabeçalho padrão
    if (headerImg) {
      doc.addImage(headerImg, 'JPEG', 0, 0, W, 40)
      y = 45
    } else {
      doc.setFillColor(26, 58, 92)
      doc.rect(0, 0, W, 30, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('NETCARE SOLUCOES EM REDES LTDA.', margin, 12)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('CNPJ: 22.115.808/0001-57  |  Maringá/PR', margin, 19)
      doc.text('financeiro@netcare.net.br  |  (44) 3200-2103', margin, 25)
      y = 35
    }

    // Título da OC
    doc.setFillColor(26, 58, 92)
    doc.rect(margin, y, W - margin*2, 12, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('ORDEM DE COMPRA — CONTRATAÇÃO DE SERVIÇOS', W/2, y+8, { align:'center' })
    y += 16

    // Número e data
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(`OC Nº: ${order.order_number}`, margin, y+5)
    doc.text(`Data de Emissão: ${new Date(order.issue_date+'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit',month:'long',year:'numeric'})}`, W - margin, y+5, { align:'right' })
    y += 12

    // Dados da Contratante
    doc.setFillColor(240, 244, 248)
    doc.rect(margin, y, W - margin*2, 5, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 58, 92)
    doc.text('▸ DADOS DA CONTRATANTE', margin+2, y+3.5)
    y += 7
    doc.setTextColor(0,0,0)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text('Razão Social: NETCARE SOLUCOES EM REDES LTDA.', margin+2, y)
    y += 4.5
    doc.text('CNPJ: 22.115.808/0001-57  |  IE: 90784043-34', margin+2, y)
    y += 4.5
    doc.text('Endereço: Rua Pioneira Glacy de Andrade Figueira Walsh, nº 60, Jardim Alvorada, Maringá/PR, CEP 87035-150', margin+2, y)
    y += 4.5
    doc.text('Telefone: (44) 3200-2103  |  E-mail: financeiro@netcare.net.br', margin+2, y)
    y += 8

    // Dados da Contratada
    if (order.suppliers) {
      doc.setFillColor(240, 244, 248)
      doc.rect(margin, y, W - margin*2, 5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(26, 58, 92)
      doc.setFontSize(9)
      doc.text('▸ DADOS DA CONTRATADA', margin+2, y+3.5)
      y += 7
      doc.setTextColor(0,0,0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      const sup = order.suppliers
      doc.text(`Razão Social: ${sup.name}`, margin+2, y); y += 4.5
      if (sup.cnpj) { doc.text(`CNPJ: ${sup.cnpj}`, margin+2, y); y += 4.5 }
      if (sup.address) { doc.text(`Endereço: ${sup.address}${sup.city ? ', ' + sup.city + '/' + sup.state : ''}`, margin+2, y); y += 4.5 }
      if (sup.phone || sup.email) { doc.text(`Telefone: ${sup.phone || ''}  |  E-mail: ${sup.email || ''}`, margin+2, y); y += 4.5 }
      y += 3
    }

    // Objeto
    doc.setFillColor(240, 244, 248)
    doc.rect(margin, y, W - margin*2, 5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 58, 92)
    doc.setFontSize(9)
    doc.text('▸ OBJETO DA CONTRATAÇÃO', margin+2, y+3.5)
    y += 7

    // Tabela de itens
    const tableItems = (order.purchase_order_items || []).map(item => [
      item.item_number,
      item.description,
      item.unit,
      Number(item.quantity).toFixed(2),
      `R$ ${Number(item.unit_value).toLocaleString('pt-BR', {minimumFractionDigits:2})}`,
      `R$ ${(Number(item.quantity) * Number(item.unit_value)).toLocaleString('pt-BR', {minimumFractionDigits:2})}`,
    ])
    tableItems.push(['', 'VALOR GLOBAL DA CONTRATAÇÃO', '', '', '',
      `R$ ${Number(order.total_value).toLocaleString('pt-BR', {minimumFractionDigits:2})}`])

    doc.autoTable({
      startY: y,
      head: [['Item','Descrição do Serviço','Und','Qtd','Vlr. Unit.','Vlr. Total']],
      body: tableItems,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [26, 58, 92], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 10, halign:'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 15, halign:'center' },
        3: { cellWidth: 18, halign:'center' },
        4: { cellWidth: 28, halign:'right' },
        5: { cellWidth: 28, halign:'right' },
      },
      didParseCell: data => {
        if (data.row.index === tableItems.length - 1) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [240, 244, 248]
        }
      }
    })
    y = doc.lastAutoTable.finalY + 6

    // Prazos
    if (order.start_days || order.completion_days) {
      doc.setFillColor(240, 244, 248)
      doc.rect(margin, y, W - margin*2, 5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(26, 58, 92)
      doc.setFontSize(9)
      doc.text('▸ PRAZOS DE EXECUÇÃO', margin+2, y+3.5)
      y += 7
      doc.setTextColor(0,0,0)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      if (order.start_days) { doc.text(`Início dos Serviços: Até ${order.start_days} dias úteis após aprovação desta OC.`, margin+2, y); y += 4.5 }
      if (order.completion_days) { doc.text(`Prazo de Conclusão: Até ${order.completion_days} dias úteis após o início das atividades.`, margin+2, y); y += 4.5 }
      doc.text('Local de Execução: Rua Pioneira Glacy de Andrade Figueira Walsh, nº 60, Jardim Alvorada, Maringá/PR', margin+2, y)
      y += 8
    }

    // Condições comerciais
    doc.setFillColor(240, 244, 248)
    doc.rect(margin, y, W - margin*2, 5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 58, 92)
    doc.setFontSize(9)
    doc.text('▸ CONDIÇÕES COMERCIAIS E DE PAGAMENTO', margin+2, y+3.5)
    y += 7
    doc.setTextColor(0,0,0)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(`Condição de Pagamento: ${order.payment_condition}`, margin+2, y); y += 4.5
    doc.text(`Garantia dos Serviços: ${order.warranty_days || 90} (${order.warranty_days || 90 === 90 ? 'noventa' : ''}) dias sobre os serviços executados.`, margin+2, y); y += 4.5
    doc.text('Janelas de pagamento: dias 12 e 25 de cada mês.', margin+2, y)
    y += 8

    // Cláusulas
    doc.setFillColor(240, 244, 248)
    doc.rect(margin, y, W - margin*2, 5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 58, 92)
    doc.setFontSize(9)
    doc.text('▸ CLÁUSULAS ADICIONAIS', margin+2, y+3.5)
    y += 7
    doc.setTextColor(0,0,0)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    const clausulas = [
      'Responsabilidade Civil: O contratado assume integral responsabilidade por quaisquer danos causados a equipamentos, instalações ou terceiros durante a execução dos serviços.',
      'Vistoria Prévia: O contratado deverá realizar vistoria técnica prévia e comunicar formalmente qualquer irregularidade antes do início das atividades.',
      'Registro Fotográfico: Obrigatória a apresentação de registros fotográficos ANTES, DURANTE e APÓS a execução.',
      'Regularidade Fiscal: O contratado declara estar em plena regularidade fiscal, trabalhista e previdenciária.',
      'Segurança do Trabalho: Obrigatório o uso de EPIs adequados durante toda a execução dos serviços.',
      'Aceite e Faturamento: A conclusão dos serviços dependerá de validação formal pela contratante.',
    ]
    clausulas.forEach(c => {
      const lines = doc.splitTextToSize(c, W - margin*2 - 4)
      doc.text(lines, margin+2, y)
      y += lines.length * 3.8 + 1
    })
    y += 4

    // Observações
    if (order.notes) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.text('Observações:', margin+2, y)
      doc.setFont('helvetica', 'normal')
      const lines = doc.splitTextToSize(order.notes, W - margin*2 - 4)
      doc.text(lines, margin+2, y+4)
      y += lines.length * 4 + 8
    }

    // Local e data
    const cidade = `Maringá/PR, ${new Date().toLocaleDateString('pt-BR', {day:'numeric',month:'long',year:'numeric'})}.`
    doc.setFontSize(8.5)
    doc.text(cidade, margin+2, y)
    y += 12

    // Assinaturas
    const sigs = order.purchase_order_signatories || []
    if (sigs.length > 0) {
      doc.setFillColor(240, 244, 248)
      doc.rect(margin, y, W - margin*2, 5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(26, 58, 92)
      doc.setFontSize(9)
      doc.text('▸ ASSINATURAS E VALIDAÇÃO', margin+2, y+3.5)
      y += 10

      const sigWidth = (W - margin*2) / Math.min(sigs.length, 3)
      sigs.forEach((s, idx) => {
        const x = margin + (idx % 3) * sigWidth
        if (idx % 3 === 0 && idx > 0) y += 25
        doc.setDrawColor(180, 180, 180)
        doc.line(x + 5, y + 15, x + sigWidth - 5, y + 15)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        doc.setFontSize(8)
        doc.text(s.signatories?.name || '', x + sigWidth/2, y + 19, { align:'center' })
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.text(s.role_in_document || s.signatories?.role_label || '', x + sigWidth/2, y + 23, { align:'center' })
      })
    }

    doc.save(`OC-${order.order_number?.replace('/','_')}.pdf`)
    toast.success('PDF gerado com sucesso!')
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Ordens de Compra / Serviço</h2>
          <p className="text-slate-500 text-sm mt-0.5">{list.length} ordem{list.length !== 1 ? 'ns' : ''} cadastrada{list.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Plus size={16}/> Nova Ordem
        </button>
      </div>

      {/* Filtros de status */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
          Todas
        </button>
        {Object.entries(STATUS).map(([key, s]) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === key ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por número, título ou fornecedor..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-400"/>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-100">
            <FileText size={32} className="mx-auto mb-2 opacity-30"/>
            Nenhuma ordem encontrada
          </div>
        ) : filtered.map(o => {
          const S = STATUS[o.status] || STATUS.draft
          const SIcon = S.icon
          return (
            <div key={o.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-mono font-bold text-indigo-600 text-sm bg-indigo-50 px-2 py-0.5 rounded">
                      OC {o.order_number}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${S.color}`}>
                      <SIcon size={11}/> {S.label}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-800">{o.title}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                    {o.suppliers && <span>🏢 {o.suppliers.name}</span>}
                    {o.vehicles && <span>🚗 {o.vehicles.plate}</span>}
                    <span>📅 {new Date(o.issue_date+'T12:00:00').toLocaleDateString('pt-BR')}</span>
                    <span className="font-semibold text-slate-700">R$ {Number(o.total_value).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                  </div>
                  {/* Itens resumo */}
                  <p className="text-xs text-slate-400 mt-1">{o.purchase_order_items?.length || 0} item(ns)</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => generatePDF(o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
                    <Printer size={12}/> PDF
                  </button>
                  <button onClick={() => openEdit(o)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                    <Pencil size={14}/>
                  </button>
                  {/* Ações de status */}
                  {o.status === 'draft' && (
                    <button onClick={() => updateStatus(o.id, 'issued')}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                      Emitir
                    </button>
                  )}
                  {o.status === 'issued' && (
                    <button onClick={() => updateStatus(o.id, 'awaiting_signature')}
                      className="px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors">
                      Ag. Assinatura
                    </button>
                  )}
                  {o.status === 'awaiting_signature' && (
                    <div className="flex gap-1">
                      <button onClick={() => updateStatus(o.id, 'approved')}
                        className="px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
                        Aprovar
                      </button>
                      <button onClick={() => updateStatus(o.id, 'rejected')}
                        className="px-3 py-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
                        Reprovar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* MODAL */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">{form.id ? `Editar OC ${form.order_number}` : 'Nova Ordem de Compra'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-5">

              {/* Tipo */}
              <div>
                <label className="text-slate-500 text-xs font-medium mb-2 block">Tipo de Ordem</label>
                <div className="flex gap-2">
                  {[['service','🔧 Contratação de Serviço'],['purchase','📦 Compra de Materiais'],['maintenance','🚗 Manutenção de Veículo']].map(([val, label]) => (
                    <button key={val} onClick={() => f('type', val)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-medium border-2 transition-all ${form.type === val ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Título / Objeto *</label>
                  <input value={form.title} onChange={e => f('title', e.target.value)}
                    placeholder="Ex: Revisão preventiva - Fiat Mobi BEB1G45"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Fornecedor / Contratada</label>
                  <select value={form.supplier_id} onChange={e => f('supplier_id', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Selecione</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Veículo (se aplicável)</label>
                  <select value={form.vehicle_id} onChange={e => f('vehicle_id', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    <option value="">Selecione</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Prazo início (dias úteis)</label>
                  <input type="number" value={form.start_days} onChange={e => f('start_days', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Prazo conclusão (dias úteis)</label>
                  <input type="number" value={form.completion_days} onChange={e => f('completion_days', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Garantia (dias)</label>
                  <input type="number" value={form.warranty_days} onChange={e => f('warranty_days', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400"/>
                </div>
                <div>
                  <label className="text-slate-500 text-xs font-medium mb-1.5 block">Status</label>
                  <select value={form.status} onChange={e => f('status', e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
                    {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Itens */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-slate-700 text-sm font-semibold">Itens / Serviços</label>
                  <button onClick={addItem} className="text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                    + Adicionar item
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                          placeholder="Descrição do serviço/item"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
                      </div>
                      <div className="col-span-1">
                        <input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                          placeholder="UN"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 text-center"/>
                      </div>
                      <div className="col-span-2">
                        <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          placeholder="Qtd"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 text-center"/>
                      </div>
                      <div className="col-span-3">
                        <input type="number" step="0.01" value={item.unit_value} onChange={e => updateItem(idx, 'unit_value', e.target.value)}
                          placeholder="R$ 0,00"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 text-right"/>
                      </div>
                      <div className="col-span-1 text-right">
                        <button onClick={() => removeItem(idx)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                          <X size={14}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {totalValue > 0 && (
                  <div className="mt-3 bg-indigo-50 rounded-xl px-4 py-3 flex items-center justify-between">
                    <span className="text-indigo-700 text-sm font-medium">Valor Global da Contratação</span>
                    <span className="text-indigo-700 text-lg font-bold">R$ {totalValue.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                  </div>
                )}
              </div>

              {/* Signatários */}
              <div>
                <label className="text-slate-700 text-sm font-semibold mb-3 block">Signatários (quem vai assinar)</label>
                <div className="grid grid-cols-2 gap-2">
                  {signatories.map(s => (
                    <label key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedSignatories.includes(s.id) ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input type="checkbox" checked={selectedSignatories.includes(s.id)} onChange={() => toggleSignatory(s.id)} className="accent-indigo-600"/>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.role_label || s.role}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-slate-500 text-xs font-medium mb-1.5 block">Observações</label>
                <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={3}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 resize-none"/>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={closeModal} className="px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="px-5 py-2.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors">
                {saving ? 'Salvando...' : form.id ? 'Atualizar Ordem' : 'Criar Ordem'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}