// API REST de gestão de obras. Os recursos seguem os nomes das APIs públicas
// do Sienge (obras, orçamentos, pedidos de compra, unidades, contratos de venda),
// mas os dados são fictícios e o formato é simplificado.

import express from 'express';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

const STATUS_PEDIDO = ['Pendente', 'Aprovado', 'Entregue', 'Cancelado'];

export function criarApp({ arquivoDados, apiKey, limitePorMinuto = 120 }) {
  if (!apiKey || apiKey.length < 16) {
    throw new Error('API_KEY ausente ou curta demais (mínimo 16 caracteres)');
  }

  const db = JSON.parse(readFileSync(arquivoDados, 'utf-8'));

  // Grava em arquivo temporário e renomeia: nunca deixa o db.json pela metade
  function salvar() {
    const tmp = `${arquivoDados}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 2));
    renameSync(tmp, arquivoDados);
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Cabeçalhos básicos de segurança
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Log simples de acesso (sem registrar a chave)
  app.use((req, res, next) => {
    const inicio = Date.now();
    res.on('finish', () => {
      console.log(`${new Date().toISOString()} ${req.ip} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - inicio}ms`);
    });
    next();
  });

  app.get('/api/saude', (req, res) => res.json({ status: 'ok' }));

  // Limite de requisições por IP (janela de 1 minuto)
  const acessos = new Map();
  app.use('/api', (req, res, next) => {
    const agora = Date.now();
    const registro = acessos.get(req.ip) ?? { inicio: agora, total: 0 };
    if (agora - registro.inicio > 60_000) { registro.inicio = agora; registro.total = 0; }
    registro.total++;
    acessos.set(req.ip, registro);
    if (registro.total > limitePorMinuto) {
      return res.status(429).json({ erro: 'Muitas requisições. Tente novamente em instantes.' });
    }
    next();
  });

  // Autenticação por chave de API (cabeçalho x-api-key), comparação em tempo constante
  const chaveEsperada = Buffer.from(apiKey);
  app.use('/api', (req, res, next) => {
    const recebida = Buffer.from(req.get('x-api-key') ?? '');
    if (recebida.length !== chaveEsperada.length || !timingSafeEqual(recebida, chaveEsperada)) {
      return res.status(401).json({ erro: 'Chave de API inválida ou ausente' });
    }
    next();
  });

  const filtrar = (lista, query, campos) =>
    lista.filter((item) => campos.every((c) => query[c] === undefined || String(item[c]) === String(query[c])));

  const obraExiste = (id) => db.obras.some((o) => o.id === id);

  // --- Obras e orçamento ---
  app.get('/api/obras', (req, res) => res.json(db.obras));

  app.get('/api/obras/:id', (req, res) => {
    const obra = db.obras.find((o) => o.id === Number(req.params.id));
    if (!obra) return res.status(404).json({ erro: 'Obra não encontrada' });
    res.json(obra);
  });

  app.get('/api/orcamentos', (req, res) => res.json(filtrar(db.orcamentos, req.query, ['obraId'])));

  // --- Suprimentos ---
  app.get('/api/pedidos-compra', (req, res) =>
    res.json(filtrar(db.pedidosCompra, req.query, ['obraId', 'status', 'fornecedor'])));

  app.post('/api/pedidos-compra', (req, res) => {
    const { obraId, fornecedor, insumo, etapa, unidade, quantidade, precoUnitario } = req.body ?? {};
    const erros = [];
    if (!Number.isInteger(obraId) || !obraExiste(obraId)) erros.push('obraId inválido');
    for (const [campo, valor] of Object.entries({ fornecedor, insumo, etapa, unidade })) {
      if (typeof valor !== 'string' || !valor.trim() || valor.length > 120) erros.push(`${campo} obrigatório (texto até 120 caracteres)`);
    }
    if (typeof quantidade !== 'number' || !(quantidade > 0)) erros.push('quantidade deve ser maior que zero');
    if (typeof precoUnitario !== 'number' || !(precoUnitario > 0)) erros.push('precoUnitario deve ser maior que zero');
    if (erros.length) return res.status(400).json({ erros });

    const pedido = {
      id: Math.max(0, ...db.pedidosCompra.map((p) => p.id)) + 1,
      obraId,
      data: new Date().toISOString().slice(0, 10),
      fornecedor: fornecedor.trim(),
      insumo: insumo.trim(),
      etapa: etapa.trim(),
      unidade: unidade.trim(),
      quantidade,
      precoUnitario,
      valorTotal: Math.round(quantidade * precoUnitario * 100) / 100,
      status: 'Pendente',
    };
    db.pedidosCompra.push(pedido);
    salvar();
    res.status(201).json(pedido);
  });

  app.patch('/api/pedidos-compra/:id/status', (req, res) => {
    const pedido = db.pedidosCompra.find((p) => p.id === Number(req.params.id));
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    const { status } = req.body ?? {};
    if (!STATUS_PEDIDO.includes(status)) return res.status(400).json({ erros: [`status deve ser um de: ${STATUS_PEDIDO.join(', ')}`] });
    pedido.status = status;
    salvar();
    res.json(pedido);
  });

  // --- Comercial ---
  app.get('/api/unidades', (req, res) => res.json(filtrar(db.unidades, req.query, ['obraId', 'status'])));
  app.get('/api/contratos-venda', (req, res) => res.json(filtrar(db.contratosVenda, req.query, ['obraId'])));

  // --- Relatório consolidado (usado pelo Power BI e pelo Power Automate) ---
  function resumoObras() {
    return db.obras.map((obra) => {
      const etapas = db.orcamentos.filter((o) => o.obraId === obra.id);
      const orcado = etapas.reduce((s, e) => s + e.orcado, 0);
      const realizado = etapas.reduce((s, e) => s + e.realizado, 0);
      const avancoFisico = etapas.reduce((s, e) => s + e.orcado * e.percentualConcluido, 0) / orcado;
      // Desvio: quanto se gastou além do previsto para o avanço físico atual
      const previstoAteAgora = orcado * avancoFisico / 100;
      const unidades = db.unidades.filter((u) => u.obraId === obra.id);
      const vendidas = unidades.filter((u) => u.status === 'Vendida');
      const contratos = db.contratosVenda.filter((c) => c.obraId === obra.id);
      const pendentes = db.pedidosCompra.filter((p) => p.obraId === obra.id && p.status === 'Pendente');
      return {
        obraId: obra.id,
        obra: obra.nome,
        cidade: obra.cidade,
        orcado: round(orcado),
        realizado: round(realizado),
        avancoFisicoPct: round(avancoFisico),
        desvioCustoPct: round(((realizado - previstoAteAgora) / previstoAteAgora) * 100),
        unidadesTotal: unidades.length,
        unidadesVendidas: vendidas.length,
        vendasPct: round((vendidas.length / unidades.length) * 100),
        vgvVendido: round(contratos.reduce((s, c) => s + c.valorVenda, 0)),
        contratosEmAtraso: contratos.filter((c) => c.parcelasEmAtraso > 0).length,
        pedidosPendentes: pendentes.length,
        valorPedidosPendentes: round(pendentes.reduce((s, p) => s + p.valorTotal, 0)),
      };
    });
  }

  app.get('/api/relatorios/resumo-obras', (req, res) => {
    const dados = resumoObras();
    if (req.query.formato !== 'csv') return res.json(dados);
    // CSV com ; e vírgula decimal: abre direto no Excel em português
    const colunas = Object.keys(dados[0]);
    const celula = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : `"${String(v).replace(/"/g, '""')}"`);
    const csv = [colunas.join(';'), ...dados.map((l) => colunas.map((c) => celula(l[c])).join(';'))].join('\r\n');
    res.type('text/csv; charset=utf-8').send('﻿' + csv);
  });

  app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erros: ['JSON inválido'] });
    console.error(err);
    res.status(500).json({ erro: 'Erro interno' });
  });

  return app;
}

const round = (v) => Math.round(v * 100) / 100;
