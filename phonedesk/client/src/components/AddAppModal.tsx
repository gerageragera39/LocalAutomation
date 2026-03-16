import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { AppPlatform } from "../types";

export interface AddAppPayload {
  name: string;
  icon: string;
  executablePath: string;
  args?: string[];
  workingDirectory?: string;
  category?: string;
  sortOrder?: number;
  platform?: AppPlatform;
}

interface AddAppModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: AddAppPayload) => Promise<void>;
}

const MAX_ICON_BYTES = 64 * 1024;

export const AddAppModal = ({ isOpen, isSubmitting, onClose, onSubmit }: AddAppModalProps) => {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [executablePath, setExecutablePath] = useState("");
  const [argsLine, setArgsLine] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [category, setCategory] = useState("");
  const [platform, setPlatform] = useState<AppPlatform>("both");
  const [error, setError] = useState("");

  const isValid = useMemo(() => name.trim().length > 0 && executablePath.trim().length > 0, [name, executablePath]);

  if (!isOpen) {
    return null;
  }

  const reset = () => {
    setName("");
    setIcon("");
    setExecutablePath("");
    setArgsLine("");
    setWorkingDirectory("");
    setCategory("");
    setPlatform("both");
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleIconUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > MAX_ICON_BYTES) {
      setError("Иконка слишком большая. Максимум 64KB.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result === "string") {
        setIcon(result);
        setError("");
      }
    };

    reader.readAsDataURL(file);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isValid) {
      setError("Заполните название и путь к исполняемому файлу.");
      return;
    }

    const args = argsLine
      .split(" ")
      .map((arg) => arg.trim())
      .filter((arg) => arg.length > 0);

    await onSubmit({
      name: name.trim(),
      icon,
      executablePath: executablePath.trim(),
      args: args.length > 0 ? args : undefined,
      workingDirectory: workingDirectory.trim() || undefined,
      category: category.trim() || undefined,
      platform,
    });

    reset();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-xl rounded-2xl bg-surface p-5 shadow-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Добавить приложение</h2>
          <button type="button" onClick={handleClose} className="rounded-md px-2 py-1 text-sm text-white/70 hover:bg-white/10">
            Закрыть
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>Название</span>
            <input
              className="rounded-lg border border-white/15 bg-base px-3 py-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Категория</span>
            <input
              className="rounded-lg border border-white/15 bg-base px-3 py-2"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </label>

          <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
            <span>Путь к исполняемому файлу</span>
            <input
              className="rounded-lg border border-white/15 bg-base px-3 py-2"
              value={executablePath}
              onChange={(event) => setExecutablePath(event.target.value)}
              required
            />
          </label>

          <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
            <span>Аргументы (через пробел)</span>
            <input
              className="rounded-lg border border-white/15 bg-base px-3 py-2"
              value={argsLine}
              onChange={(event) => setArgsLine(event.target.value)}
            />
          </label>

          <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
            <span>Working directory</span>
            <input
              className="rounded-lg border border-white/15 bg-base px-3 py-2"
              value={workingDirectory}
              onChange={(event) => setWorkingDirectory(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Платформа</span>
            <select
              className="rounded-lg border border-white/15 bg-base px-3 py-2"
              value={platform}
              onChange={(event) => setPlatform(event.target.value as AppPlatform)}
            >
              <option value="both">both</option>
              <option value="windows">windows</option>
              <option value="linux">linux</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Иконка URL / Base64</span>
            <input
              className="rounded-lg border border-white/15 bg-base px-3 py-2"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            />
          </label>

          <label className="sm:col-span-2 flex flex-col gap-1 text-sm">
            <span>Загрузить иконку (PNG/JPEG, до 64KB)</span>
            <input type="file" accept="image/png,image/jpeg" onChange={handleIconUpload} />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={handleClose} className="rounded-lg border border-white/20 px-4 py-2 text-sm">
            Отмена
          </button>
          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Сохранение..." : "Добавить"}
          </button>
        </div>
      </form>
    </div>
  );
};
