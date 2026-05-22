import * as path from 'path';
import * as os from 'os';

export const DEFAULT_INDEX_DB_PATH = path.join(os.homedir(), '.eml-mcp', 'index.db');
export const PARSER_CACHE_SIZE = 200;
