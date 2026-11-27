"""Arma las dos salidas del prototipo a partir de src/.

index.html   un solo archivo, para el artefacto de Claude.
sitio/       la web publicable e instalable en el teléfono (cualquier hosting estático).
"""
import hashlib
import json
import pathlib
import shutil

raiz = pathlib.Path(__file__).parent
src = raiz / "src"
sitio = raiz / "sitio"


def leer(nombre):
    return (src / nombre).read_text(encoding="utf-8")


def armar(extra):
    html = leer("plantilla.html")
    partes = {"/*ESTILOS*/": leer("estilos.css"), "/*LOGICA*/": leer("logica.js"), "/*VISTAS*/": leer("vistas.js")}
    partes.update(extra)
    for marca, texto in partes.items():
        assert html.count(marca) == 1, marca
        if marca.startswith("/*"):  # lo que va dentro de <style> o <script> no puede cerrarlos
            assert "</script" not in texto.lower() and "</style" not in texto.lower(), marca
        html = html.replace(marca, texto)
    return html


CABEZA = """<meta name="robots" content="noindex">
<meta name="theme-color" content="#1A2233">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="iconos/icono-192.png">
<link rel="apple-touch-icon" href="iconos/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Plataforma">
<style>@font-face{font-family:"Overpass";font-style:normal;font-weight:100 900;font-display:swap;src:url(tipografia/overpass-latin-wght-normal.woff2) format("woff2")}</style>"""

FUENTE_EXTERNA = '<link href="https://fonts.googleapis.com/css2?family=Overpass:wght@400;600;800&display=swap" rel="stylesheet">\n'

INSTALAR = """<section class="instalar" id="instalar" hidden aria-label="Instalar la aplicación">
  <p id="instalar-texto"></p>
  <button class="btn chico primario" type="button" id="instalar-si">Instalar</button>
  <button class="btn chico" type="button" id="instalar-no">Ahora no</button>
</section>"""

CABECERAS = """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(self), camera=(self)
/
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
/tipografia/*
  Cache-Control: public, max-age=31536000, immutable
"""

FONDO, APAGADA, VERDE = "#1A2233", "#35425F", "#27B56C"


def icono(lado, margen, redondeado):
    """Tres luces en vertical sobre la carcasa: la de abajo, en verde.
    `margen` es la fracción libre arriba y abajo; el ícono adaptable de Android pide más aire."""
    from PIL import Image, ImageDraw

    k = 4
    n = lado * k
    im = Image.new("RGBA", (n, n), FONDO)
    d = ImageDraw.Draw(im)
    util = n * (1 - 2 * margen)
    diam = util * 0.27
    paso = (util - diam) / 2
    for i, color in enumerate([APAGADA, APAGADA, VERDE]):
        cy = n * margen + diam / 2 + i * paso
        d.ellipse([n / 2 - diam / 2, cy - diam / 2, n / 2 + diam / 2, cy + diam / 2], fill=color)
    if redondeado:
        mascara = Image.new("L", (n, n), 0)
        ImageDraw.Draw(mascara).rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.22), fill=255)
        im.putalpha(mascara)
    else:
        im = im.convert("RGB")
    return im.resize((lado, lado), Image.LANCZOS)


def armar_sitio():
    (sitio / "iconos").mkdir(parents=True, exist_ok=True)
    html = armar({"<!--CABEZA-->": CABEZA, "<!--INSTALAR-->": INSTALAR, "/*SITIO*/": leer("sitio.js")})
    viejo = "<title>Prototipo de fichaje y jornadas</title>"
    assert html.count(viejo) == 1
    html = html.replace(viejo, "<title>Plataforma de trabajo</title>")
    # La tipografía se sirve desde el propio sitio: funciona sin conexión y no depende de terceros.
    assert html.count(FUENTE_EXTERNA) == 1
    html = html.replace(FUENTE_EXTERNA, "")
    (sitio / "index.html").write_text(html, encoding="utf-8")
    (sitio / "tipografia").mkdir(exist_ok=True)
    fuentes = ["overpass-latin-wght-normal.woff2", "LICENCIA-Overpass.txt"]
    for nombre in fuentes:
        shutil.copyfile(src / "tipografia" / nombre, sitio / "tipografia" / nombre)

    manifest = leer("manifest.webmanifest")
    json.loads(manifest)
    (sitio / "manifest.webmanifest").write_text(manifest, encoding="utf-8")

    iconos = {
        "icono-192.png": (192, 0.15, True),
        "icono-512.png": (512, 0.15, True),
        "icono-adaptable-512.png": (512, 0.22, False),
        "apple-touch-icon.png": (180, 0.15, False),
    }
    try:
        for nombre, medidas in iconos.items():
            icono(*medidas).save(sitio / "iconos" / nombre, optimize=True)
    except ImportError:
        # Sin Pillow no se pueden redibujar: sirven los que ya están en el repositorio.
        faltan = [n for n in iconos if not (sitio / "iconos" / n).exists()]
        assert not faltan, "Instalá Pillow (pip install pillow) para generar los íconos: " + ", ".join(faltan)
        print("aviso: sin Pillow, se conservan los íconos existentes")

    base = ["./", "manifest.webmanifest", "tipografia/" + fuentes[0]] + ["iconos/" + n for n in iconos]
    huella = hashlib.sha256()
    for ruta in [sitio / "index.html", sitio / "manifest.webmanifest", sitio / "tipografia" / fuentes[0]] + [sitio / "iconos" / n for n in iconos]:
        huella.update(ruta.read_bytes())
    sw = leer("sw.js")
    assert sw.count("__VERSION__") == 1 and sw.count("__BASE__") == 1
    sw = sw.replace("__VERSION__", huella.hexdigest()[:12]).replace("__BASE__", json.dumps(base))
    (sitio / "sw.js").write_text(sw, encoding="utf-8")

    (sitio / "_headers").write_text(CABECERAS, encoding="utf-8")
    (sitio / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    return len(html.encode("utf-8")), huella.hexdigest()[:12]


artefacto = armar({"<!--CABEZA-->\n": "", "<!--INSTALAR-->\n": "", "/*SITIO*/\n": ""})
(raiz / "index.html").write_text(artefacto, encoding="utf-8")
print("index.html", len(artefacto.encode("utf-8")), "bytes")
peso, version = armar_sitio()
print("sitio/index.html", peso, "bytes, versión", version)
