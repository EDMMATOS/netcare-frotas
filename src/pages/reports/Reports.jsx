import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { Download, Filter } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import toast from 'react-hot-toast'

const fmt  = v => `R$ ${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}`
const fmtN = v => Number(v||0).toLocaleString('pt-BR')
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const M_LEFT   = 15
const M_RIGHT  = 200
const M_TOP    = 38
const M_BOTTOM = 252

export default function Reports() {
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('dre')
  const [year, setYear]               = useState(new Date().getFullYear())
  const [month, setMonth]             = useState(new Date().getMonth())
  const [period, setPeriod]           = useState('month')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [vehicles, setVehicles]       = useState([])
  const [dreData, setDreData]         = useState(null)
  const [vehicleReport, setVehicleReport] = useState([])
  const [fuelReport, setFuelReport]   = useState([])
  const [maintReport, setMaintReport] = useState([])
  const [finesReport, setFinesReport] = useState([])
  const [monthlyChart, setMonthlyChart] = useState([])
  const [generating, setGenerating]   = useState(false)

  useEffect(() => { loadVehicles() }, [])
  useEffect(() => { loadReports() }, [year, month, period, vehicleFilter])

  const loadVehicles = async () => {
    const { data } = await supabase.from('vehicles').select('id, plate, brand, model').eq('is_active', true).order('plate')
    setVehicles(data || [])
  }

  const getDateRange = (p, y, m) => {
    const usePeriod = p || period
    const useYear   = y || year
    const useMonth  = m !== undefined ? m : month
    if (usePeriod === 'month') {
      return {
        start: new Date(useYear, useMonth, 1).toISOString().split('T')[0],
        end:   new Date(useYear, useMonth+1, 0).toISOString().split('T')[0],
      }
    }
    return {
      start: new Date(useYear, 0, 1).toISOString().split('T')[0],
      end:   new Date(useYear, 11, 31).toISOString().split('T')[0],
    }
  }

  const fetchData = async (periodParam, yearParam, monthParam, vehicleFilterParam) => {
    const { start, end } = getDateRange(periodParam, yearParam, monthParam)
    const vf = vehicleFilterParam !== undefined ? vehicleFilterParam : vehicleFilter

    let fuelQ    = supabase.from('fuel_records').select('*, vehicles(plate,brand,model), suppliers(name), drivers(name)').gte('date', start).lte('date', end)
    let maintQ   = supabase.from('maintenance_records').select('*, vehicles(plate,brand,model), suppliers(name)').gte('date', start).lte('date', end)
    let finesQ   = supabase.from('fines').select('*, vehicles(plate,brand,model), drivers(name)').gte('date', start).lte('date', end)
    let mileageQ = supabase.from('mileage_records').select('*, vehicles(plate,brand,model), drivers(name)').gte('date', start).lte('date', end)

    if (vf) {
      fuelQ    = fuelQ.eq('vehicle_id', vf)
      maintQ   = maintQ.eq('vehicle_id', vf)
      finesQ   = finesQ.eq('vehicle_id', vf)
      mileageQ = mileageQ.eq('vehicle_id', vf)
    }

    const [{ data: fuel }, { data: maint }, { data: fines }, { data: mileage }] = await Promise.all([
      fuelQ.order('date', { ascending: false }),
      maintQ.order('date', { ascending: false }),
      finesQ.order('date', { ascending: false }),
      mileageQ.order('date', { ascending: false }),
    ])

    return { fuel: fuel||[], maint: maint||[], fines: fines||[], mileage: mileage||[] }
  }

  const calcDre = (fuel, maint, fines, mileage) => {
    const totalFuel      = fuel.reduce((s, f) => s + Number(f.total_cost||0), 0)
    const totalMaint     = maint.reduce((s, m) => s + Number(m.total_cost||0), 0)
    const totalFinesPd   = fines.filter(f => f.status === 'pending').reduce((s, f) => s + Number(f.actual_value||0), 0)
    const totalFinesPaid = fines.filter(f => f.status === 'paid').reduce((s, f) => s + Number(f.actual_value||0), 0)
    const totalKm        = mileage.reduce((s, m) => s + Number(m.total_km||0), 0)
    const totalCost      = totalFuel + totalMaint + totalFinesPaid
    return {
      totalFuel, totalMaint, totalFinesPending: totalFinesPd,
      totalFinesPaid, totalKm, totalCost,
      fuelPct:   totalCost > 0 ? ((totalFuel/totalCost)*100).toFixed(1) : 0,
      maintPct:  totalCost > 0 ? ((totalMaint/totalCost)*100).toFixed(1) : 0,
      costPerKm: totalKm > 0 ? (totalCost/totalKm).toFixed(4) : 0,
    }
  }

  const calcVehicleReport = (fuel, maint, fines, mileage, vehiclesList) => {
    const byVehicle = {}
    vehiclesList.forEach(v => {
      byVehicle[v.id] = { id:v.id, plate:v.plate, brand:v.brand, model:v.model, fuel:0, maint:0, fines:0, km:0 }
    })
    fuel.forEach(f => { if (byVehicle[f.vehicle_id]) byVehicle[f.vehicle_id].fuel += Number(f.total_cost||0) })
    maint.forEach(m => { if (byVehicle[m.vehicle_id]) byVehicle[m.vehicle_id].maint += Number(m.total_cost||0) })
    fines.filter(f => f.status === 'paid').forEach(f => { if (byVehicle[f.vehicle_id]) byVehicle[f.vehicle_id].fines += Number(f.actual_value||0) })
    mileage.forEach(m => { if (byVehicle[m.vehicle_id]) byVehicle[m.vehicle_id].km += Number(m.total_km||0) })
    return Object.values(byVehicle)
      .map(v => ({ ...v, total: v.fuel+v.maint+v.fines, costPerKm: v.km > 0 ? (v.fuel+v.maint)/v.km : 0 }))
      .filter(v => v.total > 0)
      .sort((a, b) => b.total - a.total)
  }

  const loadReports = async () => {
    setLoading(true)
    const { fuel, maint, fines, mileage } = await fetchData(period, year, month, vehicleFilter)
    setFuelReport(fuel)
    setMaintReport(maint)
    setFinesReport(fines)
    setDreData(calcDre(fuel, maint, fines, mileage))

    const vList = vehicles.length > 0 ? vehicles : (await supabase.from('vehicles').select('id, plate, brand, model').eq('is_active', true).order('plate')).data || []
    setVehicleReport(calcVehicleReport(fuel, maint, fines, mileage, vList))

    const monthly = MONTHS.map((mes, i) => {
      const ms = new Date(year, i, 1).toISOString().split('T')[0]
      const me = new Date(year, i+1, 0).toISOString().split('T')[0]
      const f  = fuel.filter(r => r.date >= ms && r.date <= me).reduce((s,r) => s+Number(r.total_cost||0), 0)
      const m2 = maint.filter(r => r.date >= ms && r.date <= me).reduce((s,r) => s+Number(r.total_cost||0), 0)
      return { mes, Combustível: f, Manutenção: m2, Total: f+m2 }
    })
    setMonthlyChart(monthly)
    setLoading(false)
  }

  const loadTimbrado = async () => {
    try {
      const { data } = supabase.storage.from('company-assets').getPublicUrl('timbrado.jpg')
      const response = await fetch(data.publicUrl)
      if (!response.ok) return null
      const blob = await response.blob()
      return await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.readAsDataURL(blob)
      })
    } catch(e) { return null }
  }

  const addPageBackground = (doc, timbrado, pageW, pageH) => {
    if (timbrado) {
      doc.addImage(timbrado, 'JPEG', 0, 0, pageW, pageH)
    } else {
      doc.setFillColor(26,58,92)
      doc.rect(0, 0, pageW, 25, 'F')
      doc.setTextColor(255,255,255)
      doc.setFontSize(12)
      doc.setFont('helvetica','bold')
      doc.text('NETCARE SOLUCOES EM REDES LTDA.', M_LEFT, 10)
      doc.setFontSize(8)
      doc.setFont('helvetica','normal')
      doc.text('CNPJ: 22.115.808/0001-57  |  Maringá/PR  |  (44) 3200-2103', M_LEFT, 17)
    }
  }

  const generatePDF = async () => {
    setGenerating(true)
    try {
      toast('⏳ Buscando dados para o PDF...', { icon: '⏳' })

      // Busca dados FRESCOS diretamente do banco
      const { fuel, maint, fines, mileage } = await fetchData(period, year, month, vehicleFilter)

      // Carrega lista de veículos atualizada
      const { data: vList } = await supabase.from('vehicles').select('id, plate, brand, model').eq('is_active', true).order('plate')

      // Calcula DRE e relatório por veículo com dados frescos
      const pdfDre      = calcDre(fuel, maint, fines, mileage)
      const pdfVehicles = calcVehicleReport(fuel, maint, fines, mileage, vList || [])

      const doc    = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
      const pageW  = 210
      const pageH  = 297
      const usableW = M_RIGHT - M_LEFT
      let y        = M_TOP

      const periodLabel  = period === 'month' ? `${MONTHS[month]}/${year}` : `Ano ${year}`
      const vehicleLabel = vehicleFilter ? (vList||[]).find(v => v.id === vehicleFilter)?.plate || '' : 'Toda a Frota'

      // Timbrado
      const timbrado = await loadTimbrado()
      addPageBackground(doc, timbrado, pageW, pageH)

      // Título
      doc.setFillColor(26,58,92)
      doc.rect(M_LEFT, y, usableW, 11, 'F')
      doc.setTextColor(255,255,255)
      doc.setFontSize(10)
      doc.setFont('helvetica','bold')
      doc.text('RELATÓRIO DE GESTÃO DE FROTAS', M_LEFT + usableW/2, y+7.5, { align:'center' })
      y += 14

      doc.setTextColor(80,80,80)
      doc.setFontSize(8)
      doc.setFont('helvetica','normal')
      doc.text(`Período: ${periodLabel}   |   Frota: ${vehicleLabel}   |   Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, M_LEFT, y)
      y += 8

      doc.setDrawColor(200,200,200)
      doc.line(M_LEFT, y, M_RIGHT, y)
      y += 6

      // ── DRE ──
      doc.setFillColor(240,244,250)
      doc.rect(M_LEFT, y, usableW, 6, 'F')
      doc.setTextColor(26,58,92)
      doc.setFontSize(8.5)
      doc.setFont('helvetica','bold')
      doc.text('▸  DRE — DEMONSTRATIVO DE RESULTADOS DA FROTA', M_LEFT+2, y+4.2)
      y += 8

      autoTable(doc, {
        startY: y,
        head: [['Categoria', 'Valor (R$)', '% do Total']],
        body: [
          ['Combustível',      fmt(pdfDre.totalFuel),          `${pdfDre.fuelPct}%`],
          ['Manutenções',      fmt(pdfDre.totalMaint),         `${pdfDre.maintPct}%`],
          ['Multas Pagas',     fmt(pdfDre.totalFinesPaid),     '—'],
          ['CUSTO TOTAL',      fmt(pdfDre.totalCost),          '100%'],
          ['KM Rodados',       `${fmtN(pdfDre.totalKm)} km`,  '—'],
          ['Custo por KM',     `R$ ${pdfDre.costPerKm}`,       '—'],
          ['Multas Pendentes', fmt(pdfDre.totalFinesPending),  '—'],
        ],
        margin: { left: M_LEFT, right: pageW - M_RIGHT },
        tableWidth: M_RIGHT - M_LEFT,
        styles: { fontSize:8, cellPadding:2.5, textColor:[50,50,50] },
        headStyles: { fillColor:[26,58,92], textColor:255, fontStyle:'bold', fontSize:8 },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { halign:'right', cellWidth: 50 },
          2: { halign:'right', cellWidth: 35 },
        },
        didParseCell: data => {
          if (data.row.index === 3) {
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.fillColor = [220,230,245]
            data.cell.styles.textColor = [26,58,92]
          }
        }
      })
      y = doc.lastAutoTable.finalY + 8

      // ── CUSTO POR VEÍCULO ──
      if (pdfVehicles.length > 0) {
        if (y > M_BOTTOM) { doc.addPage(); addPageBackground(doc, timbrado, pageW, pageH); y = M_TOP }
        doc.setFillColor(240,244,250)
        doc.rect(M_LEFT, y, usableW, 6, 'F')
        doc.setTextColor(26,58,92)
        doc.setFontSize(8.5)
        doc.setFont('helvetica','bold')
        doc.text('▸  CUSTO POR VEÍCULO', M_LEFT+2, y+4.2)
        y += 8
        autoTable(doc, {
          startY: y,
          head: [['Veículo','Combustível','Manutenção','Multas','KM','R$/KM','Total']],
          body: pdfVehicles.map(v => [
            `${v.plate} — ${v.brand} ${v.model}`,
            fmt(v.fuel), fmt(v.maint), fmt(v.fines),
            `${fmtN(v.km)} km`,
            v.km > 0 ? `R$ ${v.costPerKm.toFixed(3)}` : '—',
            fmt(v.total)
          ]),
          margin: { left: M_LEFT, right: pageW - M_RIGHT },
          tableWidth: usableW,
          styles: { fontSize:7, cellPadding:2 },
          headStyles: { fillColor:[26,58,92], textColor:255, fontStyle:'bold', fontSize:7 },
          columnStyles: { 6: { halign:'right', fontStyle:'bold' } },
          didDrawPage: () => addPageBackground(doc, timbrado, pageW, pageH)
        })
        y = doc.lastAutoTable.finalY + 8
      }

      // ── ABASTECIMENTOS ──
      if (fuel.length > 0) {
        if (y > M_BOTTOM) { doc.addPage(); addPageBackground(doc, timbrado, pageW, pageH); y = M_TOP }
        doc.setFillColor(240,244,250)
        doc.rect(M_LEFT, y, usableW, 6, 'F')
        doc.setTextColor(26,58,92)
        doc.setFontSize(8.5)
        doc.setFont('helvetica','bold')
        doc.text('▸  ABASTECIMENTOS', M_LEFT+2, y+4.2)
        y += 8
        autoTable(doc, {
          startY: y,
          head: [['Data','Veículo','Combustível','Litros','R$/L','KM/L','Total']],
          body: fuel.map(f => [
            new Date(f.date+'T12:00:00').toLocaleDateString('pt-BR'),
            f.vehicles?.plate || '—',
            f.fuel_type || '—',
            Number(f.liters).toFixed(2),
            `R$ ${Number(f.price_per_liter).toFixed(3)}`,
            f.km_per_liter ? Number(f.km_per_liter).toFixed(1) : '—',
            fmt(f.total_cost)
          ]),
          foot: [['', '', '', `${fuel.reduce((s,f) => s+Number(f.liters||0), 0).toFixed(2)} L`, '', '', fmt(pdfDre.totalFuel)]],
          margin: { left: M_LEFT, right: pageW - M_RIGHT },
          tableWidth: usableW,
          styles: { fontSize:7, cellPadding:2 },
          headStyles: { fillColor:[26,58,92], textColor:255, fontStyle:'bold', fontSize:7 },
          footStyles: { fillColor:[255,245,220], textColor:[100,60,0], fontStyle:'bold', fontSize:7 },
          columnStyles: { 6: { halign:'right', fontStyle:'bold' } },
          didDrawPage: () => addPageBackground(doc, timbrado, pageW, pageH)
        })
        y = doc.lastAutoTable.finalY + 8
      }

      // ── MANUTENÇÕES ──
      if (maint.length > 0) {
        if (y > M_BOTTOM) { doc.addPage(); addPageBackground(doc, timbrado, pageW, pageH); y = M_TOP }
        doc.setFillColor(240,244,250)
        doc.rect(M_LEFT, y, usableW, 6, 'F')
        doc.setTextColor(26,58,92)
        doc.setFontSize(8.5)
        doc.setFont('helvetica','bold')
        doc.text('▸  MANUTENÇÕES', M_LEFT+2, y+4.2)
        y += 8
        autoTable(doc, {
          startY: y,
          head: [['Data','Veículo','Tipo','Fornecedor','Peças','MO','Total']],
          body: maint.map(m => [
            new Date(m.date+'T12:00:00').toLocaleDateString('pt-BR'),
            m.vehicles?.plate || '—',
            m.type || '—',
            m.suppliers?.name || '—',
            fmt(m.parts_cost),
            fmt(m.labor_cost),
            fmt(m.total_cost)
          ]),
          foot: [['', '', '', '', '', 'Total', fmt(pdfDre.totalMaint)]],
          margin: { left: M_LEFT, right: pageW - M_RIGHT },
          tableWidth: usableW,
          styles: { fontSize:7, cellPadding:2 },
          headStyles: { fillColor:[26,58,92], textColor:255, fontStyle:'bold', fontSize:7 },
          footStyles: { fillColor:[255,235,235], textColor:[120,0,0], fontStyle:'bold', fontSize:7 },
          columnStyles: { 6: { halign:'right', fontStyle:'bold' } },
          didDrawPage: () => addPageBackground(doc, timbrado, pageW, pageH)
        })
        y = doc.lastAutoTable.finalY + 8
      }

      // ── MULTAS ──
      if (fines.length > 0) {
        if (y > M_BOTTOM) { doc.addPage(); addPageBackground(doc, timbrado, pageW, pageH); y = M_TOP }
        doc.setFillColor(240,244,250)
        doc.rect(M_LEFT, y, usableW, 6, 'F')
        doc.setTextColor(26,58,92)
        doc.setFontSize(8.5)
        doc.setFont('helvetica','bold')
        doc.text('▸  MULTAS', M_LEFT+2, y+4.2)
        y += 8
        autoTable(doc, {
          startY: y,
          head: [['Data','Veículo','Condutor','Descrição','Pts','Status','Valor']],
          body: fines.map(f => [
            new Date(f.date+'T12:00:00').toLocaleDateString('pt-BR'),
            f.vehicles?.plate || '—',
            f.drivers?.name || '—',
            (f.description||'').substring(0,22),
            f.points || '—',
            f.status === 'paid' ? 'Pago' : f.status === 'pending' ? 'Pendente' : f.status,
            fmt(f.actual_value)
          ]),
          margin: { left: M_LEFT, right: pageW - M_RIGHT },
          tableWidth: usableW,
          styles: { fontSize:7, cellPadding:2 },
          headStyles: { fillColor:[26,58,92], textColor:255, fontStyle:'bold', fontSize:7 },
          columnStyles: { 6: { halign:'right', fontStyle:'bold' } },
          didDrawPage: () => addPageBackground(doc, timbrado, pageW, pageH)
        })
      }

      // ── NUMERAÇÃO ──
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(7)
        doc.setTextColor(120,120,120)
        doc.setFont('helvetica','normal')
        doc.text(
          `Página ${i} de ${pageCount}  —  NetCare Gestão de Frotas  —  ${new Date().toLocaleString('pt-BR')}`,
          M_LEFT + usableW/2, 287, { align:'center' }
        )
      }

      doc.save(`Relatorio_NetCare_${periodLabel.replace('/','_')}.pdf`)
      toast.success('✅ Relatório PDF gerado com sucesso!')
    } catch(e) {
      console.error(e)
      toast.error('Erro ao gerar PDF: ' + e.message)
    }
    setGenerating(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-slate-800 text-xl font-bold">Relatórios</h2>
          <p className="text-slate-500 text-sm mt-0.5">Análise completa da frota com exportação em PDF</p>
        </div>
        <button onClick={generatePDF} disabled={generating}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <Download size={16}/> {generating ? 'Gerando PDF...' : 'Exportar PDF'}
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400"/>
            <span className="text-slate-600 text-sm font-medium">Filtros:</span>
          </div>
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="month">Mensal</option>
            <option value="year">Anual</option>
          </select>
          {period === 'month' && (
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          )}
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">Toda a frota</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { key:'dre',      label:'DRE' },
          { key:'vehicles', label:'Por Veículo' },
          { key:'fuel',     label:'Combustível' },
          { key:'maint',    label:'Manutenção' },
          { key:'fines',    label:'Multas' },
          { key:'chart',    label:'Gráficos' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : (
        <>
          {tab === 'dre' && dreData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label:'Total Combustível', value:fmt(dreData.totalFuel),     color:'text-amber-600',  bg:'bg-amber-50',  pct:`${dreData.fuelPct}% do custo` },
                  { label:'Total Manutenção',  value:fmt(dreData.totalMaint),    color:'text-red-600',    bg:'bg-red-50',    pct:`${dreData.maintPct}% do custo` },
                  { label:'Multas Pagas',      value:fmt(dreData.totalFinesPaid),color:'text-purple-600', bg:'bg-purple-50', pct:'custo realizado' },
                  { label:'CUSTO TOTAL',       value:fmt(dreData.totalCost),     color:'text-slate-800',  bg:'bg-slate-100', pct:'no período' },
                ].map(c => (
                  <div key={c.label} className={`${c.bg} rounded-2xl p-5 border border-white`}>
                    <p className="text-slate-500 text-xs mb-2">{c.label}</p>
                    <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                    <p className="text-slate-400 text-xs mt-1">{c.pct}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label:'KM Rodados',       value:`${fmtN(dreData.totalKm)} km`, color:'text-blue-600',   bg:'bg-blue-50' },
                  { label:'Custo por KM',     value:`R$ ${dreData.costPerKm}`,     color:'text-indigo-600', bg:'bg-indigo-50' },
                  { label:'Multas Pendentes', value:fmt(dreData.totalFinesPending),color:'text-red-600',    bg:'bg-red-50' },
                ].map(c => (
                  <div key={c.label} className={`${c.bg} rounded-2xl p-5 border border-white`}>
                    <p className="text-slate-500 text-xs mb-2">{c.label}</p>
                    <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="text-left px-5 py-3.5 font-semibold">Categoria</th>
                      <th className="text-right px-5 py-3.5 font-semibold">Valor</th>
                      <th className="text-right px-5 py-3.5 font-semibold">% do Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {[
                      { label:'Combustível',  value:dreData.totalFuel,      pct:dreData.fuelPct },
                      { label:'Manutenções',  value:dreData.totalMaint,     pct:dreData.maintPct },
                      { label:'Multas Pagas', value:dreData.totalFinesPaid, pct:null },
                    ].map(r => (
                      <tr key={r.label} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3.5 text-slate-700">{r.label}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-slate-800">{fmt(r.value)}</td>
                        <td className="px-5 py-3.5 text-right text-slate-500">{r.pct ? `${r.pct}%` : '—'}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-800 text-white">
                      <td className="px-5 py-3.5 font-bold">CUSTO TOTAL</td>
                      <td className="px-5 py-3.5 text-right font-bold">{fmt(dreData.totalCost)}</td>
                      <td className="px-5 py-3.5 text-right">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'vehicles' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Veículo</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Combustível</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Manutenção</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Multas</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">KM</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">R$/KM</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {vehicleReport.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-400">Nenhum dado no período</td></tr>
                  ) : vehicleReport.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{v.plate}</span>
                        <p className="text-slate-400 text-xs mt-0.5">{v.brand} {v.model}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right text-amber-600 font-medium text-xs">{fmt(v.fuel)}</td>
                      <td className="px-5 py-3.5 text-right text-red-600 font-medium text-xs">{fmt(v.maint)}</td>
                      <td className="px-5 py-3.5 text-right text-purple-600 font-medium text-xs">{fmt(v.fines)}</td>
                      <td className="px-5 py-3.5 text-right text-slate-600 text-xs">{fmtN(v.km)} km</td>
                      <td className="px-5 py-3.5 text-right text-slate-500 text-xs">{v.km > 0 ? `R$ ${v.costPerKm.toFixed(4)}` : '—'}</td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-800">{fmt(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'fuel' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Data</th>
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Veículo</th>
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Motorista</th>
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Combustível</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Litros</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">KM/L</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fuelReport.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-400">Nenhum abastecimento no período</td></tr>
                  ) : fuelReport.map(f => (
                    <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{new Date(f.date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="px-5 py-3.5"><span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{f.vehicles?.plate}</span></td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{f.drivers?.name || '—'}</td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{f.fuel_type || '—'}</td>
                      <td className="px-5 py-3.5 text-right text-slate-600 text-xs">{Number(f.liters).toFixed(2)} L</td>
                      <td className="px-5 py-3.5 text-right text-xs">
                        {f.km_per_liter ? (
                          <span className={`font-medium ${Number(f.km_per_liter) >= 10 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {Number(f.km_per_liter).toFixed(1)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-800 text-xs">{fmt(f.total_cost)}</td>
                    </tr>
                  ))}
                  {fuelReport.length > 0 && (
                    <tr className="bg-amber-50">
                      <td colSpan={4} className="px-5 py-3 font-semibold text-slate-700 text-sm">Total</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-700 text-sm">
                        {fuelReport.reduce((s,f) => s+Number(f.liters||0), 0).toFixed(2)} L
                      </td>
                      <td></td>
                      <td className="px-5 py-3 text-right font-bold text-amber-700">{fmt(dreData?.totalFuel)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'maint' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Data</th>
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Veículo</th>
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Fornecedor</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Peças</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">MO</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {maintReport.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-400">Nenhuma manutenção no período</td></tr>
                  ) : maintReport.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{new Date(m.date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="px-5 py-3.5"><span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{m.vehicles?.plate}</span></td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{m.type}</td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{m.suppliers?.name || '—'}</td>
                      <td className="px-5 py-3.5 text-right text-slate-600 text-xs">{fmt(m.parts_cost)}</td>
                      <td className="px-5 py-3.5 text-right text-slate-600 text-xs">{fmt(m.labor_cost)}</td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-800 text-xs">{fmt(m.total_cost)}</td>
                    </tr>
                  ))}
                  {maintReport.length > 0 && (
                    <tr className="bg-red-50">
                      <td colSpan={6} className="px-5 py-3 font-semibold text-slate-700 text-sm">Total</td>
                      <td className="px-5 py-3 text-right font-bold text-red-700">{fmt(dreData?.totalMaint)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'fines' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Data</th>
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Veículo</th>
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Condutor</th>
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Descrição</th>
                    <th className="text-center px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Pts</th>
                    <th className="text-left px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Status</th>
                    <th className="text-right px-5 py-3.5 text-slate-500 font-medium text-xs uppercase tracking-wide">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {finesReport.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-400">Nenhuma multa no período</td></tr>
                  ) : finesReport.map(f => (
                    <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{new Date(f.date+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="px-5 py-3.5"><span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">{f.vehicles?.plate}</span></td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs">{f.drivers?.name || '—'}</td>
                      <td className="px-5 py-3.5 text-slate-600 text-xs max-w-xs truncate">{f.description || '—'}</td>
                      <td className="px-5 py-3.5 text-center text-xs">
                        {f.points ? <span className={`font-bold px-2 py-0.5 rounded-full ${Number(f.points) >= 7 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{f.points}</span> : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        <span className={`px-2 py-1 rounded-full font-medium ${f.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : f.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {f.status === 'paid' ? 'Pago' : f.status === 'pending' ? 'Pendente' : f.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-800 text-xs">{fmt(f.actual_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'chart' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-semibold text-slate-700 text-sm mb-4">📊 Evolução de Custos Mensais — {year}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={monthlyChart} margin={{ top:0, right:20, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="mes" tick={{ fontSize:11, fill:'#94a3b8' }}/>
                    <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`}/>
                    <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius:12, border:'1px solid #e2e8f0' }}/>
                    <Legend wrapperStyle={{ fontSize:11 }}/>
                    <Line type="monotone" dataKey="Combustível" stroke="#f59e0b" strokeWidth={2} dot={{ r:4 }}/>
                    <Line type="monotone" dataKey="Manutenção"  stroke="#ef4444" strokeWidth={2} dot={{ r:4 }}/>
                    <Line type="monotone" dataKey="Total"       stroke="#6366f1" strokeWidth={2.5} dot={{ r:5 }} strokeDasharray="5 5"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <h3 className="font-semibold text-slate-700 text-sm mb-4">📊 Custo Mensal por Categoria — {year}</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyChart} margin={{ top:0, right:20, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="mes" tick={{ fontSize:11, fill:'#94a3b8' }}/>
                    <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`}/>
                    <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius:12, border:'1px solid #e2e8f0' }}/>
                    <Legend wrapperStyle={{ fontSize:11 }}/>
                    <Bar dataKey="Combustível" fill="#f59e0b" radius={[4,4,0,0]} stackId="a"/>
                    <Bar dataKey="Manutenção"  fill="#ef4444" radius={[4,4,0,0]} stackId="a"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}