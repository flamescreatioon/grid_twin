import React, { useEffect, useState } from 'react'
import { useStore } from '../store'
import axios from 'axios'
import { 
  TrendingUp, 
  PlusCircle, 
  DollarSign, 
  HelpCircle, 
  Calendar, 
  ShieldCheck, 
  Percent, 
  Briefcase 
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_PREFIX = `${API_URL}/api/v1`

export default function InvestmentPlanner() {
  const { transformers, feeders, fetchGridData, user } = useStore()
  
  const [scenarios, setScenarios] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false)

  // Creation form states
  const [formData, setFormData] = useState({
    name: '',
    scenario_type: 'transformer_replacement',
    target_asset_type: 'transformer',
    target_asset_id: transformers[0]?.id || 1,
    estimated_cost: 3500000,
    expected_benefit: '',
    risk_reduction: 40.0,
    customer_impact: 100,
    reliability_improvement: 20.0,
    revenue_protection: 120000.0,
    implementation_time_days: 14
  })

  const fetchScenarios = async () => {
    setIsLoading(true)
    try {
      const response = await axios.get(`${API_PREFIX}/reports/investment-plan`)
      setScenarios(response.data.scenarios || [])
    } catch (err) {
      console.error('Error fetching scenarios:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchScenarios()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await axios.post(`${API_PREFIX}/simulate/investment-scenario`, formData)
      fetchScenarios()
      setIsFormOpen(false)
      // reset
      setFormData({
        name: '',
        scenario_type: 'transformer_replacement',
        target_asset_type: 'transformer',
        target_asset_id: transformers[0]?.id || 1,
        estimated_cost: 3500000,
        expected_benefit: '',
        risk_reduction: 40.0,
        customer_impact: 100,
        reliability_improvement: 20.0,
        revenue_protection: 120000.0,
        implementation_time_days: 14
      })
    } catch (err) {
      alert('Failed to register investment scenario')
    }
  }

  const formatNaira = (num: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(num)
  }

  const canEdit = user?.role === 'SYSTEM_ADMIN' || user?.role === 'PLANNING_ENGINEER'

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 p-8 text-zinc-300">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">CAPEX Investment Planner</h2>
          <p className="text-zinc-500 text-sm">Evaluate, compare, and prioritize grid reinforcement proposals using the AEDC multi-criteria priority index.</p>
        </div>
        {canEdit && (
          <button 
            onClick={() => setIsFormOpen(true)}
            className="bg-green-500 hover:bg-green-600 text-zinc-950 font-bold text-xs py-2.5 px-4 rounded-lg flex items-center gap-2 cursor-pointer transition shadow-md shadow-green-500/10"
          >
            <PlusCircle className="w-4 h-4" />
            Propose Intervention
          </button>
        )}
      </div>

      {/* Criteria Breakdown Banner */}
      <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-5 mb-8 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Percent className="w-4 h-4 text-green-400" />
            AEDC Prioritization Index Weights
          </h4>
          <p className="text-[11px] text-zinc-500 max-w-xl">Interventions are ranked mathematically based on weighted indices: Risk Reduction (25%), Customer Load Size (20%), Cost Effectiveness (20%), SAIDI Reliability Improvement (15%), Speed (10%), and Revenue Recovery (10%).</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold font-mono">
          <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-2.5 py-1 rounded">Risk: 25%</span>
          <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-2.5 py-1 rounded">Cust: 20%</span>
          <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-2.5 py-1 rounded">Cost: 20%</span>
          <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-2.5 py-1 rounded">Reliability: 15%</span>
          <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-2.5 py-1 rounded">Speed: 10%</span>
          <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 px-2.5 py-1 rounded">Revenue: 10%</span>
        </div>
      </div>

      {/* Scenarios List */}
      {isLoading ? (
        <div className="h-64 flex justify-center items-center">
          <div className="w-8 h-8 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {scenarios.map((sc, i) => (
            <div key={sc.id} className="bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700/80 rounded-xl p-6 transition duration-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded bg-zinc-900 border border-zinc-850 flex items-center justify-center font-mono font-bold text-xs text-white">
                    {i + 1}
                  </span>
                  <span className="text-[9px] font-bold font-mono px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full uppercase tracking-wider">
                    {sc.scenario_type.replace('_', ' ')}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white">{sc.name}</h3>
                <p className="text-xs text-zinc-500 max-w-2xl">{sc.expected_benefit}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[10px] font-medium text-zinc-500 pt-1.5">
                  <span className="flex items-center gap-1 font-mono">
                    <DollarSign className="w-3.5 h-3.5 text-zinc-600" />
                    Est. Cost: <strong className="text-zinc-300 font-semibold">{formatNaira(sc.estimated_cost)}</strong>
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                    Speed: <strong className="text-zinc-300 font-semibold">{sc.implementation_time_days} days</strong>
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <Briefcase className="w-3.5 h-3.5 text-zinc-600" />
                    Customers: <strong className="text-zinc-300 font-semibold">{sc.customer_impact}</strong>
                  </span>
                </div>
              </div>

              {/* Priority Score badge */}
              <div className="bg-zinc-900 border border-zinc-850 rounded-xl p-4 text-center shrink-0 min-w-32 flex flex-col items-center justify-center shadow-inner">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Priority Score</span>
                <span className="text-2xl font-bold font-mono text-green-400 tracking-tight mt-1 text-glow-green">
                  {sc.priority_score.toFixed(1)}
                </span>
                <span className="text-[9px] text-zinc-500 font-semibold uppercase mt-1 tracking-widest">
                  {sc.priority_score >= 70 ? 'High Priority' : sc.priority_score >= 50 ? 'Medium' : 'Low'}
                </span>
              </div>
            </div>
          ))}

          {scenarios.length === 0 && (
            <div className="h-64 flex flex-col justify-center items-center text-center p-6 border border-dashed border-zinc-850 rounded-xl">
              <TrendingUp className="w-8 h-8 text-zinc-700 mb-2.5" />
              <p className="text-xs text-zinc-400 font-bold">No CapEx proposals registered</p>
              <p className="text-[10px] text-zinc-500 mt-1">Register a new grid intervention scenario to view prioritization ratings.</p>
            </div>
          )}
        </div>
      )}

      {/* Propose Scenario Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 overflow-y-auto max-h-[85vh] text-zinc-300">
            <h3 className="text-base font-bold text-white mb-4">Propose Grid CAPEX Intervention</h3>
            
            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="text-zinc-500 block mb-1">Intervention Title *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Upgrade overloaded GK2-TX-045 transformer" 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-zinc-750"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-500 block mb-1">Intervention Type</label>
                  <select 
                    value={formData.scenario_type}
                    onChange={(e) => setFormData({ ...formData, scenario_type: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none"
                  >
                    <option value="transformer_replacement">Transformer Replacement</option>
                    <option value="feeder_reinforcement">Feeder Reinforcement</option>
                    <option value="load_splitting">Load Splitting</option>
                    <option value="smart_metering">Smart Meter Rollout</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-500 block mb-1">Estimated Cost (NGN) *</label>
                  <input 
                    type="number" 
                    required
                    value={formData.estimated_cost}
                    onChange={(e) => setFormData({ ...formData, estimated_cost: parseInt(e.target.value) })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-500 block mb-1">Expected Benefit Summary *</label>
                <textarea 
                  required
                  rows={2}
                  placeholder="Summarize engineering load relief, voltage improvements, and customer impacts..."
                  value={formData.expected_benefit}
                  onChange={(e) => setFormData({ ...formData, expected_benefit: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-500 block mb-1">Target Asset Type</label>
                  <select 
                    value={formData.target_asset_type}
                    onChange={(e) => setFormData({ ...formData, target_asset_type: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none"
                  >
                    <option value="transformer">Transformer Unit</option>
                    <option value="feeder">Feeder Line</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-500 block mb-1">Target Asset ID</label>
                  <select 
                    value={formData.target_asset_id}
                    onChange={(e) => setFormData({ ...formData, target_asset_id: parseInt(e.target.value) })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none"
                  >
                    {formData.target_asset_type === 'transformer'
                      ? transformers.map(t => <option key={t.id} value={t.id}>{t.code}</option>)
                      : feeders.map(f => <option key={f.id} value={f.id}>{f.code}</option>)
                    }
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-zinc-900 pt-3">
                <div>
                  <label className="text-zinc-500 block mb-1">Asset Risk Reduction (0-100)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.risk_reduction}
                    onChange={(e) => setFormData({ ...formData, risk_reduction: parseFloat(e.target.value) })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-500 block mb-1">Customers Affected (Count)</label>
                  <input 
                    type="number" 
                    value={formData.customer_impact}
                    onChange={(e) => setFormData({ ...formData, customer_impact: parseInt(e.target.value) })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-500 block mb-1">Reliability Growth (%)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={formData.reliability_improvement}
                    onChange={(e) => setFormData({ ...formData, reliability_improvement: parseFloat(e.target.value) })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-500 block mb-1">Implementation Period (Days)</label>
                  <input 
                    type="number" 
                    value={formData.implementation_time_days}
                    onChange={(e) => setFormData({ ...formData, implementation_time_days: parseInt(e.target.value) })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-white focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-900">
                <button 
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold py-2 px-4 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-green-500 hover:bg-green-600 text-zinc-950 font-bold text-xs py-2 px-4 rounded-lg cursor-pointer"
                >
                  Propose Scenario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
