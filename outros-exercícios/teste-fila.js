import { Fila } from './fila.js';

const atendimento = new Fila();
atendimento.enfileirar('Ythalo');
atendimento.enfileirar('Jeff');
atendimento.enfileirar('Kayque');

console.log(atendimento.frente());
console.log(atendimento.desenfileirar());
console.log(atendimento.desenfileirar());
console.log(atendimento.tamanho());