import { execFile } from "node:child_process";
import type { IMouseStrategy } from "./IMouseStrategy";

export class WindowsMouseStrategy implements IMouseStrategy {
  public async move(dx: number, dy: number): Promise<void> {
    const script = `
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class MouseNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
}
"@
$pt = New-Object MouseNative+POINT
[MouseNative]::GetCursorPos([ref]$pt) | Out-Null
[MouseNative]::SetCursorPos($pt.X + (${dx}), $pt.Y + (${dy})) | Out-Null
`;

    await this.execPowerShell(script);
  }

  public async click(button: "left" | "right"): Promise<void> {
    const [downFlag, upFlag] = button === "left" ? [0x0002, 0x0004] : [0x0008, 0x0010];

    const script = `
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class MouseNative {
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
[MouseNative]::mouse_event(${downFlag}, 0, 0, 0, [UIntPtr]::Zero)
[MouseNative]::mouse_event(${upFlag}, 0, 0, 0, [UIntPtr]::Zero)
`;

    await this.execPowerShell(script);
  }

  public async scroll(dy: number): Promise<void> {
    if (dy === 0) {
      return;
    }

    const wheelDelta = Math.round(dy * 120);

    const script = `
$ErrorActionPreference = "Stop"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class MouseNative {
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
[MouseNative]::mouse_event(0x0800, 0, 0, ${wheelDelta}, [UIntPtr]::Zero)
`;

    await this.execPowerShell(script);
  }

  private async execPowerShell(script: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { shell: false, windowsHide: true },
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        },
      );
    });
  }
}
