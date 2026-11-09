-- ============================================================================
-- Iguassu de Parfum · fotos
--
-- Bucket público só pra leitura pela URL (o build baixa daí). Só o dono sobe,
-- troca e apaga. O painel reencoda cada foto no navegador antes de subir
-- (WebP 400 e 800), por isso 2 MB e só WebP/JPEG bastam.
--
--   perfumes/p/<caminho>-400.webp  e  -800.webp     fotos dos perfumes
--   perfumes/b/<nome>-<largura>.webp                banners trocados pelo painel
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('perfumes', 'perfumes', true, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy perfumes_dono_ler on storage.objects for select to authenticated
  using (bucket_id = 'perfumes' and (select public.e_dono()));
create policy perfumes_dono_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'perfumes' and (select public.e_dono()));
create policy perfumes_dono_trocar on storage.objects for update to authenticated
  using (bucket_id = 'perfumes' and (select public.e_dono()))
  with check (bucket_id = 'perfumes' and (select public.e_dono()));
create policy perfumes_dono_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'perfumes' and (select public.e_dono()));
