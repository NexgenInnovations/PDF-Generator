import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { NavBar } from './components/NavBar.js';
import { RoleGuard } from './components/RoleGuard.js';

const TemplateList = lazy(() => import('./pages/TemplateList.js'));
const TemplateDesigner = lazy(() => import('./pages/TemplateDesigner.js'));
const FormFill = lazy(() => import('./pages/FormFill.js'));

export default function App() {
  return (
    <div style={{ minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <NavBar />
      <Suspense fallback={<div style={{ padding: 32 }}>Loading…</div>}>
        <Routes>
          <Route path="/" element={<TemplateList />} />
          <Route
            path="/templates/new"
            element={
              <RoleGuard allowed={['Admin', 'Designer']}>
                <TemplateDesigner />
              </RoleGuard>
            }
          />
          <Route
            path="/templates/:id/edit"
            element={
              <RoleGuard allowed={['Admin', 'Designer']}>
                <TemplateDesigner />
              </RoleGuard>
            }
          />
          <Route path="/templates/:id/fill" element={<FormFill />} />
        </Routes>
      </Suspense>
    </div>
  );
}
