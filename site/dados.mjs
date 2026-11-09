// Catálogo da vitrine. Hoje lê o JSON raspado da referência (dados/catalogo-inicial.json);
// quando o banco estiver no ar, carregarCatalogo() passa a ler a view pública do Supabase
// e devolve o mesmo formato.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// Nome de exibição de cada marca. A chave é como o nome do produto começa.
const MARCAS = {
  'MAISON ALHAMBRA': 'Maison Alhambra', ALHAMBRA: 'Maison Alhambra',
  'MY PERFUMES': 'My Perfumes', MPF: 'My Perfumes',
  ORIAROME: 'Ori Arome', 'ORI AROME': 'Ori Arome',
  'MERCEDES BENZ': 'Mercedes-Benz', 'MERCEDES-BENZ': 'Mercedes-Benz',
  'MARINA DE BOURBON': 'Marina de Bourbon',
  'PARFUMS DE MARLY': 'Parfums de Marly',
  'MAISON DE MILAN': 'Maison de Milan',
  'ARD AL ZAAFARAN': 'Ard Al Zaafaran',
  'DOLCE E GABBANA': 'Dolce & Gabbana',
  CHLOÉ: 'Chloé', CHLOE: 'Chloé',
  'LE FALCONÉ': 'Le Falconé',
  'YVES SAINT LAURENT': 'Yves Saint Laurent',
  'JEAN PAUL GAULTIER': 'Jean Paul Gaultier', 'JEAN PAUL': 'Jean Paul Gaultier',
  'CAROLINA HERRERA': 'Carolina Herrera',
  'GIORGIO ARMANI': 'Giorgio Armani',
  'HUGO BOSS': 'Hugo Boss',
  'PACO RABANNE': 'Paco Rabanne',
  'RASASI HAWAS': 'Rasasi',
  LANCOME: 'Lancôme',
};
// palavras que ficam em caixa alta no nome do perfume
const SIGLAS = new Set(['EDP', 'EDT', 'EDC', 'II', 'III', 'IV', 'VI', 'XX', 'NYC', 'AMG', 'CH', 'CDN', 'UK', 'USA', 'PDRN', 'HB', 'VIP', 'XL', 'NO.', 'X']);
const MINUSCULAS = new Set(['de', 'du', 'des', 'e', 'et', 'of', 'for', 'in', 'the', 'by', 'and', 'à', 'pour', 'with', 'com']);

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const slugify = (s) => semAcento(s).toLowerCase().replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function tituloPalavra(p, i) {
  const limpa = p.replace(/[^\p{L}\p{N}.]/gu, '');
  if (SIGLAS.has(limpa.toUpperCase()) && limpa === limpa.toUpperCase()) return p;
  if (/\d/.test(p)) return p.toUpperCase(); // 9PM, 212, NO.5
  const baixa = p.toLowerCase();
  if (i > 0 && MINUSCULAS.has(baixa)) return baixa;
  // Al-Rehab, D'Or, O'Neill
  return baixa.replace(/(^|[-'’(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}
const titulo = (s) => s.split(/\s+/).filter(Boolean).map(tituloPalavra).join(' ');

function marcaDoNome(nome, marcaOrigem, subcategoria, conhecidas) {
  const up = nome.toUpperCase();
  const candidatas = [...Object.keys(MARCAS), ...conhecidas].sort((a, b) => b.length - a.length);
  for (const c of candidatas) {
    if (up.startsWith(c + ' ') || up === c) return { marca: MARCAS[c] ?? titulo(c), resto: nome.slice(c.length).trim() };
  }
  const reserva = /gen[eé]rica|loreal/i.test(marcaOrigem ?? '') ? subcategoria : marcaOrigem;
  return { marca: MARCAS[reserva?.toUpperCase()] ?? titulo(reserva ?? 'Outras'), resto: nome };
}

export function normalizar(bruto) {
  const conhecidas = [...new Set(bruto.flatMap((p) => [p.marca, p.subcategoria]).filter(Boolean).map((m) => m.toUpperCase()))]
    .filter((m) => !/GEN[EÉ]RICA|LOREAL/.test(m));
  const usados = new Set();
  return bruto.map((p) => {
    let nome = p.nome.replace(/\s+/g, ' ').trim();
    let tipo = '';
    const prefixo = nome.match(/^(KIT|SPRAY CORPORAL|BODY SPRAY)\s+/i);
    if (prefixo) { tipo = prefixo[1]; nome = nome.slice(prefixo[0].length); }
    const { marca, resto } = marcaDoNome(nome, p.marca, p.subcategoria, conhecidas);
    let base = resto;
    const vol = base.match(/(\d+(?:[.,]\d+)?)\s*ML\b/i);
    const volume = vol ? `${vol[1].replace('.', ',')} ml` : '';
    if (vol) base = (base.slice(0, vol.index) + base.slice(vol.index + vol[0].length)).replace(/\s+/g, ' ').trim();
    let nomeLimpo = titulo(base) || titulo(resto);
    if (tipo) nomeLimpo = `${titulo(tipo)} ${nomeLimpo}`;
    let slug = slugify(`${marca} ${nomeLimpo} ${volume}`);
    if (usados.has(slug)) slug = `${slug}-${p.sku}`;
    usados.add(slug);
    return {
      id: p.sku,
      slug,
      linha: p.linha,
      marca,
      marcaSlug: slugify(marca),
      nome: nomeLimpo,
      volume,
      preco: p.preco ?? null,
      // a referência guarda o mesmo arquivo em pastas diferentes: tira a foto repetida
      fotos: (p.fotos ?? []).filter((f, i) => {
        const nome = (u) => u?.split('/').pop();
        const origem = p.fotosOrigem ?? [];
        return origem.findIndex((u) => nome(u) === nome(origem[i])) === i;
      }).map((f) => f.replace(/\.webp$/, '')),
      disponivel: p.disponivel !== false,
    };
  });
}

// Mais pedidos da home: escolhidos à mão (os do banner e das capas primeiro)
export const DESTAQUES = ['13432', '13353', '13757', '12939', '3233381', '13577', '13182', '13579', '3232773', '13184', '3233243', '13186'];
export const DESTAQUES_IMPORTADOS = ['3233013', '3233356', '15122', '13922', '3233054', '16887', '13956', '3233415'];

export const CONFIG_PADRAO = {
  whatsapp: '5545988110629',
  instagram: '',
  faixa_topo: 'Pedido direto pelo WhatsApp, com atendimento de quem entende de perfume',
  banner_desktop: '',
  banner_mobile: '',
};

// Com SUPABASE_URL e SUPABASE_CHAVE_PUBLICA lê o banco (o que o painel salvou);
// sem elas (ou com --arquivo), lê o arquivo da carga inicial.
export async function carregarCatalogo() {
  const { SUPABASE_URL: url, SUPABASE_CHAVE_PUBLICA: chave } = process.env;
  if (url && chave && !process.argv.includes('--arquivo')) return doBanco(url, chave);
  const bruto = JSON.parse(await readFile(join(RAIZ, 'dados', 'catalogo-inicial.json'), 'utf8')).produtos
    .filter((p) => !/PROMOCAO SEM PLASTICO/i.test(p.nome)); // item interno da referência, não é perfume
  const produtos = normalizar(bruto).filter((p) => p.preco > 0).map((p) => ({ ...p, precoDe: null, descricao: '' }));
  return { produtos, destaques: DESTAQUES, destaquesImportados: DESTAQUES_IMPORTADOS, config: CONFIG_PADRAO, origem: 'catalogo-inicial.json' };
}

async function doBanco(url, chave) {
  const ler = async (caminho, inicio = 0, fim = 999) => {
    const r = await fetch(`${url}/rest/v1/${caminho}`, { headers: { apikey: chave, Range: `${inicio}-${fim}`, 'Range-Unit': 'items' } });
    if (!r.ok) throw new Error(`Supabase ${r.status} em ${caminho.split('?')[0]}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };
  const campos = 'codigo,slug,nome,linha,volume,descricao,preco_centavos,promo_centavos,disponivel,destaque_ordem,marca:marcas(nome,slug),fotos:perfume_fotos(caminho,ordem,arquivo)';
  const linhas = [];
  for (let i = 0; ; i += 1000) {
    const lote = await ler(`perfumes?select=${campos}&visivel=eq.true&order=codigo`, i, i + 999);
    linhas.push(...lote);
    if (lote.length < 1000) break;
  }
  const [config] = await ler('configuracoes?select=whatsapp,instagram,faixa_topo,banner_desktop,banner_mobile');
  const produtos = linhas.map((l) => ({
    id: l.codigo,
    slug: l.slug,
    linha: l.linha,
    marca: l.marca.nome,
    marcaSlug: l.marca.slug,
    nome: l.nome,
    volume: l.volume,
    preco: (l.promo_centavos ?? l.preco_centavos) / 100,
    precoDe: l.promo_centavos ? l.preco_centavos / 100 : null,
    descricao: l.descricao,
    fotos: [...l.fotos].sort((a, b) => a.ordem - b.ordem).map((f) => f.caminho),
    originais: Object.fromEntries(l.fotos.filter((f) => f.arquivo).map((f) => [f.caminho, f.arquivo])),
    disponivel: l.disponivel,
    destaque: l.destaque_ordem,
  }));
  const destaquesDa = (linha) => produtos.filter((p) => p.linha === linha && p.destaque).sort((a, b) => a.destaque - b.destaque).map((p) => p.id);
  return {
    produtos,
    destaques: destaquesDa('arabe'),
    destaquesImportados: destaquesDa('importado'),
    config: { ...CONFIG_PADRAO, ...config },
    fotosUrl: `${url}/storage/v1/object/public/perfumes`,
    origem: 'supabase',
  };
}
