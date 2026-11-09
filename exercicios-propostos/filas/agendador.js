import { conectar } from '../redis.js';
import { moverVencidas } from './chaves.js';

const client = await conectar();
let rodando = true;
process.on('SIGINT', () => { rodando = false; });
process.on('SIGTERM', () => { rodando = false; });

console.log('Agendador ativo; verificando tarefas vencidas a cada 250 ms.');
while (rodando) {
  const movidas = await moverVencidas(client);
  if (movidas) console.log(`${movidas} tarefa(s) movida(s) atomicamente`);
  await new Promise((resolver) => setTimeout(resolver, 250));
}
await client.close();