import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import { PageLoader } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/projects/ProjectsPage';
import ProjectFormPage from './pages/projects/ProjectFormPage';
import ProjectDetailPage from './pages/projects/ProjectDetailPage';
import ContractorsPage from './pages/contractors/ContractorsPage';
import ContractorDetailPage from './pages/contractors/ContractorDetailPage';
import FinanceLayout from './pages/finance/FinanceLayout';
import FinanceOverview from './pages/finance/FinanceOverview';
import TransactionsPage from './pages/finance/TransactionsPage';
import InvoicesPage from './pages/finance/InvoicesPage';
import QuotationsPage from './pages/finance/QuotationsPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';

function RequireAuth({ children }) {
  const { admin, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="min-h-screen"><PageLoader /></div>;
  if (!admin) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export default function App() {
  const { admin, ready } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={ready && admin ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/new" element={<ProjectFormPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="projects/:id/edit" element={<ProjectFormPage />} />
        <Route path="contractors" element={<ContractorsPage />} />
        <Route path="contractors/:id" element={<ContractorDetailPage />} />
        <Route path="finance" element={<FinanceLayout />}>
          <Route index element={<FinanceOverview />} />
          <Route path="transactions" element={<TransactionsPage preset="all" />} />
          <Route path="income" element={<TransactionsPage preset="income" />} />
          <Route path="expenses" element={<TransactionsPage preset="expense" />} />
          <Route path="collections" element={<TransactionsPage preset="collections" />} />
          <Route path="contractor-payments" element={<TransactionsPage preset="contractor" />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="quotations" element={<QuotationsPage />} />
        </Route>
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
