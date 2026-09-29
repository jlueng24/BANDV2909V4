# Diversión con el mundo — versión 3.2

## Subir a GitHub Pages

Descomprime el ZIP y sube **el contenido de esta carpeta** a la raíz del repositorio. `index.html` debe quedar en la raíz, junto a `app.js`, `achievements.js`, `achievements.json` y `countries-local.json`. Conserva la carpeta `img/logros` con sus SVG. GitHub no ejecuta la aplicación si solo subes el archivo ZIP.

Al actualizar un sitio ya publicado, reemplaza los archivos existentes por los de esta versión. El progreso anterior permanece guardado en el navegador del jugador.

## Catálogos

- Europa tiene 45 países en `countries-local.json`, disponible aunque falle la carga mundial.
- El catálogo mundial se obtiene de [mledoze/countries](https://github.com/mledoze/countries), con licencia ODbL 1.0, y se guarda localmente tras una carga correcta. Si esa descarga falla, la aplicación muestra el alcance disponible y permite jugar Europa; no presenta 45 países como si fueran todo el mundo.
- Las banderas se muestran desde FlagCDN. Las imágenes de logros, en cambio, están incluidas en `img/logros`.

## Verificación técnica

Con Node.js instalado, ejecuta `node tests/smoke.cjs` desde esta carpeta. Comprueba el catálogo mundial y su respaldo, preguntas únicas en Banderas, Capitales y Mixto, las repeticiones de repaso en Estudio, Supervivencia más allá de diez preguntas, el reto diario, la pausa, los logros y las 19 ilustraciones.

Las partidas normales no repiten país dentro de la misma ronda. En Estudio vuelven las preguntas falladas hasta acertarlas. En Supervivencia se recorren los países del tema antes de volver a empezar el catálogo. El reloj se detiene al responder y se reanuda al mostrar la siguiente pregunta; si se agota, el resultado indica «Se agotó el tiempo» sin sumar una respuesta fallada. La pantalla final muestra las preguntas jugadas, la mejor racha de esa partida y las ilustraciones de los logros nuevos. El reto diario usa la fecha local y conserva exactamente la misma pregunta si se abre de nuevo ese día.
