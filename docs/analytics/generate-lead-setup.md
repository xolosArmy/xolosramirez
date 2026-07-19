# generate_lead setup

Este repositorio unicamente empuja el evento `generate_lead` a `window.dataLayer`. Todavia se requiere configurar Google Tag Manager, Google Analytics 4 y Google Ads para que el evento se procese como conversion o evento clave. El sitio no envia valores, moneda, precios ni datos personales a Analytics.

## Configuración en GTM

Crear variables de capa de datos, versión 2:

DLV - lead_channel
DLV - cta_location
DLV - lead_intent
DLV - profile
DLV - profile_status
DLV - page_type
DLV - lang

Cada variable debe usar el nombre correspondiente:

lead_channel
cta_location
lead_intent
profile
profile_status
page_type
lang

Crear un activador:

Nombre:
Custom Event - generate_lead

Tipo:
Evento personalizado

Nombre del evento:
generate_lead

Activación:
Todos los eventos personalizados con ese nombre.

Crear una etiqueta:

Nombre:
GA4 Event - generate_lead

Tipo:
Google Analytics: evento de GA4

Usar la Google tag o etiqueta de configuración GA4 ya existente.

Nombre del evento:
generate_lead

Parámetros:

lead_channel = {{DLV - lead_channel}}
cta_location = {{DLV - cta_location}}
lead_intent = {{DLV - lead_intent}}
profile = {{DLV - profile}}
profile_status = {{DLV - profile_status}}
page_type = {{DLV - page_type}}
lang = {{DLV - lang}}

Activador:
Custom Event - generate_lead

No enviar valor ni moneda.

## Matriz de prueba en Tag Assistant

Home correo español:

lead_channel=email
cta_location=floating
lead_intent=general_inquiry
profile=general
profile_status=not_applicable
page_type=home
lang=es

WhatsApp disponibles español:

lead_channel=whatsapp
cta_location=floating
lead_intent=price_inquiry
profile=general
profile_status=not_applicable
page_type=available-xolos
lang=es

Yaretzi o perfil available:

lead_channel=email
cta_location=profile_card
lead_intent=profile_inquiry
profile=slug
profile_status=available
page_type=available-xolos
lang=es|en

Perfil reserved:

lead_channel=email
cta_location=profile_card
lead_intent=similar_xolos
profile=slug
profile_status=reserved
page_type=available-xolos
lang=es|en

Formulario:

lead_channel=form
cta_location=contact_form
lead_intent=contact_form
profile=general
profile_status=not_applicable
page_type=contact
lang=es|en

## Configuración en GA4

1. Publicar el contenedor de GTM.
2. Ejecutar al menos una prueba real.
3. Verificar generate_lead en DebugView o Tiempo real.
4. Marcar generate_lead como evento clave.
5. También puede marcarse anticipadamente escribiendo exactamente:
   generate_lead
6. Los informes estándar pueden tardar hasta 24 horas.

## Configuración en Google Ads

1. Confirmar que GA4 y Google Ads estén vinculados.
2. Crear una conversión basada en el evento clave generate_lead.
3. La categoría recomendada para este evento unificado es Contacto, porque incluye:
   - WhatsApp
   - correo
   - formulario
4. No seleccionar purchase como conversión de leads.
5. No asignar a cada lead el precio total de un xoloitzcuintle.
6. Inicialmente validar el conteo antes de usarlo para puja automática.
7. Después de validar, configurarlo como acción principal para el objetivo de leads.

generate_lead podría no aparecer todavía por estas razones:

- el sitio no lo había enviado;
- GTM todavía no estaba configurado o publicado;
- GA4 aún no lo había recibido;
- no estaba marcado como evento clave;
- Google Ads puede tardar en mostrarlo después de la recepción y vinculación.
