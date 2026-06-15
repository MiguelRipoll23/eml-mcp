import * as fs from 'fs';
import * as path from 'path';

interface EmlConfig {
  emailDirectory: string;
}

export function loadConfig(configPath: string): EmlConfig | null {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as EmlConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: EmlConfig, configPath: string): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
