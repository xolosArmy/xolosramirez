# Validación al 12/11/2026

## Completada

- `python scripts/check-geoseo.py`: 39 páginas del comparativo, 132 URLs del sitemap, cero fallos. Comprueba canonical, H1, descripción, parseo JSON-LD, reciprocidad hreflang y destinos de enlaces añadidos. No sustituye Rich Results Test ni una inspección de renderizado.
- `python scripts/generate-sitemap.py --check`: 132 URLs autocanónicas, sin pérdida de las URLs anteriores. Los siete aliases históricos quedan excluidos.
- `git diff --check`: sin errores de whitespace.
- `node scripts/test-generate-lead-tracking.mjs`: pasa.
- `node scripts/test-wm-xr1.mjs`: 17/17 pasan.
- Comprobación individual de las 21 crónicas del primer PR: un H1, canonical propio y JSON parseable; cero destinos internos locales faltantes tras las correcciones.
- Comparación contra main público: no se añaden correos, números de microchip, wallets ni identificadores de transacción a las crónicas. No se copian datos de Clientes/Pagos/Comunicaciones a los HTML nuevos.
- Fotografías y datos de disponibilidad/precio sin cambios; los catálogos solo reciben un enlace editorial después del contenido existente.

## Fallo previo, fuera del alcance

`node --test scripts/test-journey.mjs`: 12/13 pasan. Falla el contrato de rechazo de perfiles desconocidos en analítica, ya tratado en PR #578. Los scripts de Journey y su test no cambian en estas ramas. No se presenta la suite completa como aprobada.

## Validaciones incompletas

- Visual escritorio/móvil: Chromium local abortó al crear sockets (`Operation not permitted`); el navegador remoto devolvió `ERR_CONNECTION_REFUSED` al acceder al servidor local. No se capturaron renders válidos. No se eludieron restricciones ni se publicó una preview. Ambos PR deben permanecer draft hasta completar esta revisión.
- Renderizar las 39 páginas modificadas/nuevas a 1440×900 y 390×844; revisar encabezados, tarjetas, enlaces, contraste, foco, ausencia de overflow y menú móvil. Probar los pares ES/EN y navegación de vuelta a colección. Comprobar galerías originales sin edición de imagen.
- URL Inspection, cobertura de indexación y canonical seleccionado por Google no disponibles. No se infieren a partir de sitemap, búsqueda indexada o HTML local.
- Export fresco de Search Console/GA4 pendiente. La línea base disponible es un export previo; no se modifica configuración ni se instala instrumentación.
- HTTP definitivo de los aliases, www y rutas con acentos: validar solo después de una publicación autorizada. La implementación es meta refresh inmediato, no HTTP 301.
- Enlaces externos y todos los enlaces históricos no se validaron exhaustivamente. El inventario señala destinos locales faltantes y fuentes inaccesibles; no se sustituyen por supuestas historias.

## Revisión del cambio y reversión

Revisar primero #589; después el PR dependiente de recuperación y colección. Antes de autorizar integración, actualizar contra main, reejecutar estos checks y resolver solapamientos con #464 (inicio), #579 (precios), #578 (Journey) y cambios comerciales que se hayan integrado entretanto. Ningún despliegue ni merge está autorizado por este expediente. Reversión: commits en orden inverso, también mediante aprobación del titular.
