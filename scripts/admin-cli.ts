#!/usr/bin/env tsx
/**
 * Root convenience runner for Global OTP Platform Admin CLI
 */
import path from 'path';
import { spawn } from 'child_process';

const backendCli = path.resolve(__dirname, '../backend/scripts/admin-cli.ts');
const args = process.argv.slice(2);

const child = spawn('npx', ['tsx', backendCli, ...args], {
  stdio: 'inherit',
  shell: true,
  cwd: path.resolve(__dirname, '../backend'),
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
