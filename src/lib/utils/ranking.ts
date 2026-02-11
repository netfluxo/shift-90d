/**
 * Calcula dense ranking a partir de uma lista de usuários ordenada por pontos (desc).
 * Mesmos pontos = mesma posição. Próxima pontuação distinta = próxima posição.
 * Ex: [100, 100, 80, 60, 60] → [1, 1, 2, 3, 3]
 */
export function buildDenseRankingMap(users: { id: string; points: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  let currentPosition = 0;
  let lastPoints: number | null = null;

  for (const user of users) {
    if (user.points !== lastPoints) {
      currentPosition++;
      lastPoints = user.points;
    }
    map.set(user.id, currentPosition);
  }

  return map;
}
