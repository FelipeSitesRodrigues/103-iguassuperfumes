/**
 * Roda um arquivo SQL no banco da Iguassu (consultas avulsas).
 * Migration de esquema não passa por aqui: use aplicar-migracao.mjs, que grava
 * no histórico.
 *
 *   node --env-file=.env.supabase.local scripts/rodar-sql.mjs arquivo.sql
 */
import { readFileSync } from 'node:fs'
import { sql } from './supabase-api.mjs'

const arquivo = process.argv[2]
if (!arquivo) {
  console.error('Uso: rodar-sql.mjs <arquivo.sql>')
  process.exit(1)
}

try {
  const linhas = await sql(readFileSync(arquivo, 'utf8'))
  console.log(`ok ${arquivo}`)
  if (Array.isArray(linhas) && linhas.length) console.table(linhas.slice(0, 50))
} catch (erro) {
  console.error(`ERRO ${arquivo}: ${erro.message}`)
  process.exit(1)
}
