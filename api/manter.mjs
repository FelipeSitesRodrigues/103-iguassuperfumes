// Chamado uma vez por dia pelo cron da Vercel (vercel.json): uma leitura no banco
// pra o Supabase grátis não pausar o projeto por 7 dias sem uso.
export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/configuracoes?select=atualizado_em`, {
    headers: { apikey: process.env.SUPABASE_CHAVE_PUBLICA },
  });
  res.status(r.ok ? 200 : 502).json({ banco: r.status });
}
