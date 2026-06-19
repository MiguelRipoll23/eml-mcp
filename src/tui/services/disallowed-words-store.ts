import * as fs from 'fs';
import * as path from 'path';

interface DisallowedWordsFile {
  words: string[];
}

export function loadDisallowedWords(filePath: string): string[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as DisallowedWordsFile;
    return Array.isArray(parsed.words) ? parsed.words : [];
  } catch {
    return [];
  }
}

export function saveDisallowedWords(words: string[], filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ words }, null, 2) + '\n', 'utf-8');
}
