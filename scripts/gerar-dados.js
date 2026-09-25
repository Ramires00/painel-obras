// Gera data/db.json com dados FICTÍCIOS de uma construtora do Litoral Norte.
// Determinístico (mesma semente => mesmos dados), para o dashboard ser reproduzível.
// Uso: node scripts/gerar-dados.js

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// PRNG simples (mulberry32)
let semente = 20260924;
function aleatorio() {
  semente |= 0; semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (min, max) => min + aleatorio() * (max - min);
const inteiro = (min, max) => Math.floor(entre(min, max + 1));
const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];
const dinheiro = (v) => Math.round(v * 100) / 100;
const data = (ano, mes, dia) => new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);

const obras = [
  { id: 1, nome: 'Residencial Atlântico', cidade: 'Capão da Canoa', inicio: '2024-03-01', previsaoEntrega: '2027-06-30', unidades: 48, andares: 12, precoM2: 11500 },
  { id: 2, nome: 'Vila das Dunas', cidade: 'Xangri-lá', inicio: '2025-02-01', previsaoEntrega: '2028-03-31', unidades: 36, andares: 9, precoM2: 12800 },
  { id: 3, nome: 'Torre Maré', cidade: 'Capão da Canoa', inicio: '2023-06-01', previsaoEntrega: '2026-12-15', unidades: 60, andares: 15, precoM2: 10900 },
];

// Etapas com peso no orçamento total e ordem de execução
const etapas = [
  { etapa: 'Serviços preliminares', peso: 0.03 },
  { etapa: 'Fundação', peso: 0.10 },
  { etapa: 'Estrutura', peso: 0.25 },
  { etapa: 'Alvenaria', peso: 0.10 },
  { etapa: 'Instalações elétricas e hidráulicas', peso: 0.14 },
  { etapa: 'Revestimentos', peso: 0.16 },
  { etapa: 'Esquadrias', peso: 0.08 },
  { etapa: 'Pintura e acabamento', peso: 0.14 },
];
// Percentual físico concluído por obra (quanto a obra já avançou)
const avancoObra = { 1: 0.55, 2: 0.22, 3: 0.88 };

const orcamentos = [];
for (const obra of obras) {
  const areaTotal = obra.unidades * 95;
  const orcamentoTotal = areaTotal * 4200; // custo de construção por m²
  obra.orcamentoTotal = dinheiro(orcamentoTotal);
  let acumulado = 0;
  for (const [i, e] of etapas.entries()) {
    const orcado = dinheiro(orcamentoTotal * e.peso);
    // Etapas anteriores ao avanço atual estão concluídas; a do meio, parcial
    const inicioEtapa = acumulado;
    acumulado += e.peso;
    const fracao = Math.max(0, Math.min(1, (avancoObra[obra.id] - inicioEtapa) / e.peso));
    const desvio = entre(0.92, 1.18); // estouro ou economia por etapa
    orcamentos.push({
      obraId: obra.id,
      ordem: i + 1,
      etapa: e.etapa,
      orcado,
      realizado: dinheiro(orcado * fracao * desvio),
      percentualConcluido: Math.round(fracao * 100),
    });
  }
}

const fornecedores = [
  'Cimentos Litoral', 'Aço Sul Distribuidora', 'Madeireira Serra Mar', 'Elétrica Tramandaí',
  'Hidráulica Osório', 'Cerâmica Gaúcha', 'Vidraçaria Atlântida', 'Tintas Praia Norte',
];
const insumos = [
  { insumo: 'Cimento CP-II (saco 50kg)', unidade: 'sc', preco: [34, 42], etapa: 'Estrutura' },
  { insumo: 'Vergalhão CA-50 10mm', unidade: 'barra', preco: [48, 62], etapa: 'Estrutura' },
  { insumo: 'Concreto usinado fck 30', unidade: 'm³', preco: [480, 560], etapa: 'Fundação' },
  { insumo: 'Bloco cerâmico 14x19x39', unidade: 'un', preco: [2.1, 2.9], etapa: 'Alvenaria' },
  { insumo: 'Cabo flexível 2,5mm', unidade: 'rolo', preco: [210, 280], etapa: 'Instalações elétricas e hidráulicas' },
  { insumo: 'Tubo PVC 100mm', unidade: 'barra', preco: [88, 120], etapa: 'Instalações elétricas e hidráulicas' },
  { insumo: 'Porcelanato 80x80', unidade: 'm²', preco: [69, 110], etapa: 'Revestimentos' },
  { insumo: 'Janela alumínio 150x120', unidade: 'un', preco: [980, 1450], etapa: 'Esquadrias' },
  { insumo: 'Tinta acrílica 18L', unidade: 'lata', preco: [310, 420], etapa: 'Pintura e acabamento' },
];
const statusPedido = ['Pendente', 'Aprovado', 'Entregue', 'Entregue', 'Entregue'];

const pedidosCompra = [];
let pedidoId = 1;
for (let mes = 1; mes <= 9; mes++) {
  for (const obra of obras) {
    const n = inteiro(2, 4);
    for (let k = 0; k < n; k++) {
      const item = escolher(insumos);
      const quantidade = item.preco[1] > 500 ? inteiro(5, 40) : inteiro(50, 800);
      const precoUnitario = dinheiro(entre(...item.preco));
      pedidosCompra.push({
        id: pedidoId++,
        obraId: obra.id,
        data: data(2026, mes, inteiro(1, 28)),
        fornecedor: escolher(fornecedores),
        insumo: item.insumo,
        etapa: item.etapa,
        unidade: item.unidade,
        quantidade,
        precoUnitario,
        valorTotal: dinheiro(quantidade * precoUnitario),
        status: mes === 9 ? escolher(['Pendente', 'Aprovado']) : escolher(statusPedido),
      });
    }
  }
}

const unidades = [];
const contratosVenda = [];
const clientes = ['A. Souza', 'B. Lima', 'C. Martins', 'D. Rocha', 'E. Ferreira', 'F. Alves', 'G. Costa', 'H. Pereira', 'I. Ribeiro', 'J. Carvalho'];
let unidadeId = 1;
let contratoId = 1;
const taxaVenda = { 1: 0.7, 2: 0.4, 3: 0.92 };
for (const obra of obras) {
  const porAndar = obra.unidades / obra.andares;
  for (let andar = 1; andar <= obra.andares; andar++) {
    for (let p = 1; p <= porAndar; p++) {
      const area = escolher([72, 88, 105, 128]);
      const valor = dinheiro(area * obra.precoM2 * (1 + andar * 0.01));
      const sorteio = aleatorio();
      const status = sorteio < taxaVenda[obra.id] ? 'Vendida' : sorteio < taxaVenda[obra.id] + 0.06 ? 'Reservada' : 'Disponível';
      const unidade = { id: unidadeId++, obraId: obra.id, numero: `${andar}${String(p).padStart(2, '0')}`, andar, areaPrivativa: area, valorTabela: valor, status };
      unidades.push(unidade);
      if (status === 'Vendida') {
        const entrada = dinheiro(valor * entre(0.1, 0.3));
        const parcelas = inteiro(24, 60);
        contratosVenda.push({
          id: contratoId++,
          obraId: obra.id,
          unidadeId: unidade.id,
          cliente: escolher(clientes),
          dataVenda: data(inteiro(2023, 2026), inteiro(1, 9), inteiro(1, 28)),
          valorVenda: valor,
          entrada,
          numeroParcelas: parcelas,
          valorParcela: dinheiro((valor - entrada) / parcelas),
          indiceCorrecao: 'INCC',
          parcelasEmAtraso: aleatorio() < 0.12 ? inteiro(1, 3) : 0,
        });
      }
    }
  }
}

const db = { obras, orcamentos, pedidosCompra, unidades, contratosVenda };
mkdirSync(join(raiz, 'data'), { recursive: true });
writeFileSync(join(raiz, 'data', 'db.json'), JSON.stringify(db, null, 2));
console.log(`db.json gerado: ${obras.length} obras, ${orcamentos.length} etapas, ${pedidosCompra.length} pedidos, ${unidades.length} unidades, ${contratosVenda.length} contratos`);
