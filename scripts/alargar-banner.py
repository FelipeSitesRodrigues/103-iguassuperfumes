"""Alarga o banner do ChatGPT (1536x1024) pra 1920x600 de e-commerce.
Recorta a faixa dos frascos e estende o lado esquerdo (fundo escuro) espelhando
e desfocando a borda, que vai escurecendo pra receber o título do site.
  python alargar-banner.py entrada.png saida.jpg [topo] [altura]
"""
import sys
from PIL import Image, ImageFilter, ImageOps
import numpy as np

ent, sai = sys.argv[1], sys.argv[2]
topo = int(sys.argv[3]) if len(sys.argv) > 3 else 165
alt = int(sys.argv[4]) if len(sys.argv) > 4 else 640
im = Image.open(ent).convert('RGB')
faixa = im.crop((0, topo, im.width, topo + alt))
larg = round(alt * 1920 / 600)
extra = larg - faixa.width
if extra > 0:
    # espelha a borda esquerda, desfoca cada vez mais longe da emenda
    fonte = faixa.crop((0, 0, min(extra, faixa.width), alt))
    esp = ImageOps.mirror(fonte)
    if esp.width < extra:
        esp = esp.resize((extra, alt))
    leve = esp.filter(ImageFilter.GaussianBlur(6))
    forte = esp.filter(ImageFilter.GaussianBlur(28))
    a = np.asarray(leve, dtype=np.float32); b = np.asarray(forte, dtype=np.float32)
    t = np.linspace(1, 0, extra)[None, :, None]  # 0 na emenda, 1 na ponta esquerda
    mix = a * (1 - t) + b * t
    mix *= (1 - 0.55 * t)  # escurece rumo à esquerda
    ext = Image.fromarray(mix.clip(0, 255).astype(np.uint8))
    tela = Image.new('RGB', (larg, alt))
    tela.paste(ext, (0, 0)); tela.paste(faixa, (extra, 0))
    # costura: funde 60 px em volta da emenda
    c = 60
    reg = np.asarray(tela.crop((extra - c, 0, extra + c, alt)), dtype=np.float32)
    suave = np.asarray(tela.crop((extra - c, 0, extra + c, alt)).filter(ImageFilter.GaussianBlur(5)), dtype=np.float32)
    w = (1 - np.abs(np.linspace(-1, 1, 2 * c)))[None, :, None]
    tela.paste(Image.fromarray((reg * (1 - w) + suave * w).astype(np.uint8)), (extra - c, 0))
else:
    tela = faixa.crop((faixa.width - larg, 0, faixa.width, alt))
tela = tela.resize((1920, 600), Image.LANCZOS)
tela.save(sai, quality=92)
print(sai, tela.size, 'estendido', max(extra, 0), 'px')
