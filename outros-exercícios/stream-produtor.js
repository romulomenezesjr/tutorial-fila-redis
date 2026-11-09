import { createClient } from 'redis';

const client = await createClient().on('error', console.error).connect();

for (const [pedido, cliente] of [[101, 'ana'], [102, 'bruno'], [103, 'caio']]) {
  const id = await client.xAdd(
    'fila:pedidos', '*',
    { pedido: String(pedido), cliente },
    { TRIM: { strategy: 'MAXLEN', strategyModifier: '~', threshold: 10000 } },
  );
  console.log('publicado', id);
}
await client.close();
