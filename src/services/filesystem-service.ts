import * as fs from 'fs';
import * as path from 'path';
import open from 'open';

export interface FileEntry {
  filePath: string;
  mtime: Date;
  size: number;
}

export class FilesystemService {
  walkDirectory(dir: string): FileEntry[] {
    const results: FileEntry[] = [];

    const walk = (current: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.eml')) {
          const stat = fs.statSync(fullPath);
          results.push({ filePath: fullPath, mtime: stat.mtime, size: stat.size });
        }
      }
    };

    walk(dir);
    return results;
  }

  safePath(outputDir: string, filename: string): string {
    const base = path.resolve(outputDir);
    const resolved = path.resolve(outputDir, filename);

    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      throw new Error(`INVALID_PATH: path traversal detected for filename "${filename}"`);
    }
    return resolved;
  }

  readFile(filePath: string): Buffer {
    return fs.readFileSync(filePath);
  }

  writeFile(filePath: string, content: string | Buffer): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  async openWithDefaultApp(filePath: string): Promise<void> {
    await open(filePath);
  }
}
