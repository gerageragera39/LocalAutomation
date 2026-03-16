import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PlatformDetector, type SupportedPlatform } from "../shared/utils/PlatformDetector";

const EnvSchema = z.object({
  PORT: z
    .string()
    .regex(/^\d+$/)
    .optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
});

export class AppConfig {
  public readonly port: number;
  public readonly host = "0.0.0.0";
  public readonly nodeEnv: "development" | "production" | "test";
  public readonly platform: SupportedPlatform;
  public readonly serverRoot: string;
  public readonly projectRoot: string;
  public readonly dataDir: string;
  public readonly publicDir: string;
  public readonly configFilePath: string;
  public readonly auditLogPath: string;
  public readonly windowsAppsFilePath: string;
  public readonly linuxAppsFilePath: string;

  constructor() {
    const env = EnvSchema.parse(process.env);

    this.port = Number(env.PORT ?? 3000);
    this.nodeEnv = env.NODE_ENV ?? "development";
    this.platform = PlatformDetector.detectPlatform();
    this.serverRoot = process.cwd();
    this.projectRoot = path.resolve(this.serverRoot, "..");
    this.dataDir = path.resolve(this.projectRoot, "data");
    this.publicDir = path.resolve(this.serverRoot, "public");
    this.configFilePath = path.resolve(this.dataDir, "config.json");
    this.auditLogPath = path.resolve(this.dataDir, "audit.log");
    this.windowsAppsFilePath = path.resolve(this.dataDir, "apps.windows.json");
    this.linuxAppsFilePath = path.resolve(this.dataDir, "apps.linux.json");
  }

  public get platformAppsFilePath(): string {
    return this.platform === "windows" ? this.windowsAppsFilePath : this.linuxAppsFilePath;
  }

  public async ensureRuntimeFiles(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await this.ensureJsonFile(this.windowsAppsFilePath, "[]\n");
    await this.ensureJsonFile(this.linuxAppsFilePath, "[]\n");
    await this.ensureJsonFile(this.configFilePath, "{}\n");
    await this.ensureFile(this.auditLogPath, "");
  }

  private async ensureJsonFile(filePath: string, fallbackContent: string): Promise<void> {
    try {
      await access(filePath);
    } catch {
      await writeFile(filePath, fallbackContent, "utf-8");
    }
  }

  private async ensureFile(filePath: string, fallbackContent: string): Promise<void> {
    try {
      await access(filePath);
    } catch {
      await writeFile(filePath, fallbackContent, "utf-8");
    }
  }
}
