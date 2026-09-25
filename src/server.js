import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from './app.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// Lê variáveis do arquivo .env (que NÃO vai para o Git)
const arquivoEnv = join(raiz, '.env');
if (existsSync(arquivoEnv)) {
  for (const linha of readFileSync(arquivoEnv, 'utf-8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const porta = Number(process.env.PORT ?? 3000);
const app = criarApp({
  arquivoDados: join(raiz, 'data', 'db.json'),
  apiKey: process.env.API_KEY,
});

// Escuta só em localhost: a API não fica exposta na rede
app.listen(porta, '127.0.0.1', () => console.log(`API rodando em http://localhost:${porta}`));
