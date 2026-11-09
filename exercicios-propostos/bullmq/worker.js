import { Worker } from 'bullmq';

const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  username: redis.username || undefined,
  password: redis.password || undefined,
};

const worker = new Worker('emails-exercicio-9', async (job) => {
  await new Promise((resolver) => setTimeout(resolver, 500));
  if (job.data.para.endsWith('@invalido.com')) throw new Error('domínio inexistente');
  return { enviadoEm: new Date().toISOString() };
}, { connection, concurrency: Number(process.env.CONCURRENCY ?? 5) });

worker.on('completed', (job) => console.log(`ok #${job.id}: ${job.data.para}`));
worker.on('failed', (job, erro) => {
  console.log(`falha #${job?.id} ${job?.attemptsMade}/3: ${erro.message}`);
});

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, async () => {
    await worker.close();
    process.exit(0);
  });
}

console.log('Worker BullMQ aguardando tarefas');