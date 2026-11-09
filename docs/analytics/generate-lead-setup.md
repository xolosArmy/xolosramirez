# Funnel de contacto y configuración de `generate_lead`

Fecha de revisión del contrato frontend: 8 de noviembre de 2026. Esta revisión no certifica la configuración publicada de GTM.

El frontend separa activación, intención cualificada y envío confirmado. No envía precios, moneda, contenido del formulario, correo, ciudad, query strings ni otros datos personales a Analytics.

```text
generate_lead
       ↓
qualified_contact_intent
       ↓
contacto real
       ↓
seguimiento / videollamada
       ↓
reserva
```

Solo las dos primeras capas pueden medirse enteramente en frontend. El sitio no emite `contact_received`: abrir un cliente de correo no demuestra que el mensaje se redactó o se envió. La confirmación HTTP de Formspree es una tercera evidencia técnica específica de ese formulario.

## Contrato de eventos

| Evento en `dataLayer` | Significado | Cuándo se emite |
| --- | --- | --- |
| `xolos_generate_lead` | Activación de un CTA comercial; en enlaces `mailto:` significa únicamente “email CTA opened”. | Clic en CTA o intento válido de envío del formulario. |
| `qualified_contact_intent` | Activación de un CTA con intención explícita. | Solo para `price_inquiry`, `profile_inquiry`, `video_call_request` o `contact_form`. |
| `contact_form_submit` | Formulario aceptado por Formspree. | Únicamente después de una respuesta HTTP satisfactoria. No significa que el equipo ya leyó el mensaje. |

`xolos_generate_lead` se transforma en el evento GA4 `generate_lead` desde GTM. El evento `qualified_contact_intent` conserva su nombre. Ninguno prueba por sí mismo que exista un contacto real, una cita o una reserva.

## Estados del funnel y fuentes de verdad

| Estado | Evidencia necesaria |
| --- | --- |
| `generate_lead` | Activación técnica de CTA, incluso apertura de `mailto:` o intento válido de formulario. |
| `qualified_contact_intent` | Clic o intento con intención explícita; no prueba envío. |
| `contact_form_submit` | Respuesta HTTP exitosa del proveedor al POST del formulario; no prueba lectura por el equipo. |
| Email recibido / `contact_received` | Mensaje inbound real en el sistema de correo, o envío aceptado por Formspree. Se registra operativamente; jamás se deduce de `mailto:`. |
| `video_call_request` | Intención de abrir Calendar, incluso desde la confirmación del formulario. |
| `video_call_scheduled` | Cita identificada en Google Calendar. |
| `video_call_completed` | Confirmación operativa explícita de que ocurrió; no basta con que su horario haya pasado. |
| `reservation_confirmed` | Pago/comprobante o evidencia comercial confirmada según la regla vigente. |

Estos estados no son equivalentes. El navegador no emite `video_call_booked`, `video_call_completed` ni `reservation`. La Hoja Maestra conserva las etapas operativas en `Funnel Comercial`, sin PII en el `prospect_id`.

Las fichas públicas ES/EN ofrecen correo a `contacto@xolosarmy.xyz` y WhatsApp. Los CTA flotantes de precio también usan WhatsApp; los contextuales de precio usan correo. No interpretar una activación de ninguno de estos canales como mensaje recibido. Los asuntos de correo conservan referencias de origen sin PII: `[Ref: <profile>-<lang>-available]` o `[Ref: price-<lang>-<surface>-<placement>]`. En el pie de la guía de precio, la referencia es `price-<lang>-price-article-footer`, mientras `data-cta-location` es `article_footer`. El cuerpo prellenado puede solicitar información del interesado para la conversación privada; ese cuerpo no forma parte del payload de Analytics.

Los dos eventos de activación usan, cuando el contexto existe:

- `lead_channel`
- `lead_intent`
- `page_type`
- `cta_location`
- `profile`
- `profile_status`
- `lang`

## Matriz esperada

CTA de precio:

```text
lead_channel=whatsapp  # floating
lead_channel=email     # inline|article_footer
cta_location=floating|inline|article_footer
lead_intent=price_inquiry
page_type=home|available-xolos|contact|blog-price
lang=es|en
```

CTA de perfil:

```text
lead_channel=email|whatsapp
cta_location=profile_card
lead_intent=profile_inquiry
profile=<canonical profile id>
profile_status=available|reserved
page_type=available-xolos
lang=es|en
```

Videollamada:

```text
lead_channel=video_call
cta_location=inline|post_form_success
lead_intent=video_call_request
page_type=available-xolos|contact
lang=es|en
```

Formulario:

```text
lead_channel=form
cta_location=contact_form
lead_intent=contact_form
profile=<canonical profile id, solo si el usuario seleccionó uno>
page_type=contact
lang=es|en
```

Los CTA sin un perfil real omiten `profile` y `profile_status`; no se rellenan con valores sintéticos como `general`, `unknown` o `not_applicable`.

## Configuración en GTM

Crear variables de capa de datos, versión 2, para los siete parámetros anteriores.

Para GA4 `generate_lead`:

1. Crear el activador `Custom Event - xolos_generate_lead` con nombre de evento `xolos_generate_lead`.
2. Crear una etiqueta GA4 con nombre de evento `generate_lead`.
3. Añadir los siete parámetros de la capa de datos.
4. No enviar `value` ni `currency`.

Para GA4 `qualified_contact_intent`:

1. Crear el activador `Custom Event - qualified_contact_intent` con ese mismo nombre de evento.
2. Crear una etiqueta GA4 con nombre de evento `qualified_contact_intent`.
3. Reutilizar los siete parámetros.
4. No configurarlo como prueba de contacto recibido ni de reserva.

Para `contact_form_submit`, usar un activador separado. Es una confirmación técnica de aceptación del formulario por el proveedor, no una confirmación de lectura o seguimiento.

En la página de contacto, después de HTTP exitoso aparece una sección de videollamada. El clic utiliza `video_call_request`, `cta_location=post_form_success` y el perfil capturado del `FormData` enviado. El calendario no se abre automáticamente. El panel permanece oculto si falla el POST.

**Estado de publicación al 28/09/2026:** pendiente de inspección autenticada de GTM/GA4. No afirmar que las dos etiquetas están publicadas hasta comprobar contenedor, Measurement ID, Preview con un disparo por evento y DebugView. Revisar la dependencia de Google Ads antes de modificar cualquier Key Event; no cambiar `generate_lead` si está importado o afecta bidding.

## Validación en GA4 y Google Ads

1. Validar `generate_lead` y `qualified_contact_intent` en DebugView o Tiempo real.
2. Confirmar que una activación cualificada produce exactamente un evento de cada capa.
3. Confirmar que un CTA genérico no produce `qualified_contact_intent`.
4. Confirmar que un error o timeout de Formspree no produce `contact_form_submit`.
5. Marcar eventos clave solo después de validar nombres y conteo.
6. No usar `purchase`, no asignar el precio de un xolo a un clic y no deducir una reserva desde eventos frontend.


## Regla de canal vigente

- Correo: CTA de perfiles, precio contextual, contacto general y recuperación del formulario.
- WhatsApp: CTA de perfiles y CTA flotantes de precio en las seis superficies ES/EN de Home, Disponibles y Contacto.
- Un clic en WhatsApp sigue siendo intención; no equivale a mensaje recibido ni reserva.


## Interpretación de parámetros y comprobación antes de publicar

`profile` no es obligatorio en una consulta general de precio. Un valor ausente no prueba un defecto. Para identificar omisiones inesperadas, cruzar evento, `lead_intent`, `cta_location`, `page_type`, `lang` y `profile`. La cobertura relevante es la de `profile_inquiry` desde `profile_card`, no el porcentaje global de todos los clics. No sustituir valores ausentes por un perfil inventado.

`cta_type` y `source_section` no pertenecen al contrato de siete parámetros de `generate_lead`/`qualified_contact_intent`. Para estas capas, utilizar `cta_location`; no agregar dimensiones sólo para eliminar `(not set)`. `source_section=profile_card` sí pertenece a `personality_story_click`, un evento separado de lectura de contenido, que no acredita intención comercial ni reserva.

El registro `personalityStories` de `js/journey.js` limita ese evento a crónicas publicadas. Sus fechas describen el ciclo editorial original, no la fecha del clic. Al agregar una crónica, actualizar el registro con su perfil canónico y su ciclo verificado. Los enlaces actuales ES/EN corresponden a Tlilxóchitl. Los valores arbitrarios de `data-profile` y `data-source-section` no deben transmitirse.

`js/main.js` ya limpia los siete campos antes de cada push y deduplica la misma firma durante 1,500 ms. Esto evita arrastre dentro de la capa de datos y dobles activaciones inmediatas; no deduplica personas, contactos recibidos, sesiones ni etiquetas GTM configuradas por duplicado.

| Caso de QA | Resultado esperado |
| --- | --- |
| CTA de perfil ES/EN por correo o WhatsApp | Un `xolos_generate_lead` y un `qualified_contact_intent`, con perfil/estado correctos |
| CTA general tras CTA de perfil | Sin heredar `profile` ni `profile_status` |
| Doble clic idéntico dentro de 1,500 ms | Una activación por capa |
| Cambio real de perfil/canal | Nueva activación con el contexto nuevo |
| Formulario válido con fallo HTTP/red/timeout | Puede registrar intento, nunca `contact_form_submit` |
| Formulario aceptado por HTTP | Un `contact_form_submit`; sin contenido ni correo personal en Analytics |
| Clic en crónica | Sólo `personality_story_click` con el contrato editorial permitido |

Ejecutar `node scripts/test-generate-lead-tracking.mjs` y `node scripts/test-journey.mjs` localmente. Tras autorización para la validación conectada, contrastar la secuencia con Tag Assistant y DebugView de la propiedad correcta, verificando un solo envío por evento. Si hay una etiqueta duplicada, proponer la diferencia exacta del contenedor antes de publicar. Las pruebas locales no verifican etiquetas, consentimiento, dimensiones registradas, importación de conversiones a Ads ni su configuración primaria/secundaria. No modificar eventos clave sin revisar dependencias de puja.

Referencia pública: [capa de datos de Google Tag Manager](https://developers.google.com/tag-platform/tag-manager/datalayer).
