import type { AxiosError } from "axios";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AddAppModal, type AddAppPayload } from "../components/AddAppModal";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import type { ApiErrorResponse, AppEntry } from "../types";

const ADMIN_APPS_QUERY_KEY = ["admin-apps"];

interface SortableRowProps {
  app: AppEntry;
  draft: Partial<AppEntry> | undefined;
  onChange: (id: string, patch: Partial<AppEntry>) => void;
  onSave: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const SortableRow = ({ app, draft, onChange, onSave, onDelete }: SortableRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const name = draft?.name ?? app.name;
  const executablePath = draft?.executablePath ?? app.executablePath;
  const category = draft?.category ?? app.category ?? "";

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-white/10">
      <td className="p-2 text-center">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab rounded border border-white/20 px-2 py-1 text-xs"
        >
          drag
        </button>
      </td>
      <td className="p-2 text-xs">{app.sortOrder}</td>
      <td className="p-2">
        <input
          value={name}
          onChange={(event) => onChange(app.id, { name: event.target.value })}
          className="w-full rounded border border-white/15 bg-base px-2 py-1 text-sm"
        />
      </td>
      <td className="p-2">
        <input
          value={executablePath}
          onChange={(event) => onChange(app.id, { executablePath: event.target.value })}
          className="w-full rounded border border-white/15 bg-base px-2 py-1 text-xs"
        />
      </td>
      <td className="p-2">
        <input
          value={category}
          onChange={(event) => onChange(app.id, { category: event.target.value })}
          className="w-full rounded border border-white/15 bg-base px-2 py-1 text-sm"
        />
      </td>
      <td className="p-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              void onSave(app.id);
            }}
            className="rounded border border-accent/70 px-2 py-1 text-xs"
          >
            Сохранить
          </button>
          <button
            type="button"
            onClick={() => {
              void onDelete(app.id);
            }}
            className="rounded border border-danger/70 px-2 py-1 text-xs text-danger"
          >
            Удалить
          </button>
        </div>
      </td>
    </tr>
  );
};

export const Admin = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearSession = useAuthStore((state) => state.clearSession);
  const setMustChangePin = useAuthStore((state) => state.setMustChangePin);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<AppEntry>>>({});
  const [orderedApps, setOrderedApps] = useState<AppEntry[]>([]);
  const [scanResults, setScanResults] = useState<AppEntry[]>([]);
  const [pinForm, setPinForm] = useState({ currentPin: "", newPin: "", confirmPin: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 10 } }));

  const appsQuery = useQuery({
    queryKey: ADMIN_APPS_QUERY_KEY,
    queryFn: async () => {
      const response = await api.get<AppEntry[]>("/admin/apps");
      return response.data.sort((left, right) => left.sortOrder - right.sortOrder);
    },
  });

  useEffect(() => {
    if (appsQuery.data) {
      setOrderedApps(appsQuery.data);
    }
  }, [appsQuery.data]);

  const createMutation = useMutation({
    mutationFn: async (payload: AddAppPayload) => {
      const response = await api.post<AppEntry>("/admin/apps", payload);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_APPS_QUERY_KEY });
      setIsModalOpen(false);
      setMessage("Приложение добавлено.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<AppEntry> }) => {
      const response = await api.put<AppEntry>(`/admin/apps/${id}`, patch);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_APPS_QUERY_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/apps/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ADMIN_APPS_QUERY_KEY });
      setMessage("Приложение удалено.");
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<AppEntry[]>("/admin/apps/scan");
      return response.data;
    },
    onSuccess: (data) => {
      setScanResults(data);
    },
  });

  const changePinMutation = useMutation({
    mutationFn: async () => {
      await api.post("/auth/change-pin", pinForm);
    },
    onSuccess: () => {
      setPinForm({ currentPin: "", newPin: "", confirmPin: "" });
      setMustChangePin(false);
      setMessage("PIN успешно изменён.");
    },
  });

  const isForbidden = useMemo(() => {
    const errorResponse = appsQuery.error as AxiosError<ApiErrorResponse> | null;
    return errorResponse?.response?.status === 403;
  }, [appsQuery.error]);

  const handleLogout = () => {
    clearSession();
    navigate("/pin", { replace: true });
  };

  const updateDraft = (id: string, patch: Partial<AppEntry>) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  };

  const saveDraft = async (id: string) => {
    const draft = drafts[id];

    if (!draft) {
      return;
    }

    setError("");

    try {
      await updateMutation.mutateAsync({ id, patch: draft });
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setMessage("Изменения сохранены.");
    } catch (rawError) {
      const errorResponse = rawError as AxiosError<ApiErrorResponse>;
      setError(errorResponse.response?.data?.message ?? "Не удалось сохранить приложение.");
    }
  };

  const deleteApp = async (id: string) => {
    setError("");

    try {
      await deleteMutation.mutateAsync(id);
    } catch (rawError) {
      const errorResponse = rawError as AxiosError<ApiErrorResponse>;
      setError(errorResponse.response?.data?.message ?? "Не удалось удалить приложение.");
    }
  };

  const persistSortOrder = async (apps: AppEntry[]) => {
    for (let index = 0; index < apps.length; index += 1) {
      const app = apps[index];

      if (app.sortOrder === index) {
        continue;
      }

      await updateMutation.mutateAsync({ id: app.id, patch: { sortOrder: index } });
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setOrderedApps((current) => {
      const oldIndex = current.findIndex((app) => app.id === active.id);
      const newIndex = current.findIndex((app) => app.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return current;
      }

      const moved = arrayMove(current, oldIndex, newIndex).map((app, index) => ({
        ...app,
        sortOrder: index,
      }));

      void persistSortOrder(moved).catch(() => {
        setError("Не удалось сохранить порядок приложений.");
      });

      return moved;
    });
  };

  const submitAddApp = async (payload: AddAppPayload) => {
    setError("");

    try {
      await createMutation.mutateAsync(payload);
    } catch (rawError) {
      const errorResponse = rawError as AxiosError<ApiErrorResponse>;
      setError(errorResponse.response?.data?.message ?? "Не удалось добавить приложение.");
    }
  };

  const applyScannedApp = async (app: AppEntry) => {
    await submitAddApp({
      name: app.name,
      executablePath: app.executablePath,
      icon: app.icon,
      category: app.category,
      platform: app.platform,
    });
  };

  const submitPinChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      await changePinMutation.mutateAsync();
    } catch (rawError) {
      const errorResponse = rawError as AxiosError<ApiErrorResponse>;
      setError(errorResponse.response?.data?.message ?? "Не удалось изменить PIN.");
    }
  };

  if (isForbidden) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 text-center">
        <h1 className="mb-3 text-3xl font-bold">403 Forbidden</h1>
        <p className="mb-4 text-white/70">Admin панель доступна только с localhost (127.0.0.1 / ::1).</p>
        <button type="button" onClick={handleLogout} className="rounded-lg border border-white/20 px-4 py-2">
          Выйти
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-10 pt-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-surface/80 p-4">
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-sm text-white/70">Управление приложениями, сортировкой и PIN</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={() => setIsModalOpen(true)}>
            Добавить
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/20 px-3 py-2 text-sm"
            onClick={() => {
              void scanMutation.mutateAsync();
            }}
          >
            {scanMutation.isPending ? "Сканирование..." : "Сканировать приложения"}
          </button>
          <button type="button" className="rounded-lg border border-white/20 px-3 py-2 text-sm" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </header>

      {error && <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      {message && <p className="mb-3 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-accentSoft">{message}</p>}

      <section className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-surface/80">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase text-white/60">
              <tr>
                <th className="p-2">Sort</th>
                <th className="p-2">#</th>
                <th className="p-2">Название</th>
                <th className="p-2">Путь</th>
                <th className="p-2">Категория</th>
                <th className="p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={orderedApps.map((app) => app.id)} strategy={verticalListSortingStrategy}>
                  {orderedApps.map((app) => (
                    <SortableRow
                      key={app.id}
                      app={app}
                      draft={drafts[app.id]}
                      onChange={updateDraft}
                      onSave={saveDraft}
                      onDelete={deleteApp}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </tbody>
          </table>
        </div>
      </section>

      {scanResults.length > 0 && (
        <section className="mb-6 rounded-2xl border border-white/10 bg-surface/80 p-4">
          <h2 className="mb-3 text-lg font-semibold">Найденные приложения</h2>
          <ul className="space-y-2">
            {scanResults.slice(0, 25).map((app) => (
              <li key={app.id} className="flex items-center justify-between gap-3 rounded border border-white/10 p-2 text-sm">
                <div>
                  <p className="font-medium">{app.name}</p>
                  <p className="text-xs text-white/60">{app.executablePath}</p>
                </div>
                <button
                  type="button"
                  className="rounded border border-accent/60 px-2 py-1 text-xs"
                  onClick={() => {
                    void applyScannedApp(app);
                  }}
                >
                  Добавить
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-surface/80 p-4">
        <h2 className="mb-3 text-lg font-semibold">Смена PIN</h2>
        <form onSubmit={submitPinChange} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            value={pinForm.currentPin}
            onChange={(event) => setPinForm((current) => ({ ...current, currentPin: event.target.value }))}
            placeholder="Текущий PIN"
            className="rounded-lg border border-white/15 bg-base px-3 py-2"
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            required
          />
          <input
            value={pinForm.newPin}
            onChange={(event) => setPinForm((current) => ({ ...current, newPin: event.target.value }))}
            placeholder="Новый PIN"
            className="rounded-lg border border-white/15 bg-base px-3 py-2"
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            required
          />
          <input
            value={pinForm.confirmPin}
            onChange={(event) => setPinForm((current) => ({ ...current, confirmPin: event.target.value }))}
            placeholder="Подтверждение PIN"
            className="rounded-lg border border-white/15 bg-base px-3 py-2"
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            required
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 font-semibold text-base sm:col-span-3"
            disabled={changePinMutation.isPending}
          >
            {changePinMutation.isPending ? "Сохранение..." : "Сменить PIN"}
          </button>
        </form>
      </section>

      <AddAppModal
        isOpen={isModalOpen}
        isSubmitting={createMutation.isPending}
        onClose={() => setIsModalOpen(false)}
        onSubmit={submitAddApp}
      />

      {appsQuery.isLoading && <p className="mt-4 text-sm text-white/70">Загрузка приложений...</p>}
    </div>
  );
};
