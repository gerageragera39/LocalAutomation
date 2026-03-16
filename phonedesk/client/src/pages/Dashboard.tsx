import type { AxiosError } from "axios";
import { useMemo, useRef, useState, type TouchEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppGrid } from "../components/AppGrid";
import { useApps } from "../hooks/useApps";
import { useAuthStore } from "../stores/authStore";
import type { ApiErrorResponse, AppEntry } from "../types";

const PULL_THRESHOLD = 80;

export const Dashboard = () => {
  const navigate = useNavigate();
  const clearSession = useAuthStore((state) => state.clearSession);
  const mustChangePin = useAuthStore((state) => state.mustChangePin);
  const { apps, statuses, isLoading, isFetching, refetchApps, refreshStatuses, launchApp } = useApps();

  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pullDistance, setPullDistance] = useState(0);

  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  const pullLabel = useMemo(() => {
    if (isFetching) {
      return "Обновляем...";
    }

    if (pullDistance > PULL_THRESHOLD) {
      return "Отпустите для обновления";
    }

    return "Потяните вниз для обновления";
  }, [isFetching, pullDistance]);

  const logout = () => {
    clearSession();
    navigate("/pin", { replace: true });
  };

  const handleLaunch = async (app: AppEntry) => {
    setError("");
    setLaunchingId(app.id);

    if (navigator.vibrate) {
      navigator.vibrate(20);
    }

    try {
      await launchApp(app.id);
    } catch (rawError) {
      const errorResponse = rawError as AxiosError<ApiErrorResponse>;
      setError(errorResponse.response?.data?.message ?? "Не удалось запустить приложение.");
    } finally {
      setLaunchingId(null);
    }
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const element = event.currentTarget;

    if (element.scrollTop > 0) {
      startYRef.current = null;
      pullingRef.current = false;
      return;
    }

    startYRef.current = event.touches[0].clientY;
    pullingRef.current = true;
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!pullingRef.current || startYRef.current === null) {
      return;
    }

    const delta = event.touches[0].clientY - startYRef.current;

    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    setPullDistance(Math.min(120, delta));
  };

  const onTouchEnd = async () => {
    if (!pullingRef.current) {
      return;
    }

    if (pullDistance > PULL_THRESHOLD) {
      refreshStatuses();
      await refetchApps();
    }

    setPullDistance(0);
    pullingRef.current = false;
    startYRef.current = null;
  };

  return (
    <div
      className="mx-auto min-h-screen w-full max-w-5xl overflow-y-auto px-4 pb-8 pt-4"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => {
        void onTouchEnd();
      }}
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-surface/80 p-4">
        <div>
          <h1 className="text-2xl font-bold">Панель запуска</h1>
          {mustChangePin && <p className="text-sm text-yellow-300">Смените PIN в разделе Admin.</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link to="/mouse" className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10">
            Мышь
          </Link>
          <Link to="/admin" className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10">
            Admin
          </Link>
          <button type="button" onClick={logout} className="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10">
            Выйти
          </button>
        </div>
      </header>

      <div className="mb-3 h-8 text-center text-xs text-white/60" style={{ opacity: pullDistance > 0 || isFetching ? 1 : 0 }}>
        {pullLabel}
      </div>

      {error && <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p>}

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-surface/60 p-8 text-center text-white/70">Загрузка приложений...</div>
      ) : (
        <AppGrid apps={apps} statuses={statuses} disabled={Boolean(launchingId)} onLaunch={handleLaunch} />
      )}
    </div>
  );
};
