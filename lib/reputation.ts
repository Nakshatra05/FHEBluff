/** Competition ranking: tied scores share a rank (1, 2, 2, 4). */
export function competitionRank(score:bigint,totals:readonly bigint[]):number {
  return 1+totals.filter(total=>total>score).length;
}
