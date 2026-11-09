// Confere as regras do banco com a chave pública: visitante lê e não escreve; dono escreve.
//   node --env-file=.env.local scripts/testar-acesso.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL: url, SUPABASE_CHAVE_PUBLICA: chave } = process.env;
const ok = (cond, txt) => { console.log(`${cond ? 'ok  ' : 'FALHOU'} ${txt}`); if (!cond) process.exitCode = 1; };
const anon = createClient(url, chave, { auth: { persistSession: false } });

const { data: lidos } = await anon.from('perfumes').select('id, codigo, preco_centavos').limit(1);
ok(lidos?.length === 1, 'visitante lê perfume');
const alvo = lidos[0];
const { data: mudou } = await anon.from('perfumes').update({ preco_centavos: 1 }).eq('id', alvo.id).select();
ok(!mudou?.length, 'visitante não muda preço');
const { error: eIns } = await anon.from('marcas').insert({ nome: 'Teste', slug: 'teste' });
ok(!!eIns, 'visitante não cria marca');
const { error: eCfg } = await anon.from('configuracoes').update({ whatsapp: '5511999999999' }).eq('id', true);
const { data: cfg } = await anon.from('configuracoes').select('whatsapp').single();
ok(cfg.whatsapp !== '5511999999999', `visitante não muda o WhatsApp${eCfg ? '' : ' (sem erro, mas sem efeito)'}`);
const { data: pub } = await anon.from('site_publicacao').select('*');
ok(!pub?.length, 'visitante não lê a fila de publicação');
const { error: eUp } = await anon.storage.from('perfumes').upload('p/teste.webp', new Blob(['x'], { type: 'image/webp' }));
ok(!!eUp, 'visitante não sobe foto');
const { error: eSign } = await anon.auth.signUp({ email: 'qualquer@exemplo.com', password: 'SenhaQualquer123' });
ok(!!eSign, 'cadastro aberto desligado');

const convite = readFileSync('.convites/iguassudeparfum.txt', 'utf8');
const email = convite.match(/E-mail: (.+)/)[1].trim();
const senha = convite.match(/Senha: (.+)/)[1].trim();
const dono = createClient(url, chave, { auth: { persistSession: false } });
const { error: eLogin } = await dono.auth.signInWithPassword({ email, password: senha });
ok(!eLogin, 'dono entra');
const { data: m2 } = await dono.from('perfumes').update({ preco_centavos: alvo.preco_centavos }).eq('id', alvo.id).select();
ok(m2?.length === 1, 'dono muda perfume');
const { data: p2 } = await dono.from('site_publicacao').select('status, pendente').single();
ok(!!p2, `dono lê a publicação (status ${p2?.status}, pendente ${p2?.pendente})`);
const { error: eF } = await dono.storage.from('perfumes').upload('o/teste-acesso.webp', new Blob(['x'], { type: 'image/webp' }), { upsert: true });
ok(!eF, 'dono sobe foto');
const { error: eD } = await dono.storage.from('perfumes').remove(['o/teste-acesso.webp']);
ok(!eD, 'dono apaga foto');
