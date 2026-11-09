-- ============================================================================
-- Iguassu de Parfum · foto nova sobe inteira e o build faz os tamanhos
--
-- As fotos da carga inicial já estão no bucket em 400 e 800 (p/<caminho>-400.webp).
-- A foto que o Eduardo sobe pelo painel vai uma vez só, reduzida no aparelho
-- (até 1600 px, WebP ou JPEG no Safari), em o/<caminho>.<ext>; o build do site
-- gera os 400 e 800 com o fundo branco quadrado, igual às outras.
-- Banner trocado no painel: b/<nome>.<ext>, o build recorta nos tamanhos do site.
-- ============================================================================

alter table public.perfume_fotos
  add column arquivo text check (arquivo ~ '^o/[a-z0-9-]{1,80}\.(webp|jpg)$');

alter table public.configuracoes drop constraint configuracoes_banner_desktop_check;
alter table public.configuracoes drop constraint configuracoes_banner_mobile_check;
alter table public.configuracoes
  add constraint configuracoes_banner_desktop_check check (banner_desktop ~ '^(b/[a-z0-9-]{1,80}\.(webp|jpg))?$'),
  add constraint configuracoes_banner_mobile_check check (banner_mobile ~ '^(b/[a-z0-9-]{1,80}\.(webp|jpg))?$');
