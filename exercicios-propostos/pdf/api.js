import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { conectar } from '../redis.js';
import { K, publicar } from './chaves.js';

mkdirSync('uploads', { recursive: true });
const client = await conectar();
const app = express();
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (req, arquivo, aceitar) => aceitar(null, arquivo.mimetype === 'application/pdf'),
});

app.use(express.static(new URL('./public/', import.meta.url).pathname));

app.post('/pdfs', upload.array('arquivos', 10), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ erro: 'Envie ao menos um arquivo PDF.' });
  const criados = [];
  for (const arquivo of req.files) {
    const id = randomUUID();
    const nome = Buffer.from(arquivo.originalname, 'latin1').toString('utf8');
    await client.multi()
      .hSet(K.job(id), {
        id, nome, caminho: arquivo.path, status: 'na_fila', pagina: 0,
        paginas: 0, tentativas: 0, criadoEm: Date.now(),
      })
      .lPush(K.fila, id)
      .exec();
    await publicar(client, 'na_fila', { id, nome, pagina: 0 });
    criados.push({ id, nome, status: 'na_fila' });
  }
  res.status(202).json(criados);
});

app.get('/pdfs/:id', async (req, res) => {
  const job = await client.hGetAll(K.job(req.params.id));
  if (!job.id) return res.status(404).json({ erro: 'Job não encontrado.' });
  res.json(job);
});

app.delete('/pdfs/:id', async (req, res) => {
  const { id } = req.params;
  const removido = await client.eval(`
    local removidos = redis.call('LREM', KEYS[1], 1, ARGV[1])
    if removidos == 1 then
      redis.call('HSET', KEYS[2], 'status', 'cancelado', 'cancelamentoSolicitado', '1')
    end
    return removidos
  `, { keys: [K.fila, K.job(id)], arguments: [id] });

  if (Number(removido) === 1) {
    const job = await client.hGetAll(K.job(id));
    await publicar(client, 'cancelado', { id, nome: job.nome, pagina: job.pagina });
    return res.json({ id, status: 'cancelado', modo: 'removido_da_fila' });
  }

  const job = await client.hGetAll(K.job(id));
  if (!job.id) return res.status(404).json({ erro: 'Job não encontrado.' });
  if (job.status !== 'processando') {
    return res.status(409).json({ erro: `Job não pode ser cancelado no status ${job.status}.` });
  }
  await client.hSet(K.job(id), { cancelamentoSolicitado: '1' });
  res.status(202).json({ id, status: 'cancelamento_solicitado' });
});

app.get('/pdfs/:id/texto', async (req, res) => {
  const job = await client.hGetAll(K.job(req.params.id));
  if (job.status !== 'concluido') {
    return res.status(409).json({ erro: `O job está "${job.status ?? 'inexistente'}".` });
  }
  res.type('text/plain; charset=utf-8').sendFile(job.resultado, { root: process.cwd() });
});

app.get('/eventos', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const assinante = await client.duplicate().connect();
  await assinante.subscribe(K.eventos, (mensagem) => res.write(`data: ${mensagem}\n\n`));
  req.on('close', async () => {
    await assinante.unsubscribe(K.eventos);
    await assinante.close();
  });
});

app.use((erro, req, res, next) => {
  if (res.headersSent) return next(erro);
  res.status(400).json({ erro: erro.message });
});

const server = app.listen(Number(process.env.PORT ?? 3000), () => {
  console.log('API de PDFs em http://localhost:3000');
});

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, async () => {
    server.close();
    await client.close();
    process.exit(0);
  });
}