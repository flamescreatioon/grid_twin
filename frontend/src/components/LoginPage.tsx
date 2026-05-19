import React, { useState } from 'react'
import { useStore } from '../store'
import { Zap, Lock, Mail, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const { login, error, loading } = useStore()
  const [email, setEmail] = useState<string>('admin@gridtwin.ng')
  const [password, setPassword] = useState<string>('admin123')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await login(email, password)
  }

  return (
    <div className="w-screen h-screen bg-zinc-950 flex justify-center items-center relative overflow-hidden">
      {/* Background radial highlights */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/5 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="w-full max-w-md p-8 glassmorphism border border-zinc-900 rounded-2xl shadow-2xl relative z-10 text-zinc-300">
        
        {/* Logo and Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)] mx-auto mb-4">
            <Zap className="w-7 h-7 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">GridTwin Nigeria</h2>
          <p className="text-xs text-zinc-500 mt-1">Utility Planning & GIS Analysis Portal</p>
        </div>

        {/* Errors display */}
        {error && (
          <div className="mb-5 p-3.5 bg-red-950/20 border border-red-900/40 rounded-xl flex items-center gap-2.5 text-red-400 text-xs font-medium">
            <AlertCircle className="w-4.5 h-4.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="text-zinc-500 font-semibold block mb-1.5">Email Address</label>
            <div className="relative">
              <input 
                type="email" 
                required
                placeholder="name@gridtwin.ng"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg py-2.5 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-zinc-700 placeholder-zinc-600"
              />
              <Mail className="w-4 h-4 text-zinc-650 absolute left-3 top-3" />
            </div>
          </div>

          <div>
            <label className="text-zinc-500 font-semibold block mb-1.5">Password</label>
            <div className="relative">
              <input 
                type="password" 
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg py-2.5 pl-9 pr-4 text-xs text-white focus:outline-none focus:border-zinc-700 placeholder-zinc-600"
              />
              <Lock className="w-4 h-4 text-zinc-650 absolute left-3 top-3" />
            </div>
          </div>

          <div className="pt-2">
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-green-500 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-zinc-950 font-bold py-2.5 rounded-lg cursor-pointer transition shadow-md shadow-green-500/10 text-center"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center text-[10px] text-zinc-600 border-t border-zinc-900/80 pt-5">
          <p>Restricted to authorized AEDC Planning Personnel.</p>
        </div>
      </div>
    </div>
  )
}
