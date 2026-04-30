import { Routes, Route, Navigate } from 'react-router-dom'
import { CreateDungeonPage } from './pages/CreateDungeonPage'
import DungeonDetailPage from './pages/DungeonDetailPage'
import LibraryPage from './pages/LibraryPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dungeons" replace />} />
      <Route path="/dungeons" element={<LibraryPage />} />
      <Route path="/dungeons/new" element={<CreateDungeonPage />} />
      <Route path="/dungeons/:id" element={<DungeonDetailPage />} />
      <Route
        path="*"
        element={
          <main className="container">
            <h1>Not found</h1>
            <a href="/dungeons">← Back to library</a>
          </main>
        }
      />
    </Routes>
  )
}
