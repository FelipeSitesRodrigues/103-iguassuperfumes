// Raspa o catálogo de perfumes árabes e importados (perfume francês) do atlanticostor.com.br,
// pedido do Eduardo como carga inicial da Iguassu. Grava dados/catalogo-inicial.json e baixa
// as fotos em dados/fotos-originais/<sku>-<n>.webp.
//   node scripts/raspar-referencia.mjs            lista + páginas de produto + fotos
//   node scripts/raspar-referencia.mjs --sem-fotos
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = join(RAIZ, 'dados');
const FOTOS = join(SAIDA, 'fotos-originais');
const BASE = 'https://atlanticostor.com.br';
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
// --categoria perfumes-de-nicho.476:nicho --saida catalogo-nicho.json  raspa só uma categoria num arquivo à parte
const argCat = process.argv.find((a, i) => process.argv[i - 1] === '--categoria');
const CATEGORIAS = argCat
  ? [{ slug: argCat.split(':')[0], linha: argCat.split(':')[1] }]
  : [
    { slug: 'perfume-arabe.44', linha: 'arabe' },
    { slug: 'perfume-frances.102', linha: 'importado' },
  ];
const ARQUIVO = process.argv.find((a, i) => process.argv[i - 1] === '--saida') ?? 'catalogo-inicial.json';
const semFotos = process.argv.includes('--sem-fotos');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function baixarTexto(url, tentativas = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i >= tentativas) throw new Error(`${url}: ${e.message}`);
      await espera(1500 * i);
    }
  }
}

const desfazer = (s) =>
  s.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/\s+/g, ' ').trim();

const precoNumero = (s) => Number(s.replace(/[^\d,]/g, '').replace(',', '.'));

function lerCards(html) {
  const cards = [];
  // cada card tem o link do produto no título, a marca no link /marca/ e o preço padrão
  const blocos = html.split('efa-product-card-info flex').slice(1);
  for (const b of blocos) {
    const titulo = b.match(/efa-product-card-title[\s\S]*?href="\/produto\/([^"]+)">([^<]+)<\/a>/);
    if (!titulo) continue;
    const marca = b.match(/href="\/marca\/([^"]+)">([^<]+)<\/a>/);
    // sem promoção: price-standard; em promoção: price-cross (cheio, riscado) + price-promo
    const preco = b.match(/efa-product-card-price-standard">([^<]+)</) ?? b.match(/efa-product-card-price-cross[^"]*">([^<]+)</);
    const promo = b.match(/efa-product-card-price-promo">([^<]+)</);
    const sku = titulo[1].split('~')[1];
    cards.push({
      sku,
      slugOrigem: titulo[1],
      nome: desfazer(titulo[2]).replace(/^[.\s]+/, ''),
      marca: marca ? desfazer(marca[2]) : null,
      preco: preco ? precoNumero(desfazer(preco[1])) : null,
      precoPromo: promo ? precoNumero(desfazer(promo[1])) : null,
    });
  }
  return cards;
}

function lerProduto(html) {
  const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .find((j) => j && j['@type'] === 'Product');
  const migalha = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
    .find((j) => j && j['@type'] === 'BreadcrumbList');
  return {
    fotos: ld?.image ?? [],
    marca: ld?.brand?.name ?? null,
    disponivel: ld?.offers?.availability?.endsWith('InStock') ?? true,
    subcategoria: migalha?.itemListElement?.[2]?.name ?? null,
  };
}

async function existe(p) { try { await access(p); return true; } catch { return false; } }

await mkdir(FOTOS, { recursive: true });
const porSku = new Map();

for (const cat of CATEGORIAS) {
  for (let pagina = 1; pagina < 80; pagina++) {
    const url = `${BASE}/categoria/${cat.slug}${pagina > 1 ? `?page=${pagina}` : ''}`;
    const cards = lerCards(await baixarTexto(url));
    const novos = cards.filter((c) => !porSku.has(c.sku));
    for (const c of novos) porSku.set(c.sku, { ...c, linha: cat.linha });
    process.stdout.write(`${cat.linha} p${pagina}: ${cards.length} cards, ${novos.length} novos\n`);
    if (cards.length === 0 || novos.length === 0) break;
    await espera(400);
  }
}

if (process.argv.includes('--so-precos')) {
  // relê só as listagens e atualiza os preços no JSON já raspado, sem abrir cada produto
  const arq = join(SAIDA, ARQUIVO);
  const atual = JSON.parse(await readFile(arq, 'utf8'));
  let mudou = 0;
  for (const p of atual.produtos) {
    const c = porSku.get(p.sku);
    if (!c) continue;
    if (p.preco !== c.preco || p.precoPromo !== c.precoPromo) mudou++;
    p.preco = c.preco;
    p.precoPromo = c.precoPromo;
  }
  atual.precosEm = new Date().toISOString();
  await writeFile(arq, JSON.stringify(atual, null, 2));
  console.log('preços atualizados:', mudou, '| sem preço:', atual.produtos.filter((p) => !(p.preco > 0)).length,
    '| em promoção:', atual.produtos.filter((p) => p.precoPromo).length);
  process.exit(0);
}

const produtos = [...porSku.values()];
let n = 0;
const fila = [...produtos];
async function trabalhador() {
  while (fila.length) {
    const p = fila.shift();
    try {
      const extra = lerProduto(await baixarTexto(`${BASE}/produto/${p.slugOrigem}`));
      Object.assign(p, { fotosOrigem: extra.fotos, disponivel: extra.disponivel, subcategoria: extra.subcategoria });
      if (!p.marca && extra.marca) p.marca = extra.marca;
      p.fotos = [];
      if (!semFotos) {
        for (const [i, f] of extra.fotos.entries()) {
          const nome = `${p.sku}-${i + 1}.webp`;
          const destino = join(FOTOS, nome);
          if (!(await existe(destino))) {
            const r = await fetch(f, { headers: UA });
            if (!r.ok) continue;
            await writeFile(destino, Buffer.from(await r.arrayBuffer()));
          }
          p.fotos.push(nome);
        }
      }
    } catch (e) {
      p.erro = e.message;
    }
    if (++n % 25 === 0) process.stdout.write(`produtos: ${n}/${produtos.length}\n`);
    await espera(250);
  }
}
await Promise.all(Array.from({ length: 4 }, trabalhador));

produtos.sort((a, b) => a.linha.localeCompare(b.linha) || (a.marca ?? '').localeCompare(b.marca ?? '') || a.nome.localeCompare(b.nome));
await writeFile(join(SAIDA, ARQUIVO), JSON.stringify({
  origem: BASE, raspadoEm: new Date().toISOString(), total: produtos.length, produtos,
}, null, 2));
const resumo = produtos.reduce((a, p) => ((a[p.linha] = (a[p.linha] ?? 0) + 1), a), {});
console.log('total', produtos.length, resumo, 'com erro:', produtos.filter((p) => p.erro).length,
  'sem foto:', produtos.filter((p) => !p.fotos?.length).length);
