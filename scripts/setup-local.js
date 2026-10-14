import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

let content;
try {
  content = await readFile(envPath, 'utf8');
} catch {
  content = await readFile(examplePath, 'utf8');
}

const generatedSecret = randomBytes(48).toString('base64url');
let hasSecret = false;
let hasMongoUri = false;
const lines = content.split(/\r?\n/).filter((line, index, all) => line || index < all.length - 1);
const updated = lines.map((line) => {
  if (line.startsWith('JWT_SECRET=')) {
    hasSecret = true;
    return /^JWT_SECRET=(?:|replace-with-a-long-random-secret|replace-with-a-random-secret-of-at-least-32-characters)$/.test(line) ? `JWT_SECRET=${generatedSecret}` : line;
  }
  if (line.startsWith('MONGODB_URI=')) {
    hasMongoUri = true;
    return /^MONGODB_URI=mongodb\+srv:\/\/</.test(line) ? 'MONGODB_URI=' : line;
  }
  return line;
});

if (!hasSecret) updated.push(`JWT_SECRET=${generatedSecret}`);
if (!hasMongoUri) updated.push('MONGODB_URI=');

await writeFile(envPath, `${updated.join('\n').trimEnd()}\n`, { mode: 0o600 });
try { await chmod(envPath, 0o600); } catch { /* Windows ACLs are managed outside POSIX mode bits. */ }
console.log(`Local environment ready at ${envPath}. A persistent JWT secret was configured.`);
if (!updated.some((line) => line.startsWith('MONGODB_URI=') && line.length > 'MONGODB_URI='.length)) {
  console.log('Add your MongoDB Atlas replica-set URI to MONGODB_URI before using marketplace data.');
}
