# Plataforma de trabajo

Sistema de gestión de una empresa de limpieza y mantenimiento de Mendoza, Argentina: fichaje del personal por
sede, control de jornadas con semáforo, novedades, cronograma de cobertura, licencias, feriados y preliquidación.
Hoy es un prototipo navegable con datos de ejemplo. El dueño no es programador: explicar cada cambio por lo
que ve la persona que usa la aplicación, no por el código.

## Comandos

- Armar: `python3 armar.py`. Genera `sitio/` (lo que publica el hosting) e `index.html` (un solo archivo, para el
  artefacto de Claude; no se sube). Correrlo después de cualquier cambio en `src/` y subir `sitio/` con las fuentes.
- Reglas: `node pruebas/logica.test.js`
- Recorrido en el navegador: `node pruebas/navegador.js` (Playwright y Chrome; `CHROME` cambia la ruta)
- Instalación y uso sin conexión: `node pruebas/sitio.js`

Antes de subir un cambio tienen que pasar las tres.

## Cómo está hecho

- JavaScript sin framework ni dependencias en tiempo de ejecución.
- `src/logica.js`: reglas, datos de ejemplo y acciones, sin tocar el DOM. Se prueba en Node.
- `src/vistas.js`: dibuja con plantillas y delega los eventos por atributos (`data-a`, `data-form`, `data-draft`).
- `src/sitio.js`, `src/sw.js`, `src/manifest.webmanifest`: solo para el sitio publicado (instalación, sin conexión).
- `sitio/` es salida de `armar.py`: no se edita a mano.
- Los horarios se guardan en minutos desde las 00:00 del día en que empieza el tramo. Un turno de noche termina
  pasado el minuto 1440 y pertenece al día en que empezó.

## Reglas del negocio ya decididas

- La modalidad de pago (fijo o por hora) va en la asignación, que es una persona en una sede. Una sola asignación
  por sede: el tiempo de más en la misma sede es hora extra.
- Semáforo por tramo: verde (correcto), amarillo (llegó o salió tarde), rojo (inasistencia o demora mayor a
  15 minutos), estrella (hora extra verificada por el supervisor). Los umbrales están en `S.P`.
- El tiempo de más que supera el margen abre un control excedente, que resuelve el supervisor: hora extra u
  olvido de marcar la salida. Hasta que se resuelve no suma horas.
- Se trabaja todos los días, las 24 horas. Los feriados se trabajan y se distinguen en la liquidación. Recargo
  sugerido para el pago por hora: 100 % en feriado nacional y 0 % en día no laborable, editable. Lo fijo se
  liquida según convenio y está sin definir.
- Topes diarios: 8 h en asignaciones fijas y 10 h para quien trabaja por hora. Se pueden cambiar; cambiarlos o
  superarlos avisa al supervisor y no bloquea la carga.
- Cierre de jornada con mensaje alentador y confirmación de horas por el propio colaborador.

## Convenciones

- Texto de la interfaz en español rioplatense, con voseo, frases cortas y sin jerga técnica. El personal usa
  teléfonos modestos: la vista del colaborador tiene que seguir siendo liviana y simple.
- Diseño: tipografía Overpass, acento cobalto, y el semáforo siempre como luces sobre una carcasa oscura. Los
  colores y medidas salen de las variables de `:root` en `src/estilos.css`.
- Cada regla nueva lleva su prueba en `pruebas/logica.test.js` y cada flujo nuevo su paso en `pruebas/navegador.js`.

## Pendiente

- Usuarios con permisos por rol, base de datos y fichaje real: QR de sede que cambia cada día, ubicación y hora
  de servidor.
- Por definir con el dueño: liquidación de lo fijo según convenio, valor de la hora extra, descuento por
  inasistencia y pago del traslado entre sedes.
