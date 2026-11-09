export const K = {
  alta: process.env.FILA_ALTA ?? 'fila:emails:alta',
  normal: process.env.FILA_NORMAL ?? 'fila:emails:normal',
  agendadaAlta: 'fila:emails:agendada:alta',
  agendadaNormal: 'fila:emails:agendada:normal',
  falhas: 'fila:emails:falhas',
  concluidas: 'fila:emails:concluidas',
};

export const MOVER_VENCIDAS = `
local itens = redis.call('ZRANGE', KEYS[1], '-inf', ARGV[1], 'BYSCORE', 'LIMIT', 0, ARGV[2])
local movidos = 0
for _, item in ipairs(itens) do
  if redis.call('ZREM', KEYS[1], item) == 1 then
    redis.call('LPUSH', KEYS[2], item)
    movidos = movidos + 1
  end
end
return movidos
`;

export const REPROCESSAR_FALHAS = `
local total = 0
while true do
  local item = redis.call('LMOVE', KEYS[1], KEYS[2], 'RIGHT', 'LEFT')
  if not item then break end
  local tarefa = cjson.decode(item)
  tarefa.tentativas = 0
  local destino = KEYS[4]
  if tarefa.prioridade == 'alta' then destino = KEYS[3] end
  redis.call('LREM', KEYS[2], 1, item)
  redis.call('LPUSH', destino, cjson.encode(tarefa))
  total = total + 1
end
return total
`;

export async function moverVencidas(client) {
  const agora = String(Date.now());
  const [alta, normal] = await Promise.all([
    client.eval(MOVER_VENCIDAS, {
      keys: [K.agendadaAlta, K.alta],
      arguments: [agora, '100'],
    }),
    client.eval(MOVER_VENCIDAS, {
      keys: [K.agendadaNormal, K.normal],
      arguments: [agora, '100'],
    }),
  ]);
  return Number(alta) + Number(normal);
}