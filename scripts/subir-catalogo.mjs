/**
 * Carga inicial: os 684 perfumes raspados da referência (via site/dados.mjs) e as
 * fotos já preparadas em site/publico/img/p vão pro Supabase.
 *
 *   node --env-file=.env.local scripts/subir-catalogo.mjs            (dados + fotos)
 *   node --env-file=.env.local scripts/subir-catalogo.mjs --sem-fotos
 *
 * Pode rodar de novo: perfume casa pelo código (o SKU da referência), marca pelo
 * nome, foto pelo caminho, e o upload só manda o arquivo que ainda não está lá.
 * Depois da primeira carga quem manda é o painel: rodar de novo sobrescreve o
 * que o Eduardo tiver mudado nesses perfumes.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { carregarCatalogo, DESTAQUES, DESTAQUES_IMPORTADOS } from '../site/dados.mjs';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Rode com --env-file=.env.local');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const falhar = (onde, error) => { console.error(`ERRO em ${onde}: ${error.message}`); process.exit(1); };
const emLotes = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

const { produtos } = await carregarCatalogo();
console.log(`${produtos.length} perfumes no arquivo`);

// marcas
const nomesMarcas = [...new Map(produtos.map((p) => [p.marca, p.marcaSlug])).entries()];
{
  const { error } = await db.from('marcas').upsert(nomesMarcas.map(([nome, slug]) => ({ nome, slug })), { onConflict: 'nome' });
  if (error) falhar('marcas', error);
}
const { data: marcas, error: e1 } = await db.from('marcas').select('id, nome');
if (e1) falhar('marcas', e1);
const marcaId = new Map(marcas.map((m) => [m.nome, m.id]));
console.log(`${marcas.length} marcas`);

// perfumes
const ordemDestaque = new Map([
  ...DESTAQUES.map((c, i) => [c, i + 1]),
  ...DESTAQUES_IMPORTADOS.map((c, i) => [c, i + 1]),
]);
const linhas = produtos.map((p) => ({
  codigo: String(p.id).toLowerCase(),
  slug: p.slug,
  marca_id: marcaId.get(p.marca),
  nome: p.nome,
  linha: p.linha,
  volume: p.volume,
  preco_centavos: Math.round(p.preco * 100),
  disponivel: p.disponivel,
  visivel: true,
  destaque_ordem: ordemDestaque.get(String(p.id)) ?? null,
}));
for (const lote of emLotes(linhas, 200)) {
  const { error } = await db.from('perfumes').upsert(lote, { onConflict: 'codigo' });
  if (error) falhar('perfumes', error);
}
const { data: noBanco, error: e2 } = await db.from('perfumes').select('id, codigo').limit(5000);
if (e2) falhar('perfumes', e2);
const perfumeId = new Map(noBanco.map((p) => [p.codigo, p.id]));
console.log(`${noBanco.length} perfumes no banco`);

// fotos (linhas)
const fotos = produtos.flatMap((p) => p.fotos.map((caminho, ordem) => ({ perfume_id: perfumeId.get(String(p.id).toLowerCase()), ordem, caminho })));
for (const lote of emLotes(fotos, 500)) {
  const { error } = await db.from('perfume_fotos').upsert(lote, { onConflict: 'caminho' });
  if (error) falhar('fotos', error);
}
console.log(`${fotos.length} fotos cadastradas`);

if (process.argv.includes('--sem-fotos')) process.exit(0);

// fotos (arquivos)
const PASTA = join(import.meta.dirname, '..', 'site', 'publico', 'img', 'p');
const existentes = new Set();
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await db.storage.from('perfumes').list('p', { limit: 1000, offset });
  if (error) falhar('listar bucket', error);
  data.forEach((o) => existentes.add(o.name));
  if (data.length < 1000) break;
}
const usados = new Set(fotos.flatMap((f) => [`${f.caminho}-400.webp`, `${f.caminho}-800.webp`]));
const arquivos = (await readdir(PASTA)).filter((a) => usados.has(a) && !existentes.has(a));
console.log(`${existentes.size} arquivos já no bucket, ${arquivos.length} pra subir`);

let feitos = 0;
let erros = 0;
const fila = [...arquivos];
await Promise.all(Array.from({ length: 12 }, async () => {
  while (fila.length) {
    const nome = fila.shift();
    const corpo = await readFile(join(PASTA, nome));
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const { error } = await db.storage.from('perfumes').upload(`p/${nome}`, corpo, {
        contentType: 'image/webp', upsert: true, cacheControl: '31536000',
      });
      if (!error) break;
      if (tentativa === 3) { erros++; console.error(`falhou ${nome}: ${error.message}`); }
    }
    if (++feitos % 200 === 0) console.log(`  ${feitos}/${arquivos.length}`);
  }
}));
console.log(`fotos enviadas: ${feitos - erros}, erros: ${erros}`);
