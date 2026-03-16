import type { AppEntry, LaunchResult } from "../../apps/AppTypes";

export interface ILauncherStrategy {
  launch(app: AppEntry): Promise<LaunchResult>;
  focusOrLaunch(app: AppEntry): Promise<LaunchResult>;
  isRunning(app: AppEntry): Promise<boolean>;
}
