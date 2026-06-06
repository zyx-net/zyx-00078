import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import Login from '@/pages/Login';
import Layout from '@/components/Layout';
import CaseList from '@/pages/CaseList';
import CaseDetail from '@/pages/CaseDetail';
import NewCase from '@/pages/NewCase';
import ExportRefunds from '@/pages/ExportRefunds';
import ExportHistory from '@/pages/ExportHistory';
import BatchHistory from '@/pages/BatchHistory';
import RuleConfig from '@/pages/RuleConfig';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user } = useAuthStore();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/cases" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { user } = useAuthStore();

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/cases" replace /> : <Login />}
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/cases" replace />} />
          <Route path="cases" element={<CaseList />} />
          <Route path="cases/:id" element={<CaseDetail />} />
          <Route
            path="cases/new"
            element={
              <ProtectedRoute allowedRoles={['leader']}>
                <NewCase />
              </ProtectedRoute>
            }
          />
          <Route
            path="export"
            element={
              <ProtectedRoute allowedRoles={['cs']}>
                <ExportRefunds />
              </ProtectedRoute>
            }
          />
          <Route
            path="export/history"
            element={
              <ProtectedRoute allowedRoles={['cs']}>
                <ExportHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="batch"
            element={
              <ProtectedRoute allowedRoles={['cs']}>
                <BatchHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="batch/:batchId"
            element={
              <ProtectedRoute allowedRoles={['cs']}>
                <BatchHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="rules"
            element={
              <ProtectedRoute allowedRoles={['cs']}>
                <RuleConfig />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to={user ? "/cases" : "/login"} replace />} />
      </Routes>
    </Router>
  );
}
