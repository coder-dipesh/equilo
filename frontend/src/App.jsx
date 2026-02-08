import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ThemeProvider } from './ThemeContext';
import ThemeToggle from './ThemeToggle';
import Login from './pages/Login';
import Register from './pages/Register';
import Places from './pages/Places';
import PlaceDetail from './pages/PlaceDetail';
import Join from './pages/Join';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const next = window.location.pathname + window.location.search;
  if (loading) return <div className="pb-8"><p>Loading…</p></div>;
  if (!user) return <Navigate to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />;
  return children;
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
            <Places />
          </ProtectedRoute>
        }
      />
      <Route
        path="/places/:id"
        element={
          <ProtectedRoute>
            <PlaceDetail />
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
          <div className="max-w-[560px] mx-auto px-6 py-6 relative">
            <div className="fixed top-4 right-4 z-10 sm:right-auto sm:left-[calc(50%+280px+1.5rem)]">
              <ThemeToggle />
            </div>
            <AppRoutes />
          </div>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
