import { create } from 'zustand'
import axios from 'axios'

// API Base URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_PREFIX = `${API_URL}/api/v1`

// Configure Axios defaults to automatically include Bearer Token
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('gridtwin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, (error) => {
  return Promise.reject(error)
})

export interface UserProfile {
  id: number
  email: string
  full_name: string
  role: string
  is_active: boolean
}

export interface GridAsset {
  id: number
  code: string
  name: string
  type: 'substation' | 'feeder' | 'transformer' | 'customer_cluster'
  [key: string]: any
}

interface GridTwinState {
  token: string | null
  user: UserProfile | null
  isAuthenticated: boolean
  activeView: string // 'dashboard' | 'map' | 'assets' | 'simulation' | 'investment' | 'reports' | 'admin'
  selectedAsset: GridAsset | null
  substations: any[]
  feeders: any[]
  transformers: any[]
  customerClusters: any[]
  highRiskAssets: { transformers: any[]; feeders: any[] }
  loading: boolean
  error: string | null
  
  // Auth actions
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  fetchMe: () => Promise<boolean>
  
  // UI Navigation
  setActiveView: (view: string) => void
  setSelectedAsset: (asset: GridAsset | null) => void
  
  // Grid data actions
  fetchGridData: () => Promise<void>
  fetchHighRisk: () => Promise<void>
}

export const useStore = create<GridTwinState>((set, get) => ({
  token: localStorage.getItem('gridtwin_token'),
  user: null,
  isAuthenticated: false,
  activeView: 'dashboard',
  selectedAsset: null,
  substations: [],
  feeders: [],
  transformers: [],
  customerClusters: [],
  highRiskAssets: { transformers: [], feeders: [] },
  loading: false,
  error: null,

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const response = await axios.post(`${API_PREFIX}/auth/login`, { email, password })
      const { access_token, user } = response.data
      
      localStorage.setItem('gridtwin_token', access_token)
      set({
        token: access_token,
        user,
        isAuthenticated: true,
        loading: false
      })
      
      // Load initial data
      get().fetchGridData()
      get().fetchHighRisk()
      return true
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || 'Authentication failed'
      set({ error: errMsg, loading: false })
      return false
    }
  },

  logout: () => {
    localStorage.removeItem('gridtwin_token')
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      activeView: 'dashboard',
      selectedAsset: null,
      substations: [],
      feeders: [],
      transformers: [],
      customerClusters: []
    })
    axios.post(`${API_PREFIX}/auth/logout`).catch(() => {})
  },

  fetchMe: async () => {
    const token = get().token
    if (!token) return false
    
    try {
      const response = await axios.get(`${API_PREFIX}/auth/me`)
      set({ user: response.data, isAuthenticated: true })
      get().fetchGridData()
      get().fetchHighRisk()
      return true
    } catch (err) {
      // Token is likely invalid or expired
      get().logout()
      return false
    }
  },

  setActiveView: (view) => set({ activeView: view, selectedAsset: null }),
  setSelectedAsset: (asset) => set({ selectedAsset: asset }),

  fetchGridData: async () => {
    set({ loading: true })
    try {
      const [subsRes, feedersRes, txRes, ccRes] = await Promise.all([
        axios.get(`${API_PREFIX}/assets/substations`),
        axios.get(`${API_PREFIX}/assets/feeders`),
        axios.get(`${API_PREFIX}/assets/transformers`),
        axios.get(`${API_PREFIX}/assets/customer-clusters`)
      ])
      
      set({
        substations: subsRes.data,
        feeders: feedersRes.data,
        transformers: txRes.data,
        customerClusters: ccRes.data,
        loading: false
      })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  fetchHighRisk: async () => {
    try {
      const response = await axios.get(`${API_PREFIX}/risk/high-risk`)
      set({ highRiskAssets: response.data })
    } catch (err) {
      console.error('Error fetching high risk assets:', err)
    }
  }
}))
