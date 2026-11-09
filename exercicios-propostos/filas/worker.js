import { conectar } from '../redis.js';
import { K } from './chaves.js';

const workerId = process.argv[2] ?? `worker-${process.pid}`;
const filaAlta = process.env.FILA_ALTA ?? K.alta;
const filaNormal = process.env.FILA_NORMAL ?? K.normal;
const client = await conectar();
const bloqueante = await client.duplicate().connect();
let rodando = true;

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => { rodando = false; });
}

console.log(`[${workerId}] aguardando tarefas`);
while (rodando) {
  const retirada = await bloqueante.brPop([filaAlta, filaNormal], 1);
  if (!retirada) continue;
  const tarefa = JSON.parse(retirada.element);

  try {
    const espera = Number(tarefa.atrasoMs ?? 500);
    if (espera > 0) await new Promise((resolver) => setTimeout(resolver, espera));
    if (tarefa.para?.endsWith('@invalido.com')) throw new Error('domínio inexistente');
    if (tarefa.modo === 'benchmark') await client.incr(tarefa.contador);
    else console.log(`[${workerId}] enviado: ${tarefa.assunto} -> ${tarefa.para}`);
  } catch (erro) {
    tarefa.tentativas++;
    tarefa.ultimoErro = erro.message;
    if (tarefa.tentativas <= 3) {
      const chave = tarefa.prioridade === 'alta' ? K.agendadaAlta : K.agendadaNormal;
      await client.zAdd(chave, {
        score: Date.now() + 2 ** tarefa.tentativas * 1000,
        value: JSON.stringify(tarefa),
      });
      console.log(`[${workerId}] retentativa ${tarefa.tentativas} agendada em ${2 ** tarefa.tentativas}s`);
    } else {
      await client.rPush(K.falhas, JSON.stringify(tarefa));
      console.log(`[${workerId}] tarefa ${tarefa.id} enviada à DLQ: ${erro.message}`);
    }
  }
}

await bloqueante.close();
await client.close();