import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { Toaster } from 'react-hot-toast'
import LoginPage from './pages/auth/LoginPage'
import Layout from './components/Layout'
import Dashboard from './pages/dashboard/Dashboard'
import Companies from './pages/companies/Companies'
import Vehicles from './pages/vehicles/Vehicles'
import Drivers from './pages/drivers/Drivers'
import Fuel from './pages/fuel/Fuel'
import Maintenance from './pages/maintenance/Maintenance'
import Fines from './pages/fines/Fines'
import Inspections from './pages/inspections/Inspections'
import Admin from './pages/admin/Admin'
import PDV from './pages/pdv/PDV'
import Reports from './pages/reports/Reports'
import Suppliers from './pages/suppliers/Suppliers'
import Signatories from './pages/signatories/Signatories'
import Orders from './pages/orders/Orders'
import Mileage from './pages/mileage/Mileage'

function PrivateRoute({ children }) {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    supabase.auth.onAuthStateChange((_e, s) => setSession(s))
  }, [])
  if (session === undefined) return (
    <div className="flex items-center justify-center h-screen bg-slate-900">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
  return session ? children : <Navigate to="/login" />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="companies"   element={<Companies />} />
          <Route path="vehicles"    element={<Vehicles />} />
          <Route path="drivers"     element={<Drivers />} />
          <Route path="fuel"        element={<Fuel />} />
          <Route path="maintenance" element={<Maintenance />} />
          <Route path="fines"       element={<Fines />} />
          <Route path="inspections" element={<Inspections />} />
          <Route path="suppliers"   element={<Suppliers />} />
          <Route path="admin"       element={<Admin />} />
          <Route path="pdv"         element={<PDV />} />
          <Route path="reports"     element={<Reports />} />
          <Route path="signatories" element={<Signatories />} />
          <Route path="orders" element={<Orders />} />
          <Route path="mileage" element={<Mileage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}