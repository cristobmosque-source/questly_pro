import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here

import EntryScreen from '@/pages/questly/EntryScreen';
import KidHome from '@/pages/questly/KidHome';
import KidShop from '@/pages/questly/KidShop';
import KidHistory from '@/pages/questly/KidHistory';
import ParentDashboard from '@/pages/questly/ParentDashboard';
import ParentToday from '@/pages/questly/ParentToday';
import ParentQuests from '@/pages/questly/ParentQuests';
import ParentApprovals from '@/pages/questly/ParentApprovals';
import ParentRewards from '@/pages/questly/ParentRewards';
import ParentKids from '@/pages/questly/ParentKids';
import ParentKidDetail from '@/pages/questly/ParentKidDetail';
import KidShell from '@/components/questly/KidShell';
import ParentShell from '@/components/questly/ParentShell';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<EntryScreen />} />
      <Route element={<KidShell />}>
        <Route path="/kid" element={<KidHome />} />
        <Route path="/kid/shop" element={<KidShop />} />
        <Route path="/kid/history" element={<KidHistory />} />
      </Route>
      <Route element={<ParentShell />}>
        <Route path="/parent" element={<ParentDashboard />} />
        <Route path="/parent/today" element={<ParentToday />} />
        <Route path="/parent/quests" element={<ParentQuests />} />
        <Route path="/parent/approvals" element={<ParentApprovals />} />
        <Route path="/parent/rewards" element={<ParentRewards />} />
        <Route path="/parent/kids" element={<ParentKids />} />
        <Route path="/parent/kids/:id" element={<ParentKidDetail />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App