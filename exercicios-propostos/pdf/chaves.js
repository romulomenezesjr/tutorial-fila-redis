export const K = {
  fila: 'pdf:fila',
  eventos: 'pdf:eventos',
  job: (id) => `pdf:job:${id}`,
  paginas: (id) => `pdf:paginas:${id}`,
  processando: (workerId) => `pdf:processando:${workerId}`,
};

export async function publicar(client, tipo, dados) {
  await client.publish(K.eventos, JSON.stringify({ tipo, em: Date.now(), ...dados }));
}