import { access, constants, readdir, readFile, stat } from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
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
const MAX_ICON_SOURCE_BYTES = 64 * 1024;
const MAX_ICON_DATA_URL_LENGTH = 120_000;
const ICON_EXTENSIONS = [".png", ".svg", ".jpg", ".jpeg", ".webp", ".xpm"] as const;
const ICON_MIME_TYPES: Record<(typeof ICON_EXTENSIONS)[number], string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".xpm": "image/x-xpixmap",
};
const ICON_INDEX_MAX_DEPTH = 6;
const ICON_INDEX_MAX_DIRECTORIES = 20_000;

interface LinuxDesktopEntry {
  name: string;
  executablePath: string;
  icon: string;
}

interface IconIndexCandidate {
  path: string;
  score: number;
}

export class AppsService {
  private linuxIconIndexPromise: Promise<Map<string, string>> | null = null;
  private readonly iconDataUrlCache = new Map<string, string>();
  private readonly resolvedIconCache = new Map<string, string>();
  private persistedIconMigrationDone = false;

  constructor(
    private readonly repository: AppsRepository,
    private readonly logger: Logger,
    private readonly platform: SupportedPlatform,
  ) {}

  /** Возвращает приложения с разрешёнными иконками для UI-клиента. */
  public async getAppsForClient(): Promise<AppEntry[]> {
    const apps = await this.getApps();
    return this.withResolvedIcons(apps);
  }

  /** Возвращает список приложений для текущей платформы, отсортированный по sortOrder. */
  public async getApps(): Promise<AppEntry[]> {
    try {
      const apps = await this.repository.findAll();
      const normalizedApps =
        this.platform === "linux" ? await this.persistLinuxIconsIfNeeded(apps) : apps;

      return normalizedApps
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
      const scanned =
        this.platform === "windows" ? await this.scanWindowsApps() : await this.scanLinuxApps();
      return this.withResolvedIcons(scanned);
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

  private async withResolvedIcons(entries: AppEntry[]): Promise<AppEntry[]> {
    if (this.platform !== "linux") {
      return entries;
    }

    const resolved = await Promise.all(
      entries.map(async (entry) => ({
        ...entry,
        icon: await this.resolveLinuxAppIcon(entry),
      })),
    );

    return resolved;
  }

  private async persistLinuxIconsIfNeeded(entries: AppEntry[]): Promise<AppEntry[]> {
    if (this.persistedIconMigrationDone || entries.length === 0) {
      return entries;
    }

    this.persistedIconMigrationDone = true;

    let changed = false;

    const nextEntries = await Promise.all(
      entries.map(async (entry) => {
        const resolvedIcon = await this.resolveLinuxAppIcon(entry);

        if (resolvedIcon && resolvedIcon !== entry.icon) {
          changed = true;
          return {
            ...entry,
            icon: resolvedIcon,
          };
        }

        return entry;
      }),
    );

    if (!changed) {
      return entries;
    }

    try {
      await this.repository.saveAll(nextEntries);
      return nextEntries;
    } catch (error) {
      this.logger.warn("Не удалось сохранить обновлённые иконки приложений", {
        error: error instanceof Error ? error.message : "unknown",
      });
      return entries;
    }
  }

  private async resolveLinuxAppIcon(app: Pick<AppEntry, "name" | "icon" | "executablePath">): Promise<string> {
    const currentIcon = app.icon.trim();

    if (this.isAlreadyRenderableIcon(currentIcon)) {
      return currentIcon;
    }

    const cacheKey = `${currentIcon}|${app.executablePath}|${app.name}`.toLowerCase();
    const cached = this.resolvedIconCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const hints = this.collectIconHints(app);

    for (const hint of hints) {
      const iconPath = await this.resolveLinuxIconPath(hint);
      if (!iconPath) {
        continue;
      }

      const dataUrl = await this.convertIconFileToDataUrl(iconPath);
      if (!dataUrl) {
        continue;
      }

      this.resolvedIconCache.set(cacheKey, dataUrl);
      return dataUrl;
    }

    this.resolvedIconCache.set(cacheKey, currentIcon);
    return currentIcon;
  }

  private isAlreadyRenderableIcon(icon: string): boolean {
    if (!icon) {
      return false;
    }

    if (icon.startsWith("data:image")) {
      return true;
    }

    if (icon.startsWith("http://") || icon.startsWith("https://")) {
      return true;
    }

    if (icon.startsWith("/") && !icon.startsWith("/usr/") && !icon.startsWith("/home/")) {
      return true;
    }

    return false;
  }

  private collectIconHints(app: Pick<AppEntry, "name" | "icon" | "executablePath">): string[] {
    const hints = new Set<string>();

    const addHint = (value: string | undefined): void => {
      if (!value) {
        return;
      }

      const normalized = value.trim();
      if (!normalized) {
        return;
      }

      hints.add(normalized);
    };

    addHint(app.icon);
    addHint(app.executablePath);
    addHint(path.basename(app.executablePath));
    addHint(path.parse(path.basename(app.executablePath)).name);
    addHint(app.name);
    addHint(app.name.split(/\s+/)[0]);
    addHint(app.name.toLowerCase().replace(/\s+/g, "-"));
    addHint(app.name.toLowerCase().replace(/\s+/g, ""));

    return Array.from(hints);
  }

  private async resolveLinuxIconPath(iconHint: string): Promise<string | null> {
    const trimmed = iconHint.trim();
    if (!trimmed) {
      return null;
    }

    if (path.isAbsolute(trimmed)) {
      return this.resolveAbsoluteIconPath(trimmed);
    }

    const normalizedName = path.parse(path.basename(trimmed)).name.toLowerCase();
    if (!normalizedName) {
      return null;
    }

    const iconIndex = await this.getLinuxIconIndex();

    const directMatch = iconIndex.get(normalizedName);
    if (directMatch) {
      return directMatch;
    }

    const fallbackNames = new Set<string>();
    fallbackNames.add(normalizedName.replace(/-symbolic$/, ""));
    if (normalizedName.includes(".")) {
      fallbackNames.add(normalizedName.split(".").at(-1) ?? "");
    }
    if (normalizedName.includes("-")) {
      fallbackNames.add(normalizedName.split("-").at(-1) ?? "");
    }

    for (const fallback of fallbackNames) {
      const name = fallback.trim();
      if (!name) {
        continue;
      }

      const match = iconIndex.get(name);
      if (match) {
        return match;
      }
    }

    return null;
  }

  private async resolveAbsoluteIconPath(iconPath: string): Promise<string | null> {
    const extension = path.extname(iconPath).toLowerCase();

    if (this.isSupportedIconExtension(extension)) {
      try {
        const info = await stat(iconPath);
        if (info.isFile()) {
          return iconPath;
        }
      } catch {
        // ignore and try extension-based fallbacks below
      }
    }

    if (extension) {
      return null;
    }

    for (const iconExtension of ICON_EXTENSIONS) {
      const candidatePath = `${iconPath}${iconExtension}`;

      try {
        const info = await stat(candidatePath);
        if (info.isFile()) {
          return candidatePath;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async convertIconFileToDataUrl(iconPath: string): Promise<string | null> {
    const cached = this.iconDataUrlCache.get(iconPath);
    if (cached !== undefined) {
      return cached.length > 0 ? cached : null;
    }

    const extension = path.extname(iconPath).toLowerCase();

    if (!this.isSupportedIconExtension(extension)) {
      this.iconDataUrlCache.set(iconPath, "");
      return null;
    }

    try {
      const info = await stat(iconPath);
      if (!info.isFile() || info.size > MAX_ICON_SOURCE_BYTES) {
        this.iconDataUrlCache.set(iconPath, "");
        return null;
      }

      const fileBuffer = await readFile(iconPath);
      const mime = ICON_MIME_TYPES[extension];
      const dataUrl = `data:${mime};base64,${fileBuffer.toString("base64")}`;

      if (dataUrl.length > MAX_ICON_DATA_URL_LENGTH) {
        this.iconDataUrlCache.set(iconPath, "");
        return null;
      }

      this.iconDataUrlCache.set(iconPath, dataUrl);
      return dataUrl;
    } catch {
      this.iconDataUrlCache.set(iconPath, "");
      return null;
    }
  }

  private isSupportedIconExtension(extension: string): extension is (typeof ICON_EXTENSIONS)[number] {
    return (ICON_EXTENSIONS as readonly string[]).includes(extension);
  }

  private async getLinuxIconIndex(): Promise<Map<string, string>> {
    if (!this.linuxIconIndexPromise) {
      this.linuxIconIndexPromise = this.buildLinuxIconIndex();
    }

    return this.linuxIconIndexPromise;
  }

  private async buildLinuxIconIndex(): Promise<Map<string, string>> {
    const iconRoots = [
      this.resolveHomePath("~/.local/share/icons"),
      "/usr/share/icons",
      "/usr/local/share/icons",
      "/usr/share/pixmaps",
      "/var/lib/flatpak/exports/share/icons",
      this.resolveHomePath("~/.local/share/flatpak/exports/share/icons"),
    ];

    const index = new Map<string, IconIndexCandidate>();

    for (const root of iconRoots) {
      await this.indexIconsFromRoot(root, index);
    }

    const flattenedIndex = new Map<string, string>();

    for (const [name, candidate] of index.entries()) {
      flattenedIndex.set(name, candidate.path);
    }

    return flattenedIndex;
  }

  private async indexIconsFromRoot(
    root: string,
    index: Map<string, IconIndexCandidate>,
  ): Promise<void> {
    try {
      await access(root, constants.R_OK);
    } catch {
      return;
    }

    const queue: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
    let processedDirectories = 0;

    while (queue.length > 0 && processedDirectories < ICON_INDEX_MAX_DIRECTORIES) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      processedDirectories += 1;

      let entries: Dirent[];
      try {
        entries = await readdir(current.directory, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const entryPath = path.join(current.directory, entry.name);

        if (entry.isDirectory()) {
          if (current.depth < ICON_INDEX_MAX_DEPTH && !entry.name.startsWith(".")) {
            queue.push({ directory: entryPath, depth: current.depth + 1 });
          }

          continue;
        }

        if (entry.isFile() || entry.isSymbolicLink()) {
          await this.indexIconFile(entryPath, index);
        }
      }
    }
  }

  private async indexIconFile(iconPath: string, index: Map<string, IconIndexCandidate>): Promise<void> {
    const extension = path.extname(iconPath).toLowerCase();
    if (!this.isSupportedIconExtension(extension)) {
      return;
    }

    let info: Stats;
    try {
      info = await stat(iconPath);
    } catch {
      return;
    }

    if (!info.isFile() || info.size > MAX_ICON_SOURCE_BYTES) {
      return;
    }

    const baseName = path.basename(iconPath, extension).toLowerCase();
    if (!baseName) {
      return;
    }

    const aliases = this.buildIconAliases(baseName);
    const score = this.scoreIconPath(iconPath, extension);

    for (const alias of aliases) {
      const current = index.get(alias);

      if (!current || score > current.score) {
        index.set(alias, { path: iconPath, score });
      }
    }
  }

  private buildIconAliases(baseName: string): Set<string> {
    const aliases = new Set<string>();
    const normalized = baseName.trim().toLowerCase();

    if (!normalized) {
      return aliases;
    }

    aliases.add(normalized);
    aliases.add(normalized.replace(/-symbolic$/, ""));

    if (normalized.includes(".")) {
      aliases.add(normalized.split(".").at(-1) ?? normalized);
    }

    if (normalized.includes("-")) {
      aliases.add(normalized.split("-").at(-1) ?? normalized);
    }

    return aliases;
  }

  private scoreIconPath(iconPath: string, extension: string): number {
    const lower = iconPath.toLowerCase();
    const extensionScores: Record<string, number> = {
      ".png": 60,
      ".svg": 55,
      ".webp": 50,
      ".jpg": 45,
      ".jpeg": 45,
      ".xpm": 35,
    };

    let score = extensionScores[extension] ?? 0;

    if (lower.includes("/apps/")) {
      score += 20;
    }

    if (lower.includes("/pixmaps/")) {
      score += 16;
    }

    if (lower.includes("/hicolor/")) {
      score += 12;
    }

    if (lower.includes("/scalable/")) {
      score += 10;
    }

    if (lower.includes("symbolic")) {
      score -= 20;
    }

    const sizePairMatch = lower.match(/\/(\d{2,4})x(\d{2,4})\//);
    if (sizePairMatch) {
      const parsed = Number.parseInt(sizePairMatch[1], 10);
      if (Number.isFinite(parsed)) {
        score += Math.min(parsed, 512) / 2;
      }
    }

    return score;
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
