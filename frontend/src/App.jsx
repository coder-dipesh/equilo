import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import { PreferencesProvider } from './PreferencesContext';
import Navbar from './Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Places from './pages/Places';
import PlaceDetail from './pages/PlaceDetail';
import Settings from './pages/Settings';
import Join from './pages/Join';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const next = window.location.pathname + window.location.search;
  if (loading) return <div className="min-h-screen pb-8 bg-bg"><p>Loading…</p></div>;
  if (!user) return <Navigate to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />;
  return children;
}

function ProtectedLayout({ children }) {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Navbar />
      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
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
        element={
          <ProtectedRoute>
            <ProtectedLayout>
              <Places />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <PreferencesProvider>
            <AppRoutes />
          </PreferencesProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
