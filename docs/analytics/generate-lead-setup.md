# Funnel de contacto y configuración de `generate_lead`

Fecha de revisión: 20 de septiembre de 2026.

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

Solo las dos primeras capas pueden medirse enteramente en frontend. El sitio no emite `contact_received`: abrir un cliente de correo no demuestra que el mensaje se redactó o se envió.

## Contrato de eventos

| Evento en `dataLayer` | Significado | Cuándo se emite |
| --- | --- | --- |
| `xolos_generate_lead` | Activación de un CTA comercial; en enlaces `mailto:` significa únicamente “email CTA opened”. | Clic en CTA o intento válido de envío del formulario. |
| `qualified_contact_intent` | Activación de un CTA con intención explícita. | Solo para `price_inquiry`, `profile_inquiry`, `video_call_request` o `contact_form`. |
| `contact_form_submit` | Formulario aceptado por Formspree. | Únicamente después de una respuesta HTTP satisfactoria. No significa que el equipo ya leyó el mensaje. |

`xolos_generate_lead` se transforma en el evento GA4 `generate_lead` desde GTM. El evento `qualified_contact_intent` conserva su nombre. Ninguno prueba por sí mismo que exista un contacto real, una cita o una reserva.

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
lead_channel=email
cta_location=floating|inline|article_footer
lead_intent=price_inquiry
page_type=home|available-xolos|contact|blog-price
lang=es|en
```

CTA de perfil:

```text
lead_channel=email
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

## Validación en GA4 y Google Ads

1. Validar `generate_lead` y `qualified_contact_intent` en DebugView o Tiempo real.
2. Confirmar que una activación cualificada produce exactamente un evento de cada capa.
3. Confirmar que un CTA genérico no produce `qualified_contact_intent`.
4. Confirmar que un error o timeout de Formspree no produce `contact_form_submit`.
5. Marcar eventos clave solo después de validar nombres y conteo.
6. No usar `purchase`, no asignar el precio de un xolo a un clic y no deducir una reserva desde eventos frontend.
