import { conectar } from '../redis.js';

const client = await conectar();
const stream = 'exercicio:pedidos';
const grupos = ['email', 'auditoria'];
const totalMensagens = 5;

await client.del(stream);
for (const grupo of grupos) {
  try {
    await client.xGroupCreate(stream, grupo, '0', { MKSTREAM: true });
  } catch (erro) {
    if (!erro.message.includes('BUSYGROUP')) throw erro;
  }
}

for (let indice = 1; indice <= totalMensagens; indice++) {
  await client.xAdd(stream, '*', { pedido: `pedido-${indice}`, valor: String(indice * 10) });
}

async function consumirOnda(grupo, consumidores) {
  const recebidas = await Promise.all(consumidores.map(async (consumidor) => {
    const lotes = await client.xReadGroup(grupo, consumidor, [{ key: stream, id: '>' }], {
      COUNT: 1,
      BLOCK: 100,
    });
    const mensagens = lotes?.flatMap((lote) => lote.messages) ?? [];
    for (const mensagem of mensagens) await client.xAck(stream, grupo, mensagem.id);
    return mensagens.map((mensagem) => ({
      consumidor,
      pedido: mensagem.message.pedido,
    }));
  }));
  return recebidas.flat();
}

try {
  for (const grupo of grupos) {
    const resultados = [];
    while (resultados.length < totalMensagens) {
      resultados.push(...await consumirOnda(grupo, [`${grupo}-1`, `${grupo}-2`]));
    }
    console.log(`Grupo ${grupo}:`, resultados);
  }
} finally {
  await client.close();
}