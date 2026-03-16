import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Admin } from "./pages/Admin";
import { Dashboard } from "./pages/Dashboard";
import { MousePad } from "./pages/MousePad";
import { PinScreen } from "./pages/PinScreen";
import { api } from "./services/api";
import { useAuthStore } from "./stores/authStore";

const RootRedirect = () => {
  const token = useAuthStore((state) => state.token);
  return <Navigate to={token ? "/dashboard" : "/pin"} replace />;
};

const ProtectedRoute = ({ children }: { children: JSX.Element }) => {
  const token = useAuthStore((state) => state.token);

  if (!token) {
    return <Navigate to="/pin" replace />;
  }

  return children;
};

export const App = () => {
  const token = useAuthStore((state) => state.token);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setMustChangePin = useAuthStore((state) => state.setMustChangePin);

  useEffect(() => {
    if (!token) {
      return;
    }

    api
      .get<{ valid: boolean; mustChangePin: boolean }>("/auth/verify")
      .then((response) => {
        setMustChangePin(Boolean(response.data.mustChangePin));
      })
      .catch(() => {
        clearSession();
      });
  }, [token, clearSession, setMustChangePin]);

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/pin" element={<PinScreen />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/mouse"
        element={
          <ProtectedRoute>
            <MousePad />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
