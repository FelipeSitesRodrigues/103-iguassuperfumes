/**
 * Acesso à Management API do Supabase, pros scripts de banco.
 *
 * O token (SUPABASE_ACCESS_TOKEN) e o projeto (SUPABASE_PROJECT_REF) vêm do
 * .env.supabase.local (fora do Git e da Vercel). O token nunca é
 * impresso.
 */

const API = 'https://api.supabase.com/v1'

export function projeto() {
  const ref = process.env.SUPABASE_PROJECT_REF
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!ref || !token) {
    console.error('Rode com --env-file=.env.supabase.local (faltam SUPABASE_PROJECT_REF e SUPABASE_ACCESS_TOKEN).')
    process.exit(1)
  }
  return { ref, token }
}

export async function api(caminho, opcoes = {}) {
  const { ref, token } = projeto()
  const resposta = await fetch(`${API}/projects/${ref}${caminho}`, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...opcoes.headers },
  })
  const texto = await resposta.text()
  let corpo = texto
  try {
    corpo = JSON.parse(texto)
  } catch {}
  return { ok: resposta.ok, status: resposta.status, corpo }
}

/** Roda SQL como dono do banco. Devolve as linhas do último comando. */
export async function sql(consulta) {
  const r = await api('/database/query', { method: 'POST', body: JSON.stringify({ query: consulta }) })
  if (!r.ok) {
    const mensagem = typeof r.corpo === 'object' ? r.corpo.message ?? JSON.stringify(r.corpo) : r.corpo
    const erro = new Error(String(mensagem))
    erro.status = r.status
    throw erro
  }
  return r.corpo
}
