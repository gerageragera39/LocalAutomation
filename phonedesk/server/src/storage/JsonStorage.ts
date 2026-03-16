import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class JsonStorage<T> {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly defaultValue: T,
  ) {}

  public async ensureFile(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await access(this.filePath);
    } catch {
      await this.write(this.defaultValue);
    }
  }

  public async read(): Promise<T> {
    await this.ensureFile();
    const raw = await readFile(this.filePath, "utf-8");

    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.write(this.defaultValue);
      return this.defaultValue;
    }
  }

  public async write(value: T): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const tempFilePath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      const payload = `${JSON.stringify(value, null, 2)}\n`;
      await writeFile(tempFilePath, payload, "utf-8");
      await rename(tempFilePath, this.filePath);
    });

    return this.writeQueue;
  }
}
