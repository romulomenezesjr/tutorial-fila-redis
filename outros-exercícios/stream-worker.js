import { createClient } from 'redis';

const STREAM = 'fila:pedidos';
const GRUPO = 'cozinha';
const CONSUMIDOR = process.argv[2] ?? `worker-${process.pid}`;

const client = await createClient().on('error', console.error).connect();

try {
  await client.xGroupCreate(STREAM, GRUPO, '0', { MKSTREAM: true });
} catch (erro) {
  if (!erro.message.includes('BUSYGROUP')) throw erro;
}

async function processar(id, pedido) {
  console.log(`[${CONSUMIDOR}] preparando pedido ${pedido.pedido} de ${pedido.cliente}`);
  await new Promise((r) => setTimeout(r, 200));
}

let rodando = true;
process.on('SIGINT', () => { rodando = false; });

while (rodando) {
  const resposta = await client.xReadGroup(
    GRUPO, CONSUMIDOR,
    { key: STREAM, id: '>' },
    { COUNT: 10, BLOCK: 2000 },
  );
  if (!resposta) continue;
  for (const { id, message } of resposta[0].messages) {
    await processar(id, message);
    await client.xAck(STREAM, GRUPO, id); 
  }
}
await client.close();
