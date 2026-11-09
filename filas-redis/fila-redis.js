import { randomUUID } from 'node:crypto';

export class FilaRedis {
  constructor(client, nome, { maxTentativas = 3 } = {}) {
    this.client = client;
    this.nome = nome;
    this.falhas = `${nome}:falhas`;
    this.maxTentativas = maxTentativas;
  }


  async enfileirar(dados) {
    const tarefa = { id: randomUUID(), dados, tentativas: 0, criadaEm: Date.now() };
    await this.client.lPush(this.nome, JSON.stringify(tarefa));
    return tarefa.id;
  }

  async tamanho() {
    return {
      pendentes: await this.client.lLen(this.nome),
      falhas: await this.client.lLen(this.falhas),
    };
  }

  async recuperar(workerId) {
    const processando = `${this.nome}:processando:${workerId}`;
    let recuperadas = 0;
    while (await this.client.lMove(processando, this.nome, 'RIGHT', 'RIGHT')) {
      recuperadas++;
    }
    return recuperadas;
  }

  async consumir(bloqueante, workerId, tratar, deveContinuar) {
    const processando = `${this.nome}:processando:${workerId}`;

    while (deveContinuar()) {
      const bruto = await bloqueante.blMove(this.nome, processando, 'RIGHT', 'LEFT', 5);
      if (bruto === null) continue;

      const tarefa = JSON.parse(bruto);
      try {
        await tratar(tarefa.dados, tarefa);
        await this.client.lRem(processando, 1, bruto);  
      } catch (erro) {
        tarefa.tentativas++;
        tarefa.ultimoErro = erro.message;
        const destino = tarefa.tentativas < this.maxTentativas ? this.nome : this.falhas;
        await this.client
          .multi()
          .lRem(processando, 1, bruto)              
          .lPush(destino, JSON.stringify(tarefa))  
          .exec();
        console.log(`[${workerId}] tarefa ${tarefa.id} falhou (${tarefa.tentativas}x) -> ${destino}`);
      }
    }
  }
}
