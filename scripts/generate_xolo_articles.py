from __future__ import annotations

from pathlib import Path
from textwrap import dedent

ARTICLES = [
    {
        "title": "El perro que cruza mundos — Xólotl, Venus y el origen del psicopompo",
        "filename": "xolo-1.html",
        "blocks": [
            {
                "type": "p",
                "text": (
                    "En la respiración antigua del Valle, el Xólotl desciende como una estrella oscura: "
                    "un perro sin pelo, un rayo de Venus reflejado en el barro, la sombra fiel que acompaña "
                    "a quienes cruzan el umbral."),
            },
            {
                "type": "h2",
                "text": "La estrella gemela y la herida luminosa",
            },
            {
                "type": "p",
                "text": (
                    "Venus abre y cierra las puertas del cielo; es lucero y es llaga. En su doble viaje "
                    "se refleja el destino del xoloitzcuintle: nacer en el brillo, morir en el crepúsculo, "
                    "acompañar al alma cuando el día se apaga y el mundo se vuelve sueño."),
            },
            {
                "type": "blockquote",
                "text": (
                    "Dicen los viejos que el perro de Xólotl bebe la luz y la devuelve como un puente de fuego, "
                    "para que los pasos no se pierdan en el río del olvido."),
            },
            {
                "type": "h2",
                "text": "El pacto del lomo tibio",
            },
            {
                "type": "p",
                "text": (
                    "El psicopompo no es solo guía: es memoria encarnada. Su piel desnuda recuerda la piel "
                    "del mundo al inicio, cuando las deidades caminaron entre los hombres. Por eso el xolo "
                    "es ofrenda viva, y su presencia en la tumba es un mapa: el cuerpo se va, pero la ruta permanece."),
            },
            {
                "type": "p",
                "text": (
                    "Cada ladrido es una sílaba del mito, cada silencio un nombre que no se pronuncia. "
                    "Y en el tránsito, el perro negro o bermejo es un hilo de Venus atado al corazón del viajero, "
                    "recordándole que el regreso también es una forma de llegar."),
            },
        ],
    },
    {
        "title": "El río que juzga — Itzcuitlán, el perro y la memoria moral",
        "filename": "xolo-2.html",
        "blocks": [
            {
                "type": "p",
                "text": (
                    "Itzcuitlán no es un río cualquiera: es un espejo que juzga. Sus aguas guardan las "
                    "huellas del vivir, y el xoloitzcuintle, con su pecho como canoa, transporta la verdad "
                    "de cada alma a través de la corriente."),
            },
            {
                "type": "h2",
                "text": "La memoria que pesa como agua",
            },
            {
                "type": "p",
                "text": (
                    "Se dice que el agua recuerda. En Itzcuitlán, ese recuerdo es una sentencia líquida: "
                    "si cuidaste, flotas; si heriste, te hundes. El perro, testigo del trato recibido, "
                    "es quien decide si su lomo se convierte en puente o en juicio."),
            },
            {
                "type": "blockquote",
                "text": (
                    "No hay juicio más antiguo que la mirada del perro: en ella se refleja el miedo y el cariño "
                    "que sembraste en la tierra."),
            },
            {
                "type": "h2",
                "text": "Aguas místicas, fidelidad sin descanso",
            },
            {
                "type": "p",
                "text": (
                    "El xolo acompaña al muerto como quien lleva un códice en el pecho. Su paso no olvida, "
                    "su nado no se detiene. Itzcuitlán es el tránsito donde la memoria moral se vuelve visible: "
                    "una espuma que escribe en la noche lo que el corazón ocultó."),
            },
            {
                "type": "p",
                "text": (
                    "Al otro lado, no hay absolución sin agua. El perro cruza, pero también enseña: "
                    "en su pelaje oscuro viaja la lección de la bondad y el peso del daño."),
            },
        ],
    },
    {
        "title": "El color del tránsito — Perros bermejos, pureza y desgaste espiritual",
        "filename": "xolo-3.html",
        "blocks": [
            {
                "type": "p",
                "text": (
                    "El bermejo no es solo un color: es una llama antigua. En la piel del xolo, ese rojo "
                    "recuerda la sangre del sol al caer y el polvo sagrado de los caminos que conducen al descanso."),
            },
            {
                "type": "h2",
                "text": "Rojo de tránsito, rojo de promesa",
            },
            {
                "type": "p",
                "text": (
                    "Los perros bermejos cargan el fulgor del sacrificio y la promesa de la purificación. "
                    "Su marcha es una llama que consume lo impuro, un gesto de fuego que desviste al alma "
                    "para que atraviese ligera el umbral."),
            },
            {
                "type": "blockquote",
                "text": (
                    "Dicen que el rojo guarda el cansancio del espíritu: una tinta cálida que se vuelve clara "
                    "cuando el viaje termina."),
            },
            {
                "type": "h2",
                "text": "Desgaste y renacimiento",
            },
            {
                "type": "p",
                "text": (
                    "Cada cruce deja una hebra de color en el camino. El perro bermejo lleva consigo el desgaste "
                    "de tantas almas, y aun así su figura se mantiene pura, como si el fuego que lo tiñe "
                    "fuera también un abrazo."),
            },
            {
                "type": "p",
                "text": (
                    "En la última orilla, el rojo se vuelve humo. Allí el tránsito encuentra descanso: "
                    "el alma se despinta de dolor y el xolo, guardián de la pureza, regresa a la noche con su "
                    "manto de brasas."),
            },
        ],
    },
]

ROOT = Path(__file__).resolve().parents[1]
BLOG_DIR = ROOT / "blog"
INDEX_PATH = BLOG_DIR / "index.html"


def render_article(article: dict) -> str:
    parts = [f"<h1 class=\"titulo\">{article['title']}</h1>"]
    for block in article["blocks"]:
        if block["type"] == "h2":
            parts.append(f"<h2 class=\"titulo\">{block['text']}</h2>")
        elif block["type"] == "blockquote":
            parts.append(f"<blockquote class=\"cita\">{block['text']}</blockquote>")
        else:
            parts.append(f"<p class=\"parrafo\">{block['text']}</p>")
    body = "\n    ".join(parts)
    return dedent(
        f"""\
        <!DOCTYPE html>
        <html lang="es">
          <head>
            <meta charset="utf-8"/>
            <meta content="width=device-width, initial-scale=1" name="viewport"/>
            <title>{article['title']}</title>
            <link href="../css/styles.css" rel="stylesheet"/>
          </head>
          <body>
            <main class="articulo">
              {body}
            </main>
          </body>
        </html>
        """
    ).strip() + "\n"


def build_card(article: dict, summary: str) -> str:
    return dedent(
        f"""\
        <article class="blog-card">
          <div class="card-content">
            <h3>{article['title']}</h3>
            <p>{summary}</p>
            <a class="read-more" href="{article['filename']}">Leer más</a>
          </div>
        </article>
        """
    )


def update_index(index_path: Path, cards_html: str) -> None:
    contents = index_path.read_text(encoding="utf-8")
    marker = '<section aria-label="Listado de artículos del blog" class="grid"'
    marker_index = contents.find(marker)
    if marker_index == -1:
        raise RuntimeError("No se encontró la sección de listado de artículos.")
    insert_at = contents.find(">", marker_index)
    if insert_at == -1:
        raise RuntimeError("No se encontró el cierre de la etiqueta de sección.")
    insert_at += 1
    insertion = "\n" + "\n".join(f"   {line}" if line.strip() else "" for line in cards_html.splitlines())
    contents = contents[:insert_at] + insertion + contents[insert_at:]
    index_path.write_text(contents, encoding="utf-8")


def main() -> None:
    cards = []
    for article in ARTICLES:
        html = render_article(article)
        (BLOG_DIR / article["filename"]).write_text(html, encoding="utf-8")
        summary = next(
            block["text"] for block in article["blocks"] if block["type"] == "p"
        )
        cards.append(build_card(article, summary))

    index_contents = INDEX_PATH.read_text(encoding="utf-8")
    missing_cards = [
        card for article, card in zip(ARTICLES, cards)
        if f'href="{article["filename"]}"' not in index_contents
    ]
    if missing_cards:
        update_index(INDEX_PATH, "\n".join(missing_cards))


if __name__ == "__main__":
    main()
