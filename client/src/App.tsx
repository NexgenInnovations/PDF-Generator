import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { RoleGuard } from './components/RoleGuard.js';

const Dashboard = lazy(() => import('./pages/Dashboard.js'));
const TemplateList = lazy(() => import('./pages/TemplateList.js'));
const TemplateDesigner = lazy(() => import('./pages/TemplateDesigner.js'));
const FormFill = lazy(() => import('./pages/FormFill.js'));
const Assets = lazy(() => import('./pages/Assets.js'));
const NotFound = lazy(() => import('./pages/NotFound.js'));

function RouteFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '2px solid var(--nx-hairline)',
          borderTopColor: 'var(--nx-accent)',
          animation: 'nx-spin 0.6s linear infinite',
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/templates" element={<TemplateList />} />
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
        <Route
          path="/assets"
          element={
            <RoleGuard allowed={['Admin', 'Designer']}>
              <Assets />
            </RoleGuard>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
