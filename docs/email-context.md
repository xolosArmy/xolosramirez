# Formato de contexto para correos

Todos los enlaces `mailto:` del sitio deben incluir contexto estructurado en asunto y cuerpo para que el orquestador elija una respuesta desde `cachorros.json`.

## Asunto

```text
[XOLOS] event=<EVENTO> puppy=<SLUG_O_GENERAL>
```

## Cuerpo

```text
context_event=<EVENTO>
context_puppy=<SLUG_O_GENERAL>
context_name=<NOMBRE_VISIBLE>

<Texto amable para la persona usuaria>
```

## Valores controlados

`event` debe ser uno de: `info`, `reserve`, `adoption`, `visit`, `waitlist`, `general`.

`puppy` debe ser el slug canónico del cachorro cuando aplique, o `general` para consultas sin cachorro específico. El slug es el identificador principal para mapear contra `cachorros.json`; `context_name` solo es apoyo humano.

## Parsing recomendado para el orquestador

1. Decodificar URL/quoted-printable del asunto y cuerpo si aplica.
2. Intentar extraer del asunto con:

```regex
\[XOLOS\]\s+event=(info|reserve|adoption|visit|waitlist|general)\s+puppy=([a-z0-9-]+|general)
```

3. Si falta contexto, buscar en el cuerpo con:

```regex
^context_event=(info|reserve|adoption|visit|waitlist|general)$
^context_puppy=([a-z0-9-]+|general)$
^context_name=(.+)$
```

usando modo multilínea.

4. Si todavía falta contexto, usar `event=general` y `puppy=general`.
