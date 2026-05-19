import React, { useState } from 'react'
import { useStore } from '../store'
import axios from 'axios'
import { 
  FileText, 
  Download, 
  FileSpreadsheet, 
  ShieldAlert, 
  TrendingUp, 
  Clock, 
  CheckCircle2 
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_PREFIX = `${API_URL}/api/v1`

export default function ReportsPage() {
  const { user } = useStore()
  
  const [activeReport, setActiveReport] = useState<'none' | 'risk' | 'capex'>('none')
  const [reportData, setReportData] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const loadRiskReport = async () => {
    setIsLoading(true)
    setActiveReport('risk')
    try {
      const response = await axios.get(`${API_PREFIX}/reports/high-risk-assets`)
      setReportData(response.data)
    } catch (err) {
      console.error('Error generating risk report:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadCapexReport = async () => {
    setIsLoading(true)
    setActiveReport('capex')
    try {
      const response = await axios.get(`${API_PREFIX}/reports/investment-plan`)
      setReportData(response.data)
    } catch (err) {
      console.error('Error generating capex report:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const formatNaira = (num: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(num)
  }

  const getCsvExportUrl = (type: string) => {
    const token = localStorage.getItem('gridtwin_token')
    return `${API_PREFIX}/reports/export/csv?asset_type=${type}&token=${token}`
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 p-8 text-zinc-300">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Reports & Data Exports</h2>
          <p className="text-zinc-500 text-sm">Download network spreadsheets, print outage logs, and compile engineering planners.</p>
        </div>
        <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-green-500">
          <FileText className="w-5 h-5" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Spreadsheet Export Card */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition duration-200">
          <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-850 flex items-center justify-center text-green-500 mb-4 shadow">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1.5">Asset Spreadsheets Export</h3>
          <p className="text-[11px] text-zinc-500 mb-4">Export fully compatible CSV database templates for external analysis tools.</p>
          <div className="space-y-2">
            <a 
              href={getCsvExportUrl('transformer')}
              className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-semibold py-2 px-3 rounded-lg flex justify-between items-center transition cursor-pointer"
            >
              <span>Transformers List</span>
              <Download className="w-3.5 h-3.5 text-zinc-500" />
            </a>
            <a 
              href={getCsvExportUrl('feeder')}
              className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-semibold py-2 px-3 rounded-lg flex justify-between items-center transition cursor-pointer"
            >
              <span>Feeders List</span>
              <Download className="w-3.5 h-3.5 text-zinc-500" />
            </a>
            <a 
              href={getCsvExportUrl('substation')}
              className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-semibold py-2 px-3 rounded-lg flex justify-between items-center transition cursor-pointer"
            >
              <span>Substations List</span>
              <Download className="w-3.5 h-3.5 text-zinc-500" />
            </a>
          </div>
        </div>

        {/* High Risk Asset Report Trigger */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition duration-200 flex flex-col justify-between">
          <div>
            <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-850 flex items-center justify-center text-red-400 mb-4 shadow">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1.5">Asset Risk Warning Report</h3>
            <p className="text-[11px] text-zinc-500 mb-4">Generates structured warning logs for distribution items presenting high thermal loading or long maintenance gaps.</p>
          </div>
          <button 
            onClick={loadRiskReport}
            className="w-full bg-red-600/10 hover:bg-red-600/15 border border-red-500/20 hover:border-red-500/30 text-red-400 text-xs font-bold py-2.5 rounded-lg cursor-pointer transition text-center"
          >
            Generate Report
          </button>
        </div>

        {/* Investment Plan Report Trigger */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition duration-200 flex flex-col justify-between">
          <div>
            <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-850 flex items-center justify-center text-blue-400 mb-4 shadow">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1.5">CAPEX Prioritization Report</h3>
            <p className="text-[11px] text-zinc-500 mb-4">Compiles evaluated grid interventions ranked dynamically by the planning prioritization score index.</p>
          </div>
          <button 
            onClick={loadCapexReport}
            className="w-full bg-blue-600/10 hover:bg-blue-600/15 border border-blue-500/20 hover:border-blue-500/30 text-blue-400 text-xs font-bold py-2.5 rounded-lg cursor-pointer transition text-center"
          >
            Generate Report
          </button>
        </div>
      </div>

      {/* Report Display Container */}
      {activeReport !== 'none' && (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 min-h-[300px]">
          {isLoading ? (
            <div className="h-48 flex justify-center items-center">
              <div className="w-8 h-8 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
            </div>
          ) : reportData ? (
            <div className="space-y-6">
              {/* Report Header */}
              <div className="flex justify-between items-center border-b border-zinc-900 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white">{reportData.report_name}</h3>
                  <span className="text-[10px] text-zinc-500 block mt-1 font-mono uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Generated: {new Date(reportData.generated_at).toLocaleString()}
                  </span>
                </div>
                <button 
                  onClick={() => window.print()}
                  className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 text-xs font-bold py-1.5 px-3 rounded-lg cursor-pointer transition"
                >
                  Print Report
                </button>
              </div>

              {/* Risk Report Content */}
              {activeReport === 'risk' && (
                <div className="space-y-5 text-xs">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-zinc-500 block font-semibold text-[10px] uppercase">High Risk Transformers</span>
                      <span className="text-lg font-bold text-white font-mono mt-1.5 block">{reportData.high_risk_transformers_count} units</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-zinc-500 block font-semibold text-[10px] uppercase">High Risk Feeders</span>
                      <span className="text-lg font-bold text-white font-mono mt-1.5 block">{reportData.high_risk_feeders_count} units</span>
                    </div>
                  </div>

                  <div className="space-y-3.5">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Transformer Warning Details</h4>
                    <div className="overflow-x-auto border border-zinc-900 rounded-lg">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-900 bg-zinc-900/40 text-zinc-500 font-bold">
                            <th className="py-2.5 px-4">Code</th>
                            <th className="py-2.5 px-4">Name</th>
                            <th className="py-2.5 px-4 text-center">Loading</th>
                            <th className="py-2.5 px-4 text-right">Risk Score</th>
                            <th className="py-2.5 px-4 text-right">Active Factor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.transformers.map((tx: any) => (
                            <tr key={tx.id} className="border-b border-zinc-900 hover:bg-zinc-900/10">
                              <td className="py-3 px-4 font-mono text-white">{tx.code}</td>
                              <td className="py-3 px-4 text-zinc-300 font-medium">{tx.name}</td>
                              <td className="py-3 px-4 text-center font-mono">{tx.loading_percentage}%</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-red-500">{tx.risk_score}</td>
                              <td className="py-3 px-4 text-right text-[10px] text-zinc-500 font-medium uppercase font-mono">
                                {tx.risk_factors.load > 15 ? 'Overloaded' : 'Maintenance Gap'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeReport === 'capex' && (
                <div className="space-y-5 text-xs">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-zinc-500 block font-semibold text-[10px] uppercase">Evaluated Proposals</span>
                      <span className="text-lg font-bold text-white font-mono mt-1.5 block">{reportData.total_scenarios_evaluated} Options</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-zinc-500 block font-semibold text-[10px] uppercase">Total Cost Estimate</span>
                      <span className="text-lg font-bold text-green-400 font-mono mt-1.5 block">{formatNaira(reportData.total_estimated_capex_ngn)}</span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-850 p-4 rounded-xl">
                      <span className="text-zinc-500 block font-semibold text-[10px] uppercase">Impact Benefit</span>
                      <span className="text-lg font-bold text-blue-400 font-mono mt-1.5 block">{reportData.total_customers_benefiting} Customers</span>
                    </div>
                  </div>

                  <div className="space-y-3.5">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Priority Scenario Rank List</h4>
                    <div className="overflow-x-auto border border-zinc-900 rounded-lg">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-900 bg-zinc-900/40 text-zinc-500 font-bold">
                            <th className="py-2.5 px-4 text-center">Rank</th>
                            <th className="py-2.5 px-4">Intervention</th>
                            <th className="py-2.5 px-4 text-right">Cost (NGN)</th>
                            <th className="py-2.5 px-4 text-right">Priority Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.scenarios.map((sc: any, index: number) => (
                            <tr key={sc.id} className="border-b border-zinc-900 hover:bg-zinc-900/10">
                              <td className="py-3 px-4 text-center font-bold text-white font-mono">#{index + 1}</td>
                              <td className="py-3 px-4 text-zinc-300 font-medium">
                                <div>{sc.name}</div>
                                <div className="text-[10px] text-zinc-500 mt-0.5">{sc.expected_benefit}</div>
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-zinc-400">{formatNaira(sc.estimated_cost)}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-green-400">{sc.priority_score.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-48 flex justify-center items-center text-zinc-500 text-xs">
              Failed to compile report. Please check server connections.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
