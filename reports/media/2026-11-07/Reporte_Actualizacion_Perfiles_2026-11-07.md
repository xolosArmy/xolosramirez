# Reporte de actualización de perfiles — 2026-11-07

**Estado: entrega parcial preparada; actualización del sitio aún no publicada.**

Se optimizaron 9 fotografías, se produjeron 8 Shorts y se guardaron todos los finales en Drive. Solo se publicó el Short de Michina. Los otros 7 no se subieron a YouTube porque se perdió la conexión de control del navegador; cuatro intentos de recuperación, incluido un reinicio de la sesión y una pestaña nueva, no la restablecieron. No se declara cumplido el criterio de finalización.

- Repositorio: [xolosArmy/xolosramirez](https://github.com/xolosArmy/xolosramirez).
- Rama: `codex/perfiles-multimedia-2026-11-07`.
- Base revisada: `8dea5afb315fbf7f3e35028e19ad1e2e12b16504`.
- Pull Request: pendiente de creación al preparar esta versión del informe.
- Squash and Merge: **no realizado**; faltan publicaciones, comprobaciones visuales y resolución o aceptación de fallos preexistentes de pruebas.
- Entrega en Drive: [Actualizacion_Perfiles_2026-11-07](https://drive.google.com/drive/folders/1EqLQKtvk5GYupEEgjyHxXhU0bFQBv0gm).

## Originales e incidencias de inventario

El directorio local contiene **20 archivos: 9 JPG y 11 MOV**, frente a los 19 archivos declarados. Atlixco tiene dos videos. `AtlixcoRamirez(2).MOV` fue revisado y conservado sin seleccionarlo; `AtlixcoRamirez.MOV` aporta las tomas elegidas. Este último archivo no figura entre los 19 originales de la carpeta de referencia de Drive.

Se calcularon y volvieron a verificar los SHA-256 de los 20 originales. Se guardaron copias binarias intactas de las 9 fotografías en `Originales/`. Los videos permanecen intactos en su ubicación de origen; rutas, tamaños y huellas están en `Reportes/inventario.json`. No se modificó ni renombró ningún original.

Los metadatos de creación y modificación indican junio de 2027, posterior a la fecha del encargo. Se conserva esta discrepancia y no se usa para afirmar fecha de grabación, edad o estado comercial. Los nombres de archivo suministrados son la asociación de identidad utilizada; no se intercambió XochiQuetzal con XolotlQuetzalli ni con Xochitl.

## Tratamiento fotográfico

Las nueve fotografías se evaluaron individualmente. La exposición y el detalle ya eran adecuados. Se conservaron sus colores, piel, marcas, anatomía y encuadre completo; no se aplicaron retoques estéticos ni generación de imágenes. Solo se preparó orientación EXIF, reducción proporcional a 1800 × 1200 y WebP calidad 92, conservando el perfil ICC cuando existía.

La comparación visual original/WebP fue satisfactoria para las nueve imágenes. El error absoluto medio por canal, comparando con el original reducido, se sitúa entre 1.20 y 1.78 niveles de 255; este dato mide la compresión, no sustituye la revisión visual. Los WebP pesan entre 173,458 y 267,002 bytes. Evidencias: `Comparacion_Fotos.jpg` y `verificacion_fotos.json`.

| Original conservado | Final web | Perfil ES/EN en la rama |
|---|---|---|
| `Iztak Ramirez foto (1).JPG` | [Iztak_Ramirez_foto_01_web.webp](https://drive.google.com/file/d/1tCg6WqFD7hgaqxJvxHRJL6lpDdb3RxfR/view?usp=drivesdk) | `iztac` |
| `Iztak Ramirez foto (2).JPG` | [Iztak_Ramirez_foto_02_web.webp](https://drive.google.com/file/d/1tC1pshkIWIOyvdOJ0wKcywUj8gexti6M/view?usp=drivesdk) | `iztac` |
| `Tlatoani Ramirez foto (1).JPG` | [Tlatoani_Ramirez_foto_01_web.webp](https://drive.google.com/file/d/1amgYcukAloTHjj_MIxTXcGvbZihSK1fp/view?usp=drivesdk) | `tlatoani` |
| `Tlatoani Ramirez foto (2).JPG` | [Tlatoani_Ramirez_foto_02_web.webp](https://drive.google.com/file/d/15SpFBYi9gKdoSNEKCdM6VVmXR83KnKZE/view?usp=drivesdk) | `tlatoani` |
| `Tlaxcalli Ramirez foto (1).JPG` | [Tlaxcalli_Ramirez_foto_01_web.webp](https://drive.google.com/file/d/1JhXvhaucezx_7GfIUvIV1vLRByV-Xf70/view?usp=drivesdk) | `tlaxcalli` |
| `Tlaxcalli Ramirez foto (2).JPG` | [Tlaxcalli_Ramirez_foto_02_web.webp](https://drive.google.com/file/d/1ErQJBw_EELTLpqgoLx7QtyO3LLGrYwYZ/view?usp=drivesdk) | `tlaxcalli` |
| `XolotlQuetzalli Ramirez foto (1).JPG` | [XolotlQuetzalli_Ramirez_foto_01_web.webp](https://drive.google.com/file/d/1cFXiN7LkJ1-GNnD0vmUiZgfm25ryT5Dj/view?usp=drivesdk) | `xolotlquetzalli` |
| `XolotlQuetzalli Ramirez foto (4).JPG` | [XolotlQuetzalli_Ramirez_foto_02_web.webp](https://drive.google.com/file/d/1CklAC7pa-a3Nfbql5KTamyMRInPd2MYQ/view?usp=drivesdk) | `xolotlquetzalli` |
| `Yolotl Ramirez foto (1).JPG` | [Yolotl_Ramirez_foto_01_web.webp](https://drive.google.com/file/d/1e_Ir15h5QZVYC5AS-nMK4CSlwvdJzduw/view?usp=drivesdk) | `yolotl` |

Los archivos `XolotlQuetzalli Ramirez foto (1).JPG` y `foto (4).JPG` corresponden respectivamente a `foto_01_web.webp` y `foto_02_web.webp`; no se asumió que faltasen las fotos 2 y 3.

## Shorts producidos y publicación

Los 8 MP4 tienen 1080 × 1920 (9:16), H.264, yuv420p, 29.97 fps y audio AAC a 48 kHz. Se verificaron sus pistas y su decodificación completa sin errores. La composición conserva el cuadro horizontal completo en un lienzo vertical con nombre e identidad editorial fuera de la imagen. No se estiró, interpoló, aceleró ni ralentizó al animal. Se emplearon cortes directos entre momentos seleccionados y breves fundidos de audio en los extremos.

Se conserva el audio original y no se añadió música. No se descargó ni incorporó música de licencia incierta. Las verificaciones de derechos de autor y Normas de la Comunidad de YouTube finalizaron sin problemas para Michina; los restantes videos requieren sus comprobaciones al subirlos.

| Ejemplar | Duración | Archivo final | YouTube |
|---|---:|---|---|
| Michina Ramírez | 15.62 s | [Michina_Ramirez_short_01.mp4](https://drive.google.com/file/d/1rkBwC9_-43tsHfns0fPPDxxCUt9wKMIm/view?usp=drivesdk) | [Publicado: DMOV25hO61M](https://www.youtube.com/shorts/DMOV25hO61M) |
| XochiQuetzal Ramírez | 24.82 s | [XochiQuetzal_Ramirez_short_01.mp4](https://drive.google.com/file/d/1oZCokQyWys4JqY8UCQh0uF19OnlwbmW9/view?usp=drivesdk) | Pendiente; sin ID asignado |
| XolotlQuetzalli Ramírez | 17.32 s | [XolotlQuetzalli_Ramirez_short_01.mp4](https://drive.google.com/file/d/15kUpO3OHR2kYiTbTh6v9zHXTXdG0pXlJ/view?usp=drivesdk) | Pendiente; sin ID asignado |
| Iztak Ramírez | 14.81 s | [Iztak_Ramirez_short_01.mp4](https://drive.google.com/file/d/1qBqa5F64G-OQDFFCzOBJto3cC2tLIjYO/view?usp=drivesdk) | Pendiente; sin ID asignado |
| Yolotl Ramírez | 23.02 s | [Yolotl_Ramirez_short_01.mp4](https://drive.google.com/file/d/1DdUrozRmlvw26RXJh_nHaIm5SaE-zSj_/view?usp=drivesdk) | Pendiente; sin ID asignado |
| Tlatoani Ramírez | 18.02 s | [Tlatoani_Ramirez_short_01.mp4](https://drive.google.com/file/d/1xy-PnKAnTanAsp6GDaRrdoKY8KvJQiWJ/view?usp=drivesdk) | Pendiente; sin ID asignado |
| Tlaxcalli Ramírez | 15.52 s | [Tlaxcalli_Ramirez_short_01.mp4](https://drive.google.com/file/d/1Ir9I5mPX8cyMNTglDI6RP6zNJ1OeZo5j/view?usp=drivesdk) | Pendiente; sin ID asignado |
| Atlixco Ramírez | 20.02 s | [Atlixco_Ramirez_short_01.mp4](https://drive.google.com/file/d/14TkGQ_4HIzAaTaW5nBMGCGFBFskBRmhl/view?usp=drivesdk) | Pendiente; sin ID asignado |

Michina: URL completa **https://www.youtube.com/shorts/DMOV25hO61M**, ID **DMOV25hO61M**. YouTube Studio mostró «Se ha publicado el vídeo» y fecha 7 nov 2026. Su API pública oEmbed devolvió el título personalizado, autor `Xolos Ramirez`, canal `https://www.youtube.com/@XolosRamirez` y reproductor vertical. La evidencia JSON se guarda en `youtube_michina_oembed.json`. La comprobación posterior de reproducción en la página pública queda pendiente porque el navegador se desconectó; la herramienta de consulta web también limitó la descarga de esa página.

Todos los títulos, descripciones personalizadas y hashtags se entregan en `metadatos_youtube.json`. XochiQuetzal tiene una invitación al proyecto general y no anuncia disponibilidad comercial ni apunta al perfil de otro ejemplar.

### Selección de tomas

Los tiempos siguientes son inicio y duración en segundos, con velocidad original. El plan exacto está en `plan_montaje.json`.

- **Michina Ramírez:** `Michina Ramirez.MOV`: 2.3 s + 10.4 s; `Michina Ramirez.MOV`: 22.5 s + 5.2 s.
- **XochiQuetzal Ramírez:** `XochiQuetzal Ramirez.MOV`: 0.2 s + 14.8 s; `XochiQuetzal Ramirez.MOV`: 26.0 s + 10.0 s.
- **XolotlQuetzalli Ramírez:** `XolotlQuetzalli Ramirez (2).MOV`: 0.0 s + 6.3 s; `XolotlQuetzalli Ramirez (2).MOV`: 9.0 s + 11.0 s.
- **Iztak Ramírez:** `IztakRamirez(1).MOV`: 0.2 s + 6.8 s; `IztakRamirez(1).MOV`: 17.0 s + 8.0 s.
- **Yolotl Ramírez:** `YolotlRamirez(3).MOV`: 10.5 s + 7.0 s; `YolotlRamirez.MOV`: 3.0 s + 11.0 s; `YolotlRamirez(1).MOV`: 0.2 s + 5.0 s.
- **Tlatoani Ramírez:** `TlatoaniRamirez.MOV`: 2.0 s + 11.0 s; `TlatoaniRamirez.MOV`: 18.0 s + 7.0 s.
- **Tlaxcalli Ramírez:** `TlaxcalliRamirez.MOV`: 1.5 s + 7.5 s; `TlaxcalliRamirez.MOV`: 18.0 s + 8.0 s.
- **Atlixco Ramírez:** `AtlixcoRamirez.MOV`: 13.5 s + 10.5 s; `AtlixcoRamirez.MOV`: 34.0 s + 9.5 s.

Para Yolotl se eligió un único recopilatorio de 23 segundos con fragmentos diferentes de sus tres fuentes, evitando publicar tres Shorts de contenido repetitivo. Para Atlixco se prefirieron las tomas con los ojos abiertos y la mirada más legible del video interior.

## Cambios del sitio preparados en la rama

Archivos: `xolos-disponibles.html` y `en/available-xolos.html`, más nueve assets en `img/xolos/`. Estos cambios todavía no están en `main` ni en el sitio publicado.

| Ejemplar | Identificador actual | Carrusel preparado, mismo orden ES/EN | Video preparado |
|---|---|---|---|
| Michina | `michina` | Foto principal actual conservada; sin foto nueva | Nuevo Short `DMOV25hO61M`, enlace alternativo y reproductor 9:16 de hasta 360 px |
| Tlatoani | `tlatoani` | Foto actual + nuevas 01 y 02 | Video actual conservado hasta publicar el nuevo |
| Tlaxcalli | `tlaxcalli` | Foto actual + nuevas 01 y 02 | Video actual conservado hasta publicar el nuevo |
| Atlixco | `atlixco` | Foto actual conservada; sin foto nueva | Video actual conservado hasta publicar el nuevo |
| Iztak | `iztac` | Foto actual + nuevas 01 y 02 | Video actual conservado hasta publicar el nuevo |
| Yolotl | `yolotl` | Dos fotos actuales + nueva 01 | Video actual conservado hasta publicar el nuevo |
| XolotlQuetzalli | `xolotlquetzalli` | Foto actual + nuevas 01 y 02 | Video actual conservado hasta publicar el nuevo |
| XochiQuetzal | Sin perfil localizado | No se creó ni se asignó a otro ejemplar | Short producido; publicación pendiente |

No se sustituyó ninguna fotografía anterior: cada foto principal permanece en primer lugar. Los textos alternativos nuevos y las etiquetas del reproductor de Michina están localizados. Se preservaron exactamente nombres e identificadores, descripciones, tallas, variedad, sexo, disponibilidad, estados de reserva, datos de seguimiento y enlaces comerciales. Todas las tarjetas conservan imagen, carrusel, información, contacto y reproductor.

## Verificación

- **Correcto:** SHA-256 de 20 originales y 9 copias fotográficas intactas.
- **Correcto:** 8 MP4 decodificados íntegramente, H.264/AAC, 1080 × 1920; 9 WebP legibles.
- **Correcto:** 9 fotos y 8 MP4 confirmados por lectura de sus carpetas de Drive, con nombres y tamaños coincidentes.
- **Correcto:** comprobación estructural de 7 perfiles por idioma, las 17 imágenes referidas por cada versión existen y se pueden decodificar; selección y orden de imágenes/videos ES/EN idénticos.
- **Correcto:** comparación de HTML con la base; solo cambiaron los carruseles previstos y el bloque de video de Michina. Datos comerciales, botones, tarjetas restantes y contenido fuera del alcance conservados.
- **Correcto:** `htmlhint` sobre ambos HTML, sin errores; `git diff --check`, sin errores.
- **Fallo preexistente:** `npm test`, ejecutado antes de modificar el sitio, falla porque `test-generate-lead-tracking.mjs:523` espera botones de email y WhatsApp para `nohpalli` que no están en el HTML de la base. No se modificó ese perfil ni la prueba.
- **Fallo preexistente del código sin cambios:** `node --test scripts/test-journey.mjs` pasa 12 de 13 pruebas; falla el test de analítica en la línea 204 porque `js/journey.js` emite también `personality_story_click`. Tanto el JS como la prueba son idénticos a la base. No se cambió analítica fuera del alcance multimedia.
- **Pendiente:** reproducción pública de Michina; carga y publicación de otros 7 Shorts; revisión visual de carruseles y reproductores en móvil y computadora; repetir verificaciones tras incorporar los IDs restantes.

Evidencias de pruebas: `npm-test.log`, `journey-test.log`, `htmlhint.log`, `verificacion_perfiles.json`, `verificacion_shorts.json` y `verificacion_fotos.json`.

## Acciones para finalizar

1. Restablecer el acceso al navegador de Codex para YouTube Studio.
2. Subir los siete MP4 pendientes con sus títulos y descripciones de `metadatos_youtube.json`; esperar comprobaciones y verificar publicación y enlaces. No duplicar Michina.
3. Registrar los siete IDs y URLs reales. Vincular únicamente los seis perfiles existentes correspondientes; XochiQuetzal continúa sin perfil comercial hasta confirmar identidad y estado.
4. Incorporar esos seis Shorts y sus enlaces alternativos en los dos HTML, con presentación vertical equivalente.
5. Revisar móvil y computadora, confirmar imágenes cargadas, funcionamiento de carruseles, correspondencia de videos y equivalencia ES/EN.
6. Revisar los fallos preexistentes de pruebas, completar las verificaciones del PR y resolver cualquier conflicto. Solo entonces realizar Squash and Merge y comprobar el despliegue.

**Resultado del Squash and Merge: pendiente, no ejecutado.** El encargo permanece incompleto hasta finalizar las publicaciones y la actualización efectiva de ambas páginas.
