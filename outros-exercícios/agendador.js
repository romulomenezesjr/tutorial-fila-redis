import { createClient } from 'redis';

const client = await createClient().on('error', console.error).connect();

async function agendar(tarefa, ms) {
  await client.zAdd('fila:agendada', {
    score: Date.now() + ms,
    value: JSON.stringify(tarefa),
  });
}

async function moverVencidas() {
  const vencidas = await client.zRange('fila:agendada', '-inf', Date.now(), {
    BY: 'SCORE',
    LIMIT: { offset: 0, count: 100 },
  });
  for (const tarefa of vencidas) {
    if ((await client.zRem('fila:agendada', tarefa)) === 1) {
      await client.lPush('fila:emails', tarefa);
    }
  }
  return vencidas.length;
}

await client.del(['fila:agendada', 'fila:emails']);
await agendar({ id: 1, assunto: 'Lembrete da prova' }, 1000);
await agendar({ id: 2, assunto: 'Resultado' }, 60000);
console.log('agora:', await moverVencidas());
await new Promise((r) => setTimeout(r, 1100));
console.log('após 1,1 s:', await moverVencidas());
console.log(await client.lRange('fila:emails', 0, -1));
console.log('ainda agendadas:', await client.zCard('fila:agendada'));
await client.close();
