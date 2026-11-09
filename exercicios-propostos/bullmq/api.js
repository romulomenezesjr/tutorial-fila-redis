import express from 'express';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';

const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  username: redis.username || undefined,
  password: redis.password || undefined,
};
const fila = new Queue('emails-exercicio-9', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: false,
  },
});

const app = express();
app.use(express.json());

app.post('/emails', async (req, res) => {
  const { para, assunto, prioridade = 'normal' } = req.body ?? {};
  if (!para || !assunto) return res.status(400).json({ erro: 'Informe para e assunto.' });
  if (!['alta', 'normal'].includes(prioridade)) {
    return res.status(400).json({ erro: 'prioridade deve ser alta ou normal.' });
  }
  const job = await fila.add('email', { para, assunto }, {
    jobId: randomUUID(),
    priority: prioridade === 'alta' ? 1 : 10,
  });
  res.status(202).json({ id: job.id, status: 'enfileirado' });
});

app.get('/status', async (req, res) => {
  res.json(await fila.getJobCounts('wait', 'active', 'delayed', 'failed', 'completed'));
});

app.get('/falhas', async (req, res) => {
  const jobs = await fila.getJobs(['failed'], 0, -1);
  res.json(jobs.map((job) => ({
    id: job.id,
    dados: job.data,
    tentativas: job.attemptsMade,
    erro: job.failedReason,
  })));
});

app.post('/falhas/reprocessar', async (req, res) => {
  const jobs = await fila.getJobs(['failed'], 0, -1);
  for (const job of jobs) await job.retry();
  res.json({ reprocessadas: jobs.length });
});

const server = app.listen(Number(process.env.PORT ?? 3001), () => {
  console.log('API BullMQ em http://localhost:3001');
});

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, async () => {
    server.close();
    await fila.close();
    process.exit(0);
  });
}