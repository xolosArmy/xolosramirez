# Línea base operativa: contacto → videollamada → reserva

Corte: 20–26 septiembre 2026, zona `America/Mexico_City`. Esta reconstrucción es **parcial**: el conector de Gmail disponible solo expuso `contacto@xolosarmy.xyz`. Las consultas `to:fernando@xolosramirez.com` en ese buzón no dan acceso al buzón de Fernando. Tampoco hubo acceso autenticado a Formspree ni a GTM/GA4/Google Ads. No equiparar este subconjunto con la semana completa.

## Evidencia inspeccionada

| Fuente | Resultado verificable |
| --- | --- |
| Inbox `contacto@xolosarmy.xyz` | Dos emails directos de perfiles y un tercer email de perfil asociado por nombre y proximidad a un Formspree previo. IDs Gmail: `1a0dec0f483e1325`, `1a0e04f007b20e09`, `1a0e041557917ba4`. |
| Notificaciones Formspree | Dos submissions comerciales de la semana: `1a0d4a51ccbefe04` y `1a0e03dbf2105499`; uno tiene un email de perfil posterior aparentemente del mismo prospecto. La notificación es evidencia de recepción del proveedor, aunque falta inspección directa de su panel. |
| Calendar primario `contacto@xolosarmy.xyz` | La búsqueda acotada no verificó citas agendadas atribuibles a estos prospectos. Eventos editoriales y tareas de seguimiento no se clasifican como videollamadas comerciales completadas. Puede existir evidencia fuera de este calendario. |
| Hoja Maestra | `Clientes`, `Pagos` y `Comunicaciones` contienen reservas y actividad previa, pero no una tabla de etapas de prospectos. Se agregó `Funnel Comercial` sin modificar esos registros. |

**Cuatro contactos nuevos únicos verificados en las fuentes accesibles:** dos entradas iniciales Formspree y dos entradas iniciales por email. El email de perfil posterior a un formulario se deduplicó provisionalmente por nombre, perfil y hora; confirmar identidad antes de vincular un pago. Las cuatro filas y los IDs fuente están en `Funnel Comercial!A2:M5` de la [Hoja Maestra](https://docs.google.com/spreadsheets/d/1aZom-7Tx6GUZDnUkXpkcgm1qptM7EvHNXG5XMff0WR0/edit). Los campos posteriores sin prueba permanecen vacíos o `unknown`.

La reconstrucción preliminar del encargo indicaba 15 contactos (13 email a Fernando, uno a contacto y uno Formspree). La diferencia obedece al alcance del buzón conectado y a dos notificaciones Formspree observadas aquí. **No se sustituye el 15 por 4 como total semanal.** Se necesita el inbox real de Fernando y la conciliación de Formspree para cerrar el denominador y confirmar el posible duplicado.

## Métricas pendientes

No calcular porcentajes de contactos → cita, cita realizada → reserva, price inquiry → reserva o profile inquiry → reserva: faltan el denominador completo, citas atribuibles y evidencia operativa de realización y pagos. Las cifras de GA4 aportadas en el encargo son contexto preliminar, no un conteo de contactos recibidos ni de reservas. Mantener numerador y denominador explícitos cuando ambas fuentes sean verificables.

## Registro futuro

En `Funnel Comercial`, `contact_received=yes` requiere email inbound o Formspree aceptado; `video_call_scheduled_at` requiere evento de Calendar enlazado; `video_call_completed` requiere confirmación humana; `reservation_status=confirmed` y `reservation_confirmed_at` requieren comprobante o conciliación comercial. `unknown` no significa `no`. El `prospect_id` no contiene correo, nombre ni teléfono. Guardar referencias internas a la evidencia en `notes`, evitando contenido de mensajes y PII en los informes.
