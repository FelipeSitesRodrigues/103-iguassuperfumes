/**
 * Aplica as migrations de supabase/migrations no projeto da Iguassu (IGUASSU - CATALOGO) pela
 * Management API e grava no histórico de migrations do Supabase.
 *
 *   node --env-file=.env.supabase.local scripts/aplicar-migracao.mjs            (todas as pendentes)
 *   node --env-file=.env.supabase.local scripts/aplicar-migracao.mjs <arquivo>  (uma só)
 *
 * Cada arquivo roda numa transação: se der erro, nada daquele arquivo fica.
 *
 * A API grava como versão a hora em que aplicou, não o número do arquivo. Por
 * isso o nome no histórico é o nome do arquivo inteiro ("20261007200000_esquema")
 * e é por ele que o script sabe o que já foi aplicado.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { api } from './supabase-api.mjs'

const PASTA = 'supabase/migrations'

function nomeNoHistorico(arquivo) {
  const nome = basename(arquivo, '.sql')
  if (!/^\d{14}_[a-z0-9_]+$/.test(nome)) {
    console.error(`O arquivo precisa se chamar AAAAMMDDHHMMSS_nome.sql: ${arquivo}`)
    process.exit(1)
  }
  return nome
}

async function aplicadas() {
  const r = await api('/database/migrations')
  if (!r.ok) {
    console.error(`Não consegui ler o histórico (${r.status}).`)
    process.exit(1)
  }
  return new Set((Array.isArray(r.corpo) ? r.corpo : []).map((m) => m.name))
}

async function aplicar(arquivo) {
  const nome = nomeNoHistorico(arquivo)
  const r = await api('/database/migrations', {
    method: 'POST',
    body: JSON.stringify({ name: nome, query: readFileSync(arquivo, 'utf8') }),
  })
  console.log(`${r.ok ? 'ok ' : 'ERRO'} ${nome} (${r.status})`)
  if (!r.ok) {
    console.error(typeof r.corpo === 'string' ? r.corpo.slice(0, 3000) : JSON.stringify(r.corpo).slice(0, 3000))
    process.exit(1)
  }
}

const unico = process.argv[2]
if (unico) {
  await aplicar(unico)
} else {
  const feitas = await aplicadas()
  const arquivos = readdirSync(PASTA).filter((a) => a.endsWith('.sql')).sort()
  const pendentes = arquivos.filter((a) => !feitas.has(nomeNoHistorico(a)))
  if (pendentes.length === 0) console.log('Nenhuma migration pendente.')
  for (const arquivo of pendentes) await aplicar(join(PASTA, arquivo))
}
