import * as path from 'path';
import * as os from 'os';

export const PARSER_CACHE_SIZE = 200;

export interface EmlPaths {
  emlHome: string;
  indexDbPath: string;
  configPath: string;
  workflowsDir: string;
  promptsDir: string;
}

export function getEmlPaths(base?: string): EmlPaths {
  const home = base
    ? path.resolve(base)
    : process.env.EML_HOME
      ? path.resolve(process.env.EML_HOME)
      : path.join(os.homedir(), '.eml');

  return {
    emlHome: home,
    indexDbPath: path.join(home, 'index.db'),
    configPath: path.join(home, 'config.json'),
    workflowsDir: path.join(home, 'workflows'),
    promptsDir: path.join(home, 'prompts'),
  };
}
