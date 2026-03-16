import { access, constants, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../../shared/errors/AppError";
import type { SupportedPlatform } from "../../shared/utils/PlatformDetector";
import type { Logger } from "../../shared/utils/Logger";
import type { AppEntry, CreateAppInput, UpdateAppInput } from "./AppTypes";
import { AppsRepository } from "./AppsRepository";

const MAX_SCAN_RESULTS = 120;
const DESKTOP_EXEC_PLACEHOLDER_REGEX = /%[UuFf]/g;

interface LinuxDesktopEntry {
  name: string;
  executablePath: string;
  icon: string;
}

export class AppsService {
  constructor(
    private readonly repository: AppsRepository,
    private readonly logger: Logger,
    private readonly platform: SupportedPlatform,
  ) {}

  /** Возвращает список приложений для текущей платформы, отсортированный по sortOrder. */
  public async getApps(): Promise<AppEntry[]> {
    try {
      const apps = await this.repository.findAll();
      return apps
        .filter((entry) => entry.platform === "both" || entry.platform === this.platform)
        .sort((left, right) => left.sortOrder - right.sortOrder);
    } catch (error) {
      this.logger.error("Не удалось получить список приложений", {
        error: error instanceof Error ? error.message : "unknown",
      });
      throw new AppError("Не удалось получить список приложений", 500, "APPS_READ_FAILED");
    }
  }

  /** Ищет приложение по id и выбрасывает 404, если оно не найдено. */
  public async getAppByIdOrThrow(id: string): Promise<AppEntry> {
    try {
      const app = await this.repository.findById(id);

      if (!app) {
        throw new AppError("Приложение не найдено", 404, "APP_NOT_FOUND", { id });
      }

      return app;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Ошибка при поиске приложения", 500, "APP_LOOKUP_FAILED", { id });
    }
  }

  /** Создаёт новую запись приложения и сохраняет её в JSON-хранилище. */
  public async createApp(input: CreateAppInput): Promise<AppEntry> {
    try {
      const apps = await this.repository.findAll();
      const highestOrder = apps.reduce((maxOrder, app) => Math.max(maxOrder, app.sortOrder), -1);

      const nextApp: AppEntry = {
        id: uuidv4(),
        name: input.name.trim(),
        icon: input.icon,
        executablePath: input.executablePath.trim(),
        args: input.args && input.args.length > 0 ? [...input.args] : undefined,
        workingDirectory: input.workingDirectory?.trim() || undefined,
        category: input.category?.trim() || undefined,
        sortOrder: input.sortOrder ?? highestOrder + 1,
        platform: input.platform ?? this.platform,
      };

      apps.push(nextApp);
      await this.repository.saveAll(apps);
      return nextApp;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Не удалось добавить приложение", 500, "APP_CREATE_FAILED");
    }
  }

  /** Обновляет запись приложения по id. */
  public async updateApp(id: string, patch: UpdateAppInput): Promise<AppEntry> {
    try {
      const apps = await this.repository.findAll();
      const index = apps.findIndex((entry) => entry.id === id);

      if (index === -1) {
        throw new AppError("Приложение не найдено", 404, "APP_NOT_FOUND", { id });
      }

      const current = apps[index];
      const updated: AppEntry = {
        ...current,
        ...patch,
        name: patch.name?.trim() ?? current.name,
        executablePath: patch.executablePath?.trim() ?? current.executablePath,
        workingDirectory: patch.workingDirectory?.trim() || current.workingDirectory,
        category: patch.category?.trim() || current.category,
        args: patch.args ? [...patch.args] : current.args,
      };

      apps[index] = updated;
      await this.repository.saveAll(apps);
      return updated;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Не удалось обновить приложение", 500, "APP_UPDATE_FAILED", { id });
    }
  }

  /** Удаляет приложение из хранилища. */
  public async deleteApp(id: string): Promise<void> {
    try {
      const apps = await this.repository.findAll();
      const next = apps.filter((entry) => entry.id !== id);

      if (apps.length === next.length) {
        throw new AppError("Приложение не найдено", 404, "APP_NOT_FOUND", { id });
      }

      await this.repository.saveAll(next);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError("Не удалось удалить приложение", 500, "APP_DELETE_FAILED", { id });
    }
  }

  /** Сканирует стандартные директории и возвращает кандидатов для добавления. */
  public async scanDefaultApps(): Promise<AppEntry[]> {
    try {
      if (this.platform === "windows") {
        return this.scanWindowsApps();
      }

      return this.scanLinuxApps();
    } catch (error) {
      this.logger.warn("Сканирование приложений завершилось с ошибкой", {
        error: error instanceof Error ? error.message : "unknown",
      });
      throw new AppError("Не удалось просканировать приложения", 500, "APP_SCAN_FAILED");
    }
  }

  private async scanWindowsApps(): Promise<AppEntry[]> {
    const roots = [
      process.env["ProgramFiles"],
      process.env["ProgramFiles(x86)"],
      process.env["LOCALAPPDATA"],
      "C:\\Program Files",
      "C:\\Program Files (x86)",
    ].filter((value): value is string => Boolean(value));

    const seen = new Set<string>();
    const candidates: AppEntry[] = [];

    for (const root of roots) {
      await this.walkDirectory(root, 0, 2, async (entryPath) => {
        if (candidates.length >= MAX_SCAN_RESULTS) {
          return;
        }

        if (!entryPath.toLowerCase().endsWith(".exe")) {
          return;
        }

        if (seen.has(entryPath)) {
          return;
        }

        seen.add(entryPath);
        const name = path.basename(entryPath, ".exe");
        candidates.push({
          id: uuidv4(),
          name,
          icon: "",
          executablePath: entryPath,
          sortOrder: candidates.length,
          platform: "windows",
        });
      });

      if (candidates.length >= MAX_SCAN_RESULTS) {
        break;
      }
    }

    return candidates;
  }

  private async scanLinuxApps(): Promise<AppEntry[]> {
    const binaryRoots = [
      "/usr/bin",
      "/usr/local/bin",
      "/snap/bin",
      "/var/lib/flatpak/exports/bin",
      this.resolveHomePath("~/.local/share/flatpak/exports/bin"),
    ];
    const desktopRoots = [
      "/usr/share/applications",
      this.resolveHomePath("~/.local/share/applications"),
      "/var/lib/flatpak/exports/share/applications",
      ...(await this.getSnapDesktopRoots()),
    ];
    const seen = new Set<string>();
    const candidates: AppEntry[] = [];

    const addCandidate = (name: string, executablePath: string, icon: string): void => {
      if (candidates.length >= MAX_SCAN_RESULTS) {
        return;
      }

      const normalizedName = name.trim();
      const normalizedPath = executablePath.trim();

      if (!normalizedName || !normalizedPath) {
        return;
      }

      if (seen.has(normalizedPath)) {
        return;
      }

      seen.add(normalizedPath);
      candidates.push({
        id: uuidv4(),
        name: normalizedName,
        icon,
        executablePath: normalizedPath,
        sortOrder: candidates.length,
        platform: "linux",
      });
    };

    for (const root of desktopRoots) {
      if (candidates.length >= MAX_SCAN_RESULTS) {
        break;
      }

      try {
        await access(root, constants.R_OK);
      } catch {
        continue;
      }

      let entries: string[];
      try {
        entries = await readdir(root);
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (candidates.length >= MAX_SCAN_RESULTS) {
          break;
        }

        if (!entry.endsWith(".desktop")) {
          continue;
        }

        const desktopFilePath = path.join(root, entry);
        const desktopEntry = await this.parseDesktopEntry(desktopFilePath);

        if (!desktopEntry) {
          continue;
        }

        const resolvedPath = await this.resolveLinuxExecutablePath(
          desktopEntry.executablePath,
          binaryRoots,
        );

        addCandidate(desktopEntry.name, resolvedPath, desktopEntry.icon);
      }
    }

    if (candidates.length >= MAX_SCAN_RESULTS) {
      return candidates;
    }

    for (const root of binaryRoots) {
      try {
        await access(root, constants.R_OK);
      } catch {
        continue;
      }

      let entries: string[];
      try {
        entries = await readdir(root);
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (candidates.length >= MAX_SCAN_RESULTS) {
          break;
        }

        const executablePath = path.join(root, entry);

        if (seen.has(executablePath)) {
          continue;
        }

        try {
          const info = await stat(executablePath);
          const executable = info.isFile() && (info.mode & 0o111) !== 0;

          if (!executable) {
            continue;
          }

          addCandidate(entry, executablePath, "");
        } catch {
          continue;
        }
      }
    }

    return candidates;
  }

  private resolveHomePath(value: string): string {
    if (!value.startsWith("~/")) {
      return value;
    }

    return path.join(homedir(), value.slice(2));
  }

  private async getSnapDesktopRoots(): Promise<string[]> {
    const snapRoot = "/snap";

    try {
      await access(snapRoot, constants.R_OK);
    } catch {
      return [];
    }

    let snapPackages: string[];
    try {
      snapPackages = await readdir(snapRoot);
    } catch {
      return [];
    }

    const roots: string[] = [];

    for (const packageName of snapPackages) {
      const guiPath = path.join(snapRoot, packageName, "current", "meta", "gui");

      try {
        const info = await stat(guiPath);
        if (info.isDirectory()) {
          roots.push(guiPath);
        }
      } catch {
        continue;
      }
    }

    return roots;
  }

  private async parseDesktopEntry(desktopFilePath: string): Promise<LinuxDesktopEntry | null> {
    let fileContent: string;
    try {
      fileContent = await readFile(desktopFilePath, "utf-8");
    } catch {
      return null;
    }

    let inDesktopSection = false;
    let name: string | null = null;
    let exec: string | null = null;
    let icon = "";
    let hidden = false;
    let noDisplay = false;
    let terminal = false;

    for (const line of fileContent.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        inDesktopSection = trimmed === "[Desktop Entry]";
        continue;
      }

      if (!inDesktopSection) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex);
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (key === "Name" && !name) {
        name = value;
        continue;
      }

      if (key === "Exec") {
        exec = value;
        continue;
      }

      if (key === "Icon") {
        icon = value;
        continue;
      }

      if (key === "Hidden") {
        hidden = value.toLowerCase() === "true";
        continue;
      }

      if (key === "NoDisplay") {
        noDisplay = value.toLowerCase() === "true";
        continue;
      }

      if (key === "Terminal") {
        terminal = value.toLowerCase() === "true";
      }
    }

    if (hidden || noDisplay || terminal || !name || !exec) {
      return null;
    }

    const executablePath = this.extractDesktopExecutable(exec);
    if (!executablePath) {
      return null;
    }

    return {
      name,
      executablePath,
      icon,
    };
  }

  private extractDesktopExecutable(exec: string): string | null {
    const sanitized = exec.replace(DESKTOP_EXEC_PLACEHOLDER_REGEX, "").trim();
    const tokens = this.tokenizeCommand(sanitized);

    if (tokens.length === 0) {
      return null;
    }

    let commandIndex = 0;

    if (tokens[0] === "env") {
      commandIndex = 1;

      while (
        commandIndex < tokens.length &&
        /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(tokens[commandIndex])
      ) {
        commandIndex += 1;
      }

      while (commandIndex < tokens.length && tokens[commandIndex].startsWith("-")) {
        commandIndex += 1;
      }
    }

    const command = tokens[commandIndex];
    if (!command) {
      return null;
    }

    return command.trim();
  }

  private tokenizeCommand(command: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let quote: "'" | '"' | null = null;
    let escaped = false;

    for (const char of command) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (quote) {
        if (char === quote) {
          quote = null;
        } else {
          current += char;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (/\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  private async resolveLinuxExecutablePath(command: string, binaryRoots: string[]): Promise<string> {
    const normalized = command.trim();

    if (!normalized) {
      return normalized;
    }

    if (path.isAbsolute(normalized)) {
      const executableName = path.basename(normalized);

      for (const root of binaryRoots) {
        const candidatePath = path.join(root, executableName);

        try {
          const info = await stat(candidatePath);
          const executable = info.isFile() && (info.mode & 0o111) !== 0;

          if (executable) {
            return candidatePath;
          }
        } catch {
          continue;
        }
      }

      return normalized;
    }

    for (const root of binaryRoots) {
      const candidatePath = path.join(root, normalized);

      try {
        const info = await stat(candidatePath);
        const executable = info.isFile() && (info.mode & 0o111) !== 0;

        if (executable) {
          return candidatePath;
        }
      } catch {
        continue;
      }
    }

    return normalized;
  }

  private async walkDirectory(
    root: string,
    depth: number,
    maxDepth: number,
    onFile: (entryPath: string) => Promise<void>,
  ): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    let entries: string[];

    try {
      entries = await readdir(root);
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(root, entry);

      try {
        const info = await stat(entryPath);

        if (info.isDirectory()) {
          await this.walkDirectory(entryPath, depth + 1, maxDepth, onFile);
          continue;
        }

        if (info.isFile()) {
          await onFile(entryPath);
        }
      } catch {
        continue;
      }
    }
  }
}
