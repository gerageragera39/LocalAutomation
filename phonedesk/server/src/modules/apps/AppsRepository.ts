import { JsonStorage } from "../../storage/JsonStorage";
import type { AppEntry } from "./AppTypes";

export class AppsRepository {
  constructor(private readonly storage: JsonStorage<AppEntry[]>) {}

  public async findAll(): Promise<AppEntry[]> {
    await this.storage.ensureFile();
    return this.storage.read();
  }

  public async saveAll(entries: AppEntry[]): Promise<void> {
    await this.storage.write(entries);
  }

  public async findById(id: string): Promise<AppEntry | null> {
    const apps = await this.findAll();
    return apps.find((entry) => entry.id === id) ?? null;
  }
}
