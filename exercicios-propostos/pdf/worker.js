import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';
import { conectar } from '../redis.js';
import { K, publicar } from './chaves.js';

const workerId = process.argv[2] ?? `worker-${process.pid}`;
const maxTentativas = 3;
const atrasoMs = Number(process.env.ATRASO_POR_PAGINA_MS ?? 300);
const client = await conectar();
const bloqueante = await client.duplicate().connect();
const processando = K.processando(workerId);
await mkdir('resultados', { recursive: true });

async function extrairTexto(id, caminho) {
  const parser = new PDFParse({ data: await readFile(caminho) });
  try {
    const { total } = await parser.getInfo();
    await client.hSet(K.job(id), { paginas: total });
    const guardadas = await client.lLen(K.paginas(id));

    for (let pagina = guardadas + 1; pagina <= total; pagina++) {
      const estado = await client.hGetAll(K.job(id));
      if (estado.cancelamentoSolicitado === '1') return { cancelado: true, pagina: pagina - 1 };

      const resultado = await parser.getText({ partial: [pagina] });
      await client.rPush(K.paginas(id), resultado.text);
      const paginaAtual = await client.lLen(K.paginas(id));
      await client.hSet(K.job(id), { pagina: paginaAtual });
      await publicar(client, 'progresso', { id, nome: estado.nome, pagina: paginaAtual, paginas: total });
      if (atrasoMs > 0) await new Promise((resolver) => setTimeout(resolver, atrasoMs));
    }

    const partes = await client.lRange(K.paginas(id), 0, -1);
    const texto = partes.join('\n\n');
    const resultado = `resultados/${id}.txt`;
    await writeFile(resultado, texto, 'utf8');
    return { resultado, caracteres: texto.length, paginas: total };
  } finally {
    await parser.destroy();
  }
}

async function recuperar(workerAlvo) {
  for await (const chaves of client.scanIterator({ MATCH: 'pdf:processando:*', COUNT: 100 })) {
    for (const chave of chaves) {
      let id;
      while ((id = await client.lMove(chave, K.fila, 'RIGHT', 'LEFT'))) {
        const job = await client.hGetAll(K.job(id));
        if (job.cancelamentoSolicitado === '1') {
          await client.hSet(K.job(id), { status: 'cancelado' });
          await publicar(client, 'cancelado', { id, nome: job.nome, pagina: job.pagina });
        } else {
          await client.hSet(K.job(id), { status: 'na_fila' });
          console.log(`[${workerAlvo}] job ${id} recuperado da lista ${chave}`);
        }
      }
    }
  }
}

await recuperar(workerId);
console.log(`[${workerId}] aguardando PDFs`);
let rodando = true;
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => { rodando = false; });
}

while (rodando) {
  const id = await bloqueante.blMove(K.fila, processando, 'RIGHT', 'LEFT', 2);
  if (id === null) continue;
  const job = await client.hGetAll(K.job(id));
  if (job.cancelamentoSolicitado === '1') {
    await client.multi()
      .lRem(processando, 1, id)
      .hSet(K.job(id), { status: 'cancelado' })
      .exec();
    await publicar(client, 'cancelado', { id, nome: job.nome, pagina: job.pagina });
    continue;
  }

  await client.hSet(K.job(id), { status: 'processando', worker: workerId });
  await publicar(client, 'iniciado', { id, nome: job.nome, pagina: job.pagina });
  try {
    const extraido = await extrairTexto(id, job.caminho);
    if (extraido.cancelado) {
      await client.multi()
        .lRem(processando, 1, id)
        .hSet(K.job(id), { status: 'cancelado', pagina: extraido.pagina })
        .exec();
      await publicar(client, 'cancelado', { id, nome: job.nome, pagina: extraido.pagina });
      continue;
    }

    await client.multi()
      .hSet(K.job(id), {
        status: 'concluido', resultado: extraido.resultado, caracteres: extraido.caracteres,
        pagina: extraido.paginas, concluidoEm: Date.now(),
      })
      .lRem(processando, 1, id)
      .exec();
    await publicar(client, 'concluido', {
      id, nome: job.nome, pagina: extraido.paginas, paginas: extraido.paginas,
      caracteres: extraido.caracteres,
    });
  } catch (erro) {
    const tentativas = await client.hIncrBy(K.job(id), 'tentativas', 1);
    const desistir = tentativas >= maxTentativas;
    await client.multi()
      .hSet(K.job(id), { status: desistir ? 'erro' : 'na_fila', erro: erro.message })
      .lRem(processando, 1, id)
      .lPush(desistir ? 'pdf:falhas' : K.fila, id)
      .exec();
    await publicar(client, desistir ? 'erro' : 'retentativa', {
      id, nome: job.nome, erro: erro.message, tentativas,
    });
  }
}

await bloqueante.close();
await client.close();