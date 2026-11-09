import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { conectar } from '../redis.js';

const workerPath = fileURLToPath(new URL('./worker.js', import.meta.url));
const totalTarefas = 100;
const client = await conectar();

async function medir(workers) {
  const identificador = randomUUID();
  const filaAlta = `benchmark:${identificador}:alta`;
  const filaNormal = `benchmark:${identificador}:normal`;
  const contador = `benchmark:${identificador}:concluidas`;
  const processos = Array.from({ length: workers }, (_, indice) => spawn(
    process.execPath,
    [workerPath, `benchmark-${indice + 1}`],
    {
      stdio: 'ignore',
      env: { ...process.env, FILA_ALTA: filaAlta, FILA_NORMAL: filaNormal },
    },
  ));

  const tarefas = Array.from({ length: totalTarefas }, (_, indice) => JSON.stringify({
    id: `${identificador}-${indice}`,
    modo: 'benchmark',
    atrasoMs: 100,
    contador,
    prioridade: 'normal',
  }));
  await client.rPush(filaNormal, tarefas);
  const inicio = performance.now();
  while (Number(await client.get(contador) ?? 0) < totalTarefas) {
    await new Promise((resolver) => setTimeout(resolver, 50));
  }
  const duracao = performance.now() - inicio;

  for (const processo of processos) processo.kill('SIGTERM');
  await Promise.all(processos.map((processo) => new Promise((resolver) => processo.once('exit', resolver))));
  await client.del([filaAlta, filaNormal, contador]);
  return duracao;
}

try {
  for (const quantidade of [1, 2, 4]) {
    console.log(`${quantidade} worker(s): ${(await medir(quantidade)).toFixed(0)} ms para ${totalTarefas} tarefas`);
  }
} finally {
  await client.close();
}