# Funnel de contacto y configuración de `generate_lead`

Fecha de revisión: 28 de septiembre de 2026.

El frontend separa activación, intención cualificada y contacto confirmado. No envía precios, moneda, contenido del formulario, correo, ciudad, texto de WhatsApp, query strings ni otros datos personales a Analytics.

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

Solo las dos primeras capas pueden medirse enteramente en frontend. Abrir WhatsApp no demuestra que la persona haya enviado el mensaje. La confirmación HTTP de Formspree sigue siendo una tercera evidencia técnica específica del formulario.

## Contrato de eventos

| Evento en `dataLayer` | Significado | Cuándo se emite |
| --- | --- | --- |
| `xolos_generate_lead` | Activación de un CTA comercial. En WhatsApp significa únicamente “WhatsApp CTA opened”. | Clic en CTA o intento válido de envío del formulario. |
| `qualified_contact_intent` | Activación de un CTA con intención explícita. | Solo para `price_inquiry`, `profile_inquiry`, `video_call_request` o `contact_form`. |
| `contact_form_submit` | Formulario aceptado por Formspree. | Únicamente después de una respuesta HTTP satisfactoria. No significa que el equipo ya leyó el mensaje. |

`xolos_generate_lead` se transforma en GA4 `generate_lead` desde GTM. `qualified_contact_intent` conserva su nombre. Ninguno prueba por sí mismo que exista un contacto real, una cita o una reserva.

## Estados del funnel y fuentes de verdad

| Estado | Evidencia necesaria |
| --- | --- |
| `generate_lead` | Activación técnica de CTA, incluida la apertura de WhatsApp o un intento válido de formulario. |
| `qualified_contact_intent` | Clic o intento con intención explícita; no prueba envío. |
| `contact_form_submit` | Respuesta HTTP exitosa del proveedor al POST del formulario; no prueba lectura por el equipo. |
| WhatsApp recibido / `contact_received` | Mensaje inbound real recibido en WhatsApp. Se registra operativamente; jamás se deduce de un clic en `wa.me`. |
| Email recibido | Mensaje inbound real en el sistema de correo para los flujos que siguen usando email. |
| `video_call_request` | Intención de abrir Calendar, incluso desde la confirmación del formulario. |
| `video_call_scheduled` | Cita identificada en Google Calendar. |
| `video_call_completed` | Confirmación operativa explícita de que ocurrió; no basta con que su horario haya pasado. |
| `reservation_confirmed` | Pago/comprobante o evidencia comercial confirmada según la regla vigente. |

## Canal comercial principal

Los CTA de precio, perfil y consulta general en las superficies comerciales principales usan:

```text
https://wa.me/message/EXX6AH4L77ZHK1
```

Superficies migradas:

- `index.html` y `en/index.html`
- `xolos-disponibles.html` y `en/available-xolos.html`
- `contacto.html` y `en/contact.html`
- `blog/precio-xoloitzcuintle.html` y `en/blog/xoloitzcuintli-price.html`

El enlace corto de WhatsApp Business es compartido. El origen se conserva mediante `page_type`, `cta_location`, `profile`, `profile_status` y `lang`. El clic permite medir intención y procedencia dentro del sitio, pero no confirma que el usuario haya enviado un mensaje.

El formulario Formspree se conserva como alternativa secundaria. El correo `fernando@xolosramirez.com` se mantiene para usos institucionales, metadatos y flujos fuera de esta migración comercial, incluyendo Teyolías y Xolo Skin Care.

Los eventos usan, cuando existe contexto:

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
lead_channel=whatsapp
cta_location=floating|inline|article_footer
lead_intent=price_inquiry
page_type=home|available-xolos|contact|blog-price
lang=es|en
```

CTA de perfil:

```text
lead_channel=whatsapp
cta_location=profile_card
lead_intent=profile_inquiry
profile=<canonical profile id>
profile_status=available|reserved
page_type=available-xolos
lang=es|en
```

Consulta general por WhatsApp:

```text
lead_channel=whatsapp
lead_intent=general_inquiry
cta_location=inline|footer
page_type=contact|available-xolos
lang=es|en
```

Videollamada:

```text
lead_channel=video_call
cta_location=inline
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

Los CTA sin perfil real omiten `profile` y `profile_status`; no se rellenan con valores sintéticos.

## Configuración en GTM

Para GA4 `generate_lead`:

1. Mantener el activador `Custom Event - xolos_generate_lead`.
2. Mantener el evento GA4 `generate_lead`.
3. Enviar los siete parámetros de la capa de datos.
4. No enviar `value` ni `currency`.

Para `qualified_contact_intent`:

1. Mantener el activador con ese nombre.
2. Reutilizar los siete parámetros.
3. No tratarlo como prueba de contacto recibido ni de reserva.

Para `contact_form_submit`, usar un activador separado. Es una confirmación técnica de aceptación del formulario por el proveedor, no una confirmación de lectura o seguimiento.

En la página de contacto, después de HTTP exitoso permanece la sección de videollamada. El clic usa `video_call_request`, `cta_location=post_form_success` y el perfil capturado del `FormData` enviado.

**Estado de publicación al 28/09/2026:** este cambio frontend no implica por sí solo que GTM/GA4 esté publicado o validado. Comprobar Preview y DebugView antes de modificar Key Events o dependencias de Google Ads.

## Validación

1. Validar `generate_lead` y `qualified_contact_intent` en DebugView o Tiempo real.
2. Confirmar `lead_channel=whatsapp` en CTA de precio y perfil.
3. Confirmar que los perfiles conservan `profile`, `profile_status`, `cta_location=profile_card` y el idioma.
4. Confirmar que una consulta general por WhatsApp no se interpreta como `contact_received`.
5. Confirmar que Formspree conserva `lead_channel=form` y su evento de éxito.
6. No deducir una reserva ni un mensaje enviado desde un clic frontend.
