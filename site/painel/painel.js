// Painel da Iguassu de Parfum. Fala direto com o Supabase pela chave pública:
// quem decide o que cada um pode fazer é o RLS do banco (supabase/migrations).
// Cada mudança marca o site pra republicar; o pg_cron chama o deploy hook.
import { createClient } from '@supabase/supabase-js';

const URL_SB = __SUPABASE_URL__;
const CHAVE = __SUPABASE_CHAVE__;
const PUB = `${URL_SB}/storage/v1/object/public/perfumes`;
const sb = createClient(URL_SB, CHAVE, { auth: { persistSession: true, autoRefreshToken: true } });

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugify = (s) => semAcento(s).toLowerCase().replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const real = (c) => fmt.format(c / 100);
const paraCentavos = (txt) => {
  const t = String(txt ?? '').trim().replace(/[^\d,.]/g, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const v = Math.round(parseFloat(normal) * 100);
  return Number.isFinite(v) ? v : NaN;
};
const centavosTexto = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
const aleatorio = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

const estado = { marcas: [], perfumes: [], filtro: 'todos', busca: '', mostrando: 60, config: null };
const marcaDe = (id) => estado.marcas.find((m) => m.id === id);
const fotoUrl = (f, w = 400) => (f.arquivo ? `${PUB}/${f.arquivo}` : `${PUB}/p/${f.caminho}-${w}.webp`);

// ---------- aviso ----------
let avisoTempo;
function avisar(txt, tipo = 'ok') {
  const a = $('#aviso');
  a.textContent = txt;
  a.dataset.tipo = tipo;
  a.classList.add('aberto');
  clearTimeout(avisoTempo);
  avisoTempo = setTimeout(() => a.classList.remove('aberto'), tipo === 'erro' ? 6000 : 3000);
}
const mensagemErro = (e) => {
  const m = String(e?.message ?? e ?? '');
  if (/duplicate key.*slug/i.test(m)) return 'Já existe um perfume com esse nome e volume.';
  if (/duplicate key.*marcas_nome/i.test(m)) return 'Essa marca já existe.';
  if (/promo_centavos/i.test(m)) return 'O preço promocional precisa ser menor que o preço cheio.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão. Confira a internet e tente de novo.';
  if (/row-level security|permission denied/i.test(m)) return 'Seu login não tem permissão pra isso.';
  return m || 'Algo deu errado. Tente de novo.';
};

// ---------- entrar e sair ----------
async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return mostrarEntrar();
  const { data: dono } = await sb.from('donos').select('nome').eq('user_id', session.user.id).maybeSingle();
  if (!dono) {
    await sb.auth.signOut();
    return mostrarEntrar('Esse login não tem acesso ao painel.');
  }
  $('#entrar').hidden = true;
  $('#app').hidden = false;
  await carregarTudo();
  acompanharPublicacao();
}

function mostrarEntrar(erro) {
  $('#app').hidden = true;
  $('#entrar').hidden = false;
  const p = $('#erro-entrar');
  p.hidden = !erro;
  p.textContent = erro ?? '';
  $('#form-entrar [name=email]').focus();
}

$('#form-entrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const botao = $('button[type=submit]', f);
  botao.disabled = true;
  botao.textContent = 'Entrando…';
  const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.senha.value });
  botao.disabled = false;
  botao.textContent = 'Entrar';
  if (error) {
    const p = $('#erro-entrar');
    p.hidden = false;
    p.textContent = /invalid/i.test(error.message) ? 'E-mail ou senha errados.' : mensagemErro(error);
    return;
  }
  f.senha.value = '';
  iniciar();
});

$('#sair').addEventListener('click', async () => {
  await sb.auth.signOut();
  location.reload();
});

// ---------- dados ----------
async function carregarTudo() {
  const campos = 'id,codigo,slug,nome,linha,volume,descricao,preco_centavos,promo_centavos,disponivel,visivel,destaque_ordem,marca_id,atualizado_em,fotos:perfume_fotos(id,caminho,ordem,arquivo)';
  const [marcas, cfg] = await Promise.all([
    sb.from('marcas').select('id,nome,slug').order('nome'),
    sb.from('configuracoes').select('*').single(),
  ]);
  if (marcas.error) throw marcas.error;
  const perfumes = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from('perfumes').select(campos).order('codigo').range(i, i + 999);
    if (error) throw error;
    perfumes.push(...data);
    if (data.length < 1000) break;
  }
  perfumes.forEach((p) => p.fotos.sort((a, b) => a.ordem - b.ordem));
  estado.marcas = marcas.data;
  estado.perfumes = perfumes;
  estado.config = cfg.data;
  desenharLista();
  desenharDestaques();
  preencherLoja();
}

// ---------- lista de perfumes ----------
const textoBusca = (p) => semAcento(`${marcaDe(p.marca_id)?.nome ?? ''} ${p.nome} ${p.volume} ${p.codigo}`).toLowerCase();

function filtrados() {
  const termos = semAcento(estado.busca).toLowerCase().split(/\s+/).filter(Boolean);
  return estado.perfumes
    .filter((p) => {
      switch (estado.filtro) {
        case 'arabe': case 'importado': case 'nicho': return p.linha === estado.filtro;
        case 'esgotado': return !p.disponivel;
        case 'oculto': return !p.visivel;
        case 'semfoto': return p.fotos.length === 0;
        default: return true;
      }
    })
    .filter((p) => { const t = textoBusca(p); return termos.every((x) => t.includes(x)); })
    .sort((a, b) => (marcaDe(a.marca_id)?.nome ?? '').localeCompare(marcaDe(b.marca_id)?.nome ?? '', 'pt') || a.nome.localeCompare(b.nome, 'pt'));
}

function itemHtml(p) {
  const capa = p.fotos[0];
  const selos = [
    !p.visivel && '<span class="selo selo--oculto">Oculto</span>',
    !p.disponivel && '<span class="selo selo--esgotado">Esgotado</span>',
    p.destaque_ordem && '<span class="selo selo--destaque">Destaque</span>',
    p.promo_centavos && '<span class="selo selo--promo">Promoção</span>',
  ].filter(Boolean).join('');
  return `<li class="item${p.visivel ? '' : ' item--oculto'}" data-id="${p.id}">
  <button class="item__abrir" type="button" data-abrir>
    <span class="item__foto">${capa ? `<img src="${fotoUrl(capa)}" alt="" loading="lazy" decoding="async" width="56" height="56">` : '<span class="item__semfoto">sem foto</span>'}</span>
    <span class="item__txt"><small>${esc(marcaDe(p.marca_id)?.nome)}</small><b>${esc(p.nome)}</b><span>${esc(p.volume)}${p.volume ? ' · ' : ''}${{ arabe: 'Árabe', importado: 'Importado', nicho: 'Nicho' }[p.linha]}</span>${selos ? `<span class="item__selos">${selos}</span>` : ''}</span>
    <span class="item__preco">${p.promo_centavos ? `<s>${real(p.preco_centavos)}</s>${real(p.promo_centavos)}` : real(p.preco_centavos)}</span>
  </button>
  <label class="chave chave--mini" title="Disponível"><input type="checkbox" data-disponivel${p.disponivel ? ' checked' : ''}><span class="chave__trilho" aria-hidden="true"></span><span class="sr">Disponível</span></label>
</li>`;
}

function desenharLista() {
  const lista = filtrados();
  $('#lista').innerHTML = lista.slice(0, estado.mostrando).map(itemHtml).join('') ||
    '<li class="vazio">Nenhum perfume encontrado.</li>';
  $('#mais').hidden = lista.length <= estado.mostrando;
  const esgotados = estado.perfumes.filter((p) => !p.disponivel).length;
  $('#contagem').textContent = `${estado.perfumes.length} perfumes · ${esgotados} esgotados${lista.length !== estado.perfumes.length ? ` · ${lista.length} na busca` : ''}`;
}

let buscaTempo;
$('#busca').addEventListener('input', (e) => {
  clearTimeout(buscaTempo);
  buscaTempo = setTimeout(() => { estado.busca = e.target.value; estado.mostrando = 60; desenharLista(); }, 120);
});
$$('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
  estado.filtro = b.dataset.filtro;
  estado.mostrando = 60;
  $$('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  desenharLista();
}));
$('#mais').addEventListener('click', () => { estado.mostrando += 60; desenharLista(); });

$('#lista').addEventListener('click', (e) => {
  const abrir = e.target.closest('[data-abrir]');
  if (abrir) abrirEditor(estado.perfumes.find((p) => p.id === abrir.closest('.item').dataset.id));
});
$('#lista').addEventListener('change', async (e) => {
  const chk = e.target.closest('[data-disponivel]');
  if (!chk) return;
  const p = estado.perfumes.find((x) => x.id === chk.closest('.item').dataset.id);
  const valor = chk.checked;
  const { error } = await sb.from('perfumes').update({ disponivel: valor }).eq('id', p.id);
  if (error) { chk.checked = !valor; return avisar(mensagemErro(error), 'erro'); }
  p.disponivel = valor;
  avisar(valor ? `${p.nome} disponível de novo` : `${p.nome} marcado como esgotado`);
  desenharLista();
  publicacaoMudou();
});

// ---------- foto no aparelho ----------
// Reduz pra no máximo `lado` px e apaga EXIF/GPS no reencode. O Safari não gera
// WebP e devolve PNG: aí vai JPEG.
async function prepararImagem(arquivo, lado = 1600) {
  let bmp;
  try {
    bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Esse formato de imagem não abriu. Mande em JPG ou PNG.');
  }
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  let fonte = bmp;
  let w = bmp.width;
  let h = bmp.height;
  const alvoW = Math.round(bmp.width * escala);
  const alvoH = Math.round(bmp.height * escala);
  while (w / 2 > alvoW) { // reduz em degraus pra não serrilhar
    const c = document.createElement('canvas');
    c.width = Math.round(w / 2); c.height = Math.round(h / 2);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fonte, 0, 0, c.width, c.height);
    fonte = c; w = c.width; h = c.height;
  }
  const tela = document.createElement('canvas');
  tela.width = alvoW; tela.height = alvoH;
  const ctx = tela.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, alvoW, alvoH);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fonte, 0, 0, alvoW, alvoH);
  bmp.close();
  const gerar = (tipo, q) => new Promise((ok) => tela.toBlob(ok, tipo, q));
  let blob = await gerar('image/webp', 0.86);
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') { blob = await gerar('image/jpeg', 0.88); ext = 'jpg'; }
  if (!blob) throw new Error('Não consegui preparar a imagem neste aparelho.');
  if (blob.size > 2 * 1024 * 1024) blob = await gerar(ext === 'webp' ? 'image/webp' : 'image/jpeg', 0.72);
  return { blob, ext, largura: alvoW, altura: alvoH };
}

// ---------- editor ----------
const editor = $('#editor');
const form = $('#form-perfume');
let atual = null; // perfume aberto (null = novo)
let fotosEdit = [];

function opcoesMarca(selecionada) {
  form.marca_id.innerHTML = '<option value="">Escolha a marca</option>' +
    estado.marcas.map((m) => `<option value="${m.id}"${m.id === selecionada ? ' selected' : ''}>${esc(m.nome)}</option>`).join('') +
    '<option value="__nova">+ Marca nova…</option>';
}
form.marca_id.addEventListener('change', () => {
  const nova = form.marca_id.value === '__nova';
  $('#campo-marca-nova').hidden = !nova;
  if (nova) form.marca_nova.focus();
});

function abrirEditor(p = null) {
  atual = p;
  form.reset();
  $('.erro', form).hidden = true;
  $('#editor-titulo').textContent = p ? `${marcaDe(p.marca_id)?.nome ?? ''} ${p.nome}` : 'Novo perfume';
  opcoesMarca(p?.marca_id);
  $('#campo-marca-nova').hidden = true;
  form.nome.value = p?.nome ?? '';
  form.linha.value = p?.linha ?? 'arabe';
  form.volume.value = p?.volume ?? '100 ml';
  form.preco.value = centavosTexto(p?.preco_centavos);
  form.promo.value = centavosTexto(p?.promo_centavos);
  form.descricao.value = p?.descricao ?? '';
  form.disponivel.checked = p ? p.disponivel : true;
  form.visivel.checked = p ? p.visivel : true;
  form.destaque.checked = !!p?.destaque_ordem;
  $('#excluir').hidden = !p;
  fotosEdit = (p?.fotos ?? []).map((f) => ({ ...f, url: fotoUrl(f, 400) }));
  desenharFotos();
  editor.showModal();
  if (!p) form.marca_id.focus();
}
$$('[data-fechar]', editor).forEach((b) => b.addEventListener('click', () => editor.close()));
editor.addEventListener('click', (e) => { if (e.target === editor) editor.close(); });
$('#novo').addEventListener('click', () => abrirEditor(null));

function desenharFotos() {
  const vivas = fotosEdit.filter((f) => !f.removida);
  $('#fotos').innerHTML = vivas.map((f, i) => `<li class="foto${i === 0 ? ' foto--capa' : ''}" data-i="${fotosEdit.indexOf(f)}">
  <img src="${f.url}" alt="">
  ${i === 0 ? '<span class="foto__capa">Capa</span>' : ''}
  <span class="foto__acoes">
    <button type="button" data-mover="-1" aria-label="Mover pra esquerda"${i === 0 ? ' disabled' : ''}>‹</button>
    <button type="button" data-tirar aria-label="Tirar foto">×</button>
    <button type="button" data-mover="1" aria-label="Mover pra direita"${i === vivas.length - 1 ? ' disabled' : ''}>›</button>
  </span>
</li>`).join('');
}
$('#fotos').addEventListener('click', (e) => {
  const li = e.target.closest('.foto');
  if (!li) return;
  const f = fotosEdit[Number(li.dataset.i)];
  if (e.target.closest('[data-tirar]')) {
    if (f.novo) { URL.revokeObjectURL(f.url); fotosEdit.splice(fotosEdit.indexOf(f), 1); } else f.removida = true;
    return desenharFotos();
  }
  const mover = e.target.closest('[data-mover]');
  if (mover) {
    const vivas = fotosEdit.filter((x) => !x.removida);
    const i = vivas.indexOf(f);
    const j = i + Number(mover.dataset.mover);
    [vivas[i], vivas[j]] = [vivas[j], vivas[i]];
    fotosEdit = [...vivas, ...fotosEdit.filter((x) => x.removida)];
    desenharFotos();
  }
});
$('#fotos-input').addEventListener('change', async (e) => {
  const arquivos = [...e.target.files];
  e.target.value = '';
  const rotulo = $('.fotos__add');
  rotulo.classList.add('carregando');
  for (const arq of arquivos) {
    try {
      const pronta = await prepararImagem(arq);
      fotosEdit.push({ novo: pronta, url: URL.createObjectURL(pronta.blob) });
      desenharFotos();
    } catch (erro) {
      avisar(mensagemErro(erro), 'erro');
    }
  }
  rotulo.classList.remove('carregando');
});

function erroForm(txt) {
  const p = $('.erro', form);
  p.hidden = false;
  p.textContent = txt;
}

async function garantirMarca() {
  if (form.marca_id.value !== '__nova') return form.marca_id.value;
  const nome = form.marca_nova.value.trim().replace(/\s+/g, ' ');
  if (!nome) throw new Error('Escreva o nome da marca nova.');
  const existente = estado.marcas.find((m) => semAcento(m.nome).toLowerCase() === semAcento(nome).toLowerCase());
  if (existente) return existente.id;
  const { data, error } = await sb.from('marcas').insert({ nome, slug: slugify(nome) || `marca-${aleatorio(4)}` }).select('id,nome,slug').single();
  if (error) throw error;
  estado.marcas.push(data);
  estado.marcas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  return data.id;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  $('.erro', form).hidden = true;
  const nome = form.nome.value.trim().replace(/\s+/g, ' ');
  const volume = form.volume.value.trim().replace(/\s*ml$/i, ' ml').replace(/^(\d+)ml$/i, '$1 ml');
  const preco = paraCentavos(form.preco.value);
  const promo = paraCentavos(form.promo.value);
  if (!form.marca_id.value) return erroForm('Escolha a marca.');
  if (!nome) return erroForm('Escreva o nome do perfume.');
  if (preco == null || Number.isNaN(preco) || preco <= 0) return erroForm('Preço inválido. Use, por exemplo, 169,90.');
  if (Number.isNaN(promo) || (promo != null && promo >= preco)) return erroForm('O preço promocional precisa ser menor que o preço cheio.');

  const botao = $('button[type=submit]', form);
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    const marca_id = await garantirMarca();
    const linha = form.linha.value;
    let destaque_ordem = atual?.destaque_ordem ?? null;
    if (form.destaque.checked && !destaque_ordem) {
      destaque_ordem = Math.min(99, Math.max(0, ...estado.perfumes.filter((p) => p.linha === linha && p.destaque_ordem).map((p) => p.destaque_ordem)) + 1);
    }
    if (!form.destaque.checked) destaque_ordem = null;
    const dados = {
      marca_id, nome, linha, volume,
      preco_centavos: preco,
      promo_centavos: promo,
      descricao: form.descricao.value.trim(),
      disponivel: form.disponivel.checked,
      visivel: form.visivel.checked,
      destaque_ordem,
    };
    let salvo;
    if (atual) {
      const { data, error } = await sb.from('perfumes').update(dados).eq('id', atual.id).select().single();
      if (error) throw error;
      salvo = data;
    } else {
      // endereço da página: marca + nome + volume (não muda depois, pra link enviado não quebrar)
      let slug = slugify(`${marcaDe(marca_id).nome} ${nome} ${volume}`);
      if (estado.perfumes.some((p) => p.slug === slug)) slug = `${slug}-${aleatorio(4)}`;
      const { data, error } = await sb.from('perfumes').insert({ ...dados, slug }).select().single();
      if (error) throw error;
      salvo = data;
    }

    // fotos: tira as removidas, sobe as novas, grava a ordem
    const removidas = fotosEdit.filter((f) => f.removida && f.id);
    if (removidas.length) {
      const { error } = await sb.from('perfume_fotos').delete().in('id', removidas.map((f) => f.id));
      if (error) throw error;
      const arquivos = removidas.flatMap((f) => (f.arquivo ? [f.arquivo] : [`p/${f.caminho}-400.webp`, `p/${f.caminho}-800.webp`]));
      await sb.storage.from('perfumes').remove(arquivos); // se falhar, sobra só arquivo solto no bucket
    }
    const vivas = fotosEdit.filter((f) => !f.removida);
    for (const [ordem, f] of vivas.entries()) {
      if (f.novo) {
        botao.textContent = `Enviando foto ${ordem + 1}…`;
        const caminho = `${salvo.codigo}-${aleatorio(6)}`;
        const arquivo = `o/${caminho}.${f.novo.ext}`;
        const up = await sb.storage.from('perfumes').upload(arquivo, f.novo.blob, { contentType: f.novo.blob.type, cacheControl: '31536000' });
        if (up.error) throw up.error;
        const { error } = await sb.from('perfume_fotos').insert({ perfume_id: salvo.id, caminho, arquivo, ordem });
        if (error) throw error;
      } else if (f.ordem !== ordem) {
        const { error } = await sb.from('perfume_fotos').update({ ordem }).eq('id', f.id);
        if (error) throw error;
      }
    }
    const { data: fotos } = await sb.from('perfume_fotos').select('id,caminho,ordem,arquivo').eq('perfume_id', salvo.id).order('ordem');
    salvo.fotos = fotos ?? [];
    fotosEdit.forEach((f) => f.novo && URL.revokeObjectURL(f.url));

    const i = estado.perfumes.findIndex((p) => p.id === salvo.id);
    if (i >= 0) estado.perfumes[i] = salvo; else estado.perfumes.push(salvo);
    editor.close();
    desenharLista();
    desenharDestaques();
    avisar(atual ? 'Perfume salvo' : 'Perfume cadastrado');
    publicacaoMudou();
  } catch (erro) {
    erroForm(mensagemErro(erro));
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar';
  }
});

$('#excluir').addEventListener('click', async () => {
  if (!atual) return;
  if (!confirm(`Excluir ${marcaDe(atual.marca_id)?.nome ?? ''} ${atual.nome} de vez? Se for só por um tempo, desligue "Aparece no site".`)) return;
  const { error } = await sb.from('perfumes').delete().eq('id', atual.id);
  if (error) return erroForm(mensagemErro(error));
  const arquivos = atual.fotos.flatMap((f) => (f.arquivo ? [f.arquivo] : [`p/${f.caminho}-400.webp`, `p/${f.caminho}-800.webp`]));
  if (arquivos.length) await sb.storage.from('perfumes').remove(arquivos);
  estado.perfumes = estado.perfumes.filter((p) => p.id !== atual.id);
  editor.close();
  desenharLista();
  desenharDestaques();
  avisar('Perfume excluído');
  publicacaoMudou();
});

// ---------- destaques ----------
const ordemDestaque = { arabe: [], importado: [], nicho: [] };
function desenharDestaques(recarregar = true) {
  for (const linha of ['arabe', 'importado', 'nicho']) {
    if (recarregar) {
      ordemDestaque[linha] = estado.perfumes.filter((p) => p.linha === linha && p.destaque_ordem)
        .sort((a, b) => a.destaque_ordem - b.destaque_ordem).map((p) => p.id);
    }
    const col = $(`.destaque-col[data-linha="${linha}"]`);
    const ids = ordemDestaque[linha];
    $('.ordem', col).innerHTML = ids.map((id, i) => {
      const p = estado.perfumes.find((x) => x.id === id);
      return `<li data-id="${id}"><span class="ordem__n">${i + 1}</span>${p.fotos[0] ? `<img src="${fotoUrl(p.fotos[0])}" alt="" width="40" height="40" loading="lazy">` : '<span class="item__semfoto"></span>'}<span class="ordem__txt"><small>${esc(marcaDe(p.marca_id)?.nome)}</small>${esc(p.nome)} ${esc(p.volume)}</span>
<button type="button" data-sobe aria-label="Subir"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" data-desce aria-label="Descer"${i === ids.length - 1 ? ' disabled' : ''}>↓</button><button type="button" data-remove aria-label="Tirar dos destaques">×</button></li>`;
    }).join('') || '<li class="vazio">Nenhum destaque. A faixa some da home.</li>';
  }
}
function destaquesMudaram() {
  $('#salvar-destaques').disabled = false;
  desenharDestaques(false);
}
$$('.destaque-col').forEach((col) => {
  const linha = col.dataset.linha;
  $('.ordem', col).addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const ids = ordemDestaque[linha];
    const i = ids.indexOf(li.dataset.id);
    if (e.target.closest('[data-sobe]') && i > 0) [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
    else if (e.target.closest('[data-desce]') && i < ids.length - 1) [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
    else if (e.target.closest('[data-remove]')) ids.splice(i, 1);
    else return;
    destaquesMudaram();
  });
  const input = $('input', col);
  const sug = $('.sugestoes', col);
  input.addEventListener('input', () => {
    const termos = semAcento(input.value).toLowerCase().split(/\s+/).filter(Boolean);
    if (!termos.length) { sug.innerHTML = ''; return; }
    const achados = estado.perfumes.filter((p) => p.linha === linha && p.visivel && !ordemDestaque[linha].includes(p.id))
      .filter((p) => { const t = textoBusca(p); return termos.every((x) => t.includes(x)); }).slice(0, 6);
    sug.innerHTML = achados.map((p) => `<li><button type="button" data-id="${p.id}">${esc(marcaDe(p.marca_id)?.nome)} ${esc(p.nome)} ${esc(p.volume)}</button></li>`).join('') ||
      '<li class="vazio">Nada encontrado nessa linha.</li>';
  });
  sug.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    ordemDestaque[linha].push(b.dataset.id);
    input.value = '';
    sug.innerHTML = '';
    destaquesMudaram();
  });
});
$('#salvar-destaques').addEventListener('click', async (e) => {
  const botao = e.currentTarget;
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    const nova = new Map();
    for (const linha of ['arabe', 'importado', 'nicho']) ordemDestaque[linha].forEach((id, i) => nova.set(id, Math.min(99, i + 1)));
    const mudar = estado.perfumes.filter((p) => (nova.get(p.id) ?? null) !== (p.destaque_ordem ?? null));
    for (const p of mudar) {
      const { error } = await sb.from('perfumes').update({ destaque_ordem: nova.get(p.id) ?? null }).eq('id', p.id);
      if (error) throw error;
      p.destaque_ordem = nova.get(p.id) ?? null;
    }
    desenharDestaques();
    desenharLista();
    avisar('Destaques salvos');
    publicacaoMudou();
    botao.textContent = 'Salvar ordem';
  } catch (erro) {
    avisar(mensagemErro(erro), 'erro');
    botao.disabled = false;
    botao.textContent = 'Salvar ordem';
  }
});

// ---------- loja ----------
const formLoja = $('#form-loja');
const bannersNovos = {};
const telefoneExibir = (d) => d.replace(/^55/, '').replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');
function preencherLoja() {
  const c = estado.config;
  formLoja.whatsapp.value = telefoneExibir(c.whatsapp);
  formLoja.instagram.value = c.instagram ? `@${c.instagram}` : '';
  formLoja.faixa_topo.value = c.faixa_topo;
  $$('[data-banner]', formLoja).forEach((campo) => {
    const img = $('img', campo);
    img.src = c[campo.dataset.banner] ? `${PUB}/${c[campo.dataset.banner]}` : img.dataset.padrao;
  });
}
$$('[data-banner] input[type=file]', formLoja).forEach((input) => input.addEventListener('change', async () => {
  const campo = input.closest('[data-banner]');
  const arq = input.files[0];
  input.value = '';
  if (!arq) return;
  try {
    const desktop = campo.dataset.banner === 'banner_desktop';
    const pronta = await prepararImagem(arq, desktop ? 2400 : 1400);
    const proporcao = pronta.largura / pronta.altura;
    if (desktop && proporcao < 2) avisar('Essa imagem é pouco larga: o site vai cortar bastante em cima e embaixo.', 'erro');
    if (!desktop && proporcao > 1) avisar('Essa imagem está deitada: no celular o site vai cortar as laterais.', 'erro');
    bannersNovos[campo.dataset.banner] = pronta;
    $('img', campo).src = URL.createObjectURL(pronta.blob);
  } catch (erro) {
    avisar(mensagemErro(erro), 'erro');
  }
}));
formLoja.addEventListener('submit', async (e) => {
  e.preventDefault();
  const erro = $('.erro', formLoja);
  erro.hidden = true;
  let digitos = formLoja.whatsapp.value.replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  if (!/^55\d{10,11}$/.test(digitos)) { erro.hidden = false; erro.textContent = 'WhatsApp inválido. Use DDD + número, como (45) 98811-0629.'; return; }
  const instagram = formLoja.instagram.value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
  const dados = { whatsapp: digitos, instagram, faixa_topo: formLoja.faixa_topo.value.trim() };
  const botao = $('button[type=submit]', formLoja);
  botao.disabled = true;
  botao.textContent = 'Salvando…';
  try {
    for (const [campo, pronta] of Object.entries(bannersNovos)) {
      const arquivo = `b/${campo === 'banner_desktop' ? 'desktop' : 'celular'}-${aleatorio(8)}.${pronta.ext}`;
      const up = await sb.storage.from('perfumes').upload(arquivo, pronta.blob, { contentType: pronta.blob.type, cacheControl: '31536000' });
      if (up.error) throw up.error;
      dados[campo] = arquivo;
    }
    const { data, error } = await sb.from('configuracoes').update(dados).eq('id', true).select().single();
    if (error) throw error;
    const antigos = Object.keys(bannersNovos).map((k) => estado.config[k]).filter(Boolean);
    if (antigos.length) await sb.storage.from('perfumes').remove(antigos);
    Object.keys(bannersNovos).forEach((k) => delete bannersNovos[k]);
    estado.config = data;
    preencherLoja();
    avisar('Dados da loja salvos');
    publicacaoMudou();
  } catch (er) {
    erro.hidden = false;
    erro.textContent = mensagemErro(er);
  } finally {
    botao.disabled = false;
    botao.textContent = 'Salvar dados da loja';
  }
});

// ---------- abas ----------
$$('[data-aba]').forEach((b) => b.addEventListener('click', () => {
  $$('[data-aba]').forEach((x) => x.setAttribute('aria-current', x === b ? 'page' : 'false'));
  for (const nome of ['perfumes', 'destaques', 'loja']) $(`#aba-${nome}`).hidden = nome !== b.dataset.aba;
  scrollTo({ top: 0 });
}));

// ---------- publicação do site ----------
let pubTempo;
const haQuanto = (iso) => {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
};
async function lerPublicacao() {
  const { data } = await sb.from('site_publicacao').select('status,pendente,publicado_em,erro').maybeSingle();
  const s = $('#status');
  if (!data) return;
  const txt = {
    em_dia: data.publicado_em ? `Site em dia · ${haQuanto(data.publicado_em)}` : 'Site em dia',
    aguardando: 'Atualizando o site…',
    publicando: 'Atualizando o site…',
    falhou: 'O site não atualizou',
    sem_hook: 'Atualização automática desligada',
    teto_diario: 'Limite de atualizações hoje',
  }[data.status] ?? data.status;
  s.dataset.estado = data.status;
  $('.status__txt', s).textContent = txt;
  s.title = data.erro ?? (data.status === 'sem_hook' ? 'As mudanças ficam salvas no banco e entram no site quando a publicação automática for ligada.' : 'As mudanças entram no site em 1 a 2 minutos.');
  return data;
}
function acompanharPublicacao() {
  clearTimeout(pubTempo);
  lerPublicacao().then((d) => {
    const rapido = d && ['aguardando', 'publicando'].includes(d.status);
    pubTempo = setTimeout(acompanharPublicacao, rapido ? 10000 : 60000);
  });
}
function publicacaoMudou() {
  setTimeout(acompanharPublicacao, 800);
}
$('#status').addEventListener('click', () => avisar($('#status').title));

iniciar().catch((e) => avisar(mensagemErro(e), 'erro'));
