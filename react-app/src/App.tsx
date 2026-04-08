import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { BuildingPage } from './pages/BuildingPage'
import { BuildingsPage } from './pages/BuildingsPage'
import { CreateBuildingPage } from './pages/CreateBuildingPage'
import { HelpPage } from './pages/HelpPage'
import { SettingsPage } from './pages/SettingsPage'
import { TagDetailsPage } from './pages/TagDetailsPage'

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/buildings" replace />} />
        <Route path="/buildings" element={<BuildingsPage />} />
        <Route path="/buildings/new" element={<CreateBuildingPage />} />
        <Route path="/buildings/:buildingId" element={<BuildingPage />} />
        <Route
          path="/buildings/:buildingId/tags/:tagId"
          element={<TagDetailsPage />}
        />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/buildings" replace />} />
      </Route>
    </Routes>
  )
}

export default App
