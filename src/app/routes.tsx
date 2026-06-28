import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/app/AppLayout';
import { HomePage } from '@/pages/HomePage';
import { EditorPage } from '@/pages/EditorPage';

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '');

export function AppRoutes() {
  return (
    <BrowserRouter basename={routerBasename || undefined}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/versions" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
