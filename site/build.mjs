// Monta a vitrine estática em site/dist a partir do catálogo.
//   node site/build.mjs
import { rm, mkdir, writeFile, readFile, cp, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarCatalogo } from './dados.mjs';
import { pagina, card, foto, esc, preco, precoTexto, linkWhats, nomeCompleto, LOJA, ICONES, SIMBOLO } from './lib/html.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIST = join(AQUI, 'dist');
const POR_PAGINA = 24;

const { produtos, destaques: DESTAQUES, destaquesImportados: DESTAQUES_IMPORTADOS, config, fotosUrl, origem } = await carregarCatalogo();
LOJA.whatsapp = config.whatsapp;
LOJA.whatsappExibir = config.whatsapp.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');
LOJA.instagram = config.instagram.replace(/^@/, '');
LOJA.faixaTopo = config.faixa_topo;
const porId = new Map(produtos.map((p) => [p.id, p]));
const arabes = produtos.filter((p) => p.linha === 'arabe');
const importados = produtos.filter((p) => p.linha === 'importado');

// ordem padrão: destaques primeiro, depois quem tem foto, depois marca e nome
const peso = new Map([...DESTAQUES, ...DESTAQUES_IMPORTADOS].map((id, i) => [id, i]));
const ordenar = (lista) => [...lista].sort((a, b) =>
  (peso.get(a.id) ?? 999) - (peso.get(b.id) ?? 999) ||
  (b.fotos.length > 0) - (a.fotos.length > 0) ||
  a.marca.localeCompare(b.marca, 'pt') || a.nome.localeCompare(b.nome, 'pt') ||
  a.volume.localeCompare(b.volume, 'pt', { numeric: true }) || String(a.id).localeCompare(String(b.id)));
for (const p of produtos) p.ordem = 0;
ordenar(produtos).forEach((p, i) => { p.ordem = i; });

const marcas = Object.values(produtos.reduce((acc, p) => {
  (acc[p.marcaSlug] ??= { nome: p.marca, slug: p.marcaSlug, total: 0, linhas: new Set() }).total++;
  acc[p.marcaSlug].linhas.add(p.linha);
  return acc;
}, {})).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt'));

// ---------- arquivos estáticos com versão pelo conteúdo ----------
await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
await cp(join(AQUI, 'publico'), DIST, { recursive: true });

// fotos do banco: baixa do Storage o que não veio na pasta publico. Foto nova
// (subida pelo painel) vem inteira e ganha aqui os 400 e 800 no quadrado branco,
// como as da carga inicial. Tudo fica em cache entre builds.
if (fotosUrl) {
  const { default: sharp } = await import('sharp');
  const CACHE = join(AQUI, '..', 'node_modules', '.cache', 'iguassu-fotos');
  await mkdir(CACHE, { recursive: true });
  await mkdir(join(DIST, 'img', 'p'), { recursive: true });
  const existe = (f) => access(f).then(() => true, () => false);
  const noCache = (remoto) => join(CACHE, remoto.replace(/\//g, '_'));
  const obter = async (remoto) => {
    const c = noCache(remoto);
    if (await existe(c)) return readFile(c);
    for (let t = 1; ; t++) {
      const r = await fetch(`${fotosUrl}/${remoto}`);
      if (r.ok) { const buf = Buffer.from(await r.arrayBuffer()); await writeFile(c, buf); return buf; }
      if (t === 3) throw new Error(`foto ${remoto}: ${r.status}`);
    }
  };
  const quadrado = async (buf, lado) => {
    const miolo = Math.round(lado / 1.14);
    const borda = Math.floor((lado - miolo) / 2);
    return sharp(buf).rotate().flatten({ background: '#fff' })
      .resize(miolo, miolo, { fit: 'contain', background: '#fff' })
      .extend({ top: borda, bottom: lado - miolo - borda, left: borda, right: lado - miolo - borda, background: '#fff' })
      .webp({ quality: 80 }).toBuffer();
  };
  const tarefas = [];
  for (const p of produtos) {
    for (const f of p.fotos) {
      for (const w of [400, 800]) {
        const nome = `${f}-${w}.webp`;
        const destino = join(DIST, 'img', 'p', nome);
        const original = p.originais?.[f];
        tarefas.push(async () => {
          if (await existe(destino)) return;
          if (!original) return writeFile(destino, await obter(`p/${nome}`));
          const c = noCache(`gerada/${original}-${w}`);
          if (!(await existe(c))) await writeFile(c, await quadrado(await obter(original), w));
          await cp(c, destino);
        });
      }
    }
  }
  // banner trocado no painel (cada troca tem nome novo, então o cache não fica velho)
  const banners = [
    [config.banner_desktop, [[1920, 600], [1440, 450], [960, 300]], (w) => `banner-${w}.webp`],
    [config.banner_mobile, [[828, 1242], [600, 900]], (w) => `banner-celular-${w}.webp`],
  ];
  for (const [arquivo, tamanhos, nomeDe] of banners) {
    if (!arquivo) continue;
    for (const [w, h] of tamanhos) tarefas.push(async () => {
      const buf = await sharp(await obter(arquivo)).rotate().resize(w, h, { fit: 'cover' }).webp({ quality: 78 }).toBuffer();
      await writeFile(join(DIST, 'img', nomeDe(w)), buf);
    });
  }
  const total = tarefas.length;
  await Promise.all(Array.from({ length: 16 }, async () => { while (tarefas.length) await tarefas.shift()(); }));
  console.log(`fotos: ${total} arquivos conferidos (origem ${origem})`);
}
const versao = (txt) => createHash('sha1').update(txt).digest('hex').slice(0, 8);
const css = await readFile(join(AQUI, 'estilo.css'), 'utf8');
const js = await readFile(join(AQUI, 'app.js'), 'utf8');
// CSS vai dentro do HTML (tira uma ida ao servidor antes da 1ª pintura), já enxuto
const CSS = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s*([{};,>])\s*/g, '$1').replace(/;}/g, '}');
const JS = `/app.js?v=${versao(js)}`;
await writeFile(join(DIST, 'app.js'), js.replace('__WHATS__', LOJA.whatsapp));

// catálogo enxuto pro navegador (busca, filtros e sacola)
const catalogoJson = produtos.map((p) => ({
  i: p.id, s: p.slug, l: p.linha === 'arabe' ? 'a' : 'i', m: p.marca, ms: p.marcaSlug, n: p.nome, v: p.volume, p: p.preco, f: p.fotos[0] ?? '', o: p.ordem, ...(p.precoDe ? { d: p.precoDe } : {}), ...(p.disponivel ? {} : { x: 1 }),
}));
const catalogoTxt = JSON.stringify(catalogoJson);
const CATALOGO = `/catalogo.json?v=${versao(catalogoTxt)}`;
await writeFile(join(DIST, 'catalogo.json'), catalogoTxt);

async function gravar(caminho, html) {
  const dir = join(DIST, caminho);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), html.replace(/data-catalogo=""/g, `data-catalogo="${CATALOGO}"`));
}

const migalha = (itens) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: itens.map(([nome, url], i) => ({ '@type': 'ListItem', position: i + 1, name: nome, item: LOJA.url + url })),
});
const loja = {
  '@context': 'https://schema.org', '@type': 'Store', '@id': `${LOJA.url}/#loja`,
  name: 'Iguassu de Parfum', url: LOJA.url + '/', image: `${LOJA.url}/img/banner-1440.webp`, logo: `${LOJA.url}/favicon.svg`,
  telephone: '+55 45 98811-0629', priceRange: 'R$ 50 a R$ 1.600', currenciesAccepted: 'BRL',
  description: 'Loja de perfumes árabes e importados com catálogo online e pedido pelo WhatsApp.',
};

const faixa = (titulo, subtitulo, lista, link, id) => `<section class="faixa" aria-labelledby="${id}">
  <div class="faixa__topo">
    <div><p class="rotulo">${subtitulo}</p><h2 id="${id}">${titulo}</h2></div>
    <a class="link-seta" href="${link}">Ver todos ${ICONES.seta}</a>
  </div>
  <div class="carrossel" data-carrossel>
    <button class="carrossel__seta carrossel__seta--esq" type="button" aria-label="Ver anteriores" data-seta="-1" disabled>${ICONES.seta}</button>
    <div class="trilho" data-trilho tabindex="0" aria-label="${esc(titulo)}">
      ${lista.map((p) => card(p, { sizes: '(min-width: 1100px) 300px, (min-width: 700px) 30vw, 62vw' })).join('\n')}
    </div>
    <button class="carrossel__seta carrossel__seta--dir" type="button" aria-label="Ver mais" data-seta="1">${ICONES.seta}</button>
  </div>
</section>`;

// ---------- home ----------
const faq = [
  ['Como faço meu pedido?', 'Escolha os perfumes, adicione à sacola e toque em "Finalizar pelo WhatsApp". A sacola vira uma mensagem pronta, com cada perfume, a quantidade e o total. É só enviar.'],
  ['Preciso criar conta ou pagar pelo site?', 'Não. O site é o nosso catálogo: nenhum pagamento é feito aqui e não precisa de cadastro. O pedido é confirmado no WhatsApp.'],
  ['Como funcionam pagamento e entrega?', 'Pagamento e entrega são combinados no WhatsApp, na hora de confirmar o pedido. A gente passa as opções e o prazo para a sua cidade.'],
  ['O perfume que eu quero está disponível?', 'O catálogo é atualizado pela loja. Antes de fechar, a gente confirma a disponibilidade de cada item no WhatsApp.'],
  ['Não encontrei o perfume que procuro. E agora?', 'Chama a gente no WhatsApp com o nome do perfume. Trabalhamos com muitas marcas árabes e importadas e podemos ver se conseguimos para você.'],
];
const grandesArabes = marcas.filter((m) => m.linhas.has('arabe') && m.total >= 6);
const grifes = marcas.filter((m) => m.linhas.has('importado') && !m.linhas.has('arabe') && m.total >= 2);
const marcasFita = grandesArabes.flatMap((m, i) => (grifes[i] ? [m, grifes[i]] : [m]));
const destaques = DESTAQUES.map((id) => porId.get(id)).filter(Boolean);
const destImp = DESTAQUES_IMPORTADOS.map((id) => porId.get(id)).filter(Boolean);
const totalArabes = arabes.length, totalImp = importados.length;
const home = `
<section class="hero" aria-labelledby="hero-titulo">
  <picture class="hero__foto">
    <source media="(max-width: 699px)" srcset="/img/banner-celular-600.webp 600w, /img/banner-celular-828.webp 828w" sizes="100vw">
    <img src="/img/banner-1440.webp" srcset="/img/banner-960.webp 960w, /img/banner-1440.webp 1440w, /img/banner-1920.webp 1920w" sizes="100vw" width="1920" height="600" alt="Perfumes Vulcan Feu, Lattafa Asad e Orientica Rose Eclat sobre pedra molhada, com cascata dourada ao fundo" fetchpriority="high">
  </picture>
  <div class="hero__txt">
    <p class="rotulo rotulo--ouro">Iguassu de Parfum</p>
    <h1 id="hero-titulo">Perfumes árabes<br> e importados</h1>
    <p class="hero__sub">Mais de ${Math.floor(produtos.length / 100) * 100} fragrâncias, da Lattafa à Carolina Herrera. Monte sua sacola e finalize o pedido direto no WhatsApp.</p>
    <div class="hero__btns">
      <a class="btn btn--ouro" href="/arabes/">Ver árabes</a>
      <a class="btn btn--contorno" href="/importados/">Ver importados</a>
    </div>
  </div>
</section>

<section class="fita" aria-labelledby="fita-titulo">
  <h2 class="fita__titulo rotulo" id="fita-titulo">Marcas</h2>
  <div class="fita__janela">
    <div class="fita__trilho">
      ${[0, 1].map((n) => `<ul class="fita__grupo"${n ? ' aria-hidden="true"' : ''}>${marcasFita.map((m) => `<li><a href="/marca/${m.slug}/"${n ? ' tabindex="-1"' : ''}>${esc(m.nome)}</a></li>`).join('')}</ul>`).join('')}
    </div>
  </div>
  <a class="fita__todas link-seta" href="/marcas/">Todas ${ICONES.seta}</a>
</section>

<section class="linhas" aria-label="Linhas">
  <a class="linha" href="/arabes/">
    <img src="/img/capa-arabes-520.webp" srcset="/img/capa-arabes-520.webp 520w, /img/capa-arabes-800.webp 800w" sizes="(min-width: 900px) 50vw, 100vw" width="800" height="800" alt="Perfumes árabes Afnan 9PM Elixir e Lattafa Badee Al Oud Amethyst" loading="lazy" decoding="async">
    <span class="linha__txt">
      <span class="rotulo rotulo--ouro">${totalArabes} perfumes</span>
      <span class="linha__nome">Árabes</span>
      <span class="linha__desc">Oud, âmbar e especiarias das grandes casas do Oriente Médio.</span>
      <span class="link-seta">Ver a linha ${ICONES.seta}</span>
    </span>
  </a>
  <a class="linha" href="/importados/">
    <img src="/img/capa-importados-520.webp" srcset="/img/capa-importados-520.webp 520w, /img/capa-importados-800.webp 800w" sizes="(min-width: 900px) 50vw, 100vw" width="800" height="800" alt="Perfumes importados Jean Paul Gaultier Le Male e Carolina Herrera Good Girl" loading="lazy" decoding="async">
    <span class="linha__txt">
      <span class="rotulo rotulo--ouro">${totalImp} perfumes</span>
      <span class="linha__nome">Importados</span>
      <span class="linha__desc">Os clássicos das grandes grifes, de Paris a Nova York.</span>
      <span class="link-seta">Ver a linha ${ICONES.seta}</span>
    </span>
  </a>
</section>

${faixa('Os mais pedidos', 'Árabes', destaques, '/arabes/', 'mais-pedidos')}

<section class="marcas" aria-labelledby="marcas-titulo">
  <div class="marcas__topo">
    <p class="rotulo">${marcas.length} marcas</p>
    <h2 id="marcas-titulo">Compre pela marca</h2>
  </div>
  <ul class="marcas__lista">
    ${marcas.slice(0, 16).map((m) => `<li><a href="/marca/${m.slug}/"><span>${esc(m.nome)}</span><small>${m.total}</small></a></li>`).join('\n    ')}
  </ul>
  <a class="btn btn--contorno-escuro" href="/marcas/">Ver todas as marcas</a>
</section>

${faixa('Importados em destaque', 'Grifes', destImp, '/importados/', 'importados-destaque')}

<section class="passos" id="como-comprar" aria-labelledby="passos-titulo">
  <div class="passos__in">
    <div class="passos__lado">
      <p class="rotulo">Sem cadastro, sem pagamento no site</p>
      <h2 id="passos-titulo">Como comprar</h2>
      <ol class="passos__lista">
        <li style="--i:0"><span class="passos__icone">${ICONES.busca}</span><div><span class="passos__n">Passo 1</span><h3>Escolha seus perfumes</h3><p>Navegue pelas linhas, busque pelo nome ou filtre pela marca e pelo preço.</p></div></li>
        <li style="--i:1"><span class="passos__icone">${ICONES.sacola}</span><div><span class="passos__n">Passo 2</span><h3>Monte a sacola</h3><p>Adicione quantos quiser e ajuste as quantidades. A sacola fica salva no seu celular.</p></div></li>
        <li style="--i:2"><span class="passos__icone">${ICONES.whats}</span><div><span class="passos__n">Passo 3</span><h3>Finalize no WhatsApp</h3><p>A sacola vira uma mensagem pronta. A gente confirma disponibilidade, pagamento e entrega.</p></div></li>
      </ol>
    </div>
    <figure class="conversa">
      <div class="conversa__topo"><span class="conversa__avatar">${SIMBOLO}</span><span><b>Iguassu de Parfum</b><small>online</small></span></div>
      <div class="conversa__corpo">
        <p class="balao balao--eu"><span>Olá, Iguassu! Quero fazer este pedido pelo site:</span><span class="balao__lista">1x Lattafa Asad 100 ml: R$ 169,00<br>2x French Avenue Vulcan Feu 100 ml: R$ 478,00</span><strong>Total: R$ 647,00</strong><time>14:32 <span aria-hidden="true">✓✓</span></time></p>
        <p class="balao balao--loja"><span>Oi! Os dois estão disponíveis. Já te passo as opções de pagamento e o prazo de entrega para a sua cidade.</span><time>14:33</time></p>
      </div>
      <figcaption class="sr">Exemplo de pedido: a sacola chega como mensagem pronta e a loja responde no WhatsApp.</figcaption>
    </figure>
  </div>
</section>

<section class="duvidas" id="duvidas" aria-labelledby="duvidas-titulo">
  <h2 id="duvidas-titulo">Dúvidas frequentes</h2>
  <div class="duvidas__lista">
    ${faq.map(([p, r]) => `<details><summary>${p}</summary><p>${r}</p></details>`).join('\n    ')}
  </div>
</section>`;

await gravar('', pagina({
  titulo: 'Iguassu de Parfum | Perfumes árabes e importados',
  descricao: `Catálogo de perfumes árabes e importados: Lattafa, Maison Alhambra, Armaf, Jean Paul Gaultier e mais ${marcas.length - 4} marcas. Monte a sacola e peça pelo WhatsApp.`,
  caminho: '/',
  conteudo: home,
  css: CSS, js: JS,
  preload: '<link rel="preload" as="image" href="/img/banner-1440.webp" imagesrcset="/img/banner-960.webp 960w, /img/banner-1440.webp 1440w, /img/banner-1920.webp 1920w" imagesizes="100vw" media="(min-width: 700px)" fetchpriority="high">\n<link rel="preload" as="image" href="/img/banner-celular-600.webp" imagesrcset="/img/banner-celular-600.webp 600w, /img/banner-celular-828.webp 828w" imagesizes="100vw" media="(max-width: 699px)" fetchpriority="high">',
  jsonld: [loja, { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }],
}));

// ---------- listagens ----------
function listagem({ caminho, titulo, h1, intro, lista, linha = '', marca = '', atual, migalhas }) {
  const ord = ordenar(lista);
  const marcasDaLista = Object.values(lista.reduce((a, p) => ((a[p.marcaSlug] ??= { nome: p.marca, slug: p.marcaSlug, n: 0 }).n++, a), {}))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  const conteudo = `
<section class="lista" data-listagem data-catalogo="" data-linha="${linha}" data-marca="${marca}">
  <nav class="migalha" aria-label="Você está em">${migalhas.map(([n, u], i) => i < migalhas.length - 1 ? `<a href="${u}">${n}</a>` : `<span aria-current="page">${n}</span>`).join('<span aria-hidden="true">/</span>')}</nav>
  <header class="lista__topo">
    <h1>${h1}</h1>
    <p>${intro}</p>
  </header>
  <div class="filtros" role="group" aria-label="Filtrar perfumes">
    ${marca ? '' : `<div class="filtros__linha" role="radiogroup" aria-label="Linha">
      <a href="/perfumes/" class="chip"${linha === '' ? ' aria-current="true"' : ''} data-linha-chip="">Todos</a>
      <a href="/arabes/" class="chip"${linha === 'a' ? ' aria-current="true"' : ''} data-linha-chip="a">Árabes</a>
      <a href="/importados/" class="chip"${linha === 'i' ? ' aria-current="true"' : ''} data-linha-chip="i">Importados</a>
    </div>`}
    <div class="filtros__campos">
      <label class="campo campo--busca"><span class="sr">Buscar na lista</span>${ICONES.busca}<input type="search" placeholder="Buscar nesta lista" data-f-busca autocomplete="off"></label>
      ${marca ? '' : `<label class="campo"><span class="sr">Marca</span><select data-f-marca><option value="">Todas as marcas</option>${marcasDaLista.map((m) => `<option value="${m.slug}">${esc(m.nome)} (${m.n})</option>`).join('')}</select></label>`}
      <label class="campo"><span class="sr">Preço</span><select data-f-preco><option value="">Qualquer preço</option><option value="0-100">Até R$ 100</option><option value="100-200">R$ 100 a R$ 200</option><option value="200-400">R$ 200 a R$ 400</option><option value="400-">Acima de R$ 400</option></select></label>
      <label class="campo"><span class="sr">Ordenar</span><select data-f-ordem><option value="">Mais relevantes</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option><option value="az">Nome, A a Z</option></select></label>
    </div>
  </div>
  <p class="lista__conta" data-conta-lista aria-live="polite">${lista.length} ${lista.length === 1 ? 'perfume' : 'perfumes'}</p>
  <div class="grade" data-grade>
    ${ord.slice(0, POR_PAGINA).map((p, i) => card(p, { eager: i < 2 })).join('\n')}
  </div>
  <div class="lista__vazia" data-vazia hidden>
    <p>Nenhum perfume com esses filtros.</p>
    <a class="btn btn--whats" href="${linkWhats('Olá, Iguassu! Procurei no site e não achei um perfume. Vocês têm o ')}" target="_blank" rel="noopener">${ICONES.whats}<span>Perguntar no WhatsApp</span></a>
  </div>
  <button class="btn btn--contorno-escuro lista__mais" type="button" data-mais${lista.length > POR_PAGINA ? '' : ' hidden'}>Carregar mais perfumes</button>
</section>`;
  return gravar(caminho, pagina({
    titulo, descricao: intro, caminho: `/${caminho}/`, conteudo, atual, css: CSS, js: JS,
    jsonld: [migalha(migalhas)],
  }));
}

await listagem({
  caminho: 'perfumes', atual: 'todos', titulo: 'Todos os perfumes | Iguassu de Parfum', h1: 'Todos os perfumes',
  intro: `${produtos.length} perfumes árabes e importados de ${marcas.length} marcas. Filtre por marca e preço e monte sua sacola.`,
  lista: produtos, migalhas: [['Início', '/'], ['Todos os perfumes', '/perfumes/']],
});
await listagem({
  caminho: 'arabes', atual: 'arabes', linha: 'a', titulo: 'Perfumes árabes | Iguassu de Parfum', h1: 'Perfumes árabes',
  intro: `${arabes.length} perfumes árabes de Lattafa, Maison Alhambra, Armaf, Al Wataniah, Orientica e mais marcas. Monte a sacola e peça pelo WhatsApp.`,
  lista: arabes, migalhas: [['Início', '/'], ['Perfumes árabes', '/arabes/']],
});
await listagem({
  caminho: 'importados', atual: 'importados', linha: 'i', titulo: 'Perfumes importados | Iguassu de Parfum', h1: 'Perfumes importados',
  intro: `${importados.length} perfumes importados de Jean Paul Gaultier, Carolina Herrera, Giorgio Armani, Prada e outras grifes. Peça pelo WhatsApp.`,
  lista: importados, migalhas: [['Início', '/'], ['Perfumes importados', '/importados/']],
});
for (const m of marcas) {
  const lista = produtos.filter((p) => p.marcaSlug === m.slug);
  await listagem({
    caminho: `marca/${m.slug}`, atual: 'marcas', marca: m.slug, titulo: `Perfumes ${m.nome} | Iguassu de Parfum`, h1: `Perfumes ${esc(m.nome)}`,
    intro: `${lista.length} ${lista.length === 1 ? 'perfume' : 'perfumes'} ${esc(m.nome)} no catálogo da Iguassu de Parfum. Monte a sacola e peça pelo WhatsApp.`,
    lista, migalhas: [['Início', '/'], ['Marcas', '/marcas/'], [esc(m.nome), `/marca/${m.slug}/`]],
  });
}

// ---------- página de todas as marcas ----------
const porLetra = marcas.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt')).reduce((acc, m) => {
  const l = m.nome[0].toUpperCase(); (acc[l] ??= []).push(m); return acc;
}, {});
await gravar('marcas', pagina({
  titulo: 'Marcas de perfume | Iguassu de Parfum', caminho: '/marcas/', atual: 'marcas', css: CSS, js: JS,
  descricao: `As ${marcas.length} marcas de perfumes árabes e importados do catálogo da Iguassu de Parfum, de Lattafa a Yves Saint Laurent.`,
  jsonld: [migalha([['Início', '/'], ['Marcas', '/marcas/']])],
  conteudo: `<section class="todas-marcas">
  <nav class="migalha" aria-label="Você está em"><a href="/">Início</a><span aria-hidden="true">/</span><span aria-current="page">Marcas</span></nav>
  <header class="lista__topo"><h1>Marcas</h1><p>${marcas.length} marcas de perfumes árabes e importados.</p></header>
  ${Object.entries(porLetra).map(([l, ms]) => `<div class="letra"><h2>${l}</h2><ul>${ms.map((m) => `<li><a href="/marca/${m.slug}/">${esc(m.nome)} <small>${m.total}</small></a></li>`).join('')}</ul></div>`).join('\n  ')}
</section>`,
}));

// ---------- página de cada perfume ----------
for (const p of produtos) {
  const url = `/perfume/${p.slug}/`;
  const linhaNome = p.linha === 'arabe' ? 'Perfumes árabes' : 'Perfumes importados';
  const linhaUrl = p.linha === 'arabe' ? '/arabes/' : '/importados/';
  const parecidos = ordenar(produtos.filter((x) => x.id !== p.id && x.marcaSlug === p.marcaSlug)).slice(0, 8);
  const completa = parecidos.length < 4 ? ordenar(produtos.filter((x) => x.id !== p.id && x.linha === p.linha && x.marcaSlug !== p.marcaSlug)).slice(0, 8 - parecidos.length) : [];
  const nomeTodo = nomeCompleto(p);
  const msg = p.disponivel
    ? `Olá, Iguassu! Vi no site e quero o *${nomeTodo}* (${precoTexto(p.preco)}). Está disponível?`
    : `Olá, Iguassu! Vi no site que o *${nomeTodo}* está esgotado. Quando chega de novo?`;
  const galeria = p.fotos.length > 1 ? `<div class="galeria__miniaturas" role="group" aria-label="Fotos">${p.fotos.map((f, i) => `<button type="button" data-foto="${f}"${i === 0 ? ' aria-current="true"' : ''} aria-label="Foto ${i + 1}"><img src="/img/p/${f}-400.webp" width="400" height="400" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>` : '';
  const conteudo = `
<div class="produto">
  <nav class="migalha" aria-label="Você está em"><a href="/">Início</a><span aria-hidden="true">/</span><a href="${linhaUrl}">${linhaNome}</a><span aria-hidden="true">/</span><a href="/marca/${p.marcaSlug}/">${esc(p.marca)}</a></nav>
  <div class="produto__in card" data-id="${p.id}" data-nome="${esc(p.nome)}" data-marca="${esc(p.marca)}" data-vol="${esc(p.volume)}" data-preco="${p.preco}" data-img="${p.fotos[0] ? `/img/p/${p.fotos[0]}-400.webp` : ''}" data-url="${url}">
    <div class="galeria">
      <div class="galeria__principal" data-galeria>${foto(p, { eager: true, sizes: '(min-width: 900px) 600px, 100vw' })}</div>
      ${galeria}
    </div>
    <div class="produto__info">
      <a class="produto__marca rotulo" href="/marca/${p.marcaSlug}/">${esc(p.marca)}</a>
      <h1>${esc(p.nome)}</h1>
      ${p.volume ? `<p class="produto__vol">${esc(p.volume)} · ${p.linha === 'arabe' ? 'Perfume árabe' : 'Perfume importado'}</p>` : ''}
      <p class="produto__preco">${p.precoDe ? `<s>${preco(p.precoDe)}</s> ` : ''}${preco(p.preco)}</p>
      ${p.disponivel ? '' : '<p class="produto__esgotado">Esgotado no momento. Chame no WhatsApp pra saber quando chega.</p>'}
      <div class="produto__comprar">
        <div class="qtd" data-qtd>
          <button type="button" aria-label="Diminuir quantidade" data-menos>−</button>
          <input type="number" min="1" max="20" value="1" aria-label="Quantidade" inputmode="numeric">
          <button type="button" aria-label="Aumentar quantidade" data-mais-um>+</button>
        </div>
        <button class="btn btn--escuro produto__add" type="button" data-add${p.disponivel ? '' : ' disabled'}>${p.disponivel ? 'Adicionar à sacola' : 'Esgotado'}</button>
      </div>
      <a class="btn btn--whats produto__whats" href="${linkWhats(msg)}" target="_blank" rel="noopener">${ICONES.whats}<span>${p.disponivel ? 'Pedir só este pelo WhatsApp' : 'Perguntar quando chega'}</span></a>
      ${p.descricao ? `<div class="produto__desc">${esc(p.descricao).split(/\n{2,}/).map((t) => `<p>${t.replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
      <ul class="produto__notas">
        <li>Pedido confirmado no WhatsApp, sem cadastro e sem pagamento no site</li>
        <li>Pagamento e entrega combinados no atendimento</li>
        <li>Disponibilidade confirmada antes de fechar</li>
      </ul>
    </div>
  </div>
</div>
${parecidos.length + completa.length ? faixa(parecidos.length ? `Mais de ${esc(p.marca)}` : 'Você também pode gostar', parecidos.length ? 'Mesma marca' : linhaNome, [...parecidos, ...completa], parecidos.length ? `/marca/${p.marcaSlug}/` : linhaUrl, 'parecidos') : ''}`;
  await gravar(`perfume/${p.slug}`, pagina({
    titulo: `${nomeTodo} | Iguassu de Parfum`,
    descricao: `${nomeTodo}, ${p.linha === 'arabe' ? 'perfume árabe' : 'perfume importado'} por ${precoTexto(p.preco)}. Adicione à sacola e peça pelo WhatsApp na Iguassu de Parfum.`,
    caminho: url, conteudo, css: CSS, js: JS,
    ogImagem: p.fotos[0] ? `/img/p/${p.fotos[0]}-800.webp` : undefined,
    preload: p.fotos[0] ? `<link rel="preload" as="image" href="/img/p/${p.fotos[0]}-800.webp" imagesrcset="/img/p/${p.fotos[0]}-400.webp 400w, /img/p/${p.fotos[0]}-800.webp 800w" imagesizes="(min-width: 900px) 600px, 100vw" fetchpriority="high">` : '',
    jsonld: [
      {
        '@context': 'https://schema.org', '@type': 'Product', name: nomeTodo, sku: p.id,
        brand: { '@type': 'Brand', name: p.marca },
        image: p.fotos.map((f) => `${LOJA.url}/img/p/${f}-800.webp`),
        category: p.linha === 'arabe' ? 'Perfume árabe' : 'Perfume importado',
        offers: { '@type': 'Offer', url: LOJA.url + url, priceCurrency: 'BRL', price: p.preco.toFixed(2), availability: p.disponivel ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', seller: { '@id': `${LOJA.url}/#loja` } },
      },
      migalha([['Início', '/'], [linhaNome, linhaUrl], [p.marca, `/marca/${p.marcaSlug}/`], [nomeTodo, url]]),
    ],
  }));
}

// ---------- 404, sitemap, robots, favicon ----------
await writeFile(join(DIST, '404.html'), pagina({
  titulo: 'Página não encontrada | Iguassu de Parfum', descricao: 'Esta página não existe mais.', caminho: '/404', css: CSS, js: JS,
  conteudo: `<section class="nao-achou">${SIMBOLO}<h1>Essa página não existe</h1><p>O perfume pode ter saído do catálogo. Veja os outros ou fale com a gente.</p><div class="hero__btns"><a class="btn btn--escuro" href="/perfumes/">Ver perfumes</a><a class="btn btn--contorno-escuro" href="${linkWhats('Olá, Iguassu! Vim pelo site e não achei um perfume.')}" target="_blank" rel="noopener">Falar no WhatsApp</a></div></section>`,
}).replace(/data-catalogo=""/g, `data-catalogo="${CATALOGO}"`));

const urls = ['/', '/perfumes/', '/arabes/', '/importados/', '/marcas/', ...marcas.map((m) => `/marca/${m.slug}/`), ...produtos.map((p) => `/perfume/${p.slug}/`)];
const hoje = new Date().toISOString().slice(0, 10);
await writeFile(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${LOJA.url}${u}</loc><lastmod>${hoje}</lastmod></url>`).join('\n')}\n</urlset>\n`);
await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /painel/\n\nSitemap: ${LOJA.url}/sitemap.xml\n`);
await writeFile(join(DIST, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#0f0f0f"/><g transform="translate(18 4) scale(.875)" fill="none" stroke="#b39e72" stroke-width="1.8" stroke-linejoin="round">${SIMBOLO.replace(/<\/?svg[^>]*>/g, '')}</g></svg>`);

// ---------- painel do Eduardo (só quando o build sabe qual é o banco) ----------
if (process.env.SUPABASE_URL && process.env.SUPABASE_CHAVE_PUBLICA) {
  const { build } = await import('esbuild');
  const saida = await build({
    entryPoints: [join(AQUI, 'painel', 'painel.js')], bundle: true, minify: true, format: 'esm', target: 'es2020', write: false, legalComments: 'none',
    define: { __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL), __SUPABASE_CHAVE__: JSON.stringify(process.env.SUPABASE_CHAVE_PUBLICA) },
  });
  const pjs = saida.outputFiles[0].text;
  const pcss = await readFile(join(AQUI, 'painel', 'painel.css'), 'utf8');
  await mkdir(join(DIST, 'painel'), { recursive: true });
  await writeFile(join(DIST, 'painel', `painel.${versao(pjs)}.js`), pjs);
  await writeFile(join(DIST, 'painel', `painel.${versao(pcss)}.css`), pcss);
  const phtml = (await readFile(join(AQUI, 'painel', 'index.html'), 'utf8'))
    .replace('__CSS__', `/painel/painel.${versao(pcss)}.css`).replace('__JS__', `/painel/painel.${versao(pjs)}.js`)
    .replaceAll('__SIMBOLO__', SIMBOLO);
  await writeFile(join(DIST, 'painel', 'index.html'), phtml);
  console.log(`painel: ${Math.round(pjs.length / 1024)} KB de JS`);
}

console.log(`vitrine: ${produtos.length} perfumes, ${marcas.length} marcas, ${urls.length} páginas em site/dist`);

// ---------- avisa o banco que o site novo está no ar (o painel mostra "Site em dia") ----------
if (process.env.PUBLICACAO_SEGREDO && process.env.SUPABASE_URL && process.env.VERCEL_ENV === 'production') {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/registrar_publicacao`, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_CHAVE_PUBLICA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_segredo: process.env.PUBLICACAO_SEGREDO }),
  });
  console.log(`publicação registrada: ${r.ok ? await r.text() : r.status}`);
}
