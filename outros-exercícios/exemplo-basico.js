import { conectar } from './redis.js';

const client = await conectar();

await client.set('aluno:1:nome', 'Maria');
console.log(await client.get('aluno:1:nome'));

await client.hSet('aluno:1', { nome: 'Maria', curso: 'TSI', periodo: 3 });
console.log(await client.hGetAll('aluno:1')); 

await client.lPush('fila:emails', JSON.stringify({ para: 'ana@ex.com', assunto: 'Oi' }));
console.log(await client.lLen('fila:emails'));
const item = await client.rPop('fila:emails');
console.log(JSON.parse(item));

const [tamanho, total] = await client
  .multi()
  .lPush('fila:emails', 'a')
  .incr('stats:enfileirados')
  .exec();
console.log(tamanho, total);

await client.close();
