"""Prepara as fotos raspadas pra vitrine: tira a faixa preta que veio em parte delas,
recorta o produto, centraliza num quadrado branco e salva em WebP 400 e 800.
  python scripts/preparar-fotos.py   (lê dados/fotos-originais, grava site/publico/img/p)
"""
import os, sys
from concurrent.futures import ProcessPoolExecutor
from PIL import Image
import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = os.path.join(RAIZ, 'dados', 'fotos-originais')
SAIDA = os.path.join(RAIZ, 'site', 'publico', 'img', 'p')
TAMANHOS = (400, 800)


def tirar_faixas(a):
    """Remove linhas e colunas da borda que são quase todas pretas (faixa da foto original)."""
    escuro = a.max(axis=2) < 45
    t, b, l, r = 0, a.shape[0], 0, a.shape[1]
    while t < b - 10 and escuro[t, l:r].mean() > 0.9: t += 1
    while b > t + 10 and escuro[b - 1, l:r].mean() > 0.9: b -= 1
    while l < r - 10 and escuro[t:b, l].mean() > 0.9: l += 1
    while r > l + 10 and escuro[t:b, r - 1].mean() > 0.9: r -= 1
    return a[t:b, l:r]


def preparar(nome):
    base = nome.rsplit('.', 1)[0]
    destinos = [os.path.join(SAIDA, f'{base}-{t}.webp') for t in TAMANHOS]
    if all(os.path.exists(d) for d in destinos):
        return 'pulado'
    try:
        im = Image.open(os.path.join(ORIG, nome)).convert('RGB')
    except Exception as e:
        return f'erro {nome}: {e}'
    a = tirar_faixas(np.asarray(im))
    # caixa do conteúdo: tudo que não é quase branco
    conteudo = a.min(axis=2) < 238
    linhas, colunas = np.where(conteudo.any(axis=1))[0], np.where(conteudo.any(axis=0))[0]
    if len(linhas) and len(colunas):
        a = a[linhas[0]:linhas[-1] + 1, colunas[0]:colunas[-1] + 1]
    h, w = a.shape[:2]
    lado = int(max(h, w) * 1.14)
    tela = Image.new('RGB', (lado, lado), 'white')
    tela.paste(Image.fromarray(a), ((lado - w) // 2, (lado - h) // 2))
    for t, d in zip(TAMANHOS, destinos):
        tela.resize((t, t), Image.LANCZOS).save(d, 'WEBP', quality=80, method=6)
    return 'ok'


if __name__ == '__main__':
    os.makedirs(SAIDA, exist_ok=True)
    nomes = sorted(f for f in os.listdir(ORIG) if f.endswith('.webp'))
    cont = {}
    with ProcessPoolExecutor() as ex:
        for r in ex.map(preparar, nomes, chunksize=16):
            k = r if r in ('ok', 'pulado') else 'erro'
            cont[k] = cont.get(k, 0) + 1
            if k == 'erro': print(r)
    print(cont)
