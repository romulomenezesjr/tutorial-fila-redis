import express from 'express';
import { randomUUID } from 'node:crypto';
import { conectar } from '../redis.js';
import { K, REPROCESSAR_FALHAS } from './chaves.js';

const client = await conectar();
const app = express();
app.use(express.json());

app.post('/emails', async (req, res) => {
  const { para, assunto, prioridade = 'normal' } = req.body ?? {};
  if (!para || !assunto) return res.status(400).json({ erro: 'Informe para e assunto.' });
  if (!['alta', 'normal'].includes(prioridade)) {
    return res.status(400).json({ erro: 'prioridade deve ser alta ou normal.' });
  }
  const tarefa = { id: randomUUID(), para, assunto, prioridade, tentativas: 0 };
  await client.lPush(prioridade === 'alta' ? K.alta : K.normal, JSON.stringify(tarefa));
  res.status(202).json({ id: tarefa.id, status: 'enfileirado', prioridade });
});

app.get('/status', async (req, res) => {
  const [alta, normal, agendadaAlta, agendadaNormal, falhas] = await Promise.all([
    client.lLen(K.alta), client.lLen(K.normal),
    client.zCard(K.agendadaAlta), client.zCard(K.agendadaNormal), client.lLen(K.falhas),
  ]);
  res.json({ alta, normal, agendadas: agendadaAlta + agendadaNormal, falhas });
});

app.get('/falhas', async (req, res) => {
  const tarefas = await client.lRange(K.falhas, 0, -1);
  res.json(tarefas.map((tarefa) => JSON.parse(tarefa)));
});

app.post('/falhas/reprocessar', async (req, res) => {
  const total = await client.eval(REPROCESSAR_FALHAS, {
    keys: [K.falhas, `${K.falhas}:reprocessando`, K.alta, K.normal],
    arguments: [],
  });
  res.json({ reprocessadas: Number(total) });
});

const porta = Number(process.env.PORT ?? 3000);
app.listen(porta, () => console.log(`API de filas em http://localhost:${porta}`));