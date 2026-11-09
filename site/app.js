/* Iguassu de Parfum: sacola, pedido no WhatsApp, busca, filtros e galeria. Sem biblioteca. */
(() => {
  'use strict';
  // a classe "js" vem marcada no <head> (marcar aqui recalculava o estilo da página inteira)
  const WHATS = '__WHATS__';
  const CHAVE = 'iguassu-sacola-v1';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const real = (v) => fmt.format(v);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // roda depois do carregamento, quando a thread principal estiver livre
  const ocioso = (fn, espera = 2000) => {
    const ir = () => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: espera }) : setTimeout(fn, 200));
    if (document.readyState === 'complete') ir(); else addEventListener('load', ir, { once: true });
  };

  // ---------- catálogo (carregado sob demanda) ----------
  let catalogoPromessa = null;
  const urlCatalogo = () => ($('[data-catalogo]')?.dataset.catalogo) || '/catalogo.json';
  function catalogo() {
    catalogoPromessa ??= fetch(urlCatalogo()).then((r) => r.json()).then((lista) => {
      lista.forEach((p) => { p.busca = semAcento(`${p.m} ${p.n} ${p.v}`); });
      return lista;
    }).catch(() => { catalogoPromessa = null; return []; });
    return catalogoPromessa;
  }

  // ---------- sacola ----------
  const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch { return []; } };
  let itens = ler();
  const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(itens)); } catch {} };
  const total = () => itens.reduce((s, i) => s + i.preco * i.qtd, 0);
  const qtdTotal = () => itens.reduce((s, i) => s + i.qtd, 0);

  const sacolaEl = $('#sacola');
  const veu = $('[data-veu]');
  let ultimoFoco = null;

  function mensagem() {
    const nome = ($('[data-sacola-nome]')?.value || '').trim();
    const linhas = itens.map((i) => `${i.qtd}x ${i.marca} ${i.nome}${i.vol ? ' ' + i.vol : ''}: ${real(i.preco * i.qtd)}`);
    return [
      'Olá, Iguassu! Quero fazer este pedido pelo site:',
      '',
      ...linhas,
      '',
      `*Total: ${real(total())}*`,
      ...(nome ? ['', `Nome: ${nome}`] : []),
      '',
      'Pode me confirmar a disponibilidade, o pagamento e a entrega?',
    ].join('\n');
  }

  function desenharSacola() {
    const n = qtdTotal();
    $$('[data-conta]').forEach((el) => { el.textContent = n; el.hidden = n === 0; });
    if (!sacolaEl) return;
    $('[data-sacola-qtd]').textContent = n ? `(${n})` : '';
    $('[data-sacola-vazia]').hidden = n > 0;
    $('[data-sacola-fim]').hidden = n === 0;
    $('[data-sacola-itens]').innerHTML = itens.map((i) => `
      <li class="item" data-item="${i.id}">
        <a class="item__foto" href="${i.url}">${i.img ? `<img src="${i.img}" width="400" height="400" alt="" loading="lazy">` : ''}</a>
        <div>
          <p class="item__marca">${esc(i.marca)}</p>
          <p class="item__nome"><a href="${i.url}">${esc(i.nome)}</a>${i.vol ? ` <small>${esc(i.vol)}</small>` : ''}</p>
          <div class="item__linha">
            <div class="qtd"><button type="button" aria-label="Diminuir" data-q="-1">−</button><span aria-label="Quantidade">${i.qtd}</span><button type="button" aria-label="Aumentar" data-q="1">+</button></div>
            <span class="item__preco">${real(i.preco * i.qtd)}</span>
          </div>
          <button class="item__tirar" type="button" data-tirar>Remover</button>
        </div>
      </li>`).join('');
    $('[data-sacola-total]').textContent = real(total());
    atualizarLink();
  }
  function atualizarLink() {
    const a = $('[data-finalizar]');
    if (a) a.href = `https://wa.me/${WHATS}?text=${encodeURIComponent(mensagem())}`;
  }

  function abrirSacola() {
    if (!sacolaEl) return;
    ultimoFoco = document.activeElement;
    veu.hidden = false;
    sacolaEl.inert = false;
    sacolaEl.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => { veu.classList.add('aberto'); sacolaEl.classList.add('aberta'); });
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('[data-fechar-sacola]')?.focus(), 60);
    // confere preço com o catálogo atual
    catalogo().then((lista) => {
      const mapa = new Map(lista.map((p) => [p.i, p]));
      let mudou = false;
      itens = itens.filter((i) => mapa.has(i.id) && !mapa.get(i.id).x).map((i) => {
        const p = mapa.get(i.id);
        if (p.p !== i.preco) mudou = true;
        return { ...i, preco: p.p };
      });
      if (mudou || lista.length) { gravar(); desenharSacola(); }
    });
  }
  function fecharSacola() {
    if (!sacolaEl?.classList.contains('aberta')) return;
    veu.classList.remove('aberto');
    sacolaEl.classList.remove('aberta');
    sacolaEl.setAttribute('aria-hidden', 'true');
    sacolaEl.inert = true;
    document.body.style.overflow = '';
    setTimeout(() => { veu.hidden = true; }, 350);
    ultimoFoco?.focus?.();
  }

  let avisoTempo;
  function aviso(txt) {
    const el = $('[data-aviso]');
    if (!el || sacolaEl?.classList.contains('aberta')) return; // com a sacola aberta, o item já aparece nela
    el.textContent = txt;
    el.classList.add('ver');
    clearTimeout(avisoTempo);
    avisoTempo = setTimeout(() => el.classList.remove('ver'), 2200);
  }

  function adicionar(card, qtd = 1) {
    const d = card.dataset;
    const existente = itens.find((i) => i.id === d.id);
    if (existente) existente.qtd = Math.min(existente.qtd + qtd, 20);
    else itens.push({ id: d.id, nome: d.nome, marca: d.marca, vol: d.vol, preco: Number(d.preco), img: d.img, url: d.url, qtd });
    gravar();
    desenharSacola();
    const conta = $('[data-conta]');
    if (conta && !reduzir) { conta.classList.remove('pulo'); void conta.offsetWidth; conta.classList.add('pulo'); }
    if (itens.length === 1 && !existente) abrirSacola();
    else aviso(`${d.marca} ${d.nome} na sacola`);
  }

  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const card = add.closest('[data-id]');
      const campo = card.querySelector('[data-qtd] input');
      adicionar(card, campo ? Math.max(1, Math.min(20, parseInt(campo.value, 10) || 1)) : 1);
      add.classList.add('feito');
      setTimeout(() => add.classList.remove('feito'), 900);
      return;
    }
    if (e.target.closest('[data-abrir-sacola]')) return abrirSacola();
    if (e.target.closest('[data-fechar-sacola]') || e.target.closest('[data-veu]')) return fecharSacola();
    const item = e.target.closest('[data-item]');
    if (item) {
      const i = itens.find((x) => x.id === item.dataset.item);
      const q = e.target.closest('[data-q]');
      if (q && i) { i.qtd += Number(q.dataset.q); if (i.qtd < 1) itens = itens.filter((x) => x !== i); }
      if (e.target.closest('[data-tirar]')) itens = itens.filter((x) => x !== i);
      if (q || e.target.closest('[data-tirar]')) { gravar(); desenharSacola(); }
    }
    const qtd = e.target.closest('[data-qtd]');
    if (qtd && e.target.closest('button')) {
      const campo = qtd.querySelector('input');
      const v = (parseInt(campo.value, 10) || 1) + (e.target.closest('[data-menos]') ? -1 : 1);
      campo.value = Math.max(1, Math.min(20, v));
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { fecharSacola(); fecharBusca(); } });
  document.addEventListener('input', (e) => { if (e.target.matches('[data-sacola-nome]')) atualizarLink(); });
  addEventListener('storage', (e) => { if (e.key === CHAVE) { itens = ler(); desenharSacola(); } });
  desenharSacola();

  // ---------- menu do celular ----------
  const botaoMenu = $('[data-menu]');
  botaoMenu?.addEventListener('click', () => {
    const menu = $('#menu-celular');
    const abrir = menu.hidden;
    menu.hidden = !abrir;
    botaoMenu.setAttribute('aria-expanded', String(abrir));
  });

  // ---------- busca do topo ----------
  const form = $('[data-busca]');
  const campo = form?.querySelector('input');
  const listaBusca = form?.querySelector('.busca__lista');
  let selecionado = -1;

  function pontuar(p, termos) {
    let s = 0;
    for (const t of termos) {
      const i = p.busca.indexOf(t);
      if (i < 0) return -1;
      s += i === 0 || p.busca[i - 1] === ' ' ? 3 : 1;
    }
    return s;
  }
  // tolerância a erro de digitação: distância de edição pequena contra cada palavra
  function distancia(a, b, limite) {
    if (Math.abs(a.length - b.length) > limite) return limite + 1;
    let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let menor = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < menor) menor = cur[j];
      }
      if (menor > limite) return limite + 1;
      ant = cur;
    }
    return ant[b.length];
  }
  // termo curto precisa bater exato; até 5 letras aceita 1 erro; 6 ou mais, 2
  function parecido(t, w) {
    if (w.includes(t)) return true;
    if (t.length < 4) return false;
    const limite = t.length >= 6 ? 2 : 1;
    return distancia(t, w, limite) <= limite || distancia(t, w.slice(0, t.length), limite) <= limite;
  }
  async function buscar(texto) {
    const lista = await catalogo();
    const termos = semAcento(texto).split(/\s+/).filter(Boolean);
    if (!termos.length) return [];
    let achados = lista.map((p) => [p, pontuar(p, termos)]).filter(([, s]) => s >= 0);
    if (!achados.length) {
      achados = lista.map((p) => {
        const palavras = p.busca.split(' ');
        if (!termos.every((t) => palavras.some((w) => parecido(t, w)))) return [p, -1];
        // pontua pela proximidade: exato vale mais que 1 erro, que vale mais que 2
        const nota = termos.reduce((s, t) => s + Math.max(...palavras.map((w) => (w.includes(t) ? 3 : 3 - Math.min(distancia(t, w.slice(0, t.length), 2), distancia(t, w, 2))))), 0);
        return [p, nota];
      }).filter(([, s]) => s >= 0);
      const melhor = Math.max(0, ...achados.map(([, s]) => s));
      achados = achados.filter(([, s]) => s >= melhor - 1); // corta parecido demais de longe
    }
    return achados.sort((a, b) => b[1] - a[1] || a[0].o - b[0].o).map(([p]) => p);
  }
  function fecharBusca() {
    if (!listaBusca) return;
    listaBusca.hidden = true;
    campo.setAttribute('aria-expanded', 'false');
  }
  async function mostrarBusca() {
    const texto = campo.value.trim();
    if (texto.length < 2) return fecharBusca();
    const achados = await buscar(texto);
    if (campo.value.trim() !== texto) return;
    selecionado = -1;
    listaBusca.innerHTML = achados.length
      ? achados.slice(0, 6).map((p, i) => `<a class="busca__item" role="option" id="op-${i}" aria-selected="false" href="/perfume/${p.s}/">${p.f ? `<img src="/img/p/${p.f}-400.webp" width="52" height="52" alt="" loading="lazy">` : '<span class="sem-foto"></span>'}<span><small>${esc(p.m)}</small><b>${esc(p.n)}</b></span><em>${real(p.p)}</em></a>`).join('') +
        `<a class="busca__todos" href="/perfumes/?busca=${encodeURIComponent(texto)}">Ver os ${achados.length} resultados</a>`
      : `<p class="busca__nada">Nada com "${esc(texto)}". <a href="https://wa.me/${WHATS}?text=${encodeURIComponent(`Olá, Iguassu! Vocês têm o perfume ${texto}?`)}" target="_blank" rel="noopener"><u>Perguntar no WhatsApp</u></a></p>`;
    listaBusca.hidden = false;
    campo.setAttribute('aria-expanded', 'true');
  }
  if (form) {
    let espera;
    campo.addEventListener('focus', () => { catalogo(); });
    campo.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(mostrarBusca, 120); });
    campo.addEventListener('keydown', (e) => {
      const ops = $$('.busca__item', listaBusca);
      if (!ops.length || listaBusca.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        selecionado = (selecionado + (e.key === 'ArrowDown' ? 1 : -1) + ops.length) % ops.length;
        ops.forEach((o, i) => o.setAttribute('aria-selected', String(i === selecionado)));
        campo.setAttribute('aria-activedescendant', ops[selecionado].id);
      } else if (e.key === 'Enter' && selecionado >= 0) {
        e.preventDefault();
        location.href = ops[selecionado].href;
      }
    });
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) fecharBusca(); });
    $('[data-abrir-busca]')?.addEventListener('click', () => {
      const topo = $('.topo');
      const abrir = !topo.classList.contains('busca-aberta');
      topo.classList.toggle('busca-aberta', abrir);
      if (abrir) campo.focus(); else fecharBusca();
    });
  }

  // ---------- listagem com filtros ----------
  const listagem = $('[data-listagem]');
  if (listagem) {
    const POR = 24;
    const grade = $('[data-grade]', listagem);
    const conta = $('[data-conta-lista]', listagem);
    const mais = $('[data-mais]', listagem);
    const vazia = $('[data-vazia]', listagem);
    const f = {
      busca: $('[data-f-busca]', listagem), marca: $('[data-f-marca]', listagem),
      preco: $('[data-f-preco]', listagem), ordem: $('[data-f-ordem]', listagem),
    };
    const linhaFixa = listagem.dataset.linha;
    const marcaFixa = listagem.dataset.marca;
    const q = new URLSearchParams(location.search);
    if (q.get('busca')) f.busca.value = q.get('busca');
    if (q.get('marca') && f.marca) f.marca.value = q.get('marca');
    if (q.get('preco')) f.preco.value = q.get('preco');
    if (q.get('ordem')) f.ordem.value = q.get('ordem');
    let mostrando = POR;
    let resultado = [];

    const cardHtml = (p) => {
      const url = `/perfume/${p.s}/`;
      const img = p.f ? `/img/p/${p.f}-400.webp` : '';
      return `<article class="card${p.x ? ' card--esgotado' : ''}" data-id="${p.i}" data-nome="${esc(p.n)}" data-marca="${esc(p.m)}" data-vol="${esc(p.v)}" data-preco="${p.p}" data-img="${img}" data-url="${url}">
  <a class="card__foto" href="${url}" tabindex="-1" aria-hidden="true">${p.f ? `<img src="${img}" srcset="${img} 400w, /img/p/${p.f}-800.webp 800w" sizes="(min-width: 1100px) 290px, (min-width: 700px) 30vw, 46vw" width="400" height="400" alt="${esc(`${p.m} ${p.n} ${p.v}`)}" loading="lazy" decoding="async">` : '<span class="sem-foto"><span>Foto em breve</span></span>'}</a>
  <div class="card__info"><p class="card__marca">${esc(p.m)}</p><h3 class="card__nome"><a href="${url}">${esc(p.n)}</a></h3><p class="card__rodape"><span class="card__preco">${p.d ? `<s>${real(p.d)}</s>` : ''}${real(p.p)}</span>${p.v ? `<span class="card__vol">${esc(p.v)}</span>` : ''}</p></div>
  ${p.x ? '<span class="card__add card__add--esgotado">Esgotado</span>' : `<button class="card__add" type="button" data-add aria-label="Adicionar ${esc(`${p.m} ${p.n}`)} à sacola"><span>Adicionar à sacola</span></button>`}
</article>`;
    };

    async function aplicar({ rolar = false, manterQtd = false } = {}) {
      let lista = await catalogo();
      if (!lista.length) return;
      if (linhaFixa) lista = lista.filter((p) => p.l === linhaFixa);
      if (marcaFixa) lista = lista.filter((p) => p.ms === marcaFixa);
      if (f.marca?.value) lista = lista.filter((p) => p.ms === f.marca.value);
      if (f.preco.value) {
        const [min, max] = f.preco.value.split('-').map((v) => (v === '' ? Infinity : Number(v)));
        lista = lista.filter((p) => p.p >= min && p.p <= (max ?? Infinity));
      }
      const texto = f.busca.value.trim();
      let posicao = null;
      if (texto) {
        posicao = new Map((await buscar(texto)).map((p, i) => [p.i, i]));
        lista = lista.filter((p) => posicao.has(p.i));
      }
      const o = f.ordem.value;
      const relevancia = posicao ? (a, b) => posicao.get(a.i) - posicao.get(b.i) : (a, b) => a.o - b.o;
      lista = [...lista].sort(o === 'menor' ? (a, b) => a.p - b.p : o === 'maior' ? (a, b) => b.p - a.p : o === 'az' ? (a, b) => `${a.m} ${a.n}`.localeCompare(`${b.m} ${b.n}`, 'pt') : relevancia);
      resultado = lista;
      if (!manterQtd) mostrando = POR;
      grade.innerHTML = lista.slice(0, mostrando).map(cardHtml).join('');
      conta.textContent = `${lista.length} ${lista.length === 1 ? 'perfume' : 'perfumes'}`;
      vazia.hidden = lista.length > 0;
      mais.hidden = lista.length <= mostrando;
      // endereço guarda os filtros (dá pra mandar o link filtrado)
      const p = new URLSearchParams();
      if (texto) p.set('busca', texto);
      if (f.marca?.value) p.set('marca', f.marca.value);
      if (f.preco.value) p.set('preco', f.preco.value);
      if (o) p.set('ordem', o);
      history.replaceState(null, '', `${location.pathname}${p.toString() ? '?' + p : ''}`);
      if (rolar) listagem.querySelector('.filtros').scrollIntoView({ block: 'start', behavior: reduzir ? 'auto' : 'smooth' });
    }
    let espera;
    f.busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => aplicar(), 160); });
    [f.marca, f.preco, f.ordem].forEach((s) => s?.addEventListener('change', () => aplicar()));
    mais.addEventListener('click', () => {
      const antes = mostrando;
      mostrando += POR;
      grade.insertAdjacentHTML('beforeend', resultado.slice(antes, mostrando).map(cardHtml).join(''));
      mais.hidden = resultado.length <= mostrando;
      grade.children[antes]?.querySelector('a:not([tabindex])')?.focus({ preventScroll: true });
    });
    // chips de linha mantêm os outros filtros
    $$('[data-linha-chip]', listagem).forEach((chip) => chip.addEventListener('click', (e) => {
      const p = new URLSearchParams(location.search);
      if (p.toString()) { e.preventDefault(); location.href = `${chip.getAttribute('href')}?${p}`; }
    }));
    if ([...q.keys()].length) aplicar();
    else {
      // pré-carrega o catálogo sem disputar o carregamento: no primeiro toque nos filtros ou quando o navegador ficar livre
      const filtros = $('.filtros', listagem);
      ['pointerover', 'focusin', 'touchstart'].forEach((ev) => filtros.addEventListener(ev, catalogo, { once: true, passive: true }));
      ocioso(catalogo, 4000);
    }
  }

  // ---------- galeria do produto ----------
  const principal = $('[data-galeria]');
  if (principal) {
    $$('[data-foto]').forEach((b) => b.addEventListener('click', () => {
      const img = principal.querySelector('img');
      const f = b.dataset.foto;
      img.srcset = `/img/p/${f}-400.webp 400w, /img/p/${f}-800.webp 800w`;
      img.src = `/img/p/${f}-800.webp`;
      $$('[data-foto]').forEach((x) => x.setAttribute('aria-current', String(x === b)));
    }));
  }

  // fita de marcas só anda depois do primeiro gesto (rolar, mouse, toque, tecla): parada no carregamento, não segura o Speed Index
  const andarFita = () => {
    document.documentElement.classList.add('fita-anda');
    ['scroll', 'pointermove', 'touchstart', 'keydown'].forEach((ev) => removeEventListener(ev, andarFita));
  };
  ['scroll', 'pointermove', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, andarFita, { passive: true }));

  // ---------- carrossel com setas ----------
  $$('[data-carrossel]').forEach((c) => {
    const trilho = $('[data-trilho]', c);
    const [esq, dir] = $$('[data-seta]', c);
    let quadro = 0;
    const atualizar = () => {
      quadro = 0;
      esq.disabled = trilho.scrollLeft < 8;
      dir.disabled = trilho.scrollLeft + trilho.clientWidth >= trilho.scrollWidth - 8;
    };
    trilho.addEventListener('scroll', () => { quadro ||= requestAnimationFrame(atualizar); }, { passive: true });
    $$('[data-seta]', c).forEach((b) => b.addEventListener('click', () => {
      const card = trilho.querySelector('.card');
      const passo = card ? card.getBoundingClientRect().width + (parseFloat(getComputedStyle(trilho).columnGap) || 0) : 300;
      const quantos = Math.max(1, Math.floor((trilho.clientWidth * 0.8) / passo));
      trilho.scrollBy({ left: Number(b.dataset.seta) * passo * quantos, behavior: reduzir ? 'auto' : 'smooth' });
    }));
    ocioso(atualizar, 1500);
  });

  // ---------- revelação no scroll (só transform e opacity) ----------
  if (!reduzir && 'IntersectionObserver' in window) ocioso(() => {
    const alvos = $$('.faixa__topo, .marcas__topo, .marcas__lista, .passos, .duvidas h2, .linha__txt');
    // sem getBoundingClientRect: o primeiro aviso do observer diz quem já está na tela
    const vistos = new WeakSet();
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      const el = en.target;
      if (!vistos.has(el)) {
        vistos.add(el);
        if (en.isIntersecting) { io.unobserve(el); return; } // já na tela: sem animação
        el.classList.add('revela');
        return;
      }
      if (en.isIntersecting) { el.classList.add('visto'); io.unobserve(el); }
    }), { rootMargin: '0px 0px -8% 0px' });
    alvos.forEach((el) => {
      io.observe(el);
    });
  }, 1200);
})();
