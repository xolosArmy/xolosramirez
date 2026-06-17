# Contexto estructurado para correos Xolos Ramírez

Este contrato estandariza los enlaces `mailto:` y los formularios que llegan al orquestador/backend. El objetivo es que cada consulta pueda clasificarse por evento y cachorro sin depender del texto libre del mensaje.

## Contrato de asunto

Todo correo debe usar el asunto:

```text
[XOLOS] event=<evento> puppy=<slug>
```

Valores permitidos para `event`:

- `info`
- `reserve`
- `adoption`
- `visit`
- `waitlist`
- `general`

`puppy` debe ser un slug canónico compatible con `cachorros.json` o `general`.

Regex obligatoria para parsing del asunto:

```regex
\[XOLOS\]\s+event=(info|reserve|adoption|visit|waitlist|general)\s+puppy=([a-z0-9-]+|general)
```

## Contrato de cuerpo

El cuerpo debe iniciar con tres líneas de contexto y luego una línea vacía antes del mensaje humano:

```text
context_event=<evento>
context_puppy=<slug>
context_name=<Nombre Visible>

<Mensaje amigable>
```

Regex obligatorias para parsing multilínea del cuerpo:

```regex
^context_event=(info|reserve|adoption|visit|waitlist|general)$
^context_puppy=([a-z0-9-]+|general)$
^context_name=(.+)$
```

## Resolución de entidad

El mapeo real de cachorro siempre debe hacerse con el `slug` contra `cachorros.json`. `context_name` es solo una etiqueta visible para operadores y no debe usarse como llave primaria.

## Fallback

Si falla el parsing del asunto o del bloque de contexto del cuerpo, el backend debe asignar:

```text
event=general
puppy=general
```

Después del fallback, el mensaje puede tratarse como consulta general y debe conservarse el texto original para revisión humana.
