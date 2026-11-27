'use strict';
/* Recorre la versión real (sitio/) en Chrome contra el servidor de pruebas: primera configuración, ingreso con DNI,
   carga de sedes, personas y asignaciones, pantalla de la sede, fichaje verificado, supervisión y permisos.
   Uso: node pruebas/real.js */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { crear } = require('./servidor-falso.js');

const salida = path.join(__dirname, '..', 'capturas-real');
fs.mkdirSync(salida, { recursive: true });
for (const f of fs.readdirSync(salida)) fs.unlinkSync(path.join(salida, f));

let ok = 0, mal = 0;
function igual(real, esperado, nombre) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) ok++;
  else { mal++; console.log('FALLA  ' + nombre + '\n   esperado ' + JSON.stringify(esperado) + '\n   real     ' + JSON.stringify(real)); }
}
function contiene(real, parte, nombre) {
  if (String(real).indexOf(parte) >= 0) ok++;
  else { mal++; console.log('FALLA  ' + nombre + '\n   debía contener ' + JSON.stringify(parte) + '\n   real           ' + JSON.stringify(String(real).slice(0, 500))); }
}

const CENTRO = { latitude: -32.8895, longitude: -68.8458, accuracy: 12 };
const PARQUE = { latitude: -32.8908, longitude: -68.8872, accuracy: 15 };
const DEPOSITO = { latitude: -32.9261, longitude: -68.8017, accuracy: 20 };
const LEJOS = { latitude: -32.9400, longitude: -68.8458, accuracy: 20 };
const CLAVE_ADMIN = 'administra-2026', CLAVE_INICIAL = 'limpieza2026';

(async () => {
  const srv = await crear({});
  srv.instalacion('MZA-4471-KLP');
  srv.reloj('2026-11-27', '07:40');
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errores = [];
  /* Cada persona usa su propio navegador: su sesión, su teléfono y su ubicación. */
  async function abrir(quien, opciones) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, locale: 'es-AR', serviceWorkers: 'block' }, opciones || {}));
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', e => errores.push(quien + ', pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_EMPTY_RESPONSE/.test(m.text())) errores.push(quien + ', console: ' + m.text()); });
    return page;
  }
  const txt = async (page, s) => ((await page.textContent(s)) || '').replace(/\u00a0/g, ' ').trim();
  const cap = (page, n, opt) => page.screenshot(Object.assign({ path: path.join(salida, n + '.png') }, opt || {}));
  const listo = page => page.waitForFunction(() => !document.body.classList.contains('ocupado'));
  const sinDesborde = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const borrarAviso = page => page.evaluate(() => { const a = document.getElementById('aviso'); a.textContent = ''; a.classList.remove('visible'); });
  const aviso = async page => { await page.waitForFunction(() => document.getElementById('aviso').textContent !== ''); return txt(page, '#aviso'); };
  /* Un clic que termina en un pedido al servidor: espera la respuesta y devuelve el aviso, si hubo. */
  async function pulsar(page, selector) {
    await borrarAviso(page);
    if (typeof selector === 'string') await page.click(selector); else await selector.click();
    await listo(page);
    return txt(page, '#aviso');
  }
  const cuando = (page, fn, arg) => page.waitForFunction(fn, arg);
  const errorEn = (page, selector, parte) => page.waitForFunction(x => ((document.querySelector(x[0]) || {}).textContent || '').indexOf(x[1]) >= 0, [selector, parte]).then(() => txt(page, selector));
  /* Pone el reloj del servidor y vuelve a sincronizar la pantalla de la sede, que si no seguiría mostrando códigos de la hora anterior. */
  let tablet = null;
  async function aLas(hhmm, f) {
    srv.reloj(f || srv.hoy(), hhmm);
    if (tablet && srv.M.pantallas.some(x => !x.revocada)) { await tablet.reload({ waitUntil: 'load' }); await tablet.waitForSelector('#pan-qr svg'); }
  }
  const enPantalla = async () => (await txt(tablet, '#pan-codigo')).replace(/\D/g, '');
  async function ingresar(page, dni, clave) {
    await page.fill('#in-dni', dni);
    await page.fill('#in-clave', clave);
    await page.click('#btn-ingresar');
    await listo(page);
  }
  async function elegirClave(page, clave) {
    await page.fill('#cl-nueva', clave);
    await page.fill('#cl-repetir', clave);
    await page.click('#btn-clave');
    await listo(page);
  }
  const persona = nombre => srv.M.personas.find(p => p.nombre === nombre);
  const sedeDe = nombre => srv.M.sedes.find(s => s.nombre === nombre);
  const turnoDe = (nombre, f) => srv.M.jornadas.find(j => j.persona_id === persona(nombre).id && j.f === (f || srv.hoy()));

  try {
    /* ---------- Primera configuración ---------- */
    const adm = await abrir('administración', { viewport: { width: 1280, height: 900 } });
    await adm.goto(srv.url, { waitUntil: 'load' });
    await adm.waitForSelector('form[data-form="instalar"]');
    igual(await adm.title(), 'Plataforma de trabajo', 'título del sitio');
    igual(await txt(adm, '.acceso h1'), 'Primera configuración', 'sin cuentas, ofrece crear la de administración');
    igual(await adm.locator('#reloj-hora').count(), 0, 'la versión real no trae el reloj de la demo');
    await cap(adm, '01-primera-configuracion');
    const instalar = async v => {
      const d = Object.assign({ codigo: 'MZA-4471-KLP', dni: '20.111.222', nombre: 'Estela', apellido: 'Funes', clave: CLAVE_ADMIN, clave2: CLAVE_ADMIN }, v);
      for (const k of Object.keys(d)) await adm.fill('#ins-' + k, d[k]);
      await adm.click('#btn-instalar');
      await listo(adm);
      return (await adm.locator('.acceso .error').count()) ? txt(adm, '.acceso .error') : '';
    };
    igual(await instalar({ dni: '123' }), 'Escribí tu DNI solo con números, sin puntos.', 'valida el DNI');
    igual(await instalar({ clave: 'corta', clave2: 'corta' }), 'La clave tiene que tener al menos 8 caracteres.', 'pide una clave de 8 o más');
    igual(await instalar({ clave2: 'otra-distinta' }), 'Las dos claves no coinciden.', 'pide repetir la misma clave');
    igual(await instalar({ codigo: 'NO-ES-ESTE' }), 'El código de configuración no es válido o ya venció.', 'sin el código de configuración no se crea nada');
    igual(srv.M.personas.length, 0, 'y no quedó ninguna cuenta');
    igual(await instalar({ codigo: 'mza 4471 klp' }), '', 'con el código, crea la cuenta');
    await adm.waitForSelector('.titulo-pagina h1');
    igual(await txt(adm, '.titulo-pagina h1'), 'Administración', 'entra directo a Administración');
    contiene(await txt(adm, '#cuenta'), 'Estela Funes', 'la cabecera dice quién está usando la aplicación');
    igual(await txt(adm, '.titulo-pagina p'), 'Viernes 27 de noviembre, 07:40', 'la fecha y la hora son las del servidor');
    igual(await adm.locator('.subtabs button[aria-current="true"]').textContent(), 'Sedes', 'sin sedes, abre en la pestaña Sedes');
    igual(await adm.locator('.pasos .pill').allTextContents(), ['Paso 1', 'Paso 2', 'Paso 3', 'Paso 4'], 'muestra los cuatro primeros pasos');
    igual(srv.M.config.instalacion_hash, null, 'el código de configuración sirve una sola vez');
    igual(await sinDesborde(adm), true, 'administración no desborda en una computadora');

    /* ---------- Sedes ---------- */
    const altaSede = async v => {
      const d = Object.assign({ nombre: '', dir: '', ubi: '', radio: '150', ver: 'pantalla' }, v);
      await adm.fill('#sn-nombre', d.nombre);
      await adm.fill('#sn-dir', d.dir);
      await adm.fill('#sn-ubi', d.ubi);
      await adm.fill('#sn-radio', d.radio);
      await adm.selectOption('#sn-ver', d.ver);
      const t = await pulsar(adm, '#btn-sede-alta');
      return t || txt(adm, 'form[data-form="sede"][data-id=""] .error');
    };
    igual(await altaSede({ ubi: '-32.8895, -68.8458' }), 'Escribí el nombre de la sede.', 'la sede necesita nombre');
    contiene(await altaSede({ nombre: 'Sede Centro', ubi: 'frente a la plaza' }), 'No pudimos leer la ubicación', 'y una ubicación que se pueda leer');
    contiene(await altaSede({ nombre: 'Sede Centro', ubi: 'https://share.google/sJIzX73O8LNmVxDjO' }), 'Ese enlace no es el de Google Maps. Abrí el lugar en Google Maps, tocá Compartir y pegá ese enlace', 'un enlace de Google que no es el de Maps: explica cuál pegar');
    srv.M.enlaces['maps.app.goo.gl/PruebaCentro1'] = { ok: true, lat: -32.8895, lon: -68.8458, exacto: true };
    srv.M.enlaces['maps.app.goo.gl/SoloElMapa'] = { ok: true, lat: -32.8911, lon: -68.8869, exacto: false };
    srv.M.enlaces['maps.app.goo.gl/SinPunto'] = { ok: false, motivo: 'sin_ubicacion' };
    contiene(await altaSede({ nombre: 'Sede Centro', ubi: 'https://maps.app.goo.gl/EsteNoExiste' }), 'Ese enlace ya no existe o quedó mal copiado', 'un enlace de Google Maps que no existe: lo dice');
    contiene(await altaSede({ nombre: 'Sede Centro', ubi: 'https://maps.app.goo.gl/SinPunto' }), 'Ese enlace no trae la ubicación del lugar', 'uno que no trae el punto: lo dice y ofrece las coordenadas');
    igual(srv.M.sedes.length, 0, 'y no guarda una sede con una ubicación que no pudo leer');
    igual(await altaSede({ nombre: 'Sede Centro', dir: 'San Martín 1100, Mendoza', ubi: 'maps.app.goo.gl/PruebaCentro1' }), 'Sede agregada. Revisá el punto con Ver en el mapa.', 'alta de una sede pegando el enlace que da Google Maps al compartir');
    igual([sedeDe('Sede Centro').lat, sedeDe('Sede Centro').lon, await adm.inputValue('#se' + sedeDe('Sede Centro').id + '-ubi')], [-32.8895, -68.8458, '-32.8895, -68.8458'], 'la sede queda con el punto del lugar, y el campo pasa a mostrar las coordenadas');
    igual(await altaSede({ nombre: 'Sede Parque', dir: 'Av. del Libertador 500', ubi: 'https://www.google.com/maps/place/Parque/@-32.8911,-68.8869,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-32.8908!4d-68.8872', ver: 'impreso' }), 'Sede agregada. Revisá el punto con Ver en el mapa.', 'alta con el enlace largo de Google Maps');
    igual(await altaSede({ nombre: 'Depósito', ubi: '(-32,9261 -68,8017)', radio: '200', ver: 'ubicacion' }), 'Sede agregada. Revisá el punto con Ver en el mapa.', 'alta de una sede que verifica solo con la ubicación, con las coordenadas escritas con coma');
    igual([sedeDe('Depósito').lat, sedeDe('Depósito').lon], [-32.9261, -68.8017], 'que se guardan igual');
    igual([sedeDe('Sede Parque').lat, sedeDe('Sede Parque').lon, sedeDe('Sede Parque').verificacion], [-32.8908, -68.8872, 'impreso'], 'del enlace toma el punto exacto del lugar');
    igual(await adm.locator('.sede-ficha').count(), 3, 'las tres sedes quedan a la vista');
    igual(await adm.inputValue('#sn-nombre'), '', 'y el formulario de alta queda limpio');
    contiene(await adm.locator('.sede-ficha', { hasText: 'Pantallas de esta sede' }).textContent(), 'Todavía no hay una pantalla vinculada', 'avisa que a la sede con pantalla le falta vincularla');
    igual(await adm.locator('.pasos .pill').allTextContents(), ['Listo', 'Paso 2', 'Paso 3', 'Paso 4'], 'el primer paso queda hecho y la pantalla de Sede Centro sigue pendiente');
    const centro = String(sedeDe('Sede Centro').id), parque = String(sedeDe('Sede Parque').id), deposito = String(sedeDe('Depósito').id);
    await adm.fill('#se' + centro + '-radio', '120');
    igual(await pulsar(adm, '#se-g-' + centro), 'Sede guardada.', 'se puede corregir una sede');
    await adm.fill('#se' + deposito + '-ubi', 'https://maps.app.goo.gl/SoloElMapa?g_st=ic');
    igual(await pulsar(adm, '#se-g-' + deposito), 'Sede guardada. El enlace solo traía el centro del mapa: revisá el punto con Ver en el mapa.', 'si el enlace solo trae el centro del mapa, avisa que el punto puede no ser exacto');
    await adm.fill('#se' + deposito + '-ubi', '-32.9261, -68.8017');
    igual(await pulsar(adm, '#se-g-' + deposito), 'Sede guardada. Revisá el punto con Ver en el mapa.', 'y se corrige pegando las coordenadas');
    igual(sedeDe('Sede Centro').radio_m, 120, 'y el radio nuevo llega al servidor');
    await cap(adm, '02-sedes', { fullPage: true });

    /* ---------- Clave inicial y personas ---------- */
    await adm.click('#adm-personas');
    const altaPersona = async (dni, nombre, apellido, rol) => {
      await adm.fill('#pa-dni', dni);
      await adm.fill('#pa-nombre', nombre);
      await adm.fill('#pa-apellido', apellido);
      await adm.selectOption('#pa-rol', rol);
      const t = await pulsar(adm, '#btn-persona-alta');
      return t || txt(adm, 'form[data-form="persona-alta"] .error');
    };
    igual(await altaPersona('30111222', 'Marta', 'Giménez', 'colaborador'), 'Antes de dar de alta personas, definí la clave inicial.', 'primero hay que definir la clave inicial');
    await adm.fill('#ci-clave', 'abc');
    await pulsar(adm, '#btn-clave-inicial');
    contiene(await txt(adm, 'form[data-form="clave-inicial"] .error'), 'entre 6 y 40 caracteres', 'la clave inicial tiene un largo mínimo');
    await adm.fill('#ci-clave', CLAVE_INICIAL);
    igual(await pulsar(adm, '#btn-clave-inicial'), 'Clave inicial guardada.', 'guarda la clave inicial');
    igual(await adm.locator('#ci-clave').count(), 0, 'y deja de mostrarla');
    contiene(await altaPersona('30.111.222', 'Marta', 'Giménez', 'colaborador'), 'Alta lista.', 'alta de una colaboradora con su DNI');
    igual(await altaPersona('30111222', 'Otra', 'Persona', 'colaborador'), 'Ya hay una persona con ese DNI.', 'no se repite un DNI');
    igual(await altaPersona('12ab', 'Otra', 'Persona', 'colaborador'), 'Escribí el DNI solo con números, sin puntos.', 'valida el DNI del alta');
    contiene(await altaPersona('28999111', 'Diego', 'Rojas', 'supervisor'), 'Alta lista.', 'alta de un supervisor');
    contiene(await altaPersona('31222333', 'Lucia', 'Paredes', 'colaborador'), 'Alta lista.', 'alta de Lucía');
    contiene(await altaPersona('33444555', 'Ramón', 'Ortiz', 'colaborador'), 'Alta lista.', 'alta de Ramón');
    contiene(await altaPersona('35666777', 'Carla', 'Sosa', 'colaborador'), 'Alta lista.', 'alta de Carla');
    igual(await adm.locator('.tabla-personas tbody tr').count(), 6, 'seis personas en la lista');
    const filaP = n => adm.locator('.tabla-personas tbody tr', { hasText: n });
    contiene(await filaP('Marta Giménez').textContent(), 'Sin primer ingreso', 'quien no entró todavía figura sin primer ingreso');
    contiene(await filaP('Estela Funes').textContent(), 'Sos vos', 'la lista marca la cuenta propia');
    igual(await filaP('Estela Funes').locator('button', { hasText: 'Dar de baja' }).count(), 0, 'nadie se da de baja a sí mismo');
    const idLucia = String(persona('Lucia').id);
    await adm.click('#pe-e-' + idLucia);
    await adm.fill('#pe-nombre-' + idLucia, 'Lucía');
    igual(await pulsar(adm, '#pe-g-' + idLucia), 'Datos guardados.', 'corrige el nombre de una persona');
    igual(persona('Lucía').dni, '31222333', 'sin tocar su DNI');
    igual(await sinDesborde(adm), true, 'la lista de personas no desborda');
    await cap(adm, '03-personas', { fullPage: true });

    /* ---------- Asignaciones, horario contratado y reglas ---------- */
    await adm.click('#adm-personal');
    const altaAsig = async v => {
      await adm.selectOption('#as-colab', String(persona(v.quien).id));
      await adm.selectOption('#as-sede', String(sedeDe(v.sede).id));
      await adm.fill('#as-ti', v.ti);
      await adm.fill('#as-tf', v.tf);
      await adm.selectOption('#as-mod', v.mod || 'hora');
      await adm.fill('#as-valor', v.valor == null ? '7000' : v.valor);
      const t = await pulsar(adm, '#btn-asig');
      return t || txt(adm, 'form[data-form="asig"] .error');
    };
    igual(await adm.locator('.pasos .pill').allTextContents(), ['Listo', 'Listo', 'Paso 3', 'Paso 4'], 'con la clave inicial y las altas, el segundo paso queda hecho');
    igual(await adm.locator('#as-colab option').allTextContents(), ['Estela Funes', 'Marta Giménez', 'Ramón Ortiz', 'Lucía Paredes', 'Diego Rojas', 'Carla Sosa'], 'el alta de asignación ofrece a las personas cargadas, por apellido');
    igual(await adm.inputValue('#as-valor'), '', 'sin asignaciones cargadas, el valor no viene con ningún número de ejemplo');
    igual(await altaAsig({ quien: 'Marta', sede: 'Sede Centro', ti: '08:00', tf: '14:00', valor: '' }), 'El valor tiene que ser mayor que cero.', 'y hay que escribirlo');
    igual(await altaAsig({ quien: 'Marta', sede: 'Sede Centro', ti: '08:00', tf: '14:00' }), 'Asignación agregada.', 'asignación de Marta en Sede Centro');
    contiene(await altaAsig({ quien: 'Marta', sede: 'Sede Centro', ti: '16:00', tf: '18:00' }), 'Ya tiene una asignación en Sede Centro', 'una sola asignación por sede');
    igual(await altaAsig({ quien: 'Lucía', sede: 'Sede Parque', ti: '08:00', tf: '12:00', mod: 'fijo', valor: '900000' }), 'Asignación agregada.', 'asignación fija de Lucía en Sede Parque');
    igual(await altaAsig({ quien: 'Ramón', sede: 'Depósito', ti: '08:00', tf: '12:00' }), 'Asignación agregada.', 'asignación de Ramón en el Depósito');
    igual(await altaAsig({ quien: 'Carla', sede: 'Sede Centro', ti: '08:00', tf: '09:00' }), 'Asignación agregada.', 'asignación de Carla en Sede Centro');
    igual(srv.M.jornadas.filter(j => j.f === '2026-11-27').length, 4, 'cada asignación genera su turno de hoy');
    igual([await adm.inputValue('#as-ti'), await adm.inputValue('#as-valor')], ['08:00', '7000'], 'después de cada alta el formulario vuelve a sus valores de partida, y propone el último valor hora cargado');
    const asigMarta = String(srv.M.asignaciones.find(a => a.persona_id === persona('Marta').id).id);
    await borrarAviso(adm);
    await adm.fill('#a-tf-' + asigMarta, '15:00');
    await adm.locator('#a-tf-' + asigMarta).blur();
    await listo(adm);
    igual([srv.M.asignaciones.find(a => String(a.id) === asigMarta).tf, turnoDe('Marta').tf], [900, 900], 'cambiar el horario de una asignación actualiza el turno de hoy que todavía no empezó');
    await borrarAviso(adm);
    await adm.fill('#a-valor-' + asigMarta, '0');
    await adm.locator('#a-valor-' + asigMarta).blur();
    igual(await aviso(adm), 'El valor tiene que ser mayor que cero.', 'las reglas de siempre siguen validando antes de guardar');
    igual(srv.M.asignaciones.find(a => String(a.id) === asigMarta).valor, 7000, 'y lo que no pasa la regla no llega al servidor');
    await cap(adm, '04-asignaciones', { fullPage: true });

    await adm.click('#adm-cronograma');
    await adm.click('#sg-' + centro);
    await adm.fill('#nf-ti', '08:00');
    await adm.fill('#nf-tf', '15:00');
    await adm.fill('#nf-dot', '2');
    igual(await pulsar(adm, '#btn-franja'), 'Franja contratada agregada.', 'horario contratado de Sede Centro');
    igual(await adm.locator('.g-dia.hoy .g-seg').allTextContents(), ['2/2', '1/2'], 'la grilla cuenta asignadas sobre contratadas: de 8 a 9 están las dos y después falta una');
    contiene(await txt(adm, '#sg-' + centro), '7 días con franjas sin cubrir', 'y resume la semana de la sede');
    await cap(adm, '05-cronograma', { fullPage: true });

    await adm.click('#adm-licencias');
    await adm.selectOption('#li-colab', String(persona('Carla').id));
    await adm.fill('#li-desde', '2026-12-01');
    await adm.fill('#li-hasta', '2026-12-05');
    contiene(await pulsar(adm, '#btn-licencia'), 'Ausencia cargada.', 'vacaciones de Carla');
    igual(srv.M.licencias.length, 1, 'la ausencia queda en el servidor');

    await adm.click('#adm-feriados');
    await adm.fill('#fe-f', '2026-12-24');
    await adm.fill('#fe-nombre', 'Asueto de Nochebuena');
    igual(await pulsar(adm, '#btn-feriado'), 'Fecha agregada al calendario.', 'agrega un asueto propio');
    await borrarAviso(adm);
    await adm.selectOption('#fe-tipo-2026-12-24', 'no_laborable');
    await listo(adm);
    igual(srv.M.feriados.find(x => x.f === '2026-12-24').tipo, 'no_laborable', 'y le cambia el tipo');
    igual(await pulsar(adm, '#fe-q-2026-12-24'), 'Fecha quitada del calendario.', 'lo quita');
    igual(srv.M.feriados.some(x => x.f === '2026-12-24'), false, 'y ya no está en el servidor');

    await adm.click('#adm-reglas');
    await borrarAviso(adm);
    await adm.fill('#p-topeHora', '5');
    await adm.locator('#p-topeHora').blur();
    igual(await aviso(adm), 'Tope actualizado. Supervisión ya tiene el aviso.', 'cambiar un tope avisa a supervisión');
    await listo(adm);
    igual([srv.M.config.p.topeHora, srv.M.avisos.length], [5, 1], 'y el tope y el aviso quedan guardados');
    contiene(srv.M.avisos[0].texto, 'de 10 a 5 h. Con las asignaciones actuales queda por encima: Marta Giménez.', 'el aviso nombra a quien queda por encima');

    /* ---------- Pantalla de la sede ---------- */
    await adm.click('#adm-sedes');
    await pulsar(adm, '#se-v-' + centro);
    const vinculo = (await txt(adm, '.codigo-grande')).replace(/\D/g, '');
    igual(vinculo.length, 8, 'administración recibe un código de ocho números para vincular la pantalla');
    contiene(await adm.locator('.sede-ficha', { hasText: 'Código para vincular' }).textContent(), '#pantalla', 'y la dirección que hay que abrir en la tablet');
    await cap(adm, '06-vincular-pantalla', { fullPage: true });

    tablet = await abrir('pantalla', { viewport: { width: 1024, height: 768 } });
    await tablet.goto(srv.url + '#pantalla', { waitUntil: 'load' });
    await tablet.waitForSelector('form[data-form="pantalla-vincular"]');
    igual(await tablet.isVisible('.barra'), false, 'la pantalla de la sede no muestra la cabecera de la aplicación');
    await tablet.fill('#pv-codigo', '1234');
    await tablet.click('#btn-pantalla-vincular');
    await tablet.waitForFunction(() => document.querySelector('.acceso .error').textContent !== '');
    igual(await txt(tablet, '.acceso .error'), 'El código tiene 8 números.', 'pide el código completo');
    await tablet.fill('#pv-codigo', vinculo === '00000000' ? '00000001' : '00000000');
    await tablet.click('#btn-pantalla-vincular');
    await tablet.waitForFunction(() => /no es válido/.test(document.querySelector('.acceso .error').textContent));
    contiene(await txt(tablet, '.acceso .error'), 'Ese código no es válido o ya venció', 'rechaza un código que no es');
    await tablet.fill('#pv-codigo', vinculo.slice(0, 4) + ' ' + vinculo.slice(4));
    await tablet.fill('#pv-nombre', 'Recepción');
    await tablet.click('#btn-pantalla-vincular');
    await tablet.waitForSelector('#pan-qr svg');
    igual(await txt(tablet, '.pan-sede'), 'Sede Centro', 'vinculada, muestra el nombre de la sede');
    igual(await enPantalla(), srv.codigo(centro), 'y el código de seis números que el servidor espera en este momento');
    igual(await tablet.locator('#pan-qr svg path').count(), 1, 'con su QR');
    /* Estos cuatro códigos salieron de la función de la base (dem.totp): la base, el servidor de pruebas y la pantalla tienen que dar lo mismo. */
    const CASOS = [['000102030405060708090a0b0c0d0e0f10111213', 59413920, '559256'], ['ffeeddccbbaa99887766554433221100aabbccdd', 1, '897230'],
      ['3132333435363738393031323334353637383930', 4294967301, '852258'], ['00000000000000000000000000000000000000ff', 60000000, '678451']];
    igual(CASOS.map(c => srv.totp(Buffer.from(c[0], 'hex'), c[1])), CASOS.map(c => c[2]), 'el servidor de pruebas calcula los códigos igual que la base');
    igual(await tablet.evaluate(cs => Promise.all(cs.map(c => totp(new Uint8Array(c[0].match(/../g).map(h => parseInt(h, 16))), c[1]))), CASOS), CASOS.map(c => c[2]), 'y la pantalla de la sede también');
    igual(await txt(tablet, '#pan-hora'), '07:40', 'y la hora del servidor');
    await cap(tablet, '07-pantalla-de-sede');
    await tablet.reload({ waitUntil: 'load' });
    await tablet.waitForSelector('#pan-qr svg');
    igual(await enPantalla(), srv.codigo(centro), 'la pantalla sigue vinculada después de apagarla y prenderla');
    igual(srv.M.pantallas.length, 1, 'el código de vinculación se usó una sola vez');
    await adm.reload({ waitUntil: 'load' });
    await adm.waitForSelector('.titulo-pagina h1');
    await adm.click('#adm-sedes');
    contiene(await adm.locator('.sede-ficha', { hasText: 'Pantallas de esta sede' }).textContent(), 'Recepción En línea', 'administración ve la pantalla en línea');
    igual(await adm.locator('.pasos').count(), 0, 'con todo cargado, la lista de primeros pasos se va');

    /* ---------- Ingreso con DNI y clave propia ---------- */
    await aLas('07:45');
    const errorAcceso = page => txt(page, '.acceso .error');
    const marta = await abrir('Marta');
    await marta.goto(srv.url, { waitUntil: 'load' });
    await marta.waitForSelector('form[data-form="ingreso"]');
    igual(await txt(marta, '.acceso h1'), 'Ingresá a la plataforma', 'con la plataforma configurada, pide DNI y clave');
    igual(await sinDesborde(marta), true, 'el ingreso entra en un teléfono');
    await cap(marta, '08-ingreso');
    await ingresar(marta, '30111222', 'no-es-esta');
    igual(await errorAcceso(marta), 'El DNI o la clave no coinciden.', 'rechaza una clave equivocada');
    igual(await marta.inputValue('#in-dni'), '30111222', 'y conserva el DNI escrito');
    await ingresar(marta, '30.111.222', CLAVE_INICIAL);
    igual(await txt(marta, '.acceso h1'), 'Hola, Marta. Elegí tu clave', 'en el primer ingreso pide elegir una clave propia');
    igual(await marta.evaluate(() => fetch('/rest/v1/rpc/novedad', { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json', Authorization: 'Bearer ' + JSON.parse(localStorage.getItem('plataforma-sesion')).access_token }, body: JSON.stringify({ p: { tipo: 'otra', crit: 'baja', texto: 'x' } }) }).then(r => r.json()).then(j => j.code)), 'DEM03', 'y hasta que no la cambia, el servidor no la deja hacer nada más');
    await elegirClave(marta, CLAVE_INICIAL);
    igual(await errorAcceso(marta), 'Elegí una clave distinta de la inicial.', 'la clave nueva no puede ser la inicial');
    await elegirClave(marta, 'abc');
    igual(await errorAcceso(marta), 'La clave tiene que tener al menos 6 caracteres.', 'ni tener menos de seis caracteres');
    await marta.fill('#cl-nueva', 'marta-2026');
    await marta.fill('#cl-repetir', 'marta-2027');
    await marta.click('#btn-clave');
    await listo(marta);
    igual(await errorAcceso(marta), 'Las dos claves no coinciden.', 'y hay que repetirla igual');
    await cap(marta, '09-elegir-clave');
    await elegirClave(marta, 'marta-2026');
    await marta.waitForSelector('.cabecera-app h1');
    igual(await txt(marta, '.cabecera-app h1'), 'Hola, Marta', 'con su clave nueva, entra a su jornada');
    igual(await txt(marta, '.fecha-app'), 'Viernes 27 de noviembre, 07:45', 'con la fecha y la hora del servidor');
    contiene(await txt(marta, '#pantalla'), 'Tu turno es de 08:00 a 15:00.', 've su turno de hoy');
    contiene(await txt(marta, '#pantalla'), 'vas a leer el código de la pantalla de la sede', 'y cómo se ficha en su sede');
    igual(await marta.isVisible('#nav-roles'), false, 'una colaboradora no ve otras secciones');
    igual(await marta.locator('.guia').count(), 0, 'ni la guía de la demo');
    igual(await sinDesborde(marta), true, 'la jornada entra en un teléfono');
    await cap(marta, '10-mi-jornada');
    igual(await marta.evaluate(() => llamar('admin_clave_inicial', { p_clave: 'cualquiera1' }).then(r => r.error)), 'No tenés permiso para hacer esto.', 'el servidor le niega las funciones de administración');
    await marta.evaluate(() => { location.hash = '#administracion'; });
    igual(await marta.locator('.cabecera-app h1').count(), 1, 'y la dirección de Administración la deja en su jornada');

    /* ---------- Entrada con el código de la pantalla ---------- */
    await marta.click('#btn-entrada');
    await marta.waitForSelector('#fichaje-codigo');
    igual(await txt(marta, '.fichaje .sede'), 'Marcar entrada', 'abre el fichaje de entrada');
    igual(await sinDesborde(marta), true, 'el fichaje entra en un teléfono');
    await cap(marta, '11-fichaje-con-codigo');
    await marta.fill('#fichaje-codigo', '123');
    await marta.click('#btn-codigo');
    igual(await errorEn(marta, '.fichaje .error', 'Escribí'), 'Escribí los 6 números del código.', 'pide el código completo');
    await marta.fill('#fichaje-codigo', srv.codigo(centro) === '000000' ? '111111' : '000000');
    await marta.click('#btn-codigo');
    contiene(await errorEn(marta, '.fichaje .error', 'no coincide'), 'El código no coincide o ya venció', 'con un código que no es el de la pantalla, no ficha');
    igual(turnoDe('Marta').entrada, null, 'y el turno sigue sin entrada');
    await borrarAviso(marta);
    await marta.fill('#fichaje-codigo', await enPantalla());
    await marta.click('#btn-codigo');
    igual(await aviso(marta), 'Entrada registrada a las 07:45 en Sede Centro. No pudimos leer tu ubicación: activala en el teléfono para la próxima vez.', 'con el código de la pantalla registra la entrada con la hora del servidor, y avisa que no pudo leer la ubicación');
    contiene(await txt(marta, '#pantalla'), 'Llegaste a horario', 'y la jornada queda en curso');
    let m = srv.M.marcas[srv.M.marcas.length - 1];
    igual([m.via, m.geo, m.dispositivo], ['codigo', 'sin_dato', 'nuevo'], 'el servidor guarda la marca con su respaldo: por código, sin ubicación y desde un teléfono nuevo');
    await marta.context().grantPermissions(['geolocation']);
    await marta.context().setGeolocation(CENTRO);
    await marta.reload({ waitUntil: 'load' });
    await marta.waitForSelector('#btn-abrir-cierre');
    contiene(await txt(marta, '#pantalla'), 'Llevás', 'al volver a abrir la aplicación sigue adentro, con su jornada en curso');
    await marta.click('#tab-novedades');
    igual(await marta.locator('#nov-foto').count(), 0, 'la novedad todavía no ofrece adjuntar una foto');
    await marta.fill('#nov-texto', 'Falta lavandina en el depósito del primer piso.');
    igual(await pulsar(marta, '#btn-nov'), 'Novedad enviada. Gracias por avisar.', 'carga una novedad');
    igual([srv.M.novedades.length, srv.M.novedades[0].sede_id], [1, Number(centro)], 'que llega al servidor con su sede');

    /* ---------- Otro en el mismo teléfono, leyendo el QR con la cámara ---------- */
    await aLas('07:48');
    await pulsar(marta, '#btn-salir');
    await marta.waitForSelector('form[data-form="ingreso"]');
    igual(await marta.evaluate(() => localStorage.getItem('plataforma-sesion')), null, 'al salir, la sesión se borra del teléfono');
    await marta.context().addInitScript(() => {
      window.BarcodeDetector = class {
        static getSupportedFormats() { return Promise.resolve(['qr_code']); }
        detect() { return Promise.resolve(window.__qr ? [{ rawValue: window.__qr }] : []); }
      };
      navigator.mediaDevices.getUserMedia = async () => {
        const c = document.createElement('canvas');
        c.width = 320; c.height = 320;
        const x = c.getContext('2d');
        let n = 0;
        setInterval(() => { x.fillStyle = n++ % 2 ? '#223' : '#334'; x.fillRect(0, 0, 320, 320); }, 100);
        return c.captureStream(10);
      };
    });
    await marta.reload({ waitUntil: 'load' });
    await marta.waitForSelector('form[data-form="ingreso"]');
    await ingresar(marta, '35666777', CLAVE_INICIAL);
    await elegirClave(marta, 'carla-2026');
    await marta.waitForSelector('.cabecera-app h1');
    igual(await txt(marta, '.cabecera-app h1'), 'Hola, Carla', 'Carla entra desde el teléfono de Marta');
    await marta.click('#btn-entrada');
    await marta.waitForSelector('#fichaje-video');
    igual([await marta.locator('#fichaje-codigo').count(), await txt(marta, '#btn-fichaje-manual')], [0, 'Escribir el código'], 'con cámara, abre el lector de QR y deja escribir el código como alternativa');
    await cap(marta, '12-fichaje-con-camara');
    await marta.evaluate(() => { window.__qr = 'https://ejemplo.com.ar/promo'; });
    igual(await errorEn(marta, '.fichaje .error', 'QR'), 'Ese QR no es de la plataforma. Buscá el de la sede.', 'un QR cualquiera no sirve');
    await marta.evaluate(u => { window.__qr = u; }, srv.url + '#q=' + parque + '.' + sedeDe('Sede Parque').codigo_fijo);
    igual(await errorEn(marta, '.fichaje .error', 'otra sede'), 'Ese QR es de otra sede. Tu turno es en Sede Centro.', 'ni el de otra sede');
    await borrarAviso(marta);
    await marta.evaluate(u => { window.__qr = u; }, srv.url + '#q=' + centro + '.' + (await enPantalla()));
    igual(await aviso(marta), 'Entrada registrada a las 07:48 en Sede Centro. Este teléfono también lo usa otra persona para fichar: queda avisado a supervisión.', 'el QR de la pantalla registra la entrada y avisa que el teléfono es compartido');
    m = srv.M.marcas[srv.M.marcas.length - 1];
    igual([m.via, m.geo, m.distancia_m < 5, m.dispositivo, m.comparte_con], ['qr', 'ok', true, 'compartido', persona('Marta').id], 'el servidor anota la ubicación, dentro de la sede, y con quién se comparte el teléfono');
    igual(await marta.evaluate(() => !!cam.stream), false, 'y la cámara queda apagada');
    await pulsar(marta, '#btn-salir');
    await marta.waitForSelector('form[data-form="ingreso"]');

    /* ---------- QR impreso, leído con la cámara del teléfono, lejos de la sede ---------- */
    await aLas('07:52');
    const lucia = await abrir('Lucía', { geolocation: LEJOS, permissions: ['geolocation'] });
    await lucia.goto(srv.url, { waitUntil: 'load' });
    await lucia.waitForSelector('form[data-form="ingreso"]');
    await ingresar(lucia, '31222333', CLAVE_INICIAL);
    await elegirClave(lucia, 'lucia-2026');
    await lucia.waitForSelector('.cabecera-app h1');
    contiene(await txt(lucia, '#pantalla'), 'vas a leer el QR que está pegado en la sede', 'en una sede con QR impreso, lo explica');
    igual(await lucia.locator('.turnos-hoy li').count(), 0, 'con un solo turno no hace falta la lista de turnos');
    await lucia.click('#btn-entrada');
    await cuando(lucia, () => /Abrí la cámara de tu teléfono/.test(document.querySelector('.fichaje').textContent));
    igual(await lucia.locator('#fichaje-codigo').count(), 0, 'sin lector propio, manda a leer el QR con la cámara del teléfono');
    await lucia.evaluate(h => { location.hash = h; }, '#q=' + centro + '.' + sedeDe('Sede Centro').codigo_fijo);
    igual(await errorEn(lucia, '.fichaje .error', 'otra sede'), 'Ese QR es de otra sede. Tu turno es en Sede Parque.', 'el enlace del QR de otra sede no sirve');
    await borrarAviso(lucia);
    await lucia.evaluate(h => { location.hash = h; }, '#q=' + parque + '.' + sedeDe('Sede Parque').codigo_fijo);
    igual(await aviso(lucia), 'Entrada registrada a las 07:52 en Sede Parque. Tu ubicación figura lejos de la sede: tu supervisor lo va a revisar.', 'el enlace del QR de su sede registra la entrada y avisa que figura lejos');
    igual(await lucia.evaluate(() => location.hash), '#colaborador', 'y el código no queda en la dirección');
    m = srv.M.marcas[srv.M.marcas.length - 1];
    igual([m.via, m.geo, Math.round(m.distancia_m / 100) / 10], ['impreso', 'lejos', 6.7], 'el servidor guarda a qué distancia de la sede se hizo');

    /* ---------- Sede que verifica solo con la ubicación ---------- */
    await aLas('07:55');
    const ramon = await abrir('Ramón');
    await ramon.goto(srv.url, { waitUntil: 'load' });
    await ramon.waitForSelector('form[data-form="ingreso"]');
    await ingresar(ramon, '33444555', CLAVE_INICIAL);
    await elegirClave(ramon, 'ramon-2026');
    await ramon.waitForSelector('.cabecera-app h1');
    contiene(await txt(ramon, '#pantalla'), 'usa la ubicación de tu teléfono', 'en una sede sin código, explica que usa la ubicación');
    await ramon.click('#btn-entrada');
    contiene(await errorEn(ramon, '.fichaje .error', 'ubicación'), 'necesitamos tu ubicación', 'sin permiso de ubicación, no ficha');
    await ramon.context().grantPermissions(['geolocation']);
    await ramon.context().setGeolocation(LEJOS);
    await ramon.click('#btn-fichaje-reintentar');
    igual(await errorEn(ramon, '.fichaje .error', 'figura a'), 'Tu teléfono figura a 4,4 km de la sede. Si estás ahí, pedile el fichaje asistido a tu supervisor.', 'lejos de la sede, tampoco');
    igual(turnoDe('Ramón').entrada, null, 'y el turno sigue sin entrada');
    await cap(ramon, '13-fichaje-por-ubicacion');
    await ramon.context().setGeolocation(DEPOSITO);
    await borrarAviso(ramon);
    await ramon.click('#btn-fichaje-reintentar');
    igual(await aviso(ramon), 'Entrada registrada a las 07:55 en Depósito.', 'en la sede, ficha con un toque');
    igual(turnoDe('Ramón').metodo_in, 'ubicacion', 'y queda anotado que fue por ubicación');

    /* ---------- Supervisión ---------- */
    await aLas('08:20');
    await adm.click('#adm-personal');
    igual(await altaAsig({ quien: 'Lucía', sede: 'Sede Centro', ti: '13:00', tf: '17:00' }), 'Asignación agregada. Supera el tope diario: supervisión ya tiene el aviso.', 'segunda asignación de Lucía, en otra sede: con las dos pasa el tope y lo avisa');
    const diego = await abrir('supervisor', { viewport: { width: 1280, height: 900 } });
    await diego.goto(srv.url, { waitUntil: 'load' });
    await diego.waitForSelector('form[data-form="ingreso"]');
    await ingresar(diego, '28999111', CLAVE_INICIAL);
    await elegirClave(diego, 'diego-2026');
    await diego.waitForSelector('.titulo-pagina h1');
    igual(await txt(diego, '.titulo-pagina h1'), 'Supervisión', 'el supervisor entra directo a Supervisión');
    igual(await diego.isVisible('#nav-roles'), false, 'sin acceso a Administración');
    igual(await diego.evaluate(() => llamar('admin_sede_codigo', { p_sede: 1 }).then(r => r.error)), 'No tenés permiso para hacer esto.', 'y el servidor se lo niega aunque lo pida');
    igual(await diego.evaluate(() => S.asigs.every(a => a.valor === 0) && S.colabs.every(c => !('dni' in c))), true, 'tampoco recibe valores de pago ni DNI');
    const seccion = (page, titulo) => page.locator('section.seccion', { hasText: titulo });
    igual((await diego.locator('.indicadores b').allTextContents()).join(' '), '0 4 0 1', 'indicadores: nadie para resolver, cuatro trabajando, ninguna demora y una novedad');
    igual(await seccion(diego, 'Avisos de administración').locator('.renglon').count(), 2, 've los avisos de administración: el cambio de tope y la asignación que lo supera');
    contiene(await seccion(diego, 'Avisos de administración').locator('.renglon').first().textContent(), 'Lucía Paredes suma 8 h de lunes a viernes, por encima del tope de 5 h', 'con el detalle de cada uno');
    await pulsar(diego, seccion(diego, 'Avisos de administración').locator('button').first());
    await pulsar(diego, seccion(diego, 'Avisos de administración').locator('button').first());
    igual(await seccion(diego, 'Avisos de administración').count(), 0, 'y los marca como vistos');
    const revisar = () => seccion(diego, 'Fichajes para revisar').locator('.renglon');
    igual(await revisar().count(), 2, 'dos fichajes para revisar');
    contiene(await revisar().filter({ hasText: 'Carla Sosa' }).textContent(), 'Entrada del viernes 27 de noviembre a las 07:48 en Sede Centro: desde el teléfono de Marta Giménez.', 'el de Carla, por el teléfono compartido');
    contiene(await revisar().filter({ hasText: 'Lucía Paredes' }).textContent(), 'en Sede Parque: a 6,7 km de la sede.', 'y el de Lucía, por la distancia');
    await cap(diego, '14-supervision', { fullPage: true });
    await pulsar(diego, revisar().filter({ hasText: 'Lucía Paredes' }).locator('button', { hasText: 'Dar por bueno' }));
    igual(await revisar().count(), 1, 'da por bueno el de Lucía');
    igual(turnoDe('Lucía').entrada != null, true, 'y su entrada queda como estaba');
    await revisar().locator('button', { hasText: 'Anular fichaje' }).click();
    igual(await revisar().locator('button').allTextContents(), ['Sí, anular', 'No'], 'anular pide confirmación');
    igual(await pulsar(diego, revisar().locator('button', { hasText: 'Sí, anular' })), 'Fichaje anulado. El turno vuelve a esperar esa marca.', 'anula el de Carla');
    igual([turnoDe('Carla').entrada, turnoDe('Carla').cerrada, await seccion(diego, 'Fichajes para revisar').count()], [null, false, 0], 'el turno de Carla vuelve a estar sin entrada');
    const equipo = n => seccion(diego, 'Equipo de hoy').locator('tbody tr', { hasText: n });
    igual(await seccion(diego, 'Equipo de hoy').locator('tbody tr').count(), 5, 'el equipo de hoy tiene cinco turnos');
    contiene(await equipo('Carla Sosa').textContent(), 'Sin ingresar, 20 min de demora', 'el de Carla figura con demora');
    contiene(await equipo('Marta Giménez').textContent(), '07:45, sin ubicación', 'la entrada de Marta, hecha sin ubicación, lo dice en la tabla');
    contiene(await equipo('Lucía Paredes').first().textContent(), '07:52, lejos de la sede', 'y la de Lucía, que fue lejos de la sede');
    contiene(await seccion(diego, 'Últimas resoluciones').textContent(), 'Carla Sosa, vie 27 en Sede Centro: fichaje de entrada anulado por supervisión', 'y la anulación queda registrada');
    igual(await seccion(diego, 'Últimas resoluciones').locator('button').count(), 0, 'sin botón para deshacer: una anulación no vuelve atrás');
    igual((await diego.locator('.indicadores b').allTextContents()).join(' '), '0 3 1 1', 'los indicadores siguen el cambio: tres trabajando y una demora');
    await diego.locator('button.t-luz').nth(2).click();
    contiene(await txt(diego, '#detalle-jornada'), 'Lucía Paredes, viernes 27 de noviembre. En curso. Turno de 08:00 a 12:00 en Sede Parque. Entrada 07:52 (QR impreso, ubicación a 6,7 km de la sede, fuera del radio).', 'el detalle de un turno muestra cómo se fichó y con qué respaldo');
    igual(await sinDesborde(diego), true, 'supervisión no desborda');

    /* ---------- Salida con el QR, leído antes de abrir la aplicación ---------- */
    await aLas('12:03');
    await lucia.context().setGeolocation(PARQUE);
    await lucia.goto('about:blank');
    await lucia.goto(srv.url + '#q=' + parque + '.' + sedeDe('Sede Parque').codigo_fijo, { waitUntil: 'load' });
    await lucia.waitForSelector('form[data-form="cierre"]');
    igual(await aviso(lucia), 'QR leído. Confirmá tus horas para cerrar la jornada.', 'al leer el QR con la jornada en curso, abre el cierre');
    contiene(await txt(lucia, 'form[data-form="cierre"]'), 'Confirmo que trabajé de 07:52 a 12:03', 'con sus horas para confirmar');
    await lucia.click('#btn-cerrar');
    igual(await errorEn(lucia, 'form[data-form="cierre"] .error', 'Confirmá'), 'Confirmá tus horas antes de cerrar.', 'sin confirmar no cierra');
    await lucia.check('#cierre-ok');
    await lucia.click('#btn-cerrar');
    await lucia.waitForSelector('.cierre-ok');
    igual(await txt(lucia, '.cierre-ok h2'), 'Muy bien, Lucía', 'cierra el turno con el QR que ya había leído');
    contiene(await txt(lucia, '.mensaje'), 'Turno en Sede Parque cerrado y a horario. Tu próximo turno de hoy empieza a las 13:00 en Sede Centro.', 'y le anuncia el turno de la tarde');
    igual([turnoDe('Lucía').metodo_out, turnoDe('Lucía').conf, srv.M.marcas[srv.M.marcas.length - 1].geo], ['impreso', true, 'ok'], 'el servidor guarda la salida, la confirmación y la ubicación');
    await lucia.waitForTimeout(1100);
    await cap(lucia, '15-cierre-de-turno');
    await lucia.click('#btn-proximo');
    igual(await lucia.locator('.turnos-hoy li').count(), 2, 'ahora ve sus dos turnos de hoy');

    /* ---------- Inasistencia, fichaje asistido y sesión que se renueva ---------- */
    await aLas('13:05');
    await diego.reload({ waitUntil: 'load' });
    await diego.waitForSelector('.titulo-pagina h1');
    const inas = () => seccion(diego, 'Inasistencias sin justificar').locator('.renglon');
    igual(await inas().count(), 1, 'el turno de Carla, que terminó sin entrada, pasa a inasistencias');
    contiene(await inas().textContent(), 'Carla Sosa', 'con su nombre');
    contiene(await pulsar(diego, inas().locator('button')), 'Carla Sosa, vie 27 en Sede Centro: inasistencia justificada, ausencia con aviso.', 'la justifica');
    igual(turnoDe('Carla').justif, 'aviso', 'y queda justificada en el servidor');
    srv.vencerLlaves();
    const antes = srv.M.pedidos.length;
    contiene(await pulsar(diego, equipo('Lucía Paredes').filter({ hasText: 'Sede Centro' }).locator('button')), 'Lucía Paredes en Sede Centro: entrada asistida a las 13:05.', 'ficha la entrada de Lucía en su segunda sede, con la sesión vencida');
    igual(srv.M.pedidos.slice(antes).some(x => /refresh_token/.test(x)), true, 'la aplicación renueva la sesión sola, sin pedir la clave');
    igual(srv.M.jornadas.find(j => j.persona_id === persona('Lucía').id && j.sede_id === Number(centro)).metodo_in, 'supervisor', 'y la entrada queda como asistida');

    /* ---------- Tiempo de más, desde otro teléfono ---------- */
    await aLas('15:40');
    const marta2 = await abrir('Marta, otro teléfono', { geolocation: CENTRO, permissions: ['geolocation'] });
    await marta2.goto(srv.url, { waitUntil: 'load' });
    await marta2.waitForSelector('form[data-form="ingreso"]');
    await ingresar(marta2, '30111222', 'marta-2026');
    await marta2.waitForSelector('#btn-abrir-cierre');
    contiene(await txt(marta2, '#pantalla'), 'Tu turno terminó a las 15:00. Cuando termines, cerrá la jornada.', 'pasada la hora, invita a cerrar');
    await marta2.click('#btn-abrir-cierre');
    contiene(await txt(marta2, 'form[data-form="cierre"]'), 'Registramos 40 min de más. ¿Qué pasó?', 'el cierre pregunta por el tiempo de más');
    await marta2.click('#btn-cerrar');
    igual(await errorEn(marta2, 'form[data-form="cierre"] .error', 'Elegí'), 'Elegí qué pasó con el tiempo de más.', 'y no cierra sin la respuesta');
    await marta2.check('#que-extra');
    await marta2.fill('#cierre-texto', 'Terminé de encerar el hall.');
    await marta2.click('#btn-cerrar');
    await marta2.waitForSelector('#fichaje-codigo');
    igual(await txt(marta2, '.fichaje .sede'), 'Marcar salida', 'pide el código de la sede para la salida');
    await borrarAviso(marta2);
    await marta2.fill('#fichaje-codigo', await enPantalla());
    await marta2.click('#btn-codigo');
    await marta2.waitForSelector('.cierre-ok');
    igual(await txt(marta2, '.cierre-ok h2'), 'Gracias, Marta', 'cierra y agradece');
    contiene(await txt(marta2, '.mensaje'), 'Tu supervisor va a revisar el tiempo de hoy', 'avisando que el tiempo de más pasa a revisión');
    igual(await aviso(marta2), 'No es tu teléfono habitual: queda avisado a supervisión.', 'y que fichó desde otro teléfono');
    igual([turnoDe('Marta').metodo_out, turnoDe('Marta').decl.tipo, turnoDe('Marta').decl.texto, turnoDe('Marta').conf], ['codigo', 'extra', 'Terminé de encerar el hall.', false], 'el servidor guarda lo que declaró');
    await marta2.click('#tab-jornadas');
    contiene(await txt(marta2, '.lista-jornadas'), 'En revisión: 40 min de más', 'en Mis jornadas el turno figura en revisión');

    /* ---------- Ya me fui de la sede ---------- */
    await aLas('17:10');
    await lucia.reload({ waitUntil: 'load' });
    await lucia.waitForSelector('#btn-abrir-cierre');
    contiene(await txt(lucia, '#pantalla'), 'Tu supervisor registró tu entrada a las 13:05.', 'Lucía ve que su entrada de la tarde la registró el supervisor');
    await lucia.click('#btn-abrir-cierre');
    await lucia.check('#cierre-ok');
    await lucia.click('#btn-cerrar');
    await lucia.waitForSelector('#btn-ya-me-fui');
    await lucia.click('#btn-ya-me-fui');
    igual(await lucia.inputValue('#ymf-hora'), '17:00', 'si ya se fue, propone la hora en que terminaba el turno');
    igual(await sinDesborde(lucia), true, 'el aviso de salida entra en un teléfono');
    await lucia.fill('#ymf-hora', '12:30');
    await lucia.click('#btn-ymf');
    igual(await errorEn(lucia, 'form[data-form="ya-me-fui"] .error', 'La hora'), 'La hora tiene que estar entre tu entrada de las 13:05 y ahora.', 'la hora avisada tiene que caer dentro del turno');
    await lucia.fill('#ymf-hora', '17:00');
    igual(await pulsar(lucia, '#btn-ymf'), 'Enviado. Tu supervisor va a validar la hora de salida.', 'avisa la hora y cierra sin código');
    await lucia.waitForSelector('.cierre-ok');
    igual(await txt(lucia, '.cierre-ok h2'), 'Gracias, Lucía', 'con su mensaje de cierre');
    const tardeLucia = srv.M.jornadas.find(j => j.persona_id === persona('Lucía').id && j.sede_id === Number(centro));
    igual([tardeLucia.cerrada, tardeLucia.salida, tardeLucia.metodo_out, tardeLucia.decl.hora], [true, null, 'declarada', 1020], 'el servidor no inventa una salida: guarda la hora avisada para que la valide supervisión');

    /* ---------- Control excedente ---------- */
    await diego.reload({ waitUntil: 'load' });
    await diego.waitForSelector('.titulo-pagina h1');
    const caso = n => diego.locator('.caso', { hasText: n });
    igual(await diego.locator('.caso').count(), 2, 'dos turnos para resolver');
    contiene(await caso('Marta Giménez').textContent(), 'Se quedó trabajando. Terminé de encerar el hall.', 'el de Marta, con lo que declaró');
    igual(await caso('Marta Giménez').locator('input[type="radio"]:checked').getAttribute('value'), 'extra', 'propone hora extra');
    contiene(await pulsar(diego, caso('Marta Giménez').locator('button[type="submit"]')), 'Resuelto. Marta Giménez, vie 27 en Sede Centro: hora extra verificada, 40 min.', 'la verifica');
    igual([turnoDe('Marta').rev, turnoDe('Marta').salida_val], ['extra', 940], 'y queda validada en el servidor');
    igual(await pulsar(diego, seccion(diego, 'Últimas resoluciones').locator('.renglon', { hasText: 'hora extra verificada' }).locator('button')), 'Resolución deshecha.', 'la deshace');
    igual([turnoDe('Marta').rev, await diego.locator('.caso').count()], [null, 2], 'y el turno vuelve a esperar');
    await caso('Marta Giménez').locator('input[type="time"]').fill('14:30');
    await caso('Marta Giménez').locator('button[type="submit"]').click();
    contiene(await errorEn(diego, 'form[data-form="resolver"][data-j="' + turnoDe('Marta').id + '"] .error', 'posterior'), 'Para hora extra, la salida validada tiene que ser posterior a las 15:00.', 'valida la hora antes de mandarla');
    await caso('Marta Giménez').locator('input[type="time"]').fill('15:40');
    await pulsar(diego, caso('Marta Giménez').locator('button[type="submit"]'));
    contiene(await caso('Lucía Paredes').textContent(), 'Se olvidó de marcar la salida. Dice que terminó a las 17:00.', 'el de Lucía, con la hora que avisó');
    igual(await caso('Lucía Paredes').locator('input[type="time"]').inputValue(), '17:00', 'que es la que se propone validar');
    contiene(await pulsar(diego, caso('Lucía Paredes').locator('button[type="submit"]')), 'olvido de salida, validada a las 17:00', 'la valida');
    igual(await diego.locator('.caso').count(), 0, 'no queda nada para resolver');
    contiene(await revisar().textContent(), 'Marta Giménez', 'queda para revisar el fichaje de Marta desde otro teléfono');
    contiene(await revisar().textContent(), 'desde un teléfono que no es el suyo', 'con su motivo');
    const nov = String(srv.M.novedades[0].id);
    await diego.selectOption('#est-' + nov, 'en_curso');
    await listo(diego);
    igual(srv.M.novedades[0].estado, 'en_curso', 'cambia el estado de la novedad de Marta');
    await cap(diego, '16-supervision-tarde', { fullPage: true });

    /* ---------- Administración: teléfonos, liquidación, claves y bajas ---------- */
    await adm.reload({ waitUntil: 'load' });
    await adm.waitForSelector('.titulo-pagina h1');
    await adm.click('#adm-personas');
    contiene(await filaP('Marta Giménez').textContent(), 'Fichó desde otro teléfono', 'administración ve que Marta fichó desde otro teléfono');
    contiene(await filaP('Marta Giménez').textContent(), 'Activa', 'y que ya hizo su primer ingreso');
    igual(await pulsar(adm, filaP('Marta Giménez').locator('button', { hasText: 'Aceptar el nuevo' })), 'Teléfono nuevo aceptado.', 'acepta el teléfono nuevo de Marta');
    igual(srv.M.dispositivos.filter(d => d.persona_id === persona('Marta').id).map(d => d.estado), ['registrado'], 'que pasa a ser su teléfono registrado');
    igual(await pulsar(adm, filaP('Ramón Ortiz').locator('button', { hasText: 'Liberar teléfono' })), 'Teléfono liberado: el próximo con el que fiche queda registrado.', 'libera el teléfono de Ramón');
    await cap(adm, '17-personas-con-telefonos', { fullPage: true });
    await adm.click('#adm-preliquidacion');
    const liq = n => adm.locator('.tabla-liq tbody tr', { hasText: n });
    igual((await liq('Marta Giménez').locator('td').allTextContents()).map(x => x.replace(/\u00a0/g, ' ').trim()).slice(2), ['7 h', '7 h', 'Nada', '40 min', 'Nada', '0', '$ 49.000'], 'preliquidación de Marta: siete horas validadas, la extra verificada aparte y la base por hora');
    igual((await liq('Lucía Paredes').locator('.sub').allTextContents()).filter(x => /Sede/.test(x)), ['Sede Parque, fijo', 'Sede Centro, por hora'], 'una línea por asignación');
    igual(await sinDesborde(adm), true, 'la preliquidación no desborda');
    await cap(adm, '18-preliquidacion', { fullPage: true });

    await adm.click('#adm-personas');
    contiene(await pulsar(adm, filaP('Marta Giménez').locator('button', { hasText: 'Restablecer clave' })), 'Clave restablecida', 'restablece la clave de Marta');
    await marta2.reload({ waitUntil: 'load' });
    await marta2.waitForSelector('form[data-form="clave"]');
    await elegirClave(marta2, 'marta-2028');
    await marta2.waitForSelector('form[data-form="ingreso"]');
    igual(await errorAcceso(marta2), 'Tu sesión se cerró. Ingresá de nuevo.', 'la sesión abierta de Marta deja de servir');
    await ingresar(marta2, '30111222', 'marta-2026');
    igual(await errorAcceso(marta2), 'El DNI o la clave no coinciden.', 'su clave anterior ya no entra');
    await ingresar(marta2, '30111222', CLAVE_INICIAL);
    await elegirClave(marta2, 'marta-2028');
    await marta2.waitForSelector('.cabecera-app h1');
    igual(await txt(marta2, '.cabecera-app h1'), 'Hola, Marta', 'con la clave inicial entra y elige una nueva');
    await marta2.click('#btn-cambiar-clave');
    igual(await txt(marta2, '.acceso h1'), 'Cambiar tu clave', 'después puede cambiarla cuando quiera');
    await marta2.click('#btn-cancelar-clave');
    await marta2.waitForSelector('.cabecera-app h1');
    await marta2.click('#btn-cambiar-clave');
    await elegirClave(marta2, 'marta-2029');
    await marta2.waitForSelector('.cabecera-app h1');
    igual(srv.M.usuarios.find(u => u.email === '30111222@dni.invalid').clave, 'marta-2029', 'y la clave nueva queda guardada');

    contiene(await pulsar(adm, filaP('Carla Sosa').locator('button', { hasText: 'Dar de baja' })), 'Persona dada de baja', 'da de baja a Carla');
    contiene(await filaP('Carla Sosa').textContent(), 'De baja', 'que figura de baja, sin borrarse');
    await ingresar(marta, '35666777', 'carla-2026');
    igual(await errorAcceso(marta), 'Tu acceso no está habilitado. Hablá con administración.', 'y ya no puede ingresar');
    const estela = String(persona('Estela').id);
    await adm.click('#pe-e-' + estela);
    await adm.selectOption('#pe-rol-' + estela, 'supervisor');
    igual(await pulsar(adm, '#pe-g-' + estela), 'Tiene que quedar al menos una persona activa con rol de administración.', 'la única cuenta de administración no puede quitarse el rol');
    await adm.click('#pe-c-' + estela);

    /* ---------- Administración: códigos, QR impreso y pantallas ---------- */
    await adm.click('#adm-sedes');
    igual(await pulsar(adm, '#se-b-' + centro), 'Esta sede tiene asignaciones activas. Desactivalas en Asignaciones antes de darla de baja.', 'una sede con gente asignada no se da de baja por error');
    igual(sedeDe('Sede Centro').activa, true, 'y sigue activa');
    const viejo = srv.codigo(centro);
    igual(await pulsar(adm, '#se-k-' + centro), 'Códigos cambiados. Los anteriores ya no sirven.', 'cambia los códigos de Sede Centro');
    igual(srv.codigo(centro) === viejo, false, 'el código que circulaba deja de valer');
    await tablet.reload({ waitUntil: 'load' });
    await tablet.waitForSelector('#pan-qr svg');
    igual(await enPantalla(), srv.codigo(centro), 'y la pantalla pasa a mostrar los nuevos');
    await adm.click('#se-q-' + parque);
    await adm.waitForSelector('#qr-sede-svg svg path');
    contiene(await txt(adm, '#qr-sede'), 'Sede Parque', 'muestra el QR de Sede Parque listo para imprimir');
    await cap(adm, '19-qr-impreso', { fullPage: true });
    await tablet.click('#btn-pantalla-olvidar');
    igual(await tablet.locator('.pan-pie button').allTextContents(), ['Sí, desvincular', 'No'], 'desvincular desde la propia pantalla pide confirmación');
    await tablet.click('#btn-pantalla-olvidar-no');
    igual(await pulsar(adm, adm.locator('button[data-a="pantalla-desvincular"]')), 'Pantalla desvinculada.', 'administración desvincula la pantalla');
    await tablet.reload({ waitUntil: 'load' });
    await tablet.waitForSelector('form[data-form="pantalla-vincular"]');
    contiene(await txt(tablet, '.acceso .error'), 'Esta pantalla ya no está vinculada', 'la pantalla deja de mostrar códigos y pide vincularse de nuevo');
    igual(await adm.locator('.pasos .pill').allTextContents(), ['Listo', 'Listo', 'Listo', 'Paso 4'], 'y administración vuelve a ver pendiente el paso de la pantalla');

    /* ---------- Al día siguiente: salida olvidada y uso sin conexión ---------- */
    await aLas('07:30', '2026-11-28');
    await ramon.reload({ waitUntil: 'load' });
    await ramon.waitForSelector('form[data-form="olvido"]');
    contiene(await txt(ramon, 'form[data-form="olvido"]'), 'El viernes 27 de noviembre no marcaste la salida en Depósito.', 'a Ramón, que no marcó la salida, la aplicación le pregunta a qué hora terminó');
    contiene(await txt(ramon, '#pantalla'), 'Hoy no tenés turnos asignados', 'aunque hoy no trabaje');
    igual(turnoDe('Ramón', '2026-11-27').metodo_out, 'auto', 'el servidor había cerrado el turno solo');
    await ramon.fill('#olvido-hora', '12:10');
    igual(await pulsar(ramon, '#btn-olvido'), 'Enviado. Tu supervisor lo va a revisar.', 'avisa que terminó 12:10');
    igual(turnoDe('Ramón', '2026-11-27').decl.hora, 730, 'y el servidor lo guarda');
    await ramon.click('#tab-novedades');
    await ramon.fill('#nov-texto', 'Se rompió el candado del portón.');
    await ramon.context().setOffline(true);
    await ramon.click('#btn-nov');
    igual(await errorEn(ramon, 'form[data-form="novedad"] .error', 'Sin conexión'), 'Sin conexión. Revisá tu señal y probá de nuevo.', 'sin señal, avisa y no pierde lo escrito');
    igual([await ramon.isVisible('#estado-red'), await ramon.inputValue('#nov-texto')], [true, 'Se rompió el candado del portón.'], 'con el cartel de sin conexión a la vista');
    await cap(ramon, '20-sin-conexion');
    await ramon.context().setOffline(false);
    igual(await pulsar(ramon, '#btn-nov'), 'Novedad enviada. Gracias por avisar.', 'con señal, la manda');
    igual(await ramon.isVisible('#estado-red'), false, 'y el cartel se va');
    await diego.reload({ waitUntil: 'load' });
    await diego.waitForSelector('.titulo-pagina h1');
    contiene(await caso('Ramón Ortiz').textContent(), 'Se olvidó de marcar la salida. Dice que terminó a las 12:10.', 'el supervisor ve el olvido de Ramón con su hora');
    contiene(await pulsar(diego, caso('Ramón Ortiz').locator('button[type="submit"]')), 'olvido de salida, validada a las 12:10', 'y lo resuelve');
    igual(await seccion(diego, 'Tablero de noviembre').locator('button.t-luz').count(), 5, 'el tablero del mes muestra los cinco turnos del viernes');
    await pulsar(diego, '#btn-salir');
    await diego.waitForSelector('form[data-form="ingreso"]');
    igual(await diego.evaluate(() => [S, localStorage.getItem('plataforma-sesion')]), [null, null], 'al salir no queda ningún dato en la computadora');

    if (errores.length) { mal += errores.length; console.log('Errores en la página:\n' + errores.join('\n')); }
  } finally {
    await browser.close();
    await srv.cerrar();
  }
  console.log(ok + ' correctas, ' + mal + ' fallas');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
