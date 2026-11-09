# Exercícios propostos: filas com Redis

Projeto executável para os exercícios 1 a 12 da seção 14 do tutorial. Mantém o padrão dos exemplos: Node.js com módulos ES, Redis em Docker, conexões por `node-redis` e processos separados para API e workers.

## Requisitos e inicialização

- Node.js 22 ou superior
- Docker com Docker Compose

Na pasta `exercicios-propostos/`:

```bash
docker compose up -d
npm install
npm test
```

O Compose inicia o Redis 8 na porta 6379, com AOF e volume persistente `redis-dados`. Configure outra URL com `REDIS_URL`, se necessário. Os comandos abaixo devem ser executados nesta pasta.

## Exercícios 1 e 2: fila circular e Lists

`fila-circular.js` implementa uma fila de capacidade fixa, com todos os N espaços disponíveis, índices circulares e O(1) nas operações. O teste verifica FIFO, fila cheia, reuso de posições e capacidade inválida:

```bash
npm test
```

Para a prática do `redis-cli`, abra:

```bash
docker compose exec redis redis-cli
```

E rode, em sequência:

```text
DEL fila:atendimento
LPUSH fila:atendimento Ana Beto Caio Duda Eva
RPOP fila:atendimento
RPOP fila:atendimento
LINDEX fila:atendimento -1
LLEN fila:atendimento
DEL fila:atendimento
RPUSH fila:atendimento Ana Beto Caio Duda Eva
LPOP fila:atendimento
LPOP fila:atendimento
DEL fila:atendimento
LPUSH fila:atendimento Ana Beto Caio Duda Eva
LPOP fila:atendimento
```

`LPUSH` + `RPOP` e `RPUSH` + `LPOP` atendem FIFO. `LPUSH` + `LPOP` atende LIFO, invertendo a ordem.

## Exercícios 3 a 7: workers, agendamento e prioridades

Abra terminais separados nesta pasta:

```bash
npm run api
npm run worker -- worker-1
npm run scheduler
```

A API fica em `http://localhost:3000`. Enfileire uma tarefa normal ou de alta prioridade:

```bash
curl -X POST http://localhost:3000/emails \
  -H 'Content-Type: application/json' \
  -d '{"para":"ana@example.com","assunto":"Confirmação","prioridade":"alta"}'
```

Inicie workers extras em outros terminais, por exemplo `npm run worker -- worker-2`. Para medir 100 tarefas com um, dois e quatro processos:

```bash
npm run benchmark
```

Cada tarefa tem uma espera simulada de 100 ms. O ganho é limitado por criação dos processos, Redis, escalonamento e pelo trabalho que não pode ser paralelizado. O worker consome primeiro a fila de alta prioridade com `BRPOP`; se ambas as filas já tiverem itens, a fila alta vem primeiro.

O exercício 4 é implementado por `moverVencidas()` em `filas/chaves.js`: busca, remoção do Sorted Set e entrada na List são um único `EVAL`. O worker agenda falhas no Sorted Set para 2, 4 e 8 segundos, cobrindo o exercício 5. Consulte a DLQ e reenvie suas tarefas pela API:

```bash
curl http://localhost:3000/falhas
curl -X POST http://localhost:3000/falhas/reprocessar
```

O exercício 6 é a rota de falhas; o 7 compara alta e normal. O exemplo de prioridade não mantém uma lista de processamento: uma queda após retirar uma tarefa pode perdê-la. A seção 6.6 do tutorial mostra a alternativa com `BLMOVE` e lista de processamento.

## Exercícios 8 e 9: Streams e BullMQ

O exercício 8 cria dois grupos (`email` e `auditoria`) e dois consumidores por grupo. Cada grupo recebe todas as mensagens; seus consumidores repartem as mensagens entre si:

```bash
npm run streams
```

O exercício 9 tem uma segunda API BullMQ na porta 3001. Em terminais separados:

```bash
npm run bull:api
npm run bull:worker
```

Ela mantém `POST /emails`, `/status` e as rotas de consulta/reprocessamento da DLQ, com três tentativas e backoff exponencial. O BullMQ passa a cuidar do agendamento, ciclo de vida, retries e estados dos jobs.

## Exercícios 10 a 12: progresso, retomada e cancelamento de PDFs

Em terminais separados:

```bash
npm run pdf:api
npm run pdf:worker -- worker-1
```

Abra `http://localhost:3000` e envie um PDF. Para permitir observar a retomada, ajuste o intervalo entre páginas antes de iniciar o worker:

```bash
ATRASO_POR_PAGINA_MS=800 npm run pdf:worker -- worker-1
```

O exercício 10 usa `EventSource('/eventos')`. Com 10 jobs na tela, polling a cada segundo faria até 600 requisições HTTP por minuto; SSE mantém uma conexão por navegador, além das mensagens de evento.

O exercício 11 grava o texto extraído em `pdf:paginas:<id>` com `RPUSH`. Se o worker morrer, o próximo worker recupera o ID da lista `pdf:processando:<worker>` e continua na página `LLEN + 1`. Teste com um PDF longo, encerre o processo do worker durante a extração e inicie outro.

O exercício 12 expõe `DELETE /pdfs/:id`. Se o job está em `pdf:fila`, um script Lua o remove e altera o Hash para `cancelado` atomicamente. Para um job já ativo, a API grava `cancelamentoSolicitado` no Hash; o worker consulta essa flag entre páginas e para cooperativamente. Uma página que já está sendo extraída não é interrompida no meio.

As chaves de PDF usam o mesmo prefixo `pdf:*` do exemplo `pdf-fila/`; não execute os dois exemplos de PDF ao mesmo tempo no mesmo Redis. Os diretórios `uploads/` e `resultados/` são criados durante a execução.

## Arquivos

```text
exercicios-propostos/
├── docker-compose.yml
├── fila-circular.js
├── filas/       API, workers, scheduler e benchmark
├── streams/     grupos de consumidores
├── bullmq/      API e worker BullMQ
├── pdf/         API SSE, página web e worker retomável
└── testes/      testes de fila circular
```

Ao terminar, pare o Redis com `docker compose down`. O volume persistente é mantido; `docker compose down -v` o apaga.