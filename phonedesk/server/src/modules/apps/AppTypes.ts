import { z } from "zod";

export type AppPlatform = "windows" | "linux" | "both";

export interface AppEntry {
  id: string;
  name: string;
  icon: string;
  executablePath: string;
  args?: string[];
  workingDirectory?: string;
  category?: string;
  sortOrder: number;
  platform: AppPlatform;
}

export interface CreateAppInput {
  name: string;
  icon: string;
  executablePath: string;
  args?: string[];
  workingDirectory?: string;
  category?: string;
  sortOrder?: number;
  platform?: AppPlatform;
}

export interface UpdateAppInput {
  name?: string;
  icon?: string;
  executablePath?: string;
  args?: string[];
  workingDirectory?: string;
  category?: string;
  sortOrder?: number;
  platform?: AppPlatform;
}

export interface LaunchResult {
  success: boolean;
  action: "launched" | "focused" | "focus_failed" | "already_running" | "error";
  message: string;
  pid?: number;
}

export interface AppStatusSnapshot {
  [appId: string]: boolean;
}

export const appArgsSchema = z
  .array(z.string().max(500).regex(/^[^;&|`$\n\r]*$/, "Invalid argument"))
  .max(20);

export const createAppInputSchema = z.object({
  name: z.string().min(1).max(80),
  icon: z.string().max(120_000),
  executablePath: z.string().min(1).max(2048),
  args: appArgsSchema.optional(),
  workingDirectory: z.string().max(2048).optional(),
  category: z.string().max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
  platform: z.enum(["windows", "linux", "both"]).optional(),
});

export const updateAppInputSchema = createAppInputSchema.partial();

export const appEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  icon: z.string().max(120_000),
  executablePath: z.string().min(1).max(2048),
  args: appArgsSchema.optional(),
  workingDirectory: z.string().max(2048).optional(),
  category: z.string().max(50).optional(),
  sortOrder: z.number().int().min(0),
  platform: z.enum(["windows", "linux", "both"]),
});
