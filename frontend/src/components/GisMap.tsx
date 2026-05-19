import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { GridAsset } from '../store'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import { Search, MapPin, Activity, ShieldAlert, CheckCircle2, Navigation2, Network } from 'lucide-react'

// API Prefix
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_PREFIX = `${API_URL}/api/v1`

export default function GisMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersGroupRef = useRef<L.LayerGroup | null>(null)
  const highlightGroupRef = useRef<L.LayerGroup | null>(null)
  
  const { selectedAsset, setSelectedAsset, fetchGridData, feeders, transformers } = useStore()
  
  const [mapMode, setMapMode] = useState<'standard' | 'risk' | 'load'>('standard')
  const [showOutages, setShowOutages] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [traceResult, setTraceResult] = useState<{ upstream: any[]; downstream: any[] } | null>(null)
  const [isTracing, setIsTracing] = useState<boolean>(false)

  // Map Data Stores
  const [geojsonSubs, setGeojsonSubs] = useState<any>(null)
  const [geojsonFeeders, setGeojsonFeeders] = useState<any>(null)
  const [geojsonTransformers, setGeojsonTransformers] = useState<any>(null)
  const [geojsonClusters, setGeojsonClusters] = useState<any>(null)
  const [geojsonOutages, setGeojsonOutages] = useState<any>(null)

  // Fetch GeoJSON map layers from backend
  const fetchGeoJsonLayers = async () => {
    try {
      const [subsRes, feedersRes, txRes, ccRes, outageRes] = await Promise.all([
        axios.get(`${API_PREFIX}/map/substations`),
        axios.get(`${API_PREFIX}/map/feeders`),
        axios.get(`${API_PREFIX}/map/transformers`),
        axios.get(`${API_PREFIX}/map/customer-clusters`),
        axios.get(`${API_PREFIX}/map/outage-zones`)
      ])
      setGeojsonSubs(subsRes.data)
      setGeojsonFeeders(feedersRes.data)
      setGeojsonTransformers(txRes.data)
      setGeojsonClusters(ccRes.data)
      setGeojsonOutages(outageRes.data)
    } catch (err) {
      console.error('Error fetching GeoJSON layers:', err)
    }
  }

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return

    // 1. Create Leaflet map instance centered on Garki, Abuja pilot area
    const map = L.map(mapContainerRef.current, {
      center: [9.0243, 7.4897],
      zoom: 14,
      zoomControl: false
    })
    
    mapRef.current = map

    // Add zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // 2. Add CartoDB Dark Matter Base Tile Layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/attributions">CartoDB</a> contributors',
      maxZoom: 20
    }).addTo(map)

    // 3. Initialize Layer Groups
    layersGroupRef.current = L.layerGroup().addTo(map)
    highlightGroupRef.current = L.layerGroup().addTo(map)

    // Load GeoJSON layers
    fetchGeoJsonLayers()

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Draw/Redraw grid elements when layers or map modes change
  useEffect(() => {
    if (!mapRef.current || !layersGroupRef.current) return
    
    // Clear previous drawing
    layersGroupRef.current.clearLayers()
    
    const layers = layersGroupRef.current

    // Helper: color code transformers
    const getTransformerColor = (properties: any) => {
      if (mapMode === 'risk') {
        const score = properties.risk_score || 0
        if (score <= 40.0) return '#22c55e' // Low Risk
        if (score <= 70.0) return '#eab308' // Medium Risk
        return '#ef4444' // High Risk
      } else if (mapMode === 'load') {
        const pct = properties.loading_percentage || 0
        if (pct <= 70.0) return '#22c55e' // Healthy
        if (pct <= 90.0) return '#eab308' // Watch
        if (pct <= 100.0) return '#f97316' // Near Limit
        return '#ef4444' // Overloaded
      } else {
        // Standard view: color by operational status
        return properties.status === 'overloaded' ? '#f97316' : '#22c55e'
      }
    }

    // 1. Draw Feeders (LineStrings)
    if (geojsonFeeders) {
      L.geoJSON(geojsonFeeders, {
        style: (feature) => ({
          color: feature?.properties.status === 'offline' ? '#71717a' : '#10b981',
          weight: 3.5,
          opacity: 0.85
        }),
        onEachFeature: (feature, layer) => {
          layer.on('click', () => {
            setSelectedAsset({
              id: feature.properties.id,
              code: feature.properties.code,
              name: feature.properties.name,
              type: 'feeder',
              ...feature.properties
            })
            setTraceResult(null)
          })
          layer.bindTooltip(feature.properties.name, { sticky: true, className: 'bg-black text-white border-0 text-xs px-2 py-1 rounded' })
        }
      }).addTo(layers)
    }

    // 2. Draw Customer/Load Clusters (Polygons)
    if (geojsonClusters) {
      L.geoJSON(geojsonClusters, {
        style: {
          color: '#6366f1',
          fillColor: '#6366f1',
          fillOpacity: 0.08,
          weight: 1,
          dashArray: '3, 3'
        },
        onEachFeature: (feature, layer) => {
          layer.on('click', (e) => {
            // Prevent event propagation so clicking customer cluster doesn't overwrite transformer click if layered
            L.DomEvent.stopPropagation(e)
            setSelectedAsset({
              id: feature.properties.id,
              code: feature.properties.code || `CC-${feature.properties.id}`,
              name: feature.properties.name,
              type: 'customer_cluster',
              ...feature.properties
            })
            setTraceResult(null)
          })
          layer.bindTooltip(feature.properties.name, { sticky: true })
        }
      }).addTo(layers)
    }

    // 3. Draw Substations (Large Blue Circle Markers)
    if (geojsonSubs) {
      L.geoJSON(geojsonSubs, {
        pointToLayer: (feature, latlng) => {
          return L.circleMarker(latlng, {
            radius: 8.5,
            fillColor: '#3b82f6',
            color: '#ffffff',
            weight: 1.5,
            fillOpacity: 0.9,
            className: 'shadow-[0_0_15px_rgba(59,130,246,0.5)]'
          })
        },
        onEachFeature: (feature, layer) => {
          layer.on('click', () => {
            setSelectedAsset({
              id: feature.properties.id,
              code: feature.properties.code,
              name: feature.properties.name,
              type: 'substation',
              ...feature.properties
            })
            setTraceResult(null)
          })
          layer.bindTooltip(feature.properties.name, { permanent: false, direction: 'top' })
        }
      }).addTo(layers)
    }

    // 4. Draw Transformers (Color Coded Circle Markers)
    if (geojsonTransformers) {
      L.geoJSON(geojsonTransformers, {
        pointToLayer: (feature, latlng) => {
          const color = getTransformerColor(feature.properties)
          return L.circleMarker(latlng, {
            radius: 5,
            fillColor: color,
            color: '#18181b',
            weight: 1.2,
            fillOpacity: 0.95
          })
        },
        onEachFeature: (feature, layer) => {
          layer.on('click', (e) => {
            L.DomEvent.stopPropagation(e)
            setSelectedAsset({
              id: feature.properties.id,
              code: feature.properties.code,
              name: feature.properties.name,
              type: 'transformer',
              ...feature.properties
            })
            setTraceResult(null)
          })
          layer.bindTooltip(`${feature.properties.code}: ${feature.properties.loading_percentage}% Load`, { sticky: true })
        }
      }).addTo(layers)
    }

    // 5. Draw Active Outage Blackout Zones overlay
    if (showOutages && geojsonOutages) {
      L.geoJSON(geojsonOutages, {
        style: (feature) => ({
          color: '#ef4444',
          fillColor: '#ef4444',
          fillOpacity: 0.25,
          weight: feature?.geometry.type === 'LineString' ? 5.5 : 1.5,
          className: 'animate-pulse'
        })
      }).addTo(layers)
    }
  }, [geojsonSubs, geojsonFeeders, geojsonTransformers, geojsonClusters, geojsonOutages, mapMode, showOutages])

  // Triggers topology upstream/downstream network tracing
  const handleTraceTopology = async () => {
    if (!selectedAsset) return
    setIsTracing(true)
    try {
      const response = await axios.get(`${API_PREFIX}/topology/trace/${selectedAsset.type}/${selectedAsset.id}`)
      setTraceResult(response.data)
      
      // Draw tracing highlight layers
      if (highlightGroupRef.current && mapRef.current) {
        highlightGroupRef.current.clearLayers()
        
        const highlight = highlightGroupRef.current
        const { upstream, downstream } = response.data
        
        // Highlight Upstream in Light Blue
        upstream.forEach((node: any) => {
          if (node.type === 'transformer') {
            // Find in transformers list for coords
            const txObj = transformers.find(t => t.id === node.id)
            if (txObj && txObj.latitude) {
              L.circleMarker([txObj.latitude, txObj.longitude], {
                radius: 8,
                fillColor: '#38bdf8',
                color: '#ffffff',
                weight: 1.5,
                fillOpacity: 0.8
              }).addTo(highlight)
            }
          }
        })
        
        // Highlight Downstream in Orange/Red
        downstream.forEach((node: any) => {
          if (node.type === 'transformer') {
            const txObj = transformers.find(t => t.id === node.id)
            if (txObj && txObj.latitude) {
              L.circleMarker([txObj.latitude, txObj.longitude], {
                radius: 8,
                fillColor: '#f97316',
                color: '#ffffff',
                weight: 1.5,
                fillOpacity: 0.8
              }).addTo(highlight)
            }
          }
        })
      }
    } catch (err) {
      console.error('Error tracing topology:', err)
    } finally {
      setIsTracing(false)
    }
  }

  // Clear tracing highlight
  const clearTrace = () => {
    setTraceResult(null)
    if (highlightGroupRef.current) {
      highlightGroupRef.current.clearLayers()
    }
  }

  // Handle asset search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim() || !mapRef.current) return
    
    const q = searchQuery.toLowerCase()
    
    // Check transformers
    const tx = transformers.find(t => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    if (tx && tx.latitude) {
      mapRef.current.setView([tx.latitude, tx.longitude], 17)
      setSelectedAsset({
        id: tx.id,
        code: tx.code,
        name: tx.name,
        type: 'transformer',
        ...tx
      })
      setTraceResult(null)
      return
    }

    // Check feeders
    const fd = feeders.find(f => f.code.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
    if (fd && fd.route_coordinates && fd.route_coordinates.length > 0) {
      const firstCoord = fd.route_coordinates[0]
      mapRef.current.setView([firstCoord[1], firstCoord[0]], 15)
      setSelectedAsset({
        id: fd.id,
        code: fd.code,
        name: fd.name,
        type: 'feeder',
        ...fd
      })
      setTraceResult(null)
      return
    }
  }

  return (
    <div className="flex-1 h-screen relative flex">
      {/* Map Container */}
      <div ref={mapContainerRef} className="flex-1 h-full w-full bg-zinc-950" />

      {/* Layer Control Options overlay */}
      <div className="absolute top-6 left-6 z-20 glassmorphism rounded-xl p-4 shadow-xl border border-zinc-800/80 flex flex-col gap-3.5 w-60">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">GIS Visualization Modes</h4>
          <div className="grid grid-cols-3 gap-1 bg-zinc-900/60 p-1 rounded-lg border border-zinc-800">
            <button 
              onClick={() => setMapMode('standard')}
              className={`text-[10px] font-semibold py-1 px-2 rounded cursor-pointer transition ${mapMode === 'standard' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Grid
            </button>
            <button 
              onClick={() => setMapMode('risk')}
              className={`text-[10px] font-semibold py-1 px-2 rounded cursor-pointer transition ${mapMode === 'risk' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Risk
            </button>
            <button 
              onClick={() => setMapMode('load')}
              className={`text-[10px] font-semibold py-1 px-2 rounded cursor-pointer transition ${mapMode === 'load' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              Load
            </button>
          </div>
        </div>

        <div className="border-t border-zinc-800/60 pt-3">
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-400 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showOutages} 
              onChange={() => setShowOutages(!showOutages)}
              className="rounded bg-zinc-900 border-zinc-800 text-green-500 focus:ring-0 cursor-pointer w-4 h-4" 
            />
            Highlight Outage Zones
          </label>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} className="border-t border-zinc-800/60 pt-3">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search by code (e.g. TX-012)..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg py-1.5 pl-8 pr-3 text-xs text-white focus:outline-none focus:border-zinc-700 placeholder-zinc-600"
            />
            <Search className="w-3.5 h-3.5 text-zinc-600 absolute left-2.5 top-2.5" />
          </div>
        </form>
      </div>

      {/* Asset Slide-out Detail Panel overlay */}
      {selectedAsset && (
        <div className="absolute top-6 right-6 bottom-6 w-96 z-20 glassmorphism rounded-2xl border border-zinc-800/80 shadow-2xl p-6 flex flex-col justify-between overflow-y-auto text-zinc-300">
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[9px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {selectedAsset.type}
                </span>
                <h3 className="text-lg font-bold text-white mt-1.5 leading-tight">{selectedAsset.name}</h3>
                <span className="text-xs text-zinc-500 font-mono">{selectedAsset.code}</span>
              </div>
              <button 
                onClick={() => { setSelectedAsset(null); clearTrace(); }}
                className="text-zinc-500 hover:text-zinc-300 text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Asset Properties List */}
            <div className="space-y-4 border-t border-zinc-800/60 pt-4">
              {selectedAsset.type === 'substation' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Rating Capacity</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.capacity_mva} MVA</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Voltage Ratio</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.voltage_level}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">District Zone</span>
                    <span className="text-sm font-semibold text-white">{selectedAsset.district || 'N/A'}</span>
                  </div>
                </>
              )}

              {selectedAsset.type === 'feeder' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Peak Load</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.peak_load_mw} MW</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Rated Capacity</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.rated_capacity_mw} MW</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Risk Index</span>
                      <span className="text-sm font-bold text-red-500 font-mono">{selectedAsset.risk_score}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Voltage Level</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.voltage_level}</span>
                    </div>
                  </div>
                </>
              )}

              {selectedAsset.type === 'transformer' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Transformer Rating</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.rating_kva} kVA</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Peak Load</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.peak_load_kva} kVA</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Loading %</span>
                      <span className={`text-sm font-bold font-mono ${selectedAsset.loading_percentage > 100 ? 'text-red-500' : 'text-green-500'}`}>
                        {selectedAsset.loading_percentage}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Risk Score</span>
                      <span className="text-sm font-bold text-red-400 font-mono">{selectedAsset.risk_score}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Connected Customers</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.customer_count}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Installation Year</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.installation_year || 'N/A'}</span>
                    </div>
                  </div>
                </>
              )}

              {selectedAsset.type === 'customer_cluster' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Estimated Demand</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.estimated_demand_kw} kW</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 block">Connected Users</span>
                      <span className="text-sm font-semibold text-white font-mono">{selectedAsset.customer_count}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Tariff Mix</span>
                    <div className="flex gap-2.5 mt-1.5">
                      {selectedAsset.tariff_mix && Object.entries(selectedAsset.tariff_mix).map(([k, v]: any) => (
                        <span key={k} className="text-[10px] font-bold font-mono px-2 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-zinc-400">
                          {k}: {v}%
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Topology Tracing Actions */}
            {selectedAsset.type !== 'substation' && (
              <div className="mt-8 border-t border-zinc-800/60 pt-5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3.5 flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-green-500" />
                  Topology Trace Engine
                </h4>
                <div className="flex gap-2">
                  <button 
                    onClick={handleTraceTopology}
                    disabled={isTracing}
                    className="flex-1 bg-green-500/10 hover:bg-green-500/15 border border-green-500/25 hover:border-green-500/35 text-green-400 text-xs font-bold py-2 rounded-lg cursor-pointer transition flex items-center justify-center gap-2"
                  >
                    <Navigation2 className="w-3.5 h-3.5" />
                    {isTracing ? 'Tracing...' : 'Run Trace'}
                  </button>
                  {traceResult && (
                    <button 
                      onClick={clearTrace}
                      className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-bold px-3.5 rounded-lg cursor-pointer transition"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Display Trace Results */}
                {traceResult && (
                  <div className="mt-4 p-3.5 bg-zinc-950 border border-zinc-800/60 rounded-xl space-y-2 text-xs">
                    <div className="flex justify-between items-center text-zinc-400">
                      <span>Upstream Grid supply points:</span>
                      <span className="font-bold text-white">{traceResult.upstream.length - 1}</span>
                    </div>
                    <div className="flex justify-between items-center text-zinc-400">
                      <span>Downstream impact points:</span>
                      <span className="font-bold text-white">{traceResult.downstream.length - 1}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="mt-6 flex justify-between items-center text-[10px] text-zinc-600 border-t border-zinc-850/60 pt-4">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              WGS-84 EPSG:4326
            </span>
            <span>GridTwin Nigeria</span>
          </div>
        </div>
      )}
    </div>
  )
}
