import assert from 'node:assert/strict';
import test from 'node:test';
import { FilaCircular } from '../fila-circular.js';

test('mantem FIFO, ocupa toda a capacidade e reutiliza posicoes', () => {
  const fila = new FilaCircular(3);
  fila.enfileirar('ana');
  fila.enfileirar('bia');
  fila.enfileirar('caio');
  assert.equal(fila.tamanho(), 3);
  assert.throws(() => fila.enfileirar('duda'), /cheia/);
  assert.equal(fila.desenfileirar(), 'ana');
  fila.enfileirar('duda');
  assert.deepEqual(
    [fila.desenfileirar(), fila.desenfileirar(), fila.desenfileirar()],
    ['bia', 'caio', 'duda'],
  );
  assert.equal(fila.desenfileirar(), undefined);
  assert.equal(fila.estaVazia(), true);
});

test('rejeita capacidade invalida', () => {
  assert.throws(() => new FilaCircular(0), RangeError);
});