import { FilaArray } from './fila-array.js';
import { FilaEncadeada } from './fila-encadeada.js';
import { Fila } from './fila.js';

const implementacoes = { FilaArray, FilaEncadeada, Fila };
const tamanhos = [5_000, 10_000, 20_000, 40_000, 80_000];
const REPETICOES = 3;

function medir(Classe, n) {
  const fila = new Classe();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fila.enfileirar({ id: i });
  const t1 = performance.now();
  while (!fila.estaVazia()) fila.desenfileirar();
  const t2 = performance.now();
  return { enfileirar: t1 - t0, desenfileirar: t2 - t1 };
}

function mediana(valores) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)];
}

function medirMemoria(Classe, n) {
  const fila = new Classe();
  globalThis.gc();
  const heapAntes = process.memoryUsage().heapUsed;
  for (let i = 0; i < n; i++) fila.enfileirar(i);
  globalThis.gc();
  const heapDepois = process.memoryUsage().heapUsed;
  if (fila.tamanho() !== n) throw new Error('A fila perdeu itens durante a medição.');
  return heapDepois - heapAntes;
}

for (const Classe of Object.values(implementacoes)) medir(Classe, 10_000);

const resultados = [];
for (const n of tamanhos) {
  for (const [nome, Classe] of Object.entries(implementacoes)) {
    const medidas = Array.from({ length: REPETICOES }, () => medir(Classe, n));
    resultados.push({
      fila: nome,
      n,
      'enfileirar (ms)': Number(mediana(medidas.map((m) => m.enfileirar)).toFixed(2)),
      'desenfileirar (ms)': Number(mediana(medidas.map((m) => m.desenfileirar)).toFixed(2)),
    });
  }
}
console.table(resultados);

const memoria = Object.entries(implementacoes).map(([nome, Classe]) => ({
  fila: nome,
  'heap usado (MiB)': Number((medirMemoria(Classe, 1_000_000) / 1024 ** 2).toFixed(2)),
}));
console.table(memoria);
