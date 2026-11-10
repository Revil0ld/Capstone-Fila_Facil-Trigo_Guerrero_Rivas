import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

const acuentaLogo = require('../../assets/images/logos/ACUENTA.png');
const jumboLogo = require('../../assets/images/logos/JUMBO.png');
const liderLogo = require('../../assets/images/logos/LIDER.png');
const santaIsabelLogo = require('../../assets/images/logos/SANTA_ISABEL.png');
const super10Logo = require('../../assets/images/logos/SUPER 10.webp');
const tottusLogo = require('../../assets/images/logos/TOTTUS.png');
const alviLogo = require('../../assets/images/logos/ALVI.webp');
const unimarcLogo = require('../../assets/images/logos/UNIMARC.webp');
const montserratLogo = require('../../assets/images/logos/MONTSERRAT.png');

const supermarketLogoAssets = {
  acuenta: acuentaLogo,
  jumbo: jumboLogo,
  lider: liderLogo,
  santaIsabel: santaIsabelLogo,
  super10: super10Logo,
  tottus: tottusLogo,
  alvi: alviLogo,
  unimarc: unimarcLogo,
  montserrat: montserratLogo,
};

export const supermarketLogoUris = {
  acuenta: Asset.fromModule(acuentaLogo).uri,
  jumbo: Asset.fromModule(jumboLogo).uri,
  lider: Asset.fromModule(liderLogo).uri,
  santaIsabel: Asset.fromModule(santaIsabelLogo).uri,
  super10: Asset.fromModule(super10Logo).uri,
  tottus: Asset.fromModule(tottusLogo).uri,
  alvi: Asset.fromModule(alviLogo).uri,
  unimarc: Asset.fromModule(unimarcLogo).uri,
  mayorista10: Asset.fromModule(super10Logo).uri,
  montserrat: Asset.fromModule(montserratLogo).uri,
};

let supermarketLogoDataUrisPromise: Promise<Record<string, string>> | null = null;

export function getSupermarketLogoDataUris() {
  if (!supermarketLogoDataUrisPromise) {
    supermarketLogoDataUrisPromise = Promise.all(
      Object.entries(supermarketLogoAssets).map(async ([name, moduleId]) => {
        const asset = await Asset.fromModule(moduleId).downloadAsync();
        if (!asset.localUri) {
          throw new Error(`No se pudo descargar el logo ${name} para mostrarlo en el mapa.`);
        }

        const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (!base64) {
          throw new Error(`El archivo del logo ${name} está vacío.`);
        }

        const mimeType = asset.type === 'webp' ? 'image/webp' : 'image/png';
        return [name, `data:${mimeType};base64,${base64}`] as const;
      })
    )
      .then((entries) => {
        const dataUris = Object.fromEntries(entries);
        return { ...dataUris, mayorista10: dataUris.super10 };
      })
      .catch((error: unknown) => {
        supermarketLogoDataUrisPromise = null;
        throw error;
      });
  }

  return supermarketLogoDataUrisPromise;
}

export function getSupermarketLogoUri(name: string) {
  const normalizedName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const compactName = normalizedName.replace(/[^a-z0-9]/g, '');

  if (normalizedName.includes('acuenta')) {
    return supermarketLogoUris.acuenta;
  }
  if (normalizedName.includes('jumbo')) {
    return supermarketLogoUris.jumbo;
  }
  if (normalizedName.includes('lider')) {
    return supermarketLogoUris.lider;
  }
  if (normalizedName.includes('santa isabel')) {
    return supermarketLogoUris.santaIsabel;
  }
  if (compactName.includes('super10')) {
    return supermarketLogoUris.super10;
  }
  if (compactName.includes('mayorista10')) {
    return supermarketLogoUris.mayorista10;
  }
  if (normalizedName.includes('tottus')) {
    return supermarketLogoUris.tottus;
  }
  if (compactName.includes('alvi')) {
    return supermarketLogoUris.alvi;
  }
  if (normalizedName.includes('unimarc')) {
    return supermarketLogoUris.unimarc;
  }
  if (normalizedName.includes('montserrat')) {
    return supermarketLogoUris.montserrat;
  }

  return null;
}
