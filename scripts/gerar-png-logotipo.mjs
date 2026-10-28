// Gera o logotipo em PNG para os e-mails (Gmail e Outlook não mostram SVG).
// Sai em 4x (960 × 128) para ficar nítido em telas de alta densidade; o e-mail
// exibe em 240 × 32. Rode: node scripts/gerar-png-logotipo.mjs

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const marca = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'marca');
const origem = join(marca, 'investindo-logotipo-escuro.svg');
const destino = join(marca, 'investindo-logotipo-email.png');

const info = await sharp(origem, { density: 72 * 2 })
  .resize({ width: 960 })
  .png({ compressionLevel: 9, palette: true })
  .toFile(destino);
console.log(`${destino}: ${info.width} × ${info.height}, ${Math.round(info.size / 1024)} KB`);
