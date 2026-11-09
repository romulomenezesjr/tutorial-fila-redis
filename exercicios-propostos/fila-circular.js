export class FilaCircular {
  #itens;
  #inicio = 0;
  #fim = 0;
  #tamanho = 0;

  constructor(capacidade) {
    if (!Number.isInteger(capacidade) || capacidade < 1) {
      throw new RangeError('A capacidade deve ser um inteiro positivo.');
    }
    this.#itens = new Array(capacidade);
  }

  enfileirar(item) {
    if (this.#tamanho === this.#itens.length) {
      throw new Error('A fila está cheia.');
    }
    this.#itens[this.#fim] = item;
    this.#fim = (this.#fim + 1) % this.#itens.length;
    this.#tamanho++;
  }

  desenfileirar() {
    if (this.estaVazia()) return undefined;
    const item = this.#itens[this.#inicio];
    this.#itens[this.#inicio] = undefined;
    this.#inicio = (this.#inicio + 1) % this.#itens.length;
    this.#tamanho--;
    return item;
  }

  frente() {
    return this.estaVazia() ? undefined : this.#itens[this.#inicio];
  }

  tamanho() {
    return this.#tamanho;
  }

  estaVazia() {
    return this.#tamanho === 0;
  }
}