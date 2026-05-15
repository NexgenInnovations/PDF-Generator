import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { RoleGuard } from './components/RoleGuard.js';
import { LoadingScreen } from './components/LoadingScreen.js';
import { TransitionLoader } from './components/TransitionLoader.js';

const Dashboard = lazy(() => import('./pages/Dashboard.js'));
const TemplateList = lazy(() => import('./pages/TemplateList.js'));
const TemplateDesigner = lazy(() => import('./pages/TemplateDesigner.js'));
const FormFill = lazy(() => import('./pages/FormFill.js'));
const NotFound = lazy(() => import('./pages/NotFound.js'));

export default function App() {
  return (
    <>
      <TransitionLoader />
      <Suspense fallback={<LoadingScreen variant="dark" status="Loading your workspace" />}>
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
