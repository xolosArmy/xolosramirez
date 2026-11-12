# XR-GEOSEO-01 — expediente de revisión

Corte: 12 de noviembre de 2026. Base examinada: `e0259ae156a424eab67e84d466d961e4823a04ad`. Trabajo en ramas; no publicado ni autorizado para integración.

## Entregables y alcance

- [Matriz geográfica](matriz-geografica.csv) y [versión JSON](matriz-geografica.json): 40 registros con evidencia pública, hechos limitados por fuente y fechas desconocidas vacías. No es un censo exhaustivo de todas las entregas históricas.
- [Cobertura de las 32 entidades](cobertura-32-entidades.csv): 11 entidades con encuentros físicos documentados en las fuentes leídas. La falta de evidencia no demuestra ausencia de entregas.
- [Auditoría de URLs](auditoria-urls.csv): 253 fuentes HTML existentes y 11 páginas nuevas. Columnas actuales corresponden al HEAD base, propuestas a la rama. Incluye títulos, descripciones, H1/H2/H3, canonical, hreflang, OG/Twitter, JSON-LD, robots, menciones, enlaces entrantes/salientes y destinos locales faltantes.
- [Fuentes Markdown](auditoria-markdown.csv): 31 archivos; no se presume que toda fuente Markdown se publique. [Duplicidades](duplicidades.csv): grupos de título, descripción y canonical a revisar, sin correcciones masivas.
- [Archivo histórico](archivo-historico-pendientes.csv): 49 referencias de entregas/hogares extraídas de 577 enlaces del índice Jimdo. Hay referencias cuyo cuerpo no se pudo recuperar. Un título del índice no basta para confirmar entrega, fecha ni modalidad.
- [Comparativo](comparativo-cambios.csv): títulos y metadescripciones anteriores/propuestos, texto visible, enlaces y estructura para 39 HTML modificados o nuevos. Las siete rutas históricas adicionales solo redirigen.
- [Estrategia y medición](estrategia-medicion.md), [autorizaciones](autorizaciones.csv), [validaciones](validacion.md).

Los datos operativos de reservas, consultas y viajes pendientes, junto con la línea base de analítica, se entregan en un anexo privado. No se publican filas de Clientes, Pagos, correos, domicilios, localizadores de viaje ni información financiera en este repositorio.

## Reglas de interpretación

`1_entrega_realizada_comprobada`: la fuente describe una recepción realizada en ese lugar. `2_entrega_nacional_destino_internacional_posterior`: el encuentro fue en México; el trayecto posterior puede estar previsto o confirmado, según la nota. `3_programada_pendiente`, `4_reserva_futura` y `5_consulta_sin_entrega` se mantienen en el anexo operativo privado. `6_referencia_editorial` prueba vida familiar o mención cultural, no una entrega física por el criadero en ese destino.

`delivery_date` es el día del encuentro cuando está probado; `publication_date` es otra cosa. Las fechas inferidas de «hoy» o «ayer» se explican. Una región administrativa añadida a una ciudad inequívoca es normalización geográfica, no evidencia nueva de entrega. El alias Lola procede del mandato para Athena; la crónica recuperada solo permite publicar Athena.

Guatemala y Chile tienen relatos históricos cuyo cuerpo se leyó en el índice de búsqueda, aunque sus rutas antiguas devolvían 404 en vivo. Las páginas propuestas son recuperaciones editoriales resumidas, no copias completas ni pruebas de indexación actual. No se confunde el contenido recuperado por el buscador con una respuesta HTTP actual.

Puerto Rico se trata como territorio estadounidense, no país independiente. La referencia de Gala sigue pendiente de recuperar; no se añade al listado público de entregas comprobadas. Oaxaca/Huatulco tiene una referencia histórica de Yoltic, pero el cuerpo de la crónica no estuvo disponible. Estado de México no se infiere a partir de CDMX. Xóchitl no se cuenta como entrega realizada en Guadalajara el 12 de noviembre.

## Implementación y dependencias

1. PR #589: 21 crónicas existentes; precisión geográfica, metadatos, canonical/hreflang, enlaces rotos y sitemap. Base `main`.
2. Rama `seo/xr-geoseo-01-historical-20261112`: depende de #589. Añade siete relatos recuperados ES, dos traducciones EN, colección ES/EN, enlaces contextuales desde inicio/catálogos/blog/testimonios, siete aliases históricos y este expediente. Base de revisión: rama del primer PR para que su diff sea independiente.

Los aliases usan canonical y meta refresh inmediato con enlace accesible. No son redirecciones HTTP 301. No se alteró configuración de hosting. La respuesta final y sus cadenas deben validarse después de una publicación autorizada.

El sitemap final contiene 132 páginas autocanónicas. No incluye aliases ni documentos de auditoría. Se preservan URLs de Personalidad Xolo que el generador anterior omitía. No se crean páginas puerta por ciudad, sucursales, establecimientos LocalBusiness ni meta keywords.

## Conflictos y revisión

PR #579 trabaja precios ES/EN, fuera de este cambio. #578 trabaja el fallo conocido de Journey. #464 toca inicio: la nueva sección de enlaces puede requerir resolución de contexto si ese PR se integra antes. #556 y #457 modifican estados/catálogo; no se absorben. Los cambios de disponibilidad y precio quedan fuera del mandato.

Antes de integrar, volver a comparar con el HEAD vigente, revisar ambos PR en orden y resolver solapamientos con la versión comercial vigente. La aprobación exclusiva pertenece a Xolos Ramírez.
