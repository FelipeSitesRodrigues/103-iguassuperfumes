-- ============================================================================
-- Iguassu de Parfum · terceira linha (nicho) e o nome dos Hawas
--
-- 1. Pedido do Eduardo: perfumes de nicho entram como linha própria.
-- 2. A referência cadastra "Rasasi Hawas" como marca; a carga tirou o "Hawas"
--    do nome (ficou "Rasasi Black"). Hawas é a linha da Rasasi: volta pro nome
--    e pro endereço da página.
-- ============================================================================

alter table public.perfumes drop constraint perfumes_linha_check;
alter table public.perfumes add constraint perfumes_linha_check check (linha in ('arabe', 'importado', 'nicho'));

update public.perfumes p
   set nome = 'Hawas ' || p.nome,
       slug = 'rasasi-hawas-' || substring(p.slug from char_length('rasasi-') + 1)
  from public.marcas m
 where m.id = p.marca_id
   and m.slug = 'rasasi'
   and p.nome !~* '^hawas';
