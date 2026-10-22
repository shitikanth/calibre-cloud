import { cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = resolve(import.meta.dirname, '..');
const dist = resolve(pkg, 'dist');

rmSync(dist, { recursive: true, force: true });
cpSync(resolve(pkg, '../../web/dist'), dist, { recursive: true });
cpSync(resolve(pkg, '_headers'), resolve(dist, '_headers'));
