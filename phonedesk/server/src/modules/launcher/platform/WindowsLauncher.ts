import { execFile, spawn } from "node:child_process";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import type { AppEntry, LaunchResult } from "../../apps/AppTypes";
import type { ILauncherStrategy } from "./ILauncherStrategy";

interface ExecResult {
  stdout: string;
  stderr: string;
}

export class WindowsLauncher implements ILauncherStrategy {
  constructor(private readonly processMap: Map<string, ChildProcess>) {}

  public async launch(app: AppEntry): Promise<LaunchResult> {
    try {
      const cwd = app.workingDirectory || path.dirname(app.executablePath);
      const child = spawn(app.executablePath, app.args ?? [], {
        cwd,
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });

      child.unref();
      this.processMap.set(app.id, child);
      child.once("exit", () => {
        this.processMap.delete(app.id);
      });

      return {
        success: true,
        action: "launched",
        message: `Приложение ${app.name} запущено`,
        pid: child.pid,
      };
    } catch (error) {
      return {
        success: false,
        action: "error",
        message: error instanceof Error ? error.message : "Не удалось запустить приложение",
      };
    }
  }

  public async focusOrLaunch(app: AppEntry): Promise<LaunchResult> {
    try {
      const running = await this.isRunning(app);

      if (!running) {
        return this.launch(app);
      }

      const focused = await this.focusWindow(app.executablePath);

      if (focused) {
        return {
          success: true,
          action: "focused",
          message: `Окно ${app.name} выведено на передний план`,
        };
      }

      return this.launch(app);
    } catch (error) {
      return {
        success: false,
        action: "error",
        message: error instanceof Error ? error.message : "Не удалось сфокусировать или запустить приложение",
      };
    }
  }

  public async isRunning(app: AppEntry): Promise<boolean> {
    try {
      const imageName = path.win32.basename(app.executablePath);
      const result = await this.execFileAsync("tasklist", ["/FI", `IMAGENAME eq ${imageName}`]);
      const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
      return output.includes(imageName.toLowerCase());
    } catch {
      return false;
    }
  }

  private async focusWindow(executablePath: string): Promise<boolean> {
    const executableName = path.win32.basename(executablePath, path.win32.extname(executablePath));
    const script = `
$signature = @"
[DllImport("user32.dll")]
public static extern bool SetForegroundWindow(IntPtr hWnd);
"@
Add-Type -MemberDefinition $signature -Name "WinApi" -Namespace "PhoneDesk"
$proc = Get-Process -Name "${executableName}" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($null -eq $proc) { exit 1 }
[PhoneDesk.WinApi]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
exit 0
`.trim();

    try {
      await this.execFileAsync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
      return true;
    } catch {
      return false;
    }
  }

  private execFileAsync(command: string, args: string[]): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      });
    });
  }
}
