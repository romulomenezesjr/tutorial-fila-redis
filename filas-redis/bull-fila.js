import { Queue } from 'bullmq';

const connection = { host: 'localhost', port: 6379 };
const fila = new Queue('emails', { connection });

await fila.add('confirmacao', { para: 'ana@ifpb.edu.br', assunto: 'Inscrição confirmada' });

await fila.add(
  'confirmacao',
  { para: 'x@invalido.com', assunto: 'Teste' },
  { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
);

await fila.add('lembrete', { para: 'bruno@ifpb.edu.br', assunto: 'Prova amanhã' }, { delay: 3000 });

await fila.add('senha', { para: 'caio@ifpb.edu.br', assunto: 'Redefinir senha' }, { priority: 1 });

console.log('tarefas por estado:', await fila.getJobCounts('wait', 'delayed', 'prioritized'));
await fila.close();
