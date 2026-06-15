import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
const pkg = _require('../../package.json') as { version: string };
export const VERSION = pkg.version;
