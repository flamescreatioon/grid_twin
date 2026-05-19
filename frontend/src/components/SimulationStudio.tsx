import React, { useEffect, useState } from 'react'
import { useStore } from '../store'
import axios from 'axios'
import { 
  Activity, 
  AlertTriangle, 
  Sparkles, 
  TrendingUp, 
  PlusCircle, 
  Wrench,
  DollarSign,
  Users,
  Flame,
  CheckCircle2
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_PREFIX = `${API_URL}/api/v1`

const parseFiniteFloat = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const parseFiniteInt = (value: string, fallback: number) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export default function SimulationStudio() {
  const { feeders, transformers, fetchGridData } = useStore()
  
  const [activeTab, setActiveTab] = useState<'outage' | 'growth' | 'connection' | 'upgrade'>('outage')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [simResult, setSimResult] = useState<any | null>(null)

  // Form States
  const [outageForm, setOutageForm] = useState({
    asset_type: 'feeder',
    asset_id: feeders[0]?.id || 1,
    cause: 'Feeder Overload Tripping',
    duration_hours: 4
  })

  const [growthForm, setGrowthForm] = useState({
    growth_rate: 5.0,
    years: 5
  })

  const [connectionForm, setConnectionForm] = useState({
    transformer_id: transformers[0]?.id || 1,
    additional_kva: 45.0,
    customer_count: 30
  })

  const [upgradeForm, setUpgradeForm] = useState({
    transformer_id: transformers[0]?.id || 1,
    new_rating_kva: 500
  })

  useEffect(() => {
    const selectedFeeder = feeders[0]?.id
    const selectedTransformer = transformers[0]?.id

    setOutageForm((current) => {
      if (current.asset_type === 'feeder' && selectedFeeder && !feeders.some((f) => f.id === current.asset_id)) {
        return { ...current, asset_id: selectedFeeder }
      }
      if (current.asset_type === 'transformer' && selectedTransformer && !transformers.some((t) => t.id === current.asset_id)) {
        return { ...current, asset_id: selectedTransformer }
      }
      return current
    })

    if (selectedTransformer && !transformers.some((t) => t.id === connectionForm.transformer_id)) {
      setConnectionForm((current) => ({ ...current, transformer_id: selectedTransformer }))
    }

    if (selectedTransformer && !transformers.some((t) => t.id === upgradeForm.transformer_id)) {
      setUpgradeForm((current) => ({ ...current, transformer_id: selectedTransformer }))
    }
  }, [feeders, transformers, connectionForm.transformer_id, upgradeForm.transformer_id])

  // Submit Handlers
  const handleOutageSim = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setSimResult(null)
    try {
      const response = await axios.post(`${API_PREFIX}/simulate/outage`, outageForm)
      setSimResult({
        type: 'outage',
        data: response.data
      })
      fetchGridData() // Refresh list since outage status changes
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Outage simulation failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGrowthSim = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setSimResult(null)
    try {
      const response = await axios.post(`${API_PREFIX}/simulate/load-growth`, {
        annual_growth_rate: growthForm.growth_rate,
        years: growthForm.years
      })
      setSimResult({
        type: 'growth',
        data: response.data
      })
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Growth simulation failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleConnectionSim = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setSimResult(null)
    try {
      const response = await axios.post(`${API_PREFIX}/simulate/new-connection`, {
        transformer_id: connectionForm.transformer_id,
        new_demand_kw: connectionForm.additional_kva * 0.85,
        customer_count: connectionForm.customer_count
      })
      setSimResult({
        type: 'connection',
        data: response.data
      })
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Connection simulation failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpgradeSim = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setSimResult(null)
    try {
      const response = await axios.post(`${API_PREFIX}/simulate/upgrade`, {
        transformer_id: upgradeForm.transformer_id,
        new_capacity_kva: upgradeForm.new_rating_kva
      })
      setSimResult({
        type: 'upgrade',
        data: response.data
      })
      fetchGridData() // Refresh to see updated rating/load ratio
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Upgrade simulation failed')
    } finally {
      setIsLoading(false)
    }
  }

  // Format currency
  const formatNaira = (num: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(num)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 p-8 text-zinc-300">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Grid Simulation Studio</h2>
          <p className="text-zinc-500 text-sm">Perform what-if analysis on load growth, outages, and connection upgrades.</p>
        </div>
        <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-green-500">
          <Activity className="w-5 h-5 animate-pulse" />
        </div>
      </div>

      {/* Selector Tabs */}
      <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 mb-8 max-w-2xl">
        <button 
          onClick={() => { setActiveTab('outage'); setSimResult(null); }}
          className={`flex-1 text-xs font-semibold py-2.5 px-4 rounded-lg cursor-pointer transition ${activeTab === 'outage' ? 'bg-zinc-900 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Outage propagation
        </button>
        <button 
          onClick={() => { setActiveTab('growth'); setSimResult(null); }}
          className={`flex-1 text-xs font-semibold py-2.5 px-4 rounded-lg cursor-pointer transition ${activeTab === 'growth' ? 'bg-zinc-900 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Load Growth
        </button>
        <button 
          onClick={() => { setActiveTab('connection'); setSimResult(null); }}
          className={`flex-1 text-xs font-semibold py-2.5 px-4 rounded-lg cursor-pointer transition ${activeTab === 'connection' ? 'bg-zinc-900 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          New Load Connections
        </button>
        <button 
          onClick={() => { setActiveTab('upgrade'); setSimResult(null); }}
          className={`flex-1 text-xs font-semibold py-2.5 px-4 rounded-lg cursor-pointer transition ${activeTab === 'upgrade' ? 'bg-zinc-900 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Asset Upgrades
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Panel */}
        <div className="lg:col-span-5 bg-zinc-950 border border-zinc-800 rounded-xl p-6 h-fit">
          {activeTab === 'outage' && (
            <form onSubmit={handleOutageSim} className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-red-500" />
                Simulate Fault Propagation
              </h3>
              
              <div>
                <label className="text-zinc-400 block mb-1">Target Element Type</label>
                <select 
                  value={outageForm.asset_type}
                  onChange={(e) => {
                    const asset_type = e.target.value
                    const fallbackId = asset_type === 'feeder' ? feeders[0]?.id : transformers[0]?.id
                    setOutageForm({ ...outageForm, asset_type, asset_id: fallbackId || outageForm.asset_id })
                  }}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700"
                >
                  <option value="feeder">Feeder Line</option>
                  <option value="transformer">Transformer Unit</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Select Grid Node</label>
                <select 
                  value={outageForm.asset_id}
                  onChange={(e) => setOutageForm({ ...outageForm, asset_id: parseFiniteInt(e.target.value, outageForm.asset_id) })}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700"
                >
                  {outageForm.asset_type === 'feeder' 
                    ? feeders.map(f => <option key={f.id} value={f.id}>{f.name} ({f.code})</option>)
                    : transformers.map(t => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)
                  }
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Outage Cause Category</label>
                <select 
                  value={outageForm.cause}
                  onChange={(e) => setOutageForm({ ...outageForm, cause: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700"
                >
                  <option value="Feeder Overload Tripping">Feeder Overload Tripping</option>
                  <option value="Heavy Rainstorm Damage">Heavy Rainstorm Damage</option>
                  <option value="Transformer Blown Fuse">Transformer Blown Fuse</option>
                  <option value="Grid Load Shedding">Grid Load Shedding</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Expected Outage Duration (Hours)</label>
                <input 
                  type="number" 
                  min="0.5"
                  step="0.5"
                  value={outageForm.duration_hours}
                  onChange={(e) => setOutageForm({ ...outageForm, duration_hours: parseFiniteFloat(e.target.value, outageForm.duration_hours) })}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-bold py-2.5 rounded-lg cursor-pointer transition shadow-md shadow-red-600/10"
              >
                {isLoading ? 'Calculating Impact...' : 'Trigger Simulation'}
              </button>
            </form>
          )}

          {activeTab === 'growth' && (
            <form onSubmit={handleGrowthSim} className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-green-500" />
                Simulate Compounded Demand Growth
              </h3>

              <div>
                <label className="text-zinc-400 block mb-1">Annual Load Growth Rate (%)</label>
                <input 
                  type="number" 
                  step="0.1"
                  min="0"
                  max="20"
                  value={growthForm.growth_rate}
                  onChange={(e) => setGrowthForm({ ...growthForm, growth_rate: parseFiniteFloat(e.target.value, growthForm.growth_rate) })}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Horizon Range (Years)</label>
                <input 
                  type="number" 
                  min="1"
                  max="15"
                  value={growthForm.years}
                  onChange={(e) => setGrowthForm({ ...growthForm, years: parseFiniteInt(e.target.value, growthForm.years) })}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-green-500 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold py-2.5 rounded-lg cursor-pointer transition shadow-md shadow-green-500/10"
              >
                {isLoading ? 'Modeling Future Loads...' : 'Project Load Growth'}
              </button>
            </form>
          )}

          {activeTab === 'connection' && (
            <form onSubmit={handleConnectionSim} className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4 text-blue-500" />
                Check New Customer Connection
              </h3>

              <div>
                <label className="text-zinc-400 block mb-1">Target Transformer Node</label>
                <select 
                  value={connectionForm.transformer_id}
                  onChange={(e) => setConnectionForm({ ...connectionForm, transformer_id: parseFiniteInt(e.target.value, connectionForm.transformer_id) })}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700"
                >
                  {transformers.map(t => <option key={t.id} value={t.id}>{t.code} ({t.rating_kva}kVA) - {t.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Proposed Load Ingestion (kVA)</label>
                <input 
                  type="number" 
                  min="1"
                  value={connectionForm.additional_kva}
                  onChange={(e) => setConnectionForm({ ...connectionForm, additional_kva: parseFiniteFloat(e.target.value, connectionForm.additional_kva) })}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">New Domestic/Business Customer Count</label>
                <input 
                  type="number" 
                  min="1"
                  value={connectionForm.customer_count}
                  onChange={(e) => setConnectionForm({ ...connectionForm, customer_count: parseFiniteInt(e.target.value, connectionForm.customer_count) })}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700 font-mono"
                />
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold py-2.5 rounded-lg cursor-pointer transition shadow-md shadow-blue-500/10"
              >
                {isLoading ? 'Testing Bus Constraints...' : 'Assess Connection'}
              </button>
            </form>
          )}

          {activeTab === 'upgrade' && (
            <form onSubmit={handleUpgradeSim} className="space-y-4 text-xs">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-purple-500" />
                Model Transformer Rating Upgrade
              </h3>

              <div>
                <label className="text-zinc-400 block mb-1">Select Overloaded Transformer</label>
                <select 
                  value={upgradeForm.transformer_id}
                  onChange={(e) => setUpgradeForm({ ...upgradeForm, transformer_id: parseFiniteInt(e.target.value, upgradeForm.transformer_id) })}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700"
                >
                  {transformers.filter(t => t.loading_percentage > 90).map(t => (
                    <option key={t.id} value={t.id}>{t.code} ({t.rating_kva}kVA - {t.loading_percentage}% Load)</option>
                  ))}
                  {transformers.filter(t => t.loading_percentage > 90).length === 0 && 
                    transformers.map(t => <option key={t.id} value={t.id}>{t.code} ({t.rating_kva}kVA)</option>)
                  }
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Upgraded Capacity Rating (kVA)</label>
                <select 
                  value={upgradeForm.new_rating_kva}
                  onChange={(e) => setUpgradeForm({ ...upgradeForm, new_rating_kva: parseFiniteInt(e.target.value, upgradeForm.new_rating_kva) })}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-700 font-mono"
                >
                  <option value="200">200 kVA</option>
                  <option value="300">300 kVA</option>
                  <option value="500">500 kVA</option>
                  <option value="1000">1000 kVA</option>
                </select>
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold py-2.5 rounded-lg cursor-pointer transition shadow-md shadow-purple-500/10"
              >
                {isLoading ? 'Upgrading Transformer...' : 'Execute Upgrade'}
              </button>
            </form>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-7 bg-zinc-950 border border-zinc-800 rounded-xl p-6 min-h-[400px]">
          <h3 className="text-sm font-bold text-white mb-6 border-b border-zinc-900 pb-3">Simulation Analysis Output</h3>
          
          {isLoading && (
            <div className="h-64 flex flex-col justify-center items-center gap-3">
              <div className="w-10 h-10 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
              <span className="text-xs text-zinc-500 font-semibold tracking-wide">Solving grid equations...</span>
            </div>
          )}

          {!isLoading && !simResult && (
            <div className="h-64 flex flex-col justify-center items-center text-center p-6 border border-dashed border-zinc-850 rounded-xl">
              <Sparkles className="w-8 h-8 text-zinc-700 mb-2.5" />
              <p className="text-xs text-zinc-400 font-bold">Waiting for simulation inputs</p>
              <p className="text-[10px] text-zinc-500 max-w-xs mt-1">Configure options in the left panel and click run to model electric flow, capacity limits, and financial outage costs.</p>
            </div>
          )}

          {!isLoading && simResult && (
            <div className="space-y-6">
              {simResult.type === 'outage' && (
                <div className="space-y-5">
                  <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-white">Outage Impact Simulated</h4>
                      <p className="text-[10px] text-red-400/80 mt-0.5">Propagated cascading downslope outages on the selected branch.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Customers Blacked Out</span>
                      <div className="flex items-center gap-2 mt-2">
                        <Users className="w-4 h-4 text-zinc-400" />
                        <span className="text-lg font-bold text-white font-mono">{simResult.data.total_affected_customers}</span>
                      </div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Naira Revenue Loss</span>
                      <div className="flex items-center gap-2 mt-2">
                        <DollarSign className="w-4 h-4 text-red-500" />
                        <span className="text-lg font-bold text-red-400 font-mono">
                          {formatNaira(simResult.data.estimated_revenue_lost_ngn)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Energy Unserved</span>
                      <span className="text-lg font-bold text-white font-mono mt-2 block">{simResult.data.estimated_energy_lost_kwh?.toLocaleString()} kWh</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-[10px] text-zinc-500 block uppercase font-semibold">Restoration Priority Rank</span>
                      <span className="text-lg font-bold text-orange-400 font-mono mt-2 block">
                        {simResult.data.restoration_priority} (Score: {simResult.data.restoration_score?.toFixed(0)})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {simResult.type === 'growth' && (
                <div className="space-y-5">
                  <div className="p-4 bg-green-950/20 border border-green-900/40 rounded-xl flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-white">Demand Growth Projection Completed</h4>
                      <p className="text-[10px] text-green-400/80 mt-0.5">Calculated compounded demand load increase over {growthForm.years} years at {growthForm.growth_rate}% p.a.</p>
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-850 p-5 rounded-xl space-y-4 text-xs">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-850">
                      <span className="text-zinc-500">Projection Period</span>
                      <span className="text-white font-bold font-mono">{growthForm.years} Years</span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-850">
                      <span className="text-zinc-500">Compounding growth factor</span>
                      <span className="text-white font-bold font-mono">
                        {((simResult.data.load_compounding_multiplier || 1) * 100 - 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-850">
                      <span className="text-zinc-500">Newly Overloaded Transformers</span>
                      <span className="text-red-400 font-bold font-mono">{simResult.data.new_overloaded_transformers?.length || 0} units</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Total Critically Loaded Transformers</span>
                      <span className="text-red-500 font-bold font-mono">{simResult.data.new_critical_transformers?.length || 0} units</span>
                    </div>
                  </div>
                </div>
              )}

              {simResult.type === 'connection' && (() => {
                const isTxOverloaded = simResult.data.transformer?.is_overloaded_after;
                const isFeederOverloaded = simResult.data.feeder?.is_overloaded_after;
                const safeToConnect = !isTxOverloaded && !isFeederOverloaded;
                const connectionMsg = safeToConnect 
                  ? "Connection Feasible: Transformer and parent feeder have sufficient reserve capacity."
                  : `Capacity Warning: ${isTxOverloaded ? "Transformer" : ""}${isTxOverloaded && isFeederOverloaded ? " and " : ""}${isFeederOverloaded ? "Parent Feeder" : ""} will exceed safe loading limits.`;
                
                return (
                  <div className="space-y-5">
                    <div className={`p-4 rounded-xl flex items-center gap-3 border ${
                      safeToConnect 
                        ? 'bg-green-950/20 border-green-900/40 text-green-400' 
                        : 'bg-red-950/20 border-red-900/40 text-red-400'
                    }`}>
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <div>
                        <h4 className="text-xs font-bold text-white">
                          {safeToConnect ? 'Connection Feasible' : 'Connection Risk: Overload Warning'}
                        </h4>
                        <p className={`text-[10px] mt-0.5 ${safeToConnect ? 'text-green-400/80' : 'text-red-400/80'}`}>
                          {connectionMsg}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                        <span className="text-zinc-500 block">Pre-Connection Load</span>
                        <span className="text-sm font-bold text-zinc-400 font-mono mt-1.5 block">
                          {simResult.data.transformer?.current_load_kva?.toFixed(1)} kVA ({simResult.data.transformer?.current_loading_pct?.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                        <span className="text-zinc-500 block">Post-Connection Load</span>
                        <span className={`text-sm font-bold font-mono mt-1.5 block ${isTxOverloaded ? 'text-red-400' : 'text-green-400'}`}>
                          {simResult.data.transformer?.projected_load_kva?.toFixed(1)} kVA ({simResult.data.transformer?.projected_loading_pct?.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {simResult.type === 'upgrade' && (
                <div className="space-y-5">
                  <div className="p-4 bg-purple-950/20 border border-purple-900/40 rounded-xl flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-purple-400 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-white">Upgrade Assessment Solved</h4>
                      <p className="text-[10px] text-purple-400/80 mt-0.5">Transformer capacity upgraded to {upgradeForm.new_rating_kva} kVA.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-zinc-500 block">Original Configuration</span>
                      <div className="mt-2 space-y-1 font-mono text-[11px]">
                        <div>Rating: <span className="text-white font-bold">{simResult.data.current_rating_kva} kVA</span></div>
                        <div>Loading Ratio: <span className="text-red-400 font-bold">{simResult.data.current_loading_pct?.toFixed(1)}%</span></div>
                      </div>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-zinc-500 block">Upgraded Configuration</span>
                      <div className="mt-2 space-y-1 font-mono text-[11px]">
                        <div>Rating: <span className="text-white font-bold">{simResult.data.proposed_rating_kva} kVA</span></div>
                        <div>Loading Ratio: <span className="text-green-400 font-bold">{simResult.data.proposed_loading_pct?.toFixed(1)}%</span></div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl text-xs flex justify-between items-center">
                    <span className="text-zinc-500">Asset Safety Status</span>
                    <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20 uppercase font-bold text-[10px]">
                      {simResult.data.proposed_status}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
