import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, TrendingUp, Receipt, FileText, Landmark,
  Calculator, Plus, Trash2, Edit3, Upload, CheckCircle,
  FolderOpen, Download, FileSpreadsheet, Image, AlertCircle, ChevronDown,
  Save, User, Car, Archive, History, Paperclip, X as XIcon,
  Building2, RefreshCw, Send
} from 'lucide-react'
import SyncResultModal from '@/components/SyncResultModal'
import ScontrinoSmartModal from '@/components/ScontrinoSmartModal'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '@/lib/api'
import { formatEuro, formatData, cn, MESI } from '@/lib/utils'
import { CATEGORIE_COSTI, TIPI_VERSAMENTO, METODI_PAGAMENTO } from '@/lib/constants'
import StatCard from '@/components/shared/StatCard'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import ImportRegistroIvaModal from '@/components/shared/ImportRegistroIvaModal'
import ImportCorrispettiviModal from '@/components/shared/ImportCorrispettiviModal'
import VersamentoFormModal from '@/components/shared/VersamentoFormModal'
import CorrispettivoFormModal from '@/components/shared/CorrispettivoFormModal'
import CostoFormModal from '@/components/shared/CostoFormModal'
import { useOutletContext } from 'react-router-dom'
import { useActiveCliente } from '@/contexts/ActiveClienteContext'

export default function ClienteDetailPage() {
  const { id } = useParams()
  const { setActive, clearActive } = useActiveCliente()
  const { anno } = useOutletContext()

  const [cliente, setCliente] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('panoramica')

  const [corrispettivi, setCorrispettivi] = useState(null)
  const [costi, setCosti] = useState(null)
  const [versamenti, setVersamenti] = useState(null)
  const [fatture, setFatture] = useState(null)
  const [tabLoading, setTabLoading] = useState(false)

  const [showImportCosti, setShowImportCosti] = useState(false)
  const [showCostoForm, setShowCostoForm] = useState(false)
  const [editingCosto, setEditingCosto] = useState(null)
  const [showImportCorrispettivi, setShowImportCorrispettivi] = useState(false)
  const [showCorrispettivoForm, setShowCorrispettivoForm] = useState(false)
  const [editingCorrispettivo, setEditingCorrispettivo] = useState(null)
  const [showVersamentoForm, setShowVersamentoForm] = useState(false)
  const [editingVersamento, setEditingVersamento] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Anagrafica edit
  const [anagraficaForm, setAnagraficaForm] = useState(null)
  const [savingAnagrafica, setSavingAnagrafica] = useState(false)
  const [anagraficaSuccess, setAnagraficaSuccess] = useState('')

  // Delega AdE
  const [adeDelega, setAdeDelega] = useState({ inDelega: false, delegaDal: '' })
  const [savingAde, setSavingAde] = useState(false)
  const [syncingCliente, setSyncingCliente] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncLogId, setSyncLogId] = useState(null)

  // Trasmissione corrispettivi
  const [showTrasmissioneModal, setShowTrasmissioneModal] = useState(false)
  // Trasmissione singola fattura
  const [trasmettendoFattura, setTrasmettendoFattura] = useState(null) // fatturaId in progress

  // Veicolo
  const [veicoli, setVeicoli] = useState(null)
  const [veicoloAttivo, setVeicoloAttivo] = useState(null)
  const [veicoloLoading, setVeicoloLoading] = useState(false)
  const [veicoloForm, setVeicoloForm] = useState({ targa: '', marca: '', modello: '', annoImmatricolazione: '', alimentazione: 'benzina', colore: '', note: '', dataInizioUso: '' })
  const [editingVeicolo, setEditingVeicolo] = useState(false)
  const [nuovoVeicolo, setNuovoVeicolo] = useState(false)
  const [savingVeicolo, setSavingVeicolo] = useState(false)
  const [storicizzaForm, setStoricizzaForm] = useState({ data: '', motivo: 'vendita' })
  const [showStoricizza, setShowStoricizza] = useState(false)
  const [veicoloSuccess, setVeicoloSuccess] = useState('')

  // Stato cliente
  const [statoForm, setStatoForm] = useState({ stato: '', motivazione: '', dataVariazione: '' })
  const [showStatoForm, setShowStatoForm] = useState(false)
  const [savingStato, setSavingStato] = useState(false)
  const [storicoStato, setStoricoStato] = useState(null)
  const [showStoricoStato, setShowStoricoStato] = useState(false)

  // Giustificativo costi
  const [uploadingGiust, setUploadingGiust] = useState(null) // costoId in upload
  const giustInputRef = useRef(null)
  const [giustTargetId, setGiustTargetId] = useState(null)

  // Documenti
  const [documenti, setDocumenti] = useState(null)
  const [docUploading, setDocUploading] = useState(false)
  const [docTipo, setDocTipo] = useState('patente')
  const [docNote, setDocNote] = useState('')
  const [docFile, setDocFile] = useState(null)
  const [docError, setDocError] = useState('')
  const fileInputRef = useRef(null)

  // Export corrispettivi
  const [showExport, setShowExport] = useState(false)
  const [exportMese, setExportMese] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => { fetchDashboard() }, [id, anno])

  useEffect(() => {
    if (activeTab === 'corrispettivi' && corrispettivi === null) loadTab('corrispettivi')
    if (activeTab === 'costi' && costi === null) loadTab('costi')
    if (activeTab === 'versamenti' && versamenti === null) loadTab('versamenti')
    if (activeTab === 'fatture' && fatture === null) loadTab('fatture')
    if (activeTab === 'documenti' && documenti === null) fetchDocumenti()
    if (activeTab === 'veicolo' && veicoli === null) fetchVeicoli()
  }, [activeTab, corrispettivi, costi, versamenti, fatture, documenti])

  useEffect(() => {
    setCorrispettivi(null); setCosti(null); setVersamenti(null); setFatture(null)
    setShowExport(false)
  }, [anno])

  // Svuota il context quando si lascia la pagina del cliente
  useEffect(() => {
    return () => clearActive()
  }, [])

  async function fetchDashboard() {
    setLoading(true)
    try {
      const [clienteRes, dashRes] = await Promise.all([
        api.get(`/users/clienti/${id}`),
        api.get('/dashboard/cliente', { params: { anno, userId: id } }),
      ])
      const c = clienteRes.data.data?.cliente || clienteRes.data.data
      setCliente(c)
      setDashboard(dashRes.data.data)
      // Popola il context per la Topbar (veicolo caricato dopo, in fetchVeicoli)
      setActive({
        nome: c.nome || '',
        cognome: c.cognome || '',
        codiceCliente: c.codiceCliente || '',
        numeroLicenza: c.numeroLicenza || '',
        comuneRilascioLicenza: c.comuneRilascioLicenza || '',
        targa: null,
      })
      setAnagraficaForm({
        nome: c.nome || '',
        cognome: c.cognome || '',
        email: c.email || '',
        telefono: c.telefono || '',
        codiceCliente: c.codiceCliente || '',
        numeroLicenza: c.numeroLicenza || '',
        comuneRilascioLicenza: c.comuneRilascioLicenza || '',
        codiceFiscale: c.codiceFiscale || '',
        partitaIva: c.partitaIva || '',
      })
      setAdeDelega({
        inDelega: c.ade?.inDelega || false,
        delegaDal: c.ade?.delegaDal ? new Date(c.ade.delegaDal).toISOString().split('T')[0] : '',
      })
    } catch (err) {
      console.error('Errore caricamento cliente:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadTab(tab) {
    setTabLoading(true)
    try {
      const params = { anno, userId: id, limit: 200 }
      switch (tab) {
        case 'corrispettivi': {
          const r = await api.get('/corrispettivi', { params })
          setCorrispettivi(r.data.data.corrispettivi || [])
          break
        }
        case 'costi': {
          const r = await api.get('/costi', { params })
          setCosti(r.data.data.costi || [])
          break
        }
        case 'versamenti': {
          const r = await api.get('/versamenti', { params })
          setVersamenti(r.data.data.versamenti || [])
          break
        }
        case 'fatture': {
          const r = await api.get('/fatture', { params })
          setFatture(r.data.data.fatture || [])
          break
        }
      }
    } catch (err) {
      console.error(`Errore tab ${tab}:`, err)
    } finally {
      setTabLoading(false)
    }
  }

  function reloadTab(tab) {
    if (tab === 'corrispettivi') setCorrispettivi(null)
    if (tab === 'costi') setCosti(null)
    if (tab === 'versamenti') setVersamenti(null)
    if (tab === 'fatture') setFatture(null)
  }

  // ── Documenti ─────────────────────────────────────────────────────────
  const TIPI_DOC = [
    { value: 'patente',            label: 'Patente di Guida' },
    { value: 'ci',                 label: "Carta d'Identità" },
    { value: 'cf',                 label: 'Codice Fiscale' },
    { value: 'kb',                 label: 'KB (Kartellino)' },
    { value: 'iscrizione_ruolo',   label: 'Iscrizione a Ruolo' },
    { value: 'visura',             label: 'Visura Camerale' },
    { value: 'qr_agenzia_entrate', label: 'QR Agenzia delle Entrate' },
    { value: 'copia_licenza',      label: 'Copia Licenza' },
    { value: 'altro',              label: 'Altro' },
  ]
  const TIPO_DOC_LABEL = Object.fromEntries(TIPI_DOC.map(t => [t.value, t.label]))

  function fmtBytes(b) {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  async function fetchDocumenti() {
    try {
      const res = await api.get('/documenti', { params: { userId: id } })
      setDocumenti(res.data.data?.documenti || [])
    } catch (err) {
      console.error('Errore caricamento documenti:', err)
      setDocumenti([])
    }
  }

  function handleDocFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { setDocError('File troppo grande (max 5 MB)'); setDocFile(null); return }
    const ok = ['image/jpeg','image/jpg','image/png','image/webp','application/pdf']
    if (!ok.includes(f.type)) { setDocError('Formato non supportato (JPG, PNG, WEBP, PDF)'); setDocFile(null); return }
    setDocError('')
    setDocFile(f)
  }

  async function handleUploadDoc(e) {
    e.preventDefault()
    if (!docFile) { setDocError('Seleziona un file.'); return }
    setDocUploading(true)
    setDocError('')
    try {
      const fd = new FormData()
      fd.append('file', docFile)
      fd.append('tipo', docTipo)
      fd.append('note', docNote)
      await api.post(`/documenti/upload?userId=${id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setDocFile(null)
      setDocNote('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      setDocumenti(null) // trigger reload
    } catch (err) {
      setDocError(err.response?.data?.message || 'Errore upload')
    } finally {
      setDocUploading(false)
    }
  }

  async function handleDeleteDoc(docId) {
    if (!confirm('Eliminare questo documento?')) return
    try {
      await api.delete(`/documenti/${docId}?userId=${id}`)
      setDocumenti(prev => (prev || []).filter(d => d._id !== docId))
    } catch (err) {
      alert(err.response?.data?.message || 'Errore eliminazione')
    }
  }

  function handleDownloadDoc(doc) {
    const baseUrl = import.meta.env.VITE_API_URL || ''
    const url = `${baseUrl}/api/v1/documenti/${doc._id}/download?userId=${id}`
    const token = localStorage.getItem('token')
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = doc.originalName
        link.click()
        URL.revokeObjectURL(blobUrl)
      })
      .catch(() => alert('Errore download'))
  }

  // ── Export Registro Corrispettivi ─────────────────────────────────────
  const MESI_EXPORT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']

  async function handleExportExcel() {
    setExporting(true)
    try {
      const params = { anno, userId: id }
      if (exportMese) params.mese = exportMese
      const token = localStorage.getItem('token')
      const baseUrl = import.meta.env.VITE_API_URL || ''
      const qs = new URLSearchParams(params).toString()
      const res = await fetch(`${baseUrl}/api/v1/corrispettivi/export/registro?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Errore export')
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match ? match[1] : `registro-${anno}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert("Errore durante l'esportazione Excel")
    } finally {
      setExporting(false)
    }
  }

  function handleExportPDF() {
    const mese = exportMese ? parseInt(exportMese) : null
    const periodoLabel = mese ? `${MESI_EXPORT[mese - 1]} ${anno}` : `Anno ${anno}`
    const nomeCliente = cliente ? `${cliente.nome} ${cliente.cognome}` : ''

    // Raggruppa per giorno
    const perGiorno = {}
    ;(corrispettivi || [])
      .filter(c => !mese || new Date(c.data).getMonth() === mese - 1)
      .forEach(c => {
        const chiave = new Date(c.data).toLocaleDateString('it-IT')
        if (!perGiorno[chiave]) perGiorno[chiave] = { label: chiave, totale: 0, dataRaw: new Date(c.data) }
        perGiorno[chiave].totale += c.importo
      })
    const giornate = Object.values(perGiorno).sort((a, b) => a.dataRaw - b.dataRaw)
    const totaleE = giornate.reduce((s, g) => s + g.totale, 0)

    const righe = giornate.map((g, i) => `<tr>
      <td>${i+1}</td>
      <td>${g.label}</td>
      <td style="text-align:right">${g.totale.toLocaleString('it-IT',{style:'currency',currency:'EUR'})}</td>
    </tr>`).join('')

    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"/>
<title>Registro Corrispettivi – ${periodoLabel}</title>
<style>
@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;font-size:11px;color:#222}
h1{font-size:16px;margin-bottom:4px}.subtitle{color:#555;margin-bottom:16px}
.info-box{border:1px solid #ddd;padding:10px 14px;border-radius:4px;margin-bottom:20px}
.info-box p{margin:3px 0}table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{background:#1a1a2e;color:#fff;padding:7px 8px;text-align:left;font-size:10px}
td{padding:6px 8px;border-bottom:1px solid #f0f0f0}tr:nth-child(even) td{background:#f9f9f9}
.total-row td{font-weight:bold;background:#f0f4ff;border-top:2px solid #aaa}
.summary{display:flex;gap:20px;margin-top:16px}
.summary-box{flex:1;border:1px solid #ddd;padding:10px;border-radius:4px;text-align:center}
.summary-box strong{display:block;font-size:18px;color:#1a1a2e}
.footer{margin-top:30px;font-size:9px;color:#999;text-align:center}
@media print{button{display:none!important}}
</style></head><body>
<h1>REGISTRO CORRISPETTIVI</h1>
<p class="subtitle">Periodo: ${periodoLabel}</p>
<div class="info-box">
<p><strong>Titolare:</strong> ${nomeCliente}</p>
<p><strong>Data generazione:</strong> ${new Date().toLocaleString('it-IT')}</p>
<p><strong>Giorni lavorati:</strong> ${giornate.length}</p>
</div>
<table><thead><tr><th>N.</th><th>Data</th><th>Importo Giornaliero</th></tr></thead>
<tbody>${righe}<tr class="total-row"><td colspan="2">TOTALE</td>
<td style="text-align:right">${totaleE.toLocaleString('it-IT',{style:'currency',currency:'EUR'})}</td>
</tr></tbody></table>
<div class="summary">
<div class="summary-box"><span>Totale Incassato</span><strong>${totaleE.toLocaleString('it-IT',{style:'currency',currency:'EUR'})}</strong></div>
<div class="summary-box"><span>Giorni Lavorati</span><strong>${giornate.length}</strong></div>
<div class="summary-box"><span>Media Giornaliera</span><strong>${giornate.length>0?(totaleE/giornate.length).toLocaleString('it-IT',{style:'currency',currency:'EUR'}):'–'}</strong></div>
</div>
<div class="footer">Documento generato da App Taxi · ${new Date().toLocaleDateString('it-IT')}</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
  }

  async function handleSaveAnagrafica(e) {
    e.preventDefault()
    setSavingAnagrafica(true)
    setAnagraficaSuccess('')
    try {
      const res = await api.put(`/users/clienti/${id}`, anagraficaForm)
      setCliente(res.data.data.cliente)
      setAnagraficaSuccess('Dati aggiornati')
      setTimeout(() => setAnagraficaSuccess(''), 3000)
    } catch (err) {
      alert(err.response?.data?.messaggio || err.response?.data?.message || 'Errore salvataggio')
    } finally {
      setSavingAnagrafica(false)
    }
  }

  async function handleSaveAdeDelega(e) {
    e.preventDefault()
    setSavingAde(true)
    try {
      await api.patch(`/ade/clienti/${id}/delega`, {
        inDelega: adeDelega.inDelega,
        delegaDal: adeDelega.delegaDal || undefined,
      })
      setAnagraficaSuccess('Delega AdE aggiornata con successo')
      setTimeout(() => setAnagraficaSuccess(''), 3000)
    } catch (err) {
      alert(err.response?.data?.messaggio || 'Errore salvataggio delega AdE')
    } finally {
      setSavingAde(false)
    }
  }

  async function handleSyncCliente() {
    setSyncingCliente(true)
    try {
      await api.post(`/ade/sync/${id}`)
      const logsRes = await api.get('/ade/sync/logs')
      const lastLog = logsRes.data.data?.logs?.[0]
      if (lastLog?._id) setSyncLogId(lastLog._id)
      setShowSyncModal(true)
    } catch (err) {
      alert(err.response?.data?.messaggio || 'Errore avvio sync')
    } finally {
      setSyncingCliente(false)
    }
  }

  async function handleTrasmettiFattura(fatturaId) {
    setTrasmettendoFattura(fatturaId)
    try {
      await api.post(`/ade/trasmetti/fattura/${fatturaId}`)
      reloadTab('fatture')
    } catch (err) {
      alert(err.response?.data?.messaggio || err.response?.data?.message || 'Errore trasmissione fattura')
    } finally {
      setTrasmettendoFattura(null)
    }
  }

  async function handleCambiaStato(e) {
    e.preventDefault()
    if (!statoForm.stato) return
    setSavingStato(true)
    try {
      const res = await api.put(`/users/clienti/${id}/stato`, statoForm)
      const updated = res.data.data?.cliente || res.data.data
      setCliente(updated)
      setShowStatoForm(false)
      setStatoForm({ stato: '', motivazione: '', dataVariazione: '' })
      setStoricoStato(null) // force reload
    } catch (err) {
      alert(err.response?.data?.message || 'Errore cambio stato')
    } finally { setSavingStato(false) }
  }

  async function fetchStoricoStato() {
    try {
      const res = await api.get(`/users/clienti/${id}/stato/storico`)
      setStoricoStato(res.data.data?.storico || [])
    } catch { setStoricoStato([]) }
  }

  const STATO_CONFIG = {
    attivo:  { label: 'Attivo',  cls: 'bg-green-100 text-green-700' },
    sospeso: { label: 'Sospeso', cls: 'bg-amber-100 text-amber-700' },
    cessato: { label: 'Cessato', cls: 'bg-red-100 text-red-700' },
  }

  const ALIMENTAZIONI_V = [
    { value: 'benzina', label: 'Benzina' }, { value: 'diesel', label: 'Diesel' },
    { value: 'gpl', label: 'GPL' }, { value: 'metano', label: 'Metano' },
    { value: 'ibrido_benzina', label: 'Ibrido Benzina' }, { value: 'ibrido_diesel', label: 'Ibrido Diesel' },
    { value: 'elettrico', label: 'Elettrico' }, { value: 'idrogeno', label: 'Idrogeno' },
    { value: 'altro', label: 'Altro' },
  ]
  const MOTIVI_FINE_USO_V = [
    { value: 'vendita', label: 'Vendita' }, { value: 'permuta', label: 'Permuta' },
    { value: 'rottamazione', label: 'Rottamazione' }, { value: 'altro', label: 'Altro' },
  ]
  const VUOTO_V = { targa: '', marca: '', modello: '', annoImmatricolazione: '', alimentazione: 'benzina', colore: '', note: '', dataInizioUso: '' }

  async function fetchVeicoli() {
    setVeicoloLoading(true)
    try {
      const res = await api.get('/veicoli', { params: { userId: id } })
      const list = res.data.data?.veicoli || []
      setVeicoli(list)
      const attivo = list.find(v => v.attivo) || null
      setVeicoloAttivo(attivo)
      // Aggiorna targa nel context
      if (attivo?.targa) {
        setActive(prev => prev ? { ...prev, targa: attivo.targa } : prev)
      }
    } catch { setVeicoli([]) }
    finally { setVeicoloLoading(false) }
  }

  async function handleSaveVeicoloConsulente(e) {
    e.preventDefault()
    setSavingVeicolo(true)
    setVeicoloSuccess('')
    try {
      if (editingVeicolo && veicoloAttivo) {
        const res = await api.put(`/veicoli/${veicoloAttivo._id}?userId=${id}`, veicoloForm)
        setVeicoloAttivo(res.data.data.veicolo)
        setEditingVeicolo(false)
      } else {
        await api.post(`/veicoli?userId=${id}`, veicoloForm)
        setNuovoVeicolo(false)
        fetchVeicoli()
      }
      setVeicoloSuccess('Veicolo salvato')
      setTimeout(() => setVeicoloSuccess(''), 3000)
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.messaggio || 'Errore salvataggio')
    } finally { setSavingVeicolo(false) }
  }

  async function handleStoricizzaConsulente(e) {
    e.preventDefault()
    if (!storicizzaForm.data) { alert('Inserisci la data di fine utilizzo.'); return }
    setSavingVeicolo(true)
    try {
      await api.post(`/veicoli/${veicoloAttivo._id}/storicizza?userId=${id}`, {
        dataFineUso: storicizzaForm.data,
        motivoFineUso: storicizzaForm.motivo,
      })
      setShowStoricizza(false)
      setStoricizzaForm({ data: '', motivo: 'vendita' })
      setNuovoVeicolo(true)
      setVeicoloForm(VUOTO_V)
      fetchVeicoli()
    } catch (err) {
      alert(err.response?.data?.message || 'Errore storicizzazione')
    } finally { setSavingVeicolo(false) }
  }

  async function handleUploadGiustificativo(e) {
    const file = e.target.files?.[0]
    if (!file || !giustTargetId) return
    setUploadingGiust(giustTargetId)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await api.post(`/costi/${giustTargetId}/giustificativo?userId=${id}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const meta = res.data.data?.giustificativo
      setCosti(prev => (prev || []).map(c =>
        c._id === giustTargetId ? { ...c, giustificativo: meta } : c
      ))
    } catch (err) {
      alert(err.response?.data?.message || 'Errore upload giustificativo')
    } finally {
      setUploadingGiust(null)
      setGiustTargetId(null)
      if (giustInputRef.current) giustInputRef.current.value = ''
    }
  }

  function handleDownloadGiustificativo(costo) {
    const baseUrl = import.meta.env.VITE_API_URL || ''
    const url = `${baseUrl}/api/v1/costi/${costo._id}/giustificativo?userId=${id}`
    const token = localStorage.getItem('token')
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob)
        window.open(blobUrl, '_blank')
        setTimeout(() => URL.revokeObjectURL(blobUrl), 3000)
      })
      .catch(() => alert('Errore download'))
  }

  async function handleDeleteGiustificativo(costoId) {
    if (!confirm('Rimuovere il giustificativo allegato?')) return
    try {
      await api.delete(`/costi/${costoId}/giustificativo?userId=${id}`)
      setCosti(prev => (prev || []).map(c =>
        c._id === costoId ? { ...c, giustificativo: undefined } : c
      ))
    } catch (err) {
      alert(err.response?.data?.message || 'Errore rimozione')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      const { type, item } = deleteTarget
      const endpoint = type === 'corrispettivo' ? 'corrispettivi' : type === 'costo' ? 'costi' : 'versamenti'
      await api.delete(`/${endpoint}/${item._id}?userId=${id}`)
      reloadTab(type === 'corrispettivo' ? 'corrispettivi' : type === 'costo' ? 'costi' : 'versamenti')
      setDeleteTarget(null)
    } catch (err) {
      alert(err.response?.data?.messaggio || 'Errore eliminazione')
    }
  }

  if (loading) return <LoadingSpinner />
  if (!cliente) return <div className="text-center text-gray-500 py-10">Cliente non trovato</div>

  const riepilogo = dashboard?.riepilogoAnnuale || {}
  const kpiRicavi = riepilogo.ricavoLordo || 0
  const kpiCosti = riepilogo.totaleCosti || 0
  const kpiImposta = riepilogo.impostaSostitutiva ?? riepilogo.irpefLorda ?? 0
  const kpiINPS = riepilogo.contributiINPS || 0
  const andamentoMensile = dashboard?.andamentoMensile || []
  const calcoloFiscale = riepilogo.ricavoLordo != null ? {
    ricaviLordi: riepilogo.ricavoLordo,
    coefficiente: riepilogo.redditoImponibile && riepilogo.ricavoLordo > 0
      ? Math.round((riepilogo.redditoImponibile / riepilogo.ricavoLordo) * 100) : 67,
    redditoImponibile: riepilogo.redditoImponibile,
    contributiINPS: riepilogo.contributiINPS,
    redditoNetto: riepilogo.nettoStimato,
    impostaSostitutiva: riepilogo.impostaSostitutiva,
    irpefNetta: riepilogo.irpefLorda,
    totaleImposte: riepilogo.totaleImposteContributi,
  } : null

  const tabs = [
    { key: 'panoramica',    label: 'Panoramica',    icon: TrendingUp },
    { key: 'anagrafica',    label: 'Anagrafica',    icon: User },
    { key: 'veicolo',       label: 'Veicolo',       icon: Car },
    { key: 'corrispettivi', label: 'Corrispettivi', icon: Receipt },
    { key: 'costi',         label: 'Costi',         icon: Receipt },
    { key: 'fatture',       label: 'Fatture',       icon: FileText },
    { key: 'versamenti',    label: 'Versamenti',    icon: Landmark },
    { key: 'documenti',     label: 'Documenti',     icon: FolderOpen },
  ]

  return (
    <div className="space-y-6">

      <div className="flex items-center gap-4">
        <Link to="/consulente/clienti" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold">
            {cliente.nome?.charAt(0)}{cliente.cognome?.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{cliente.nome} {cliente.cognome}</h1>
            <p className="text-sm text-gray-500">
              {cliente.email} · Anno {anno}
              {cliente.codiceCliente && <span className="ml-2 px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">{cliente.codiceCliente}</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Ricavi" value={formatEuro(kpiRicavi)} icon={TrendingUp} color="success" />
        <StatCard title="Costi" value={formatEuro(kpiCosti)} icon={Receipt} color="danger" />
        <StatCard title="Imposta" value={formatEuro(kpiImposta)} icon={Calculator} color="warning" />
        <StatCard title="INPS" value={formatEuro(kpiINPS)} icon={Landmark} color="primary" />
      </div>

      <div className="flex border-b border-gray-200 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            )}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Panoramica */}
      {activeTab === 'panoramica' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {andamentoMensile.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Andamento Mensile Ricavi</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={andamentoMensile.map(m => ({ ...m, mese: MESI[m.mese - 1]?.substring(0, 3) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatEuro(v)} />
                  <Bar dataKey="totale" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {calcoloFiscale && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Dettaglio Calcolo Fiscale</h3>
              <div className="space-y-3">
                {[
                  { label: 'Ricavi lordi', value: calcoloFiscale.ricaviLordi },
                  { label: `Reddito imponibile (${calcoloFiscale.coefficiente || 67}%)`, value: calcoloFiscale.redditoImponibile },
                  { label: 'Contributi INPS (24,48%)', value: calcoloFiscale.contributiINPS },
                  { label: 'Reddito netto stimato', value: calcoloFiscale.redditoNetto },
                  { label: calcoloFiscale.impostaSostitutiva != null ? 'Imposta Sostitutiva' : 'IRPEF Netta', value: calcoloFiscale.impostaSostitutiva ?? calcoloFiscale.irpefNetta },
                  { label: 'Totale imposte + INPS', value: calcoloFiscale.totaleImposte },
                ].filter(r => r.value != null).map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-600">{row.label}</span>
                    <span className="text-sm font-semibold">{formatEuro(row.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Anagrafica */}
      {activeTab === 'anagrafica' && anagraficaForm && (
        <div className="space-y-4 max-w-lg">
          {anagraficaSuccess && (
            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm font-medium">
              <CheckCircle className="w-4 h-4 shrink-0" /> {anagraficaSuccess}
            </div>
          )}
          <form onSubmit={handleSaveAnagrafica} className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Dati Anagrafici
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input type="text" value={anagraficaForm.nome}
                  onChange={(e) => setAnagraficaForm({ ...anagraficaForm, nome: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cognome</label>
                <input type="text" value={anagraficaForm.cognome}
                  onChange={(e) => setAnagraficaForm({ ...anagraficaForm, cognome: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={anagraficaForm.email}
                onChange={(e) => setAnagraficaForm({ ...anagraficaForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
                <input type="tel" value={anagraficaForm.telefono}
                  onChange={(e) => setAnagraficaForm({ ...anagraficaForm, telefono: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Codice Cliente</label>
                <input type="text" value={anagraficaForm.codiceCliente}
                  onChange={(e) => setAnagraficaForm({ ...anagraficaForm, codiceCliente: e.target.value })}
                  placeholder="Es. CLI-001"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numero Licenza</label>
                <input type="text" value={anagraficaForm.numeroLicenza}
                  onChange={(e) => setAnagraficaForm({ ...anagraficaForm, numeroLicenza: e.target.value })}
                  placeholder="Es. 42"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comune di Rilascio</label>
                <input type="text" value={anagraficaForm.comuneRilascioLicenza}
                  onChange={(e) => setAnagraficaForm({ ...anagraficaForm, comuneRilascioLicenza: e.target.value })}
                  placeholder="Es. Milano"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Codice Fiscale</label>
                <input type="text" value={anagraficaForm.codiceFiscale}
                  onChange={(e) => setAnagraficaForm({ ...anagraficaForm, codiceFiscale: e.target.value.toUpperCase() })}
                  placeholder="RSSMRA80A01H501U"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Partita IVA</label>
                <input type="text" value={anagraficaForm.partitaIva}
                  onChange={(e) => setAnagraficaForm({ ...anagraficaForm, partitaIva: e.target.value })}
                  placeholder="12345678901"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono" />
              </div>
            </div>
            <button type="submit" disabled={savingAnagrafica}
              className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2">
              <Save className="w-4 h-4" />{savingAnagrafica ? 'Salvataggio...' : 'Salva Anagrafica'}
            </button>
          </form>

          {/* Stato Cliente */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-gray-800">Stato Cliente</h3>
                {cliente?.statoCliente && (() => {
                  const cfg = STATO_CONFIG[cliente.statoCliente] || STATO_CONFIG.attivo
                  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                })()}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowStoricoStato(s => !s); if (!storicoStato) fetchStoricoStato() }}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                  <History className="w-3.5 h-3.5" /> Storico
                </button>
                <button
                  onClick={() => setShowStatoForm(s => !s)}
                  className="text-xs text-primary hover:underline">
                  {showStatoForm ? 'Annulla' : 'Modifica stato'}
                </button>
              </div>
            </div>

            {showStatoForm && (
              <form onSubmit={handleCambiaStato} className="border border-gray-100 rounded-lg p-4 space-y-3 bg-gray-50">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nuovo stato *</label>
                    <select value={statoForm.stato} required
                      onChange={e => setStatoForm({ ...statoForm, stato: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary">
                      <option value="">Seleziona...</option>
                      <option value="attivo">Attivo</option>
                      <option value="sospeso">Sospeso</option>
                      <option value="cessato">Cessato</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Data variazione</label>
                    <input type="date" value={statoForm.dataVariazione}
                      onChange={e => setStatoForm({ ...statoForm, dataVariazione: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Motivazione</label>
                  <input type="text" value={statoForm.motivazione} placeholder="Es. Cliente non più attivo"
                    onChange={e => setStatoForm({ ...statoForm, motivazione: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
                <button type="submit" disabled={savingStato}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {savingStato ? 'Salvataggio...' : 'Conferma cambio stato'}
                </button>
              </form>
            )}

            {showStoricoStato && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Storico variazioni</p>
                {storicoStato === null ? (
                  <p className="text-xs text-gray-400">Caricamento...</p>
                ) : storicoStato.length === 0 ? (
                  <p className="text-xs text-gray-400">Nessuna variazione registrata.</p>
                ) : (
                  <div className="space-y-1.5">
                    {storicoStato.map(s => {
                      const cfg = STATO_CONFIG[s.stato] || STATO_CONFIG.attivo
                      return (
                        <div key={s._id} className="flex items-start gap-3 text-xs border-l-2 border-gray-100 pl-3 py-1">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${cfg.cls}`}>{cfg.label}</span>
                          <div>
                            <span className="text-gray-500">{new Date(s.dataVariazione).toLocaleDateString('it-IT')}</span>
                            {s.motivazione && <span className="ml-2 text-gray-400">— {s.motivazione}</span>}
                            {s.cambiatoDa && <span className="ml-2 text-gray-300">da {s.cambiatoDa.nome} {s.cambiatoDa.cognome}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Delega AdE */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" /> Delega Agenzia delle Entrate
              </h3>
              {adeDelega.inDelega && cliente?.ade?.lastSyncAt && (
                <span className="text-xs text-gray-400">
                  Ultimo sync: {new Date(cliente.ade.lastSyncAt).toLocaleDateString('it-IT')}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Attiva questa opzione se il cliente ha conferito la delega al consulente
              per accedere al portale Fatture e Corrispettivi dell'AdE.
            </p>
            <form onSubmit={handleSaveAdeDelega} className="space-y-4">
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium text-gray-700">Cliente in delega AdE</p>
                  <p className="text-xs text-gray-400 mt-0.5">Abilita il download automatico delle sue fatture</p>
                </div>
                <button type="button"
                  onClick={() => setAdeDelega({ ...adeDelega, inDelega: !adeDelega.inDelega })}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    adeDelega.inDelega ? 'bg-blue-600' : 'bg-gray-200'
                  )}>
                  <span className={cn(
                    'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                    adeDelega.inDelega ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>
              {adeDelega.inDelega && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data inizio delega</label>
                  <input type="date" value={adeDelega.delegaDal}
                    onChange={(e) => setAdeDelega({ ...adeDelega, delegaDal: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
                </div>
              )}
              <div className="flex items-center gap-3">
                <button type="submit" disabled={savingAde}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                  <Save className="w-3.5 h-3.5" />{savingAde ? 'Salvataggio...' : 'Salva'}
                </button>
                {adeDelega.inDelega && (
                  <button type="button" onClick={handleSyncCliente} disabled={syncingCliente}
                    className="px-4 py-2 border border-blue-200 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center gap-2">
                    <RefreshCw className={cn('w-3.5 h-3.5', syncingCliente && 'animate-spin')} />
                    {syncingCliente ? 'Avvio...' : 'Sincronizza ora'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal sync AdE */}
      {showSyncModal && (
        <SyncResultModal
          logId={syncLogId}
          onClose={() => { setShowSyncModal(false); setSyncLogId(null) }}
        />
      )}

      {/* Veicolo */}
      {activeTab === 'veicolo' && (
        <div className="space-y-4 max-w-lg">
          {veicoloSuccess && (
            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm font-medium">
              <CheckCircle className="w-4 h-4 shrink-0" /> {veicoloSuccess}
            </div>
          )}
          {veicoloLoading ? (
            <div className="py-8 text-center text-gray-400 text-sm">Caricamento...</div>
          ) : (
            <>
              {/* Veicolo attivo */}
              {veicoloAttivo && !editingVeicolo && !nuovoVeicolo && (
                <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      <Car className="w-4 h-4 text-primary" /> Veicolo Attuale
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Attivo</span>
                    </h3>
                    <button onClick={() => { setVeicoloForm({ ...veicoloAttivo, annoImmatricolazione: veicoloAttivo.annoImmatricolazione || '', dataInizioUso: veicoloAttivo.dataInizioUso ? veicoloAttivo.dataInizioUso.slice(0,10) : '' }); setEditingVeicolo(true) }}
                      className="text-xs text-primary hover:underline">Modifica</button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    {[
                      { label: 'Targa',         value: veicoloAttivo.targa },
                      { label: 'Marca',         value: veicoloAttivo.marca },
                      { label: 'Modello',       value: veicoloAttivo.modello },
                      { label: 'Anno imm.',     value: veicoloAttivo.annoImmatricolazione },
                      { label: 'Alimentazione', value: ALIMENTAZIONI_V.find(a => a.value === veicoloAttivo.alimentazione)?.label },
                      { label: 'Colore',        value: veicoloAttivo.colore || '—' },
                    ].map(r => (
                      <div key={r.label}>
                        <p className="text-xs text-gray-400">{r.label}</p>
                        <p className="font-medium text-gray-800">{r.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                  {!showStoricizza ? (
                    <button onClick={() => setShowStoricizza(true)}
                      className="flex items-center gap-2 px-4 py-2 border border-orange-200 text-orange-600 bg-orange-50 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors">
                      <Archive className="w-4 h-4" /> Storicizza (Vendita / Permuta)
                    </button>
                  ) : (
                    <form onSubmit={handleStoricizzaConsulente} className="border border-orange-200 rounded-lg p-4 space-y-3 bg-orange-50">
                      <p className="text-sm font-medium text-orange-700 flex items-center gap-2"><Archive className="w-4 h-4" /> Storicizza Veicolo</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Data fine utilizzo *</label>
                          <input type="date" required value={storicizzaForm.data}
                            onChange={e => setStoricizzaForm({ ...storicizzaForm, data: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Motivo</label>
                          <select value={storicizzaForm.motivo} onChange={e => setStoricizzaForm({ ...storicizzaForm, motivo: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none">
                            {MOTIVI_FINE_USO_V.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={savingVeicolo}
                          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
                          {savingVeicolo ? 'Archiviazione...' : 'Conferma'}
                        </button>
                        <button type="button" onClick={() => setShowStoricizza(false)}
                          className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Annulla</button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Nessun veicolo */}
              {!veicoloAttivo && !nuovoVeicolo && !editingVeicolo && (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
                  <Car className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                  <p className="text-sm text-gray-500 mb-4">Nessun veicolo registrato</p>
                  <button onClick={() => { setVeicoloForm(VUOTO_V); setNuovoVeicolo(true) }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 mx-auto">
                    <Plus className="w-4 h-4" /> Aggiungi Veicolo
                  </button>
                </div>
              )}

              {/* Form nuovo / modifica */}
              {(nuovoVeicolo || editingVeicolo) && (
                <form onSubmit={handleSaveVeicoloConsulente} className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
                  <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Car className="w-4 h-4 text-primary" />{editingVeicolo ? 'Modifica Veicolo' : 'Nuovo Veicolo'}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Targa *</label>
                      <input required type="text" value={veicoloForm.targa}
                        onChange={e => setVeicoloForm({ ...veicoloForm, targa: e.target.value.toUpperCase() })}
                        placeholder="AB123CD"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Alimentazione</label>
                      <select value={veicoloForm.alimentazione} onChange={e => setVeicoloForm({ ...veicoloForm, alimentazione: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                        {ALIMENTAZIONI_V.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Marca *</label>
                      <input required type="text" value={veicoloForm.marca}
                        onChange={e => setVeicoloForm({ ...veicoloForm, marca: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Modello *</label>
                      <input required type="text" value={veicoloForm.modello}
                        onChange={e => setVeicoloForm({ ...veicoloForm, modello: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Anno imm.</label>
                      <input type="number" min="1950" max={new Date().getFullYear()+1} value={veicoloForm.annoImmatricolazione}
                        onChange={e => setVeicoloForm({ ...veicoloForm, annoImmatricolazione: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Colore</label>
                      <input type="text" value={veicoloForm.colore}
                        onChange={e => setVeicoloForm({ ...veicoloForm, colore: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">In uso dal</label>
                      <input type="date" value={veicoloForm.dataInizioUso}
                        onChange={e => setVeicoloForm({ ...veicoloForm, dataInizioUso: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                    <input type="text" value={veicoloForm.note}
                      onChange={e => setVeicoloForm({ ...veicoloForm, note: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingVeicolo}
                      className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                      <Save className="w-4 h-4" />{savingVeicolo ? 'Salvataggio...' : 'Salva'}
                    </button>
                    <button type="button" onClick={() => { setEditingVeicolo(false); setNuovoVeicolo(false) }}
                      className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Annulla</button>
                  </div>
                </form>
              )}

              {/* Storico */}
              {(veicoli || []).filter(v => !v.attivo).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
                    <History className="w-4 h-4 text-gray-400" />
                    <h3 className="font-semibold text-gray-800 text-sm">Storico Veicoli</h3>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {(veicoli || []).filter(v => !v.attivo).map(v => (
                      <li key={v._id} className="px-5 py-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-700">
                            {v.marca} {v.modello}
                            <span className="ml-2 font-mono text-xs text-gray-400">{v.targa}</span>
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {ALIMENTAZIONI_V.find(a => a.value === v.alimentazione)?.label}
                            {v.annoImmatricolazione ? ` · ${v.annoImmatricolazione}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {v.dataFineUso && (
                            <p className="text-xs text-gray-400">Fine: <span className="font-medium">{new Date(v.dataFineUso).toLocaleDateString('it-IT')}</span></p>
                          )}
                          {v.motivoFineUso && (
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                              {MOTIVI_FINE_USO_V.find(m => m.value === v.motivoFineUso)?.label || v.motivoFineUso}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Corrispettivi */}
      {activeTab === 'corrispettivi' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700">Corrispettivi {anno}</span>
            <div className="flex items-center gap-2">
              {cliente?.apiCube?.enabled && (
                <button onClick={() => setShowTrasmissioneModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors">
                  <Send className="w-3.5 h-3.5" /> Scontrino Smart
                </button>
              )}
              <button onClick={() => setShowImportCorrispettivi(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors">
                <Upload className="w-3.5 h-3.5" /> Importa Registro
              </button>
              <button onClick={() => { setEditingCorrispettivo(null); setShowCorrispettivoForm(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Nuovo
              </button>
            </div>
          </div>
          {tabLoading && !corrispettivi ? (
            <div className="py-12 flex justify-center"><LoadingSpinner /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Importo</th>
                    <th className="px-4 py-3 font-medium">Metodo</th>
                    <th className="px-4 py-3 font-medium">Note</th>
                    <th className="px-4 py-3 text-right font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(corrispettivi || []).map((c) => (
                    <tr key={c._id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">{formatData(c.data)}</td>
                      <td className="px-4 py-3 font-semibold text-green-600">{formatEuro(c.importo)}</td>
                      <td className="px-4 py-3">{METODI_PAGAMENTO[c.metodoPagamento] || c.metodoPagamento}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">{c.note || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditingCorrispettivo(c); setShowCorrispettivoForm(true) }}
                            className="p-1.5 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget({ type: 'corrispettivo', item: c })}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!corrispettivi || corrispettivi.length === 0) && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Nessun corrispettivo</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {/* Export registro */}
          <div className="border-t border-gray-50">
            <button
              onClick={() => setShowExport(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-1.5"><Download className="w-3.5 h-3.5 text-primary" /> Scarica Registro Corrispettivi</span>
              <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', showExport && 'rotate-180')} />
            </button>
            {showExport && (
              <div className="px-4 pb-4 space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <select
                    value={exportMese}
                    onChange={(e) => setExportMese(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Anno {anno} (completo)</option>
                    {MESI_EXPORT.map((m, i) => <option key={i} value={i + 1}>{m} {anno}</option>)}
                  </select>
                  <button onClick={handleExportExcel} disabled={exporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
                    <FileSpreadsheet className="w-3.5 h-3.5" />{exporting ? 'Export...' : 'Excel'}
                  </button>
                  <button onClick={handleExportPDF}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700">
                    <FileText className="w-3.5 h-3.5" /> PDF / Stampa
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Costi */}
      {activeTab === 'costi' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700">Costi {anno}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowImportCosti(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors">
                <Upload className="w-3.5 h-3.5" /> Importa Registro IVA
              </button>
              <button onClick={() => { setEditingCosto(null); setShowCostoForm(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Nuovo
              </button>
            </div>
          </div>
          {tabLoading && !costi ? (
            <div className="py-12 flex justify-center"><LoadingSpinner /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                {/* Input nascosto per upload giustificativo */}
                <input type="file" ref={giustInputRef} className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
                  onChange={handleUploadGiustificativo} />

                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 font-medium">Descrizione</th>
                    <th className="px-4 py-3 font-medium">Importo</th>
                    <th className="px-4 py-3 font-medium">Stato</th>
                    <th className="px-4 py-3 text-center font-medium">Scontrino</th>
                    <th className="px-4 py-3 text-right font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(costi || []).map((c) => (
                    <tr key={c._id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">{formatData(c.data)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORIE_COSTI[c.categoria]?.color }} />
                          {CATEGORIE_COSTI[c.categoria]?.label || c.categoria}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[160px] truncate">{c.descrizione || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">{formatEuro(c.importo)}</td>
                      <td className="px-4 py-3 text-xs">{c.statoApprovazione || (c.approvato ? 'approvato' : 'in_attesa')}</td>
                      <td className="px-4 py-3 text-center">
                        {uploadingGiust === c._id ? (
                          <span className="text-[11px] text-gray-400">Carico...</span>
                        ) : c.giustificativo?.nome ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleDownloadGiustificativo(c)} title={c.giustificativo.nome}
                              className="p-1 text-green-600 hover:text-green-700 rounded hover:bg-green-50 transition-colors">
                              <Paperclip className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteGiustificativo(c._id)}
                              className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
                              <XIcon className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setGiustTargetId(c._id); giustInputRef.current?.click() }}
                            title="Allega scontrino"
                            className="p-1 text-gray-300 hover:text-primary rounded hover:bg-primary/5 transition-colors">
                            <Paperclip className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditingCosto(c); setShowCostoForm(true) }}
                            className="p-1.5 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget({ type: 'costo', item: c })}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!costi || costi.length === 0) && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Nessun costo</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Fatture */}
      {activeTab === 'fatture' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {tabLoading && !fatture ? (
            <div className="py-12 flex justify-center"><LoadingSpinner /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">N°</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Importo</th>
                    <th className="px-4 py-3 font-medium">Stato SDI</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(fatture || []).map((f) => (
                    <tr key={f._id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono text-xs">{f.numero}</td>
                      <td className="px-4 py-3">{formatData(f.data)}</td>
                      <td className="px-4 py-3">{f.cliente?.denominazione || '—'}</td>
                      <td className="px-4 py-3 font-semibold">{formatEuro(f.importoNetto)}</td>
                      <td className="px-4 py-3"><StatusBadge status={f.statoSdi} type="sdi" /></td>
                      <td className="px-4 py-3">
                        {f.statoSdi === 'bozza' && !f.sdi?.trasmessa && (
                          <button
                            onClick={() => handleTrasmettiFattura(f._id)}
                            disabled={trasmettendoFattura === f._id}
                            title="Trasmetti al SDI"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
                          >
                            {trasmettendoFattura === f._id
                              ? <RefreshCw className="w-3 h-3 animate-spin" />
                              : <Send className="w-3 h-3" />}
                            Trasmetti
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!fatture || fatture.length === 0) && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Nessuna fattura</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Versamenti */}
      {activeTab === 'versamenti' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700">Versamenti fiscali {anno}</span>
            <button onClick={() => { setEditingVersamento(null); setShowVersamentoForm(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Nuovo versamento
            </button>
          </div>
          {tabLoading && !versamenti ? (
            <div className="py-12 flex justify-center"><LoadingSpinner /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Scadenza</th>
                    <th className="px-4 py-3 font-medium">Importo</th>
                    <th className="px-4 py-3 font-medium">Stato</th>
                    <th className="px-4 py-3 text-right font-medium">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(versamenti || []).map((v) => (
                    <tr key={v._id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">{TIPI_VERSAMENTO[v.tipoVersamento] || v.tipoVersamento}</td>
                      <td className="px-4 py-3">{formatData(v.dataScadenza)}</td>
                      <td className="px-4 py-3 font-semibold">{formatEuro(v.importo)}</td>
                      <td className="px-4 py-3">
                        {v.pagato ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Pagato {v.dataVersamento ? formatData(v.dataVersamento) : ''}
                          </span>
                        ) : (
                          <span className="text-amber-600 text-xs font-medium">Da pagare</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditingVersamento(v); setShowVersamentoForm(true) }}
                            className="p-1.5 text-gray-400 hover:text-primary rounded-lg hover:bg-primary/5 transition-colors">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget({ type: 'versamento', item: v })}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!versamenti || versamenti.length === 0) && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Nessun versamento</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Documenti */}
      {activeTab === 'documenti' && (
        <div className="space-y-5 max-w-2xl">

          {/* Upload */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              <Upload className="w-4 h-4 text-primary" /> Carica Documento per {cliente?.nome} {cliente?.cognome}
            </h3>
            <p className="text-xs text-gray-500">Formati: JPG, PNG, WEBP, PDF · Max 5 MB</p>
            <form onSubmit={handleUploadDoc} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tipo Documento *</label>
                <select value={docTipo} onChange={(e) => setDocTipo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                  {TIPI_DOC.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div
                className="border-2 border-dashed border-gray-200 rounded-lg p-5 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-7 h-7 text-gray-300 mx-auto mb-1" />
                {docFile
                  ? <p className="text-sm font-medium text-primary">{docFile.name} ({fmtBytes(docFile.size)})</p>
                  : <p className="text-xs text-gray-400">Clicca per selezionare il file</p>
                }
                <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handleDocFileChange} />
              </div>
              <input type="text" value={docNote} onChange={(e) => setDocNote(e.target.value)}
                placeholder="Note (opzionale, es. scadenza)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              {docError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-2 rounded-lg text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {docError}
                </div>
              )}
              <button type="submit" disabled={docUploading || !docFile}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                <Upload className="w-4 h-4" />{docUploading ? 'Caricamento...' : 'Carica'}
              </button>
            </form>
          </div>

          {/* Lista */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-primary" /> Documenti Caricati
              </h3>
            </div>
            {documenti === null ? (
              <div className="p-8 text-center text-xs text-gray-400">Caricamento...</div>
            ) : documenti.length === 0 ? (
              <div className="p-8 text-center">
                <FolderOpen className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                <p className="text-sm text-gray-400">Nessun documento caricato</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {documenti.map((doc) => (
                  <li key={doc._id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {doc.mimeType?.startsWith('image/') ? <Image className="w-3.5 h-3.5 text-primary" /> : <FileText className="w-3.5 h-3.5 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{TIPO_DOC_LABEL[doc.tipo] || doc.tipo}</p>
                      <p className="text-xs text-gray-400 truncate">{doc.originalName} · {fmtBytes(doc.size)}{doc.note ? ` · ${doc.note}` : ''}</p>
                      <p className="text-xs text-gray-300">{new Date(doc.createdAt).toLocaleDateString('it-IT')}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleDownloadDoc(doc)} title="Scarica"
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteDoc(doc._id)} title="Elimina"
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCostoForm && (
        <CostoFormModal
          clienteId={id}
          costo={editingCosto}
          onClose={() => setShowCostoForm(false)}
          onSaved={() => reloadTab('costi')}
        />
      )}

      {showImportCosti && (
        <ImportRegistroIvaModal
          clienteId={id} anno={anno}
          onClose={() => setShowImportCosti(false)}
          onSuccess={() => { setShowImportCosti(false); reloadTab('costi') }}
        />
      )}

      {showImportCorrispettivi && (
        <ImportCorrispettiviModal
          clienteId={id}
          onClose={() => setShowImportCorrispettivi(false)}
          onSuccess={() => { setShowImportCorrispettivi(false); reloadTab('corrispettivi') }}
        />
      )}

      {showCorrispettivoForm && (
        <CorrispettivoFormModal
          clienteId={id}
          corrispettivo={editingCorrispettivo}
          onClose={() => setShowCorrispettivoForm(false)}
          onSaved={() => reloadTab('corrispettivi')}
        />
      )}

      {showVersamentoForm && (
        <VersamentoFormModal
          clienteId={id}
          versamento={editingVersamento}
          onClose={() => setShowVersamentoForm(false)}
          onSaved={() => reloadTab('versamenti')}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Elimina ${deleteTarget?.type === 'corrispettivo' ? 'Corrispettivo' : deleteTarget?.type === 'costo' ? 'Costo' : 'Versamento'}`}
        message="Sei sicuro di voler eliminare questo record? L'azione non può essere annullata."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />

      {showTrasmissioneModal && (
        <ScontrinoSmartModal
          clienteId={id}
          onClose={() => setShowTrasmissioneModal(false)}
        />
      )}
    </div>
  )
}
