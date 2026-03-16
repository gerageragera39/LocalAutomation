import type { AppEntry, AppStatusSnapshot } from "../types";
import { AppIcon } from "./AppIcon";

interface AppGridProps {
  apps: AppEntry[];
  statuses: AppStatusSnapshot;
  disabled?: boolean;
  onLaunch: (app: AppEntry) => void;
}

export const AppGrid = ({ apps, statuses, disabled = false, onLaunch }: AppGridProps) => {
  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {apps.map((app) => (
        <AppIcon
          key={app.id}
          app={app}
          isRunning={Boolean(statuses[app.id])}
          disabled={disabled}
          onPress={onLaunch}
        />
      ))}
    </div>
  );
};
