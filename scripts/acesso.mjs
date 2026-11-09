/**
 * Login do painel.
 *
 *   node --env-file=.env.local scripts/acesso.mjs dono <email> "<Nome>"   cria (ou promove) o dono
 *   node --env-file=.env.local scripts/acesso.mjs senha <email>            gera senha nova
 *
 * O cadastro aberto está desligado no Supabase: só entra quem for criado aqui.
 * A senha vai pra .convites/ (fora do Git) e não aparece no terminal.
 */
import { randomInt } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY, PAINEL_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) { console.error('Rode com --env-file=.env.local'); process.exit(1); }
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const [acao, emailBruto, nome] = process.argv.slice(2);
const email = String(emailBruto ?? '').trim().toLowerCase();
if (!['dono', 'senha'].includes(acao) || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) {
  console.error('Uso: acesso.mjs dono <email> "<Nome>" | senha <email>');
  process.exit(1);
}

function senhaForte() {
  const palavras = ['ambar', 'oud', 'rosa', 'baunilha', 'cedro', 'musgo', 'jasmim', 'canela', 'limao', 'lavanda', 'sandalo', 'vetiver',
    'frasco', 'nota', 'fundo', 'topo', 'brisa', 'areia', 'cristal', 'ouro', 'seda', 'tarde', 'noite', 'serra', 'rio', 'lago'];
  const p = () => { const w = palavras[randomInt(palavras.length)]; return w[0].toUpperCase() + w.slice(1); };
  return `${p()}-${p()}-${p()}-${randomInt(100, 1000)}`;
}
function guardar(senha) {
  mkdirSync('.convites', { recursive: true });
  const arquivo = `.convites/${email.split('@')[0]}.txt`;
  writeFileSync(arquivo, ['Painel da Iguassu de Parfum', '', `Endereço: ${PAINEL_URL ?? '(endereço do site)/painel/'}`, `E-mail: ${email}`, `Senha: ${senha}`, ''].join('\n'), { mode: 0o600 });
  console.log(`Acesso gravado em ${arquivo}. Mande numa conversa particular e apague o arquivo.`);
}
const { data: lista, error: e0 } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (e0) throw e0;
let usuario = lista.users.find((u) => u.email === email) ?? null;

if (acao === 'dono') {
  if (!nome || nome.trim().length < 2) { console.error('Informe o nome.'); process.exit(1); }
  if (!usuario) {
    const senha = senhaForte();
    const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
    if (error) throw error;
    usuario = data.user;
    guardar(senha);
  } else {
    console.log('Login já existia: senha mantida.');
  }
  const { error } = await admin.from('donos').upsert({ user_id: usuario.id, nome: nome.trim() });
  if (error) throw error;
  console.log(`${nome} é dono do painel.`);
} else {
  if (!usuario) { console.error('Não existe login com esse e-mail.'); process.exit(1); }
  const senha = senhaForte();
  const { error } = await admin.auth.admin.updateUserById(usuario.id, { password: senha });
  if (error) throw error;
  guardar(senha);
}
