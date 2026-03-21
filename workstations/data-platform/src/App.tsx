import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { CatalogPage } from './pages/CatalogPage'
import { LineagePage } from './pages/LineagePage'
import { KnowledgePage } from './pages/KnowledgePage'
import { PipelinesPage } from './pages/PipelinesPage'
import { QualityPage } from './pages/QualityPage'
import { TopologyPage } from './pages/TopologyPage'
import { StoragePage } from './pages/StoragePage'
import { BackupPage } from './pages/BackupPage'
import { useApiInit } from './hooks/useApiInit'

export default function App() {
  useApiInit()
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/lineage" element={<LineagePage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/pipelines" element={<PipelinesPage />} />
          <Route path="/quality" element={<QualityPage />} />
          <Route path="/topology" element={<TopologyPage />} />
          <Route path="/storage" element={<StoragePage />} />
          <Route path="/backup" element={<BackupPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
