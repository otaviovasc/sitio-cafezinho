import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/ui';
import { api } from './lib/api';
import { AnimalDetailPage, AnimalsPage, NewAnimalPage } from './pages/AnimalsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { LoginPage } from './pages/LoginPage';
import { ImportMilkPage, MilkSessionDetailPage, MilkSessionsPage } from './pages/MilkPages';
import { MilkCollectionDetailPage, NewMilkCollectionPage } from './pages/MilkCollectionPages';
import { MastitisCaseDetailPage, MastitisCasesPage, NewMastitisCasePage } from './pages/MastitisPages';
import { FinancePage, NewRevenuePage, RevenueDetailPage } from './pages/FinancePages';
import { DataSettingsPage } from './pages/DataSettingsPage';
import { NewPurchasePage, PurchaseDetailPage, PurchasesPage, SupplierDetailPage, SuppliersPage } from './pages/PurchasePages';
import { ImportWeightsPage, WeightSessionDetailPage, WeightSessionsPage } from './pages/WeightPages';

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const location = useLocation();
  useEffect(() => {
    api<{ authenticated: boolean }>('/api/session').then((result) => setAuthenticated(result.authenticated)).catch(() => setAuthenticated(false));
  }, []);
  useEffect(() => {
    const expire = () => setAuthenticated(false);
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);

  if (authenticated === null) return <div className="page"><LoadingState /></div>;
  if (!authenticated) {
    if (location.pathname !== '/entrar') return <Navigate to="/entrar" replace />;
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }
  if (location.pathname === '/entrar') return <Navigate to="/" replace />;

  return <AppShell><Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/rebanho" element={<AnimalsPage />} />
    <Route path="/rebanho/novo" element={<NewAnimalPage />} />
    <Route path="/rebanho/:id" element={<AnimalDetailPage />} />
    <Route path="/producao" element={<MilkSessionsPage />} />
    <Route path="/producao/nova" element={<Navigate to="/producao/importar" replace />} />
    <Route path="/producao/importar" element={<ImportMilkPage />} />
    <Route path="/producao/coletas/nova" element={<NewMilkCollectionPage />} />
    <Route path="/producao/coletas/:id" element={<MilkCollectionDetailPage />} />
    <Route path="/mastite" element={<MastitisCasesPage />} />
    <Route path="/mastite/nova" element={<NewMastitisCasePage />} />
    <Route path="/mastite/:id" element={<MastitisCaseDetailPage />} />
    <Route path="/financeiro" element={<FinancePage />} />
    <Route path="/receitas/nova" element={<NewRevenuePage />} />
    <Route path="/receitas/:id" element={<RevenueDetailPage />} />
    <Route path="/configuracoes/dados" element={<DataSettingsPage />} />
    <Route path="/producao/:id" element={<MilkSessionDetailPage />} />
    <Route path="/compras" element={<PurchasesPage />} />
    <Route path="/compras/nova" element={<NewPurchasePage />} />
    <Route path="/compras/:id" element={<PurchaseDetailPage />} />
    <Route path="/fornecedores" element={<SuppliersPage />} />
    <Route path="/fornecedores/:id" element={<SupplierDetailPage />} />
    <Route path="/documentos" element={<DocumentsPage />} />
    <Route path="/pesos" element={<WeightSessionsPage />} />
    <Route path="/pesos/importar" element={<ImportWeightsPage />} />
    <Route path="/pesos/:id" element={<WeightSessionDetailPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AppShell>;
}
