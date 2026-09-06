# Propuesta implementada: SEO, experiencia y recorrido de las familias

Fecha: 6 de septiembre de 2026. Base auditada: `1bccf3ba0715afe6369e061d3da916f3b9d48703`.

La web ya dispone de fotografías reales, historias de entrega, guías y una narrativa de linaje reconocible. La oportunidad es hacer que una familia encuentre esos recursos en el momento adecuado y llegue a una conversación con contexto. Este PR reorganiza el recorrido en español e inglés conservando las condiciones comerciales y la identidad de Xolos Ramírez.

## Hallazgos y cambios

| Prioridad | Fricción observada | Cambio implementado | Resultado esperado |
| --- | --- | --- | --- |
| Alta | Portadas de pantalla completa y varios bloques antes de los perfiles. | Introducción compacta, acceso directo al listado y perfiles inmediatamente después de la introducción. | Menos desplazamiento para conocer a los xolos. |
| Alta | La página española desplazaba la lectura al Show automáticamente a los 3.5 segundos. | Se elimina ese desplazamiento. El episodio permanece en la página. | La persona conserva el control de la lectura. |
| Alta | Tlilxóchitl y las actualizaciones de Xilonen dependían de mutaciones de JavaScript. | Los seis perfiles, fotografías, personalidades y videos vigentes se incluyen en ambos HTML. Se retiran los parches históricos del script compartido. | El contenido esencial está disponible desde la respuesta inicial y también sin JavaScript. |
| Alta | Yohualli aparecía reservada, pero su enlace y medición decían disponible; otras reservas tenían un distintivo verde de disponibilidad. | Se alinean distintivos, consulta por ejemplares similares y estado de seguimiento con la reserva ya publicada. | Expectativas coherentes, sin modificar reservas ni disponibilidad comercial. |
| Alta | Videos altos antes de la consulta; reproducción automática en perfiles y portadas. | La consulta aparece después de la información del ejemplar. Los videos se conservan en controles nativos desplegables, sin autoplay y con enlaces a YouTube. | Comparación más clara y reproducción elegida por la persona. |
| Alta | El contacto empezaba por un formulario genérico y no ofrecía un recorrido claro para agendar. | WhatsApp, videollamada y correo visibles; alternativa explícita si la agenda no abre; formulario con ciudad y ejemplar opcionales. | La conversación puede empezar por el canal que prefiera la familia. |
| Alta | El formulario salía de la página al enviarse. | Mejora progresiva con estados de envío, éxito y error, prevención de solicitudes simultáneas, tiempo máximo y reintento conservando el texto. El POST nativo existente permanece como alternativa sin JS. | La persona conoce el resultado y puede continuar. |
| Media | Navegación inconsistente y enlaces ingleses a `testimonials.html`, que no existe. | Menú compartido en las páginas del recorrido y enlaces a las historias reales en español identificados como ES. Teyolías, Skin Care y xolosArmy se conservan en “Nuestro universo”. | Descubrimiento consistente sin inventar una traducción. |
| Media | El menú móvil se desplazaba fuera de pantalla pero sus enlaces seguían potencialmente accesibles al tabular. | Navegación cerrada fuera del orden de foco mediante `display:none`; Escape, cierre exterior, estado accesible y navegación expandida si JS no funciona. | Uso por teclado y alternativa sin JS. |
| Media | Textos oscuros sobre superficies oscuras, controles pequeños y botones flotantes sin texto en móvil. | Estilos acotados a las páginas intervenidas: contraste, controles de al menos 44 px, etiquetas visibles, márgenes de foco, tablas desplazables y movimiento reducido. | Lectura y acciones más claras en pantallas pequeñas. |
| Media | El blog cargaba automáticamente el archivo completo mediante JavaScript, sin un enlace visible alternativo al archivo. | Se mantienen las ocho publicaciones recientes, accesos temáticos y un enlace HTML al archivo completo. | Acceso deliberado al archivo y enlaces rastreables sin cargar toda su colección al entrar. |
| Media | Sitemap manual con 26 URL y fechas desactualizadas. | Generador con la biblioteca estándar de Python y sitemap de 42 URL autocanónicas. | Actualización repetible y exclusión de alias, redirecciones y páginas no indexables. |

## Recorrido propuesto de principio a fin

| Etapa | Pregunta de la familia | Superficie / siguiente acción |
| --- | --- | --- |
| Descubrimiento | ¿Quién es Xolos Ramírez? | Inicio: linaje, disponibilidad, historia real y origen. El blog ofrece entradas por talla, cuidado, temperamento y proceso. |
| Exploración | ¿Qué xolo podría integrarse a mi vida? | Perfiles disponibles primero; filtros opcionales de disponibilidad, fotos, talla y personalidad. Todos permanecen accesibles sin JS. |
| Confianza y evaluación | ¿Qué respalda el proceso? | Guía de precio y qué incluye, documentación, testimonios y episodios. Se mantiene el contenido cultural y digital. |
| Consulta | ¿Cómo hablo con ustedes sobre este ejemplar? | Correo contextual desde cada ficha o formulario con el perfil preseleccionado; WhatsApp y agenda existentes. Los reservados orientan a ejemplares similares. |
| Compatibilidad y reserva | ¿Cuáles son las condiciones para mi familia y destino? | Conversación directa para confirmar disponibilidad, ubicación y condiciones antes de acordar la reserva. Las cifras y condiciones no se cambian en este PR. |
| Preparación y entrega | ¿Cómo preparamos su llegada? | Etapa explícita de documentación y logística, acordada directamente con la familia. |
| Adaptación y continuidad | ¿Qué pasa después de la entrega? | Calendario de seguimiento existente, guías de cuidado, historias familiares y The Xolos Ramírez Show. |

La reserva, el pago y la confirmación de entrega siguen siendo pasos atendidos por el equipo. Un clic de contacto o la apertura de la agenda no confirma una reserva ni una cita.

## Marca, contenido y diseño

- Se conserva el negro, dorado, Cinzel/Poppins, logotipo, imágenes originales y narrativa de cultura, guardianes, pirámide viviente y linaje.
- Se reorganiza la jerarquía: disponibilidad y proceso antes; historias, origen y universo cultural siguen accesibles.
- No se incorpora 3D ni se agrega una dependencia de aplicación.
- Las fotografías y su orden en los carruseles se conservan. Las de Tlilxóchitl y Xilonen coinciden entre idiomas. Los videos visibles después de los parches anteriores se materializan en HTML, conservando sus IDs.
- Se mantienen las URLs principales, las imágenes sociales, GTM, el endpoint de Formspree, el enlace de WhatsApp y la agenda existentes.

## SEO y medición

Títulos y descripciones se alinean con la intención de cada página principal. Se conservan canonical y equivalencias ES/EN; se agregan migas de pan con datos estructurados en contacto, disponibilidad y testimonios, y un `ItemList` de perfiles sin inventar precios, ofertas ni valoraciones. El correo de contacto se corrige también en HTML y datos estructurados.

El sitemap incluye solo URLs con canonical propio, HTTPS y dominio canónico que resuelven a un archivo local de la superficie pública. Excluye archivos sin canonical confirmado, alias, `noindex`, redirecciones e informes. Omite `lastmod` cuando no existe una fecha de modificación significativa verificable; no usa la fecha del checkout para rejuvenecer todo el archivo.

```bash
python3 scripts/generate-sitemap.py
python3 scripts/generate-sitemap.py --check
```

Se preserva `xolos_generate_lead` y su contrato: un clic o envío válido es una señal de intención. Se añaden eventos independientes:

| Evento | Disparador | Parámetros |
| --- | --- | --- |
| `xolos_journey_step` | Enlaces instrumentados hacia perfiles o contacto. | `step` (`view_profiles` / `contact`), `page_type`, `lang`. |
| `xolos_contact_success` | Respuesta HTTP satisfactoria de Formspree. | `lead_channel=form`, `page_type=contact`, `lang`. |

Los eventos nuevos no incluyen el contenido del formulario, email, ciudad, perfil solicitado ni query strings. No se ha modificado la configuración de GTM/GA4: hay que configurar el envío de estos dos eventos desde el contenedor para verlos en GA4. El éxito de Formspree confirma la aceptación de la solicitud por el servicio, no su lectura por el equipo ni una entrega de correo verificada.

## Validación realizada

- 11 páginas pasan HTMLHint, con un solo `main`/H1, IDs únicos y JSON-LD válido.
- 439 referencias locales a páginas, imágenes, scripts, estilos y anclas verificadas sin destinos inexistentes.
- Seis perfiles bilingües: estado, orden de imágenes y videos vigentes coincidentes; fotos anteriores de los carruseles preservadas.
- Nueve pruebas de comportamiento de filtros y formulario: consulta conocida/desconocida, entrada inválida, envío, doble clic, error HTTP, red, timeout, reintento y eventos sin datos personales.
- Se mantiene aprobada la suite existente de seguimiento de leads, actualizada para comprobar el botón flotante de WhatsApp que antes se obtenía mediante mutación de JS.
- Sintaxis JavaScript y coherencia del sitemap verificadas.
- Las solicitudes a Formspree se simulan en las pruebas: no se enviaron consultas de prueba al equipo.

```bash
npm run test:generate-lead
node --test scripts/test-journey.mjs
node --check js/main.js
node --check js/journey.js
python3 scripts/generate-sitemap.py --check
```

No se ejecutó prueba visual en navegador, navegación real de agenda/WhatsApp, entrega real del formulario ni Lighthouse sobre esta rama. No se atribuyen mejoras numéricas de velocidad, ranking o conversión sin medición. Antes de aprobar el merge conviene revisar escritorio/móvil, zoom al 200 %, menú/galerías por teclado y los tres canales de contacto en un navegador real.

## Próximas mejoras propuestas

1. **Archivo histórico y canonical.** La inspección detectó 113 archivos HTML de la superficie pública sin canonical, 19 apuntando al antiguo dominio de GitHub Pages, tres a rutas históricas de `www` y un alias relativo. Hay que determinar cuáles son piezas únicas, duplicados y alias antes de migrar metadatos o redirigir. Este PR no canonicaliza masivamente contenido sin esa revisión.
2. **Medición posterior a publicación.** Comparar impresiones y clics orgánicos de inicio, disponibilidad y precio en Search Console, y avance a contacto y éxito de formulario por idioma/dispositivo. Usar un periodo anterior comparable y documentar la fecha de publicación.
3. **Continuidad operativa.** Conciliar las consultas con compatibilidad, reserva, entrega y seguimiento mediante el registro comercial existente; no deducir ventas a partir de clics de WhatsApp.
4. **Imágenes externas y rendimiento.** Tras una medición real, priorizar la migración de recursos externos críticos a imágenes locales optimizadas y comprobar LCP/CLS/INP. La presente entrega reutiliza las imágenes existentes.

## Referencias técnicas

- [Guía SEO de Google](https://developers.google.com/search/docs/fundamentals/seo-starter-guide): organización, contenido útil, enlaces y títulos descriptivos.
- [JavaScript y SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics): disponibilidad del contenido y enlaces rastreables.
- [Construcción de sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): URLs canónicas y uso correcto de fechas.

Esta propuesta se entrega para revisión mediante PR. No autoriza ni ejecuta merge o despliegue de producción.
