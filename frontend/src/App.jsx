import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { PreferencesProvider } from './PreferencesContext';
import { Skeleton } from './components/Skeleton';
import OfflineBanner from './components/OfflineBanner';
import Navbar from './Navbar';
import BottomNav from './BottomNav';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Activity from './pages/Activity';
import Places from './pages/Places';
import PlaceDetail from './pages/PlaceDetail';
import Settings from './pages/Settings';
import Join from './pages/Join';
import Notifications from './pages/Notifications';
import Landing from './pages/Landing';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const next = window.location.pathname + window.location.search;
  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-text-primary">
        <div className="h-1 w-full bg-primary" aria-hidden />
        <header className="sticky top-0 z-50 w-full bg-surface border-b border-border shadow-card">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
            <Skeleton className="h-7 w-20 rounded" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-10 w-24 rounded-lg" />
            </div>
          </div>
        </header>
        <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
          <div className="space-y-6 animate-fade-in">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="rounded-2xl border border-base-300 bg-surface p-6 space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <div className="flex gap-3">
                <Skeleton className="h-12 flex-1 rounded-lg" />
                <Skeleton className="h-12 flex-1 rounded-lg" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }
  if (!user) return <Navigate to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />;
  return children;
}

function ProtectedLayout({ children }) {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Navbar />
      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

function HomeRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-text-primary">
        <div className="h-1 w-full bg-primary" aria-hidden />
        <header className="sticky top-0 z-50 w-full bg-surface border-b border-border shadow-card">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14 sm:h-16">
            <Skeleton className="h-7 w-20 rounded" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-10 w-24 rounded-lg" />
            </div>
          </div>
        </header>
        <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
          <div className="space-y-6 animate-fade-in">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
            <div className="rounded-2xl border border-base-300 bg-surface p-6 space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <div className="flex gap-3">
                <Skeleton className="h-12 flex-1 rounded-lg" />
                <Skeleton className="h-12 flex-1 rounded-lg" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return (
    <ProtectedLayout>
      <Dashboard />
    </ProtectedLayout>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/join/:token" element={<Join />} />
      <Route
        path="/"
        element={<HomeRoute />}
      />
      <Route
        path="/places"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <Places />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/activity"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <Activity />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/places/:id"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <PlaceDetail />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <Settings />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <Notifications />
            </ProtectedLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <PreferencesProvider>
            <OfflineBanner />
            <AppRoutes />
          </PreferencesProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
