import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/ui';
import { api } from './lib/api';
import { VoiceContext } from './lib/voice-context';
import { RevisarPage } from './pages/RevisarPage';
import { AnimalDetailPage, AnimalsPage, NewAnimalPage } from './pages/AnimalsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { LoginPage } from './pages/LoginPage';
import { ImportMilkPage, MilkSessionDetailPage, MilkSessionsPage } from './pages/MilkPages';
import { NewDailyMilkTotalPage, NewIndividualControlPage } from './pages/MilkCreatePages';
import { MilkCollectionDetailPage, NewMilkCollectionPage } from './pages/MilkCollectionPages';
import { MastitisCaseDetailPage, MastitisCasesPage, NewMastitisCasePage } from './pages/MastitisPages';
import { FinancePage, NewRevenuePage, RevenueDetailPage } from './pages/FinancePages';
import { DataSettingsPage } from './pages/DataSettingsPage';
import { NewPurchasePage, PurchaseDetailPage, PurchasesPage, SupplierDetailPage, SuppliersPage } from './pages/PurchasePages';
import { NewWeightSessionPage, WeightSessionDetailPage, WeightSessionsPage } from './pages/WeightPages';
import { MilkPricePage } from './pages/MilkPricePage';

export function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const location = useLocation();
  const refreshSession = useCallback(() => api<{ authenticated: boolean; voiceEnabled?: boolean }>('/api/session')
    .then((result) => { setAuthenticated(result.authenticated); setVoiceEnabled(Boolean(result.voiceEnabled)); })
    .catch(() => setAuthenticated(false)), []);
  useEffect(() => { void refreshSession(); }, [refreshSession]);
  useEffect(() => {
    const expire = () => setAuthenticated(false);
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);

  if (authenticated === null) return <div className="page"><LoadingState /></div>;
  if (!authenticated) {
    if (location.pathname !== '/entrar') return <Navigate to="/entrar" replace />;
    return <LoginPage onLogin={() => { void refreshSession(); }} />;
  }
  if (location.pathname === '/entrar') return <Navigate to="/" replace />;

  return <VoiceContext.Provider value={{ voiceEnabled }}><AppShell><Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/revisar" element={<RevisarPage />} />
    <Route path="/rebanho" element={<AnimalsPage />} />
    <Route path="/rebanho/novo" element={<NewAnimalPage />} />
    <Route path="/rebanho/:id" element={<AnimalDetailPage />} />
    <Route path="/producao" element={<MilkSessionsPage />} />
    <Route path="/producao/nova" element={<Navigate to="/producao/individual/novo" replace />} />
    <Route path="/producao/total/novo" element={<NewDailyMilkTotalPage />} />
    <Route path="/producao/individual/novo" element={<NewIndividualControlPage />} />
    <Route path="/producao/importar" element={<ImportMilkPage />} />
    <Route path="/producao/coletas/nova" element={<NewMilkCollectionPage />} />
    <Route path="/producao/coletas/:id" element={<MilkCollectionDetailPage />} />
    <Route path="/mastite" element={<MastitisCasesPage />} />
    <Route path="/mastite/nova" element={<NewMastitisCasePage />} />
    <Route path="/mastite/:id" element={<MastitisCaseDetailPage />} />
    <Route path="/financeiro" element={<FinancePage />} />
    <Route path="/financeiro/preco-leite" element={<MilkPricePage />} />
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
    <Route path="/pesos/novo" element={<NewWeightSessionPage />} />
    <Route path="/pesos/importar" element={<Navigate to="/pesos/novo" replace />} />
    <Route path="/pesos/:id" element={<WeightSessionDetailPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AppShell></VoiceContext.Provider>;
}
