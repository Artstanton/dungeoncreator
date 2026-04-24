import { Routes, Route, Navigate } from 'react-router-dom'
import { CreateDungeonPage } from './pages/CreateDungeonPage'
import DungeonDetailPage from './pages/DungeonDetailPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dungeons/new" replace />} />
      <Route path="/dungeons/new" element={<CreateDungeonPage />} />
      <Route path="/dungeons/:id" element={<DungeonDetailPage />} />
      <Route
        path="*"
        element={
          <main className="container">
            <h1>Not found</h1>
            <a href="/dungeons/new">← Create a dungeon</a>
          </main>
        }
      />
    </Routes>
  )
}
