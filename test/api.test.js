import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from '../src/app.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHAVE = 'chave-de-teste-1234567890';
let servidor, base, pasta;

before(async () => {
  // Cópia do banco numa pasta temporária: os testes não alteram data/db.json
  pasta = mkdtempSync(join(tmpdir(), 'painel-obras-'));
  const arquivo = join(pasta, 'db.json');
  copyFileSync(join(raiz, 'data', 'db.json'), arquivo);
  const app = criarApp({ arquivoDados: arquivo, apiKey: CHAVE, limitePorMinuto: 1000 });
  await new Promise((ok) => { servidor = app.listen(0, '127.0.0.1', ok); });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => { servidor.close(); rmSync(pasta, { recursive: true, force: true }); });

const chamar = (rota, opcoes = {}) =>
  fetch(base + rota, { ...opcoes, headers: { 'content-type': 'application/json', 'x-api-key': CHAVE, ...opcoes.headers } });

test('rota de saúde não exige chave', async () => {
  const r = await fetch(`${base}/api/saude`);
  assert.equal(r.status, 200);
});

test('recusa requisição sem chave ou com chave errada', async () => {
  assert.equal((await fetch(`${base}/api/obras`)).status, 401);
  assert.equal((await chamar('/api/obras', { headers: { 'x-api-key': 'errada' } })).status, 401);
});

test('lista obras e filtra pedidos por obra', async () => {
  const obras = await (await chamar('/api/obras')).json();
  assert.equal(obras.length, 3);
  const pedidos = await (await chamar('/api/pedidos-compra?obraId=2')).json();
  assert.ok(pedidos.length > 0);
  assert.ok(pedidos.every((p) => p.obraId === 2));
});

test('cria pedido de compra válido', async () => {
  const r = await chamar('/api/pedidos-compra', {
    method: 'POST',
    body: JSON.stringify({ obraId: 1, fornecedor: 'Cimentos Litoral', insumo: 'Cimento CP-II', etapa: 'Estrutura', unidade: 'sc', quantidade: 100, precoUnitario: 38.5 }),
  });
  assert.equal(r.status, 201);
  const pedido = await r.json();
  assert.equal(pedido.valorTotal, 3850);
  assert.equal(pedido.status, 'Pendente');
});

test('rejeita pedido inválido', async () => {
  const r = await chamar('/api/pedidos-compra', { method: 'POST', body: JSON.stringify({ obraId: 99, quantidade: -1 }) });
  assert.equal(r.status, 400);
  const { erros } = await r.json();
  assert.ok(erros.includes('obraId inválido'));
});

test('rejeita JSON malformado', async () => {
  const r = await chamar('/api/pedidos-compra', { method: 'POST', body: '{quebrado' });
  assert.equal(r.status, 400);
});

test('resumo por obra em JSON e CSV', async () => {
  const resumo = await (await chamar('/api/relatorios/resumo-obras')).json();
  assert.equal(resumo.length, 3);
  assert.ok(resumo.every((o) => o.orcado > 0 && o.unidadesTotal > 0));
  const r = await chamar('/api/relatorios/resumo-obras?formato=csv');
  assert.match(r.headers.get('content-type'), /text\/csv/);
  const csv = await r.text();
  assert.equal(csv.trim().split('\r\n').length, 4); // cabeçalho + 3 obras
});
