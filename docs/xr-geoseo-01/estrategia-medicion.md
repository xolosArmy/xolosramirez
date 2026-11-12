# Estrategia nacional e internacional y medición

## Decisión editorial

La autoridad se construye con historias verificables, no con una lista de destinos repetida en cada página. La colección central es útil porque reúne crónicas antes desconectadas, permite distinguir encuentro y residencia, y conecta Guatemala, Chile, Grecia y Venezuela con el resto del historial. No se justifica crear landings independientes para cada estado o país con los datos disponibles.

La sede sigue siendo Ciudad de México. El primer nivel enlaza inicio, blog, catálogo y testimonios con la colección. El segundo agrupa encuentros por lugar, historias internacionales y seguimientos familiares. Cada crónica regresa a la colección y conduce a cuidados, testimonios, proceso o contacto según su utilidad.

## Grupos semánticos y destino editorial

| Grupo | Intención | Página elegible | Prioridad y límite |
|---|---|---|---|
| Xolos Ramírez + CDMX/México | Marca/comercial | Inicio y encuentros CDMX | Mantener sede real; se añade navegación, no listas en metadatos |
| Xoloitzcuintle + Mérida/Yucatán | Entrega/informativa | Nox | P1 por claridad del caso; demanda específica aún no comprobada |
| Xolos Ramírez + Tijuana/Baja California | Marca/entrega | Chimalma y Yohualli; Piltzin con recogida familiar | P1 por evidencia y varias historias; no afirmar sucursal |
| Xoloitzcuintle + Guadalajara/Jalisco | Entrega/informativa | Ameyalli | Historia histórica propia; Xóchitl pendiente excluida |
| Xoloitzcuintle + Monterrey/Nuevo León | Entrega/informativa | Xochimani, Luna y Yoalli | Separar ejemplares y fechas; enlazar desde una misma colección |
| Xolos Ramírez + Guatemala | Marca/historia | Athena ES/EN | P1 por mandato y oportunidad editorial; el volumen no se presume |
| Xoloitzcuintle precio Guatemala | Comercial | Información vigente de proceso, con enlace opcional a historia de Athena | La consulta observada no debe convertir la crónica en una tarifa local |
| Xoloitzcuintle mexicano + Chile/Santiago | Historia/entrega | Luismi ES/EN | P1 editorial; muestra de demanda escasa, sin promesa comercial |
| Xolos Ramírez + Atenas/Grecia o Caracas/Venezuela | Marca/cultural | Tecuani y Pepe | Antecedentes de entrega documentados por separado de los seguimientos; no duplicar eventos ni crear sucursales |
| Xoloitzcuintli breeder Mexico / international delivery | Comercial/informativa EN | Inicio EN, colección EN, historias equivalentes | Son hipótesis semánticas; no se ha demostrado volumen para estas frases exactas |
| Estados Unidos / Texas / California / República Dominicana | Hogar posterior/itinerario | Crónicas que identifican encuentro en México | No equivale a entrega física del criadero en esos países |
| Oaxaca, Puerto Rico, Estado de México y otras referencias por evaluar | Pendiente | Inventario de investigación | No crear afirmaciones ni landings todavía |

P1 es prioridad editorial/técnica y de evidencia; no un pronóstico de tráfico. La línea base privada distingue búsquedas reales de hipótesis. El país desde donde busca el usuario es una dimensión analítica distinta del destino narrado.

## Línea base y restricciones de acceso

Se revisaron los archivos de auditoría/exportación del 8 de noviembre de 2026 disponibles en Drive. Contienen datos Search Console vinculados a GA4 para 1–7 noviembre y comparación GA4 2–7 noviembre contra 26–31 octubre. No equivalen a una extracción actual ni a URL Inspection. Los totales de consultas y páginas cubren conjuntos diferentes; no deben sumarse. Ausencia de una fila no significa cero impresiones.

No había un conector directo activo de Search Console/GA4 con capacidad suficiente. No se inició sesión por navegador ni se modificó configuración. Antes de publicación, obtener export directo de 28 días completos y, si hay volumen, 90 días: consulta, página, país de búsqueda, dispositivo, clics, impresiones, CTR y posición. Registrar propiedad, zona horaria, fecha de extracción, filtros y límites de filas. Guardar estas métricas en el anexo privado.

## Tablero y ventanas

T0 es el día de publicación autorizada y comprobada, no el de creación del PR. Capturar 28 días completos previos; comparar T0+1 a T0+28 con esa ventana, T0+29 a T0+56 con los 28 previos, y T0+63 a T0+90 con una ventana de igual tamaño. Mostrar además acumulados de 56 y 90 días por separado, sin compararlos directamente con un total de 28. Anotar estacionalidad, campañas, cambios de catálogo, disponibilidad, publicación de videos y otras modificaciones del sitio.

| Indicador | Fuente/dimensión | Cálculo | Interpretación |
|---|---|---|---|
| Visibilidad geográfica | GSC consulta + página, agrupadas por destino validado | impresiones y URLs distintas con impresiones | No inferir ubicación de entrega a partir de país del buscador |
| Marca + destino | GSC consultas normalizadas | clics, impresiones, CTR = clics/impresiones | Conservar variante con/sin acentos; no sumar duplicados entre exportaciones |
| Posición | GSC por consulta/página | valor de fuente, agregado ponderado por impresiones cuando proceda | No promedio simple de promedios; cambios de mezcla afectan lectura |
| Sesiones orgánicas | GA4 canal Organic Search + landing page | sesiones/usuarios, misma ventana | No equivalen a prospectos |
| Lectura de crónicas | GA4 eventos existentes + page_location | chronicle_view, chronicle_scroll_75 | Validar cobertura; no todas las páginas históricas tienen instrumentación |
| Navegación comercial | GA4 commercial_cta_click y rutas existentes | eventos/usuarios por crónica | Un clic no es un contacto confirmado |
| Contacto | GA4 contact_form_submit y registro comercial | eventos; contactos únicos solo mediante conciliación autorizada | No asumir que enviar un formulario es reserva |
| Reservas atribuibles | Evidencia comercial y trazabilidad permitida | solo reservas con correspondencia verificable | Mantener no atribuibles como desconocidas; sin unión basada en país o nombre aproximado |

No se añaden eventos ni se modifica GA4/GTM/CRM. Si el tablero necesita una dimensión inexistente, anotarla como no disponible y solicitar autorización específica para instrumentarla; no estimarla. El anexo incluye celdas «pendiente» para los cortes futuros, no ceros inventados.

## Criterios de éxito y reversión

Éxito técnico previo: correspondencia entre texto y evidencia, metadata coherente, canonical y alternates bidireccionales en equivalentes, enlaces resolubles, JSON válido y tipos pertinentes, cero cambios comerciales. Éxito después de publicar: respuestas HTTP correctas, selección canonical e indexación revisadas en GSC, uso de la colección y señales de consulta/página evaluables. No se fija una posición garantizada.

Revisar a 28, 56 y 90 días; si baja la interacción, investigar mezcla de tráfico, enlaces y experiencia móvil antes de revertir. Una subida coincidente no demuestra causalidad. Los commits pueden revertirse en orden inverso, siempre mediante autorización de integración. No se programa automáticamente ninguna tarea futura.

## Fuentes técnicas primarias consultadas

- [Títulos](https://developers.google.com/search/docs/appearance/title-link).
- [Canonicalización](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
- [Versiones localizadas y hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions).
- [Redirecciones y meta refresh](https://developers.google.com/search/docs/crawling-indexing/301-redirects).
- [Article y BlogPosting](https://developers.google.com/search/docs/appearance/structured-data/article).
- [Políticas de spam y páginas puerta](https://developers.google.com/search/docs/essentials/spam-policies).
