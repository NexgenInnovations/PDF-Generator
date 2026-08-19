import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { RoleGuard } from './components/RoleGuard.js';
import { AuthGuard } from './components/AuthGuard.js';

const Landing = lazy(() => import('./pages/Landing.js'));
const Waitlist = lazy(() => import('./pages/Waitlist.js'));
const Login = lazy(() => import('./pages/Login.js'));
const Onboarding = lazy(() => import('./pages/Onboarding.js'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.js'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.js'));
const Dashboard = lazy(() => import('./pages/Dashboard.js'));
const TemplateList = lazy(() => import('./pages/TemplateList.js'));
const TemplateGallery = lazy(() => import('./pages/TemplateGallery.js'));
const TemplateDesigner = lazy(() => import('./pages/TemplateDesigner.js'));
const FormFill = lazy(() => import('./pages/FormFill.js'));
const Assets = lazy(() => import('./pages/Assets.js'));
const Letterheads = lazy(() => import('./pages/Letterheads.js'));
const Submissions = lazy(() => import('./pages/Submissions.js'));
const AllSubmissions = lazy(() => import('./pages/AllSubmissions.js'));
const Settings = lazy(() => import('./pages/Settings.js'));
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
        <Route path="/welcome" element={<Landing />} />
        <Route path="/waitlist" element={<Waitlist />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/join/:code" element={<Onboarding />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/templates/:id/fill" element={<FormFill />} />

        <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/templates" element={<AuthGuard><TemplateList /></AuthGuard>} />
        <Route
          path="/templates/gallery"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <TemplateGallery />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/templates/new"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <TemplateDesigner />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/templates/:id/edit"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <TemplateDesigner />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/assets"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <Assets />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/letterheads"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <Letterheads />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/templates/:id/submissions"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <Submissions />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/submissions"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <AllSubmissions />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin']}>
                <Settings />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
