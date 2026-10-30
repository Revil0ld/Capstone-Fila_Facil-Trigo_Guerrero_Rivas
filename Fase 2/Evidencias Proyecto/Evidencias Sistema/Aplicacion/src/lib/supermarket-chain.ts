import type { Supermarket } from '@/data/supermarkets';

export function normalizeSupermarketChain(chain: string) {
  return chain
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase()
    .replace(/^supermercados?\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

export function getSupermarketChains(stores: Supermarket[]) {
  const chains = new Map<string, string>();

  for (const store of stores) {
    const chain = store.chain.trim();
    const normalized = normalizeSupermarketChain(chain);
    const current = chains.get(normalized);
    if (
      normalized &&
      (!current ||
        chain.length < current.length ||
        (chain.length === current.length && chain.localeCompare(current, 'es') < 0))
    ) {
      chains.set(normalized, chain);
    }
  }

  return [...chains.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'es'))
    .map(([, chain]) => chain);
}
