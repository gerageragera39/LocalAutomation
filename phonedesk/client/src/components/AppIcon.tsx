import { motion } from "framer-motion";
import type { AppEntry } from "../types";

interface AppIconProps {
  app: AppEntry;
  isRunning: boolean;
  disabled?: boolean;
  onPress: (app: AppEntry) => void;
}

const hasImageIcon = (icon: string): boolean => {
  if (icon.startsWith("data:image")) {
    return true;
  }

  if (icon.startsWith("http://") || icon.startsWith("https://")) {
    return true;
  }

  if (!icon.startsWith("/")) {
    return false;
  }

  const lower = icon.toLowerCase();
  const isFilesystemPath =
    lower.startsWith("/usr/") ||
    lower.startsWith("/home/") ||
    lower.startsWith("/opt/") ||
    lower.startsWith("/var/") ||
    lower.startsWith("/snap/") ||
    lower.startsWith("/etc/");

  return !isFilesystemPath;
};

export const AppIcon = ({ app, isRunning, disabled = false, onPress }: AppIconProps) => {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      className="group flex h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-surface/80 px-2 text-center transition hover:border-accent/70 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
      onClick={() => onPress(app)}
      disabled={disabled}
    >
      <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-base/80 text-lg font-semibold text-accentSoft">
        {hasImageIcon(app.icon) ? (
          <img src={app.icon} alt={app.name} className="h-full w-full object-cover" />
        ) : (
          <span>{app.name.slice(0, 1).toUpperCase()}</span>
        )}
        <span
          className={`absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border border-base ${
            isRunning ? "bg-accent" : "bg-gray-500"
          }`}
        />
      </div>
      <span className="line-clamp-2 text-xs font-medium leading-tight text-white/90">{app.name}</span>
    </motion.button>
  );
};
