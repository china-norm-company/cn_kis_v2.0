import { HashRouter, Route, Routes } from 'react-router-dom'
import { ErrorBoundary, HealthPage } from '@cn-kis/ui-kit'
import { AppLayout } from './layouts/AppLayout'
import { HomePage } from './pages/HomePage'

export default function App() {
  return (
    <ErrorBoundary workstation="data-platform">
      <HashRouter>
        <Routes>
          <Route path="/health" element={<HealthPage workstation="data-platform" />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<HomePage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
