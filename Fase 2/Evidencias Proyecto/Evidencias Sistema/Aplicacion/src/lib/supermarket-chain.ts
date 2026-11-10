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

const BRANDS = [
  { label: 'A Cuenta', match: 'acuenta' },
  { label: 'Jumbo', match: 'jumbo' },
  { label: 'Líder', match: 'lider' },
  { label: 'Santa Isabel', match: 'santaisabel' },
  { label: 'Super 10', match: 'super10' },
  { label: 'Super 10', match: 'mayorista10' },
  { label: 'Tottus', match: 'tottus' },
  { label: 'Alvi', match: 'alvi' },
  { label: 'Unimarc', match: 'unimarc' },
  { label: 'Montserrat', match: 'montserrat' },
];

// Devuelve la marca con logo (agrupando sucursales) o null si no es una cadena relevante.
export function getSupermarketBrand(chain: string, name = '') {
  const compact = `${chain} ${name}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return BRANDS.find((brand) => compact.includes(brand.match))?.label ?? null;
}

export function getSupermarketChains(stores: Pick<Supermarket, 'chain' | 'name'>[]) {
  const brands = new Set<string>();
  for (const store of stores) {
    const brand = getSupermarketBrand(store.chain, store.name);
    if (brand) brands.add(brand);
  }
  return [...brands].sort((a, b) => a.localeCompare(b, 'es'));
}
