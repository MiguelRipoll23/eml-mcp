import * as fs from 'fs';
import * as path from 'path';

export class ProcessedStore {
  private readonly ids: Set<string> = new Set();

  constructor(private readonly filePath: string) {}

  load(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as string[];
      for (const id of parsed) this.ids.add(id);
    } catch {
      // start fresh if the file is corrupt
    }
  }

  has(messageId: string): boolean {
    return this.ids.has(messageId);
  }

  mark(messageId: string): void {
    this.ids.add(messageId);
    this.persist();
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify([...this.ids]));
  }
}
