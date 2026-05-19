import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import axios from 'axios'
import {
  Plus,
  Upload,
  Search,
  Trash2,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  FileWarning,
  Layers3
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_PREFIX = `${API_URL}/api/v1`

type AssetType = 'substation' | 'feeder' | 'transformer' | 'customer_cluster'

const parseFiniteFloat = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseFiniteInt = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const endpointFor = (type: AssetType) => {
  if (type === 'customer_cluster') return `${API_PREFIX}/assets/customer-clusters`
  return `${API_PREFIX}/assets/${type}s`
}

export default function AssetRegistry() {
  const { substations, feeders, transformers, customerClusters, fetchGridData, user } = useStore()

  const [activeTab, setActiveTab] = useState<AssetType>('transformer')
  const [searchQuery, setSearchQuery] = useState('')

  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importAssetType, setImportAssetType] = useState<'substation' | 'transformer'>('transformer')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<any | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createType, setCreateType] = useState<AssetType>('transformer')
  const [batchQueue, setBatchQueue] = useState<Array<{ type: AssetType; label: string; payload: any }>>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [substationForm, setSubstationForm] = useState({
    code: '',
    name: '',
    voltage_level: '33/11kV',
    capacity_mva: 15,
    latitude: 9.02,
    longitude: 7.48,
    district: 'Abuja South',
    status: 'operational'
  })

  const [feederForm, setFeederForm] = useState({
    code: '',
    name: '',
    voltage_level: '11kV',
    source_substation_id: substations[0]?.id || 1,
    rated_capacity_mw: 8,
    peak_load_mw: 4,
    start_latitude: 9.02,
    start_longitude: 7.48,
    end_latitude: 9.03,
    end_longitude: 7.49,
    status: 'operational'
  })

  const [transformerForm, setTransformerForm] = useState({
    code: '',
    name: '',
    rating_kva: 300,
    feeder_id: feeders[0]?.id || 1,
    latitude: 9.02,
    longitude: 7.48,
    customer_count: 50,
    peak_load_kva: 150,
    installation_year: new Date().getFullYear(),
    status: 'operational'
  })

  const [clusterForm, setClusterForm] = useState({
    name: '',
    transformer_id: transformers[0]?.id || 1,
    customer_count: 40,
    estimated_demand_kw: 25,
    r2_mix: 65,
    c1_mix: 25,
    d1_mix: 10
  })

  useEffect(() => {
    if (substations[0]?.id && !substations.some((s) => s.id === feederForm.source_substation_id)) {
      setFeederForm((current) => ({ ...current, source_substation_id: substations[0].id }))
    }
    if (feeders[0]?.id && !feeders.some((f) => f.id === transformerForm.feeder_id)) {
      setTransformerForm((current) => ({ ...current, feeder_id: feeders[0].id }))
    }
    if (transformers[0]?.id && !transformers.some((t) => t.id === clusterForm.transformer_id)) {
      setClusterForm((current) => ({ ...current, transformer_id: transformers[0].id }))
    }
  }, [substations, feeders, transformers, feederForm.source_substation_id, transformerForm.feeder_id, clusterForm.transformer_id])

  const canEdit = user?.role === 'SYSTEM_ADMIN' || user?.role === 'PLANNING_ENGINEER'
  const query = searchQuery.toLowerCase()

  const filteredSubs = substations.filter((s) => s.name.toLowerCase().includes(query) || s.code.toLowerCase().includes(query))
  const filteredFeeders = feeders.filter((f) => f.name.toLowerCase().includes(query) || f.code.toLowerCase().includes(query))
  const filteredTxs = transformers.filter((t) => t.name.toLowerCase().includes(query) || t.code.toLowerCase().includes(query))
  const filteredClusters = customerClusters.filter((c) => c.name.toLowerCase().includes(query))

  const batchSummary = useMemo(() => {
    const counts = batchQueue.reduce<Record<AssetType, number>>((acc, item) => {
      acc[item.type] += 1
      return acc
    }, { substation: 0, feeder: 0, transformer: 0, customer_cluster: 0 })
    return counts
  }, [batchQueue])

  const resetForm = (type: AssetType) => {
    if (type === 'substation') {
      setSubstationForm((current) => ({ ...current, code: '', name: '' }))
    } else if (type === 'feeder') {
      setFeederForm((current) => ({ ...current, code: '', name: '' }))
    } else if (type === 'transformer') {
      setTransformerForm((current) => ({ ...current, code: '', name: '' }))
    } else {
      setClusterForm((current) => ({ ...current, name: '' }))
    }
  }

  const currentPayload = () => {
    if (createType === 'substation') {
      return {
        ...substationForm,
        code: substationForm.code.trim(),
        name: substationForm.name.trim(),
        district: substationForm.district.trim() || null
      }
    }

    if (createType === 'feeder') {
      return {
        code: feederForm.code.trim(),
        name: feederForm.name.trim(),
        voltage_level: feederForm.voltage_level,
        source_substation_id: feederForm.source_substation_id,
        peak_load_mw: feederForm.peak_load_mw,
        rated_capacity_mw: feederForm.rated_capacity_mw,
        status: feederForm.status,
        route_coordinates: [
          [feederForm.start_longitude, feederForm.start_latitude],
          [feederForm.end_longitude, feederForm.end_latitude]
        ]
      }
    }

    if (createType === 'transformer') {
      const loading = transformerForm.rating_kva > 0 ? (transformerForm.peak_load_kva / transformerForm.rating_kva) * 100 : 0
      return {
        ...transformerForm,
        code: transformerForm.code.trim(),
        name: transformerForm.name.trim(),
        loading_percentage: Number(loading.toFixed(1)),
        status: loading > 100 ? 'overloaded' : transformerForm.status
      }
    }

    return {
      transformer_id: clusterForm.transformer_id,
      name: clusterForm.name.trim(),
      customer_count: clusterForm.customer_count,
      estimated_demand_kw: clusterForm.estimated_demand_kw,
      tariff_mix: {
        R2: clusterForm.r2_mix,
        C1: clusterForm.c1_mix,
        D1: clusterForm.d1_mix
      }
    }
  }

  const currentLabel = () => {
    if (createType === 'customer_cluster') return clusterForm.name.trim() || 'New customer cluster'
    const payload = currentPayload()
    return `${payload.code || 'NEW'} - ${payload.name || 'Unnamed asset'}`
  }

  const validateCurrent = () => {
    const payload = currentPayload()
    if ('code' in payload && !payload.code) return 'Asset code is required.'
    if (!payload.name) return 'Asset name is required.'
    if (createType === 'feeder' && substations.length === 0) return 'Create a source substation before registering feeders.'
    if (createType === 'transformer' && feeders.length === 0) return 'Create a feeder before registering transformers.'
    if (createType === 'customer_cluster' && transformers.length === 0) return 'Create a transformer before registering customer clusters.'
    return null
  }

  const savePayload = async (type: AssetType, payload: any) => {
    await axios.post(endpointFor(type), payload)
  }

  const handleSaveCurrent = async (keepOpen: boolean) => {
    const validationError = validateCurrent()
    if (validationError) {
      setSaveMessage(validationError)
      return
    }

    setIsSaving(true)
    setSaveMessage(null)
    try {
      await savePayload(createType, currentPayload())
      await fetchGridData()
      resetForm(createType)
      setSaveMessage('Asset registered successfully.')
      if (!keepOpen) setIsCreateOpen(false)
    } catch (err: any) {
      setSaveMessage(err.response?.data?.detail || 'Asset registration failed.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddToBatch = () => {
    const validationError = validateCurrent()
    if (validationError) {
      setSaveMessage(validationError)
      return
    }

    setBatchQueue((current) => [...current, { type: createType, label: currentLabel(), payload: currentPayload() }])
    resetForm(createType)
    setSaveMessage('Asset staged for batch registration.')
  }

  const handleSubmitBatch = async () => {
    if (batchQueue.length === 0) return

    setIsSaving(true)
    setSaveMessage(null)
    const errors: string[] = []
    for (const item of batchQueue) {
      try {
        await savePayload(item.type, item.payload)
      } catch (err: any) {
        errors.push(`${item.label}: ${err.response?.data?.detail || 'failed'}`)
      }
    }

    await fetchGridData()
    setIsSaving(false)
    if (errors.length > 0) {
      setSaveMessage(`${batchQueue.length - errors.length} registered, ${errors.length} failed. ${errors[0]}`)
      setBatchQueue((current) => current.filter((item) => errors.some((err) => err.startsWith(item.label))))
    } else {
      setBatchQueue([])
      setSaveMessage('Batch registration completed.')
      setIsCreateOpen(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0])
      setImportResult(null)
    }
  }

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) return

    setIsUploading(true)
    setImportResult(null)

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const response = await axios.post(
        `${API_PREFIX}/assets/import/csv?asset_type=${importAssetType}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      setImportResult(response.data)
      fetchGridData()
    } catch (err: any) {
      setImportResult({
        status: 'error',
        error: err.response?.data?.detail || 'CSV Upload failed'
      })
    } finally {
      setIsUploading(false)
    }
  }

  const renderAssetTypeTabs = (compact = false) => (
    <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 overflow-x-auto">
      {[
        ['substation', `Substations${compact ? '' : ` (${substations.length})`}`],
        ['feeder', `Feeders${compact ? '' : ` (${feeders.length})`}`],
        ['transformer', `Transformers${compact ? '' : ` (${transformers.length})`}`],
        ['customer_cluster', `Load Clusters${compact ? '' : ` (${customerClusters.length})`}`]
      ].map(([type, label]) => (
        <button
          key={type}
          type="button"
          onClick={() => compact ? setCreateType(type as AssetType) : setActiveTab(type as AssetType)}
          className={`whitespace-nowrap text-xs font-semibold py-2 px-4 rounded-md cursor-pointer transition ${
            (compact ? createType : activeTab) === type ? 'bg-zinc-900 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 p-8 text-zinc-300">
      <div className="flex justify-between items-start mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">AEDC Asset Registry</h2>
          <p className="text-zinc-500 text-sm">Register and maintain substations, feeder lines, distribution transformers, and load clusters.</p>
        </div>
        {canEdit && (
          <div className="flex gap-3">
            <button
              onClick={() => setIsImportOpen(true)}
              className="bg-zinc-850 hover:bg-zinc-850 border border-zinc-700/60 hover:border-zinc-700 text-white font-bold text-xs py-2.5 px-4 rounded-lg flex items-center gap-2 cursor-pointer transition"
            >
              <Upload className="w-4 h-4" />
              Ingest CSV
            </button>
            <button
              onClick={() => { setCreateType(activeTab); setSaveMessage(null); setIsCreateOpen(true) }}
              className="bg-green-500 hover:bg-green-600 text-zinc-950 font-bold text-xs py-2.5 px-4 rounded-lg flex items-center gap-2 cursor-pointer transition shadow-md shadow-green-500/10"
            >
              <Plus className="w-4 h-4" />
              Register Asset
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
        {renderAssetTypeTabs()}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Search by code, name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800/80 rounded-lg py-2 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-zinc-700"
          />
          <Search className="w-4 h-4 text-zinc-600 absolute left-3 top-2.5" />
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === 'substation' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-4 px-6">Code</th>
                  <th className="py-4 px-6">Substation Name</th>
                  <th className="py-4 px-6">Capacity</th>
                  <th className="py-4 px-6">Voltage</th>
                  <th className="py-4 px-6">District</th>
                  <th className="py-4 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubs.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-900 hover:bg-zinc-900/10">
                    <td className="py-4 px-6 font-mono text-white font-semibold">{s.code}</td>
                    <td className="py-4 px-6 text-zinc-300 font-semibold">{s.name}</td>
                    <td className="py-4 px-6 text-zinc-400 font-mono">{s.capacity_mva} MVA</td>
                    <td className="py-4 px-6 text-zinc-400 font-mono">{s.voltage_level}</td>
                    <td className="py-4 px-6 text-zinc-400">{s.district || '-'}</td>
                    <td className="py-4 px-6 text-right"><StatusPill status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'feeder' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-4 px-6">Code</th>
                  <th className="py-4 px-6">Feeder Line</th>
                  <th className="py-4 px-6 text-center">Peak Load</th>
                  <th className="py-4 px-6 text-center">Capacity</th>
                  <th className="py-4 px-6 text-right">Risk</th>
                  <th className="py-4 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeeders.map((f) => (
                  <tr key={f.id} className="border-b border-zinc-900 hover:bg-zinc-900/10">
                    <td className="py-4 px-6 font-mono text-white font-semibold">{f.code}</td>
                    <td className="py-4 px-6 text-zinc-300 font-semibold">{f.name}</td>
                    <td className="py-4 px-6 text-center text-zinc-400 font-mono">{f.peak_load_mw} MW</td>
                    <td className="py-4 px-6 text-center text-zinc-400 font-mono">{f.rated_capacity_mw} MW</td>
                    <td className="py-4 px-6 text-right font-mono font-bold text-orange-400">{f.risk_score}</td>
                    <td className="py-4 px-6 text-right"><StatusPill status={f.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'transformer' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-4 px-6">Code</th>
                  <th className="py-4 px-6">Transformer</th>
                  <th className="py-4 px-6 text-center">Rating</th>
                  <th className="py-4 px-6 text-center">Loading</th>
                  <th className="py-4 px-6 text-center">Customers</th>
                  <th className="py-4 px-6 text-right">Risk</th>
                  <th className="py-4 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxs.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-900 hover:bg-zinc-900/10">
                    <td className="py-4 px-6 font-mono text-white font-semibold">{t.code}</td>
                    <td className="py-4 px-6 text-zinc-300 font-semibold">{t.name}</td>
                    <td className="py-4 px-6 text-center text-zinc-400 font-mono">{t.rating_kva} kVA</td>
                    <td className="py-4 px-6 text-center"><LoadingPill value={t.loading_percentage} /></td>
                    <td className="py-4 px-6 text-center text-zinc-400 font-mono">{t.customer_count}</td>
                    <td className="py-4 px-6 text-right font-mono font-bold text-red-400">{t.risk_score}</td>
                    <td className="py-4 px-6 text-right"><StatusPill status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === 'customer_cluster' && (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-bold uppercase tracking-wider">
                  <th className="py-4 px-6">Cluster</th>
                  <th className="py-4 px-6 text-center">Transformer ID</th>
                  <th className="py-4 px-6 text-center">Customers</th>
                  <th className="py-4 px-6 text-center">Demand</th>
                  <th className="py-4 px-6 text-right">Tariff Mix</th>
                </tr>
              </thead>
              <tbody>
                {filteredClusters.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-900 hover:bg-zinc-900/10">
                    <td className="py-4 px-6 text-zinc-300 font-semibold">{c.name}</td>
                    <td className="py-4 px-6 text-center text-zinc-400 font-mono">{c.transformer_id}</td>
                    <td className="py-4 px-6 text-center text-zinc-400 font-mono">{c.customer_count}</td>
                    <td className="py-4 px-6 text-center text-zinc-400 font-mono">{c.estimated_demand_kw} kW</td>
                    <td className="py-4 px-6 text-right text-zinc-400 font-mono">
                      {c.tariff_mix ? Object.entries(c.tariff_mix).map(([k, v]) => `${k}:${v}`).join(' ') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl p-6 overflow-y-auto max-h-[85vh] text-zinc-300">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-green-500" />
                  Grid CSV Import
                </h3>
                <p className="text-zinc-500 text-xs mt-1">CSV import currently supports substations and transformers.</p>
              </div>
              <button onClick={() => { setIsImportOpen(false); setSelectedFile(null); setImportResult(null) }} className="text-zinc-500 hover:text-zinc-300 text-lg cursor-pointer">&times;</button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div className="flex gap-3">
                {(['transformer', 'substation'] as const).map((type) => (
                  <label key={type} className="flex-1 flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/40 text-xs font-semibold cursor-pointer">
                    <span className="capitalize">{type}s</span>
                    <input type="radio" name="importType" checked={importAssetType === type} onChange={() => setImportAssetType(type)} className="text-green-500 focus:ring-0 w-4 h-4 cursor-pointer" />
                  </label>
                ))}
              </div>

              <div className="border border-dashed border-zinc-850 hover:border-zinc-800 rounded-xl p-6 text-center bg-zinc-900/20 transition">
                <input type="file" accept=".csv" id="csv-file-input" onChange={handleFileChange} className="hidden" />
                <label htmlFor="csv-file-input" className="cursor-pointer block">
                  <Upload className="w-8 h-8 text-zinc-600 mx-auto mb-2.5" />
                  <span className="text-xs font-bold text-white block">{selectedFile ? selectedFile.name : 'Select grid data CSV file'}</span>
                  <span className="text-[10px] text-zinc-500 block mt-1">Accepts UTF-8 formatted CSV spreadsheets</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-900">
                <button type="button" onClick={() => { setIsImportOpen(false); setSelectedFile(null); setImportResult(null) }} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold py-2 px-4 rounded-lg cursor-pointer">Cancel</button>
                <button type="submit" disabled={!selectedFile || isUploading} className="bg-green-500 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-zinc-950 font-bold text-xs py-2 px-4 rounded-lg cursor-pointer transition">
                  {isUploading ? 'Validating...' : 'Validate and Import'}
                </button>
              </div>
            </form>

            {importResult && <ImportResult result={importResult} />}
          </div>
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl shadow-2xl p-6 text-zinc-300 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers3 className="w-5 h-5 text-green-500" />
                  Register Grid Assets
                </h3>
                <p className="text-zinc-500 text-xs mt-1">Create one asset immediately or stage multiple assets and submit them as a batch.</p>
              </div>
              <button onClick={() => setIsCreateOpen(false)} className="text-zinc-500 hover:text-zinc-300 text-lg cursor-pointer">&times;</button>
            </div>

            <div className="mb-5">{renderAssetTypeTabs(true)}</div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                <form className="space-y-4 text-xs" onSubmit={(e) => { e.preventDefault(); handleSaveCurrent(false) }}>
                  {createType === 'substation' && (
                    <SubstationForm form={substationForm} setForm={setSubstationForm} />
                  )}
                  {createType === 'feeder' && (
                    <FeederForm form={feederForm} setForm={setFeederForm} substations={substations} />
                  )}
                  {createType === 'transformer' && (
                    <TransformerForm form={transformerForm} setForm={setTransformerForm} feeders={feeders} />
                  )}
                  {createType === 'customer_cluster' && (
                    <ClusterForm form={clusterForm} setForm={setClusterForm} transformers={transformers} />
                  )}

                  {saveMessage && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-zinc-300">{saveMessage}</div>
                  )}

                  <div className="flex flex-wrap justify-end gap-3 pt-4 border-t border-zinc-900">
                    <button type="button" onClick={() => setIsCreateOpen(false)} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold py-2 px-4 rounded-lg cursor-pointer">Cancel</button>
                    <button type="button" onClick={handleAddToBatch} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold py-2 px-4 rounded-lg cursor-pointer">Stage Asset</button>
                    <button type="button" onClick={() => handleSaveCurrent(true)} disabled={isSaving} className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 text-white font-bold text-xs py-2 px-4 rounded-lg cursor-pointer">Register and Add Another</button>
                    <button type="submit" disabled={isSaving} className="bg-green-500 hover:bg-green-600 disabled:opacity-60 text-zinc-950 font-bold text-xs py-2 px-4 rounded-lg cursor-pointer">Register</button>
                  </div>
                </form>
              </div>

              <div className="lg:col-span-4 bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 h-fit">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-bold text-white">Batch Queue</h4>
                  <span className="text-[10px] text-zinc-500 font-mono">{batchQueue.length} staged</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-500 mb-4">
                  <span>Subs: {batchSummary.substation}</span>
                  <span>Feeders: {batchSummary.feeder}</span>
                  <span>TXs: {batchSummary.transformer}</span>
                  <span>Clusters: {batchSummary.customer_cluster}</span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {batchQueue.map((item, index) => (
                    <div key={`${item.type}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase text-zinc-500 font-bold">{item.type.replace('_', ' ')}</div>
                        <div className="truncate text-xs text-white">{item.label}</div>
                      </div>
                      <button type="button" onClick={() => setBatchQueue((current) => current.filter((_, i) => i !== index))} className="text-zinc-500 hover:text-red-400 cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {batchQueue.length === 0 && <div className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500">No staged assets yet.</div>}
                </div>
                <button type="button" disabled={batchQueue.length === 0 || isSaving} onClick={handleSubmitBatch} className="mt-4 w-full bg-green-500 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold text-xs py-2.5 rounded-lg cursor-pointer">
                  Submit Batch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-zinc-500 block mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputClass = 'w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-white focus:outline-none focus:border-zinc-700'

function SubstationForm({ form, setForm }: { form: any; setForm: React.Dispatch<React.SetStateAction<any>> }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Substation Code *"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} placeholder="GK2_IS_02" /></Field>
        <Field label="Substation Name *"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Garki Injection Substation" /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Voltage Level"><input value={form.voltage_level} onChange={(e) => setForm({ ...form, voltage_level: e.target.value })} className={inputClass} /></Field>
        <Field label="Capacity (MVA)"><input type="number" min="0.1" step="0.1" value={form.capacity_mva} onChange={(e) => setForm({ ...form, capacity_mva: parseFiniteFloat(e.target.value, form.capacity_mva) })} className={inputClass} /></Field>
        <Field label="Status"><StatusSelect value={form.status} onChange={(status) => setForm({ ...form, status })} /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Latitude"><input type="number" step="0.000001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: parseFiniteFloat(e.target.value, form.latitude) })} className={inputClass} /></Field>
        <Field label="Longitude"><input type="number" step="0.000001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: parseFiniteFloat(e.target.value, form.longitude) })} className={inputClass} /></Field>
        <Field label="District"><input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className={inputClass} /></Field>
      </div>
    </>
  )
}

function FeederForm({ form, setForm, substations }: { form: any; setForm: React.Dispatch<React.SetStateAction<any>>; substations: any[] }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Feeder Code *"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} placeholder="GK2_F06" /></Field>
        <Field label="Feeder Name *"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Area 10 Relief Feeder" /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Source Substation"><select value={form.source_substation_id} onChange={(e) => setForm({ ...form, source_substation_id: parseFiniteInt(e.target.value, form.source_substation_id) })} className={inputClass}>{substations.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}</select></Field>
        <Field label="Voltage"><input value={form.voltage_level} onChange={(e) => setForm({ ...form, voltage_level: e.target.value })} className={inputClass} /></Field>
        <Field label="Peak Load (MW)"><input type="number" step="0.1" value={form.peak_load_mw} onChange={(e) => setForm({ ...form, peak_load_mw: parseFiniteFloat(e.target.value, form.peak_load_mw) })} className={inputClass} /></Field>
        <Field label="Capacity (MW)"><input type="number" step="0.1" value={form.rated_capacity_mw} onChange={(e) => setForm({ ...form, rated_capacity_mw: parseFiniteFloat(e.target.value, form.rated_capacity_mw) })} className={inputClass} /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Start Lat"><input type="number" step="0.000001" value={form.start_latitude} onChange={(e) => setForm({ ...form, start_latitude: parseFiniteFloat(e.target.value, form.start_latitude) })} className={inputClass} /></Field>
        <Field label="Start Lon"><input type="number" step="0.000001" value={form.start_longitude} onChange={(e) => setForm({ ...form, start_longitude: parseFiniteFloat(e.target.value, form.start_longitude) })} className={inputClass} /></Field>
        <Field label="End Lat"><input type="number" step="0.000001" value={form.end_latitude} onChange={(e) => setForm({ ...form, end_latitude: parseFiniteFloat(e.target.value, form.end_latitude) })} className={inputClass} /></Field>
        <Field label="End Lon"><input type="number" step="0.000001" value={form.end_longitude} onChange={(e) => setForm({ ...form, end_longitude: parseFiniteFloat(e.target.value, form.end_longitude) })} className={inputClass} /></Field>
      </div>
    </>
  )
}

function TransformerForm({ form, setForm, feeders }: { form: any; setForm: React.Dispatch<React.SetStateAction<any>>; feeders: any[] }) {
  const loading = form.rating_kva > 0 ? ((form.peak_load_kva / form.rating_kva) * 100).toFixed(1) : '0.0'
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Transformer Code *"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} placeholder="GK2-TX-151" /></Field>
        <Field label="Transformer Name *"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Transformer #151" /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Feeder"><select value={form.feeder_id} onChange={(e) => setForm({ ...form, feeder_id: parseFiniteInt(e.target.value, form.feeder_id) })} className={inputClass}>{feeders.map((f) => <option key={f.id} value={f.id}>{f.code} - {f.name}</option>)}</select></Field>
        <Field label="Rating (kVA)"><input type="number" value={form.rating_kva} onChange={(e) => setForm({ ...form, rating_kva: parseFiniteFloat(e.target.value, form.rating_kva) })} className={inputClass} /></Field>
        <Field label="Peak Load (kVA)"><input type="number" value={form.peak_load_kva} onChange={(e) => setForm({ ...form, peak_load_kva: parseFiniteFloat(e.target.value, form.peak_load_kva) })} className={inputClass} /></Field>
        <Field label="Loading"><div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-white font-mono">{loading}%</div></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Latitude"><input type="number" step="0.000001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: parseFiniteFloat(e.target.value, form.latitude) })} className={inputClass} /></Field>
        <Field label="Longitude"><input type="number" step="0.000001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: parseFiniteFloat(e.target.value, form.longitude) })} className={inputClass} /></Field>
        <Field label="Customers"><input type="number" value={form.customer_count} onChange={(e) => setForm({ ...form, customer_count: parseFiniteInt(e.target.value, form.customer_count) })} className={inputClass} /></Field>
        <Field label="Install Year"><input type="number" value={form.installation_year} onChange={(e) => setForm({ ...form, installation_year: parseFiniteInt(e.target.value, form.installation_year) })} className={inputClass} /></Field>
      </div>
    </>
  )
}

function ClusterForm({ form, setForm, transformers }: { form: any; setForm: React.Dispatch<React.SetStateAction<any>>; transformers: any[] }) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Cluster Name *"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Cluster GK2-CC-301" /></Field>
        <Field label="Transformer"><select value={form.transformer_id} onChange={(e) => setForm({ ...form, transformer_id: parseFiniteInt(e.target.value, form.transformer_id) })} className={inputClass}>{transformers.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <Field label="Customers"><input type="number" value={form.customer_count} onChange={(e) => setForm({ ...form, customer_count: parseFiniteInt(e.target.value, form.customer_count) })} className={inputClass} /></Field>
        <Field label="Demand (kW)"><input type="number" step="0.1" value={form.estimated_demand_kw} onChange={(e) => setForm({ ...form, estimated_demand_kw: parseFiniteFloat(e.target.value, form.estimated_demand_kw) })} className={inputClass} /></Field>
        <Field label="R2 Mix %"><input type="number" value={form.r2_mix} onChange={(e) => setForm({ ...form, r2_mix: parseFiniteFloat(e.target.value, form.r2_mix) })} className={inputClass} /></Field>
        <Field label="C1 Mix %"><input type="number" value={form.c1_mix} onChange={(e) => setForm({ ...form, c1_mix: parseFiniteFloat(e.target.value, form.c1_mix) })} className={inputClass} /></Field>
        <Field label="D1 Mix %"><input type="number" value={form.d1_mix} onChange={(e) => setForm({ ...form, d1_mix: parseFiniteFloat(e.target.value, form.d1_mix) })} className={inputClass} /></Field>
      </div>
    </>
  )
}

function StatusSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="operational">operational</option>
      <option value="maintenance">maintenance</option>
      <option value="offline">offline</option>
      <option value="overloaded">overloaded</option>
    </select>
  )
}

function StatusPill({ status }: { status: string }) {
  const danger = status === 'overloaded' || status === 'offline'
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold border ${danger ? 'bg-red-950 text-red-400 border-red-900' : 'bg-green-950 text-green-400 border-green-900'}`}>
      {status}
    </span>
  )
}

function LoadingPill({ value }: { value: number }) {
  return (
    <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${value > 100 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : value > 90 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
      {value}%
    </span>
  )
}

function ImportResult({ result }: { result: any }) {
  return (
    <div className="mt-6 border-t border-zinc-900 pt-5 space-y-4">
      {result.status === 'error' ? (
        <div className="flex gap-3 p-3 bg-red-950/20 border border-red-900/40 rounded-lg text-red-400 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <h4 className="font-bold text-white">Import Error</h4>
            <p className="mt-0.5">{result.error}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Data Quality Rating</span>
              <span className="text-2xl font-bold font-mono text-white tracking-tight">{result.quality_score}%</span>
            </div>
            <div className="flex gap-4 text-xs font-mono text-right">
              <Metric label="Total" value={result.total_records} color="text-white" />
              <Metric label="Valid" value={result.valid_count} color="text-green-400" />
              <Metric label="Errors" value={result.invalid_count} color="text-red-400" />
            </div>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="border border-zinc-850 rounded-xl p-4 bg-zinc-950 space-y-3">
              <h4 className="text-xs font-bold text-red-400 flex items-center gap-1.5"><FileWarning className="w-4 h-4" />Validation Checklist</h4>
              <div className="max-h-40 overflow-y-auto space-y-2 text-xs font-mono">
                {result.errors.map((errObj: any, index: number) => (
                  <div key={index} className="p-2 bg-zinc-900 border border-zinc-850 rounded text-zinc-400">
                    <span className="text-red-400 font-bold font-sans">Row {errObj.record_index + 1} ({errObj.code}):</span>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 pl-1 text-[11px]">
                      {errObj.errors.map((err: string, i: number) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.invalid_count === 0 && (
            <div className="flex gap-2.5 p-3.5 bg-green-950/20 border border-green-900/40 rounded-xl text-green-400 text-xs">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <div>
                <h4 className="font-bold text-white">Grid Quality Validated</h4>
                <p className="mt-0.5 text-[11px]">No parsing, coordinate, or relational constraints violated.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <span className="text-zinc-500 block">{label}</span>
      <span className={`${color} font-bold`}>{value}</span>
    </div>
  )
}
