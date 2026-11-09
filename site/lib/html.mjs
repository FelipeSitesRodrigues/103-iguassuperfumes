// Peças de HTML compartilhadas pelas páginas da vitrine.
export const LOJA = {
  nome: 'Iguassu de Parfum',
  whatsapp: '5545988110629',
  whatsappExibir: '(45) 98811-0629',
  instagram: '', // vem das configurações do banco (build.mjs)
  faixaTopo: 'Pedido direto pelo WhatsApp, com atendimento de quem entende de perfume',
  url: (process.env.SITE_URL || 'https://iguassudeparfum.vercel.app').replace(/\/$/, ''),
};

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const preco = (v) => fmt.format(v).replace(/ /g, '&nbsp;');
export const precoTexto = (v) => fmt.format(v).replace(/ /g, ' ');
export const linkWhats = (texto) => `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(texto)}`;
export const nomeCompleto = (p) => `${p.marca} ${p.nome}${p.volume ? ' ' + p.volume : ''}`;

export const ICONES = {
  busca: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  sacola: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>',
  fechar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  seta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
  whats: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ico-cheio"><path d="M12 2.2A9.7 9.7 0 0 0 3.6 16.8L2.3 21.7l5-1.3A9.7 9.7 0 1 0 12 2.2Zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9Zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.2.1-.1 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.4-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.4-.3Z"/></svg>',
};

// símbolo do logo: frasco facetado com cascata (desenho da Direção A)
export const SIMBOLO = `<svg class="simbolo" viewBox="0 0 32 60" aria-hidden="true"><path d="M9 6h14l4 5-11 10L5 11zM5 11h22M12.5 11 16 6l3.5 5M9 6l3.5 5L16 21l3.5-10L23 6"/><path d="M13 21h6v4h-6z"/><path d="M10 25h12q2 0 2.4 1.6l1.6 5Q26.5 33 26.5 35v20q0 3-3 3h-15q-3 0-3-3V35q0-2 .5-3.4l1.6-5Q8 25 10 25z"/><path d="M12.5 37v14M15 34.5v19M17.5 34.5v19M20 37v14"/></svg>`;

export function logo(classe = '') {
  return `<a class="logo ${classe}" href="/" aria-label="Iguassu de Parfum, página inicial">${SIMBOLO}<span class="logo__divisa" aria-hidden="true"></span><span class="logo__txt"><span class="logo__nome">IGUASSU</span><span class="logo__sub">DE PARFUM</span></span></a>`;
}

export function foto(p, { sizes = '(min-width: 1100px) 290px, (min-width: 700px) 30vw, 46vw', eager = false, n = 0 } = {}) {
  const f = p.fotos[n];
  if (!f) {
    return `<span class="sem-foto">${SIMBOLO}<span>Foto em breve</span></span>`;
  }
  return `<img src="/img/p/${f}-400.webp" srcset="/img/p/${f}-400.webp 400w, /img/p/${f}-800.webp 800w" sizes="${sizes}" width="400" height="400" alt="${esc(nomeCompleto(p))}" ${eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}>`;
}

export function card(p, opcoes = {}) {
  const url = `/perfume/${p.slug}/`;
  const img = p.fotos[0] ? `/img/p/${p.fotos[0]}-400.webp` : '';
  return `<article class="card${p.disponivel ? '' : ' card--esgotado'}" data-id="${p.id}" data-nome="${esc(p.nome)}" data-marca="${esc(p.marca)}" data-vol="${esc(p.volume)}" data-preco="${p.preco}" data-img="${img}" data-url="${url}">
  <a class="card__foto" href="${url}" tabindex="-1" aria-hidden="true">${foto(p, opcoes)}</a>
  <div class="card__info">
    <p class="card__marca">${esc(p.marca)}</p>
    <h3 class="card__nome"><a href="${url}">${esc(p.nome)}</a></h3>
    <p class="card__rodape"><span class="card__preco">${p.precoDe ? `<s>${preco(p.precoDe)}</s>` : ''}${preco(p.preco)}</span>${p.volume ? `<span class="card__vol">${esc(p.volume)}</span>` : ''}</p>
  </div>
  ${p.disponivel ? `<button class="card__add" type="button" data-add aria-label="Adicionar ${esc(nomeCompleto(p))} à sacola"><span>Adicionar à sacola</span>${ICONES.sacola}</button>` : '<span class="card__add card__add--esgotado">Esgotado</span>'}
</article>`;
}

function cabecalho(atual) {
  const item = (href, txt, chave) => `<a href="${href}"${atual === chave ? ' aria-current="page"' : ''}>${txt}</a>`;
  return `<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<div class="faixa-topo"><p>${esc(LOJA.faixaTopo)}</p></div>
<header class="topo">
  <div class="topo__in">
    <button class="topo__btn topo__menu" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu-celular" data-menu>${ICONES.menu}</button>
    <nav class="topo__nav" aria-label="Principal">
      ${item('/arabes/', 'Árabes', 'arabes')}
      ${item('/importados/', 'Importados', 'importados')}
      ${item('/marcas/', 'Marcas', 'marcas')}
    </nav>
    ${logo('topo__logo')}
    <div class="topo__acoes">
      <form class="busca" action="/perfumes/" role="search" data-busca>
        <label class="sr" for="busca-campo">Buscar perfume</label>
        <input id="busca-campo" name="busca" type="search" placeholder="Buscar perfume ou marca" autocomplete="off" aria-controls="busca-lista" aria-expanded="false" aria-autocomplete="list">
        <button class="busca__ir" type="submit" aria-label="Buscar">${ICONES.busca}</button>
        <div class="busca__lista" id="busca-lista" role="listbox" hidden></div>
      </form>
      <button class="topo__btn topo__lupa" type="button" aria-label="Buscar" data-abrir-busca>${ICONES.busca}</button>
      <button class="topo__btn topo__sacola" type="button" aria-label="Abrir sacola" aria-controls="sacola" data-abrir-sacola>${ICONES.sacola}<span class="topo__conta" data-conta hidden>0</span></button>
    </div>
  </div>
  <nav class="menu-celular" id="menu-celular" aria-label="Menu" hidden>
    <a href="/arabes/">Perfumes árabes</a>
    <a href="/importados/">Perfumes importados</a>
    <a href="/perfumes/">Todos os perfumes</a>
    <a href="/marcas/">Marcas</a>
    <a href="${linkWhats('Olá, Iguassu! Vim pelo site e queria tirar uma dúvida.')}" target="_blank" rel="noopener">Falar no WhatsApp</a>
  </nav>
</header>`;
}

function rodape() {
  const ano = new Date().getFullYear();
  return `<footer class="rodape">
  <div class="rodape__in">
    <div class="rodape__marca">
      ${logo('rodape__logo')}
      <p>Perfumes árabes e importados, com pedido direto pelo WhatsApp e atendimento personalizado.</p>
    </div>
    <nav class="rodape__col" aria-label="Catálogo">
      <h2>Catálogo</h2>
      <a href="/arabes/">Árabes</a><a href="/importados/">Importados</a><a href="/perfumes/">Todos os perfumes</a><a href="/marcas/">Marcas</a>
    </nav>
    <div class="rodape__col">
      <h2>Atendimento</h2>
      <a href="${linkWhats('Olá, Iguassu! Vim pelo site e queria tirar uma dúvida.')}" target="_blank" rel="noopener">WhatsApp ${LOJA.whatsappExibir}</a>
      ${LOJA.instagram ? `<a href="https://instagram.com/${esc(LOJA.instagram)}" target="_blank" rel="noopener">Instagram @${esc(LOJA.instagram)}</a>` : ''}
      <a href="/#como-comprar">Como comprar</a>
      <a href="/#duvidas">Dúvidas frequentes</a>
    </div>
  </div>
  <div class="rodape__base">
    <p>© ${ano} Iguassu de Parfum. Preços sujeitos a confirmação no atendimento.</p>
    <p>Site por <a href="https://instagram.com/feliperodrigues.sites" target="_blank" rel="noopener">Felipe Rodrigues Sites</a></p>
  </div>
</footer>`;
}

function sacola() {
  return `<div class="veu" data-veu hidden></div>
<aside class="sacola" id="sacola" aria-label="Sacola" aria-hidden="true" inert>
  <div class="sacola__topo">
    <h2>Sua sacola <span data-sacola-qtd></span></h2>
    <button class="topo__btn" type="button" aria-label="Fechar sacola" data-fechar-sacola>${ICONES.fechar}</button>
  </div>
  <ul class="sacola__itens" data-sacola-itens></ul>
  <div class="sacola__vazia" data-sacola-vazia>
    ${SIMBOLO}
    <p>Sua sacola está vazia.</p>
    <a class="btn btn--escuro" href="/perfumes/">Ver perfumes</a>
  </div>
  <div class="sacola__fim" data-sacola-fim hidden>
    <p class="sacola__total"><span>Total</span><strong data-sacola-total></strong></p>
    <label class="sacola__nome"><span>Seu nome <small>(opcional)</small></span><input type="text" autocomplete="given-name" data-sacola-nome maxlength="60"></label>
    <a class="btn btn--whats" href="#" target="_blank" rel="noopener" data-finalizar>${ICONES.whats}<span>Finalizar pelo WhatsApp</span></a>
    <p class="sacola__nota">O pedido chega pronto no WhatsApp. Lá a gente confirma disponibilidade, pagamento e entrega.</p>
  </div>
</aside>
<div class="aviso" role="status" aria-live="polite" data-aviso></div>`;
}

export function pagina({ titulo, descricao, caminho, conteudo, atual = '', jsonld = [], css, js, preload = '', ogImagem = '/img/banner-1440.webp' }) {
  const url = LOJA.url + caminho;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0f0f0f">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Iguassu de Parfum">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${LOJA.url}${ogImagem}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fontes/jost-latin.woff2" as="font" type="font/woff2" crossorigin>
${preload}
<script>document.documentElement.className='js'+(location.hash?' cv-pronto':'');addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href*="#"]');if(a)document.documentElement.classList.add('cv-pronto')},true)</script>
<style>${css}</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body>
${cabecalho(atual)}
<main id="conteudo">
${conteudo}
</main>
${rodape()}
${sacola()}
<a class="whats-flutua" href="${linkWhats('Olá, Iguassu! Vim pelo site e queria tirar uma dúvida.')}" target="_blank" rel="noopener" aria-label="Falar no WhatsApp">${ICONES.whats}</a>
<script src="${js}" defer></script>
</body>
</html>`;
}
