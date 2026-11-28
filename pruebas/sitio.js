'use strict';
/* Sirve la carpeta sitio/ con el servidor de pruebas y verifica lo que la hace instalable y segura de publicar:
   manifest, íconos, service worker, arranque sin conexión, aviso de instalación y cabeceras del hosting.
   Uso: node pruebas/sitio.js */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { crear } = require('./servidor-falso.js');

const carpeta = path.join(__dirname, '..', 'sitio');
const salida = path.join(__dirname, '..', 'capturas-sitio');
fs.mkdirSync(salida, { recursive: true });
for (const f of fs.readdirSync(salida)) fs.unlinkSync(path.join(salida, f));

let ok = 0, mal = 0;
function igual(real, esperado, nombre) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) ok++;
  else { mal++; console.log('FALLA  ' + nombre + '\n   esperado ' + JSON.stringify(esperado) + '\n   real     ' + JSON.stringify(real)); }
}
function contiene(real, parte, nombre) {
  if (String(real).indexOf(parte) >= 0) ok++;
  else { mal++; console.log('FALLA  ' + nombre + '\n   debía contener ' + JSON.stringify(parte) + '\n   real           ' + JSON.stringify(String(real).slice(0, 300))); }
}

(async () => {
  const srv = await crear({ carpeta: carpeta });
  const URL_SITIO = srv.url;
  /* Una cuenta de administración y una colaboradora con su turno de hoy, cargadas directo en el servidor de pruebas. */
  srv.reloj('2026-11-27', '09:00');
  srv.instalacion('COD-DE-PRUEBA');
  srv.F.instalar(null, { p_codigo: 'COD-DE-PRUEBA', p_dni: '20111222', p_nombre: 'Estela', p_apellido: 'Funes', p_clave: 'administra-2026' });
  const admin = srv.M.usuarios[0].id;
  srv.F.admin_sede(admin, { p: { nombre: 'Sede Centro', lat: '-32.8895', lon: '-68.8458', radio: '150', verificacion: 'pantalla' } });
  srv.F.admin_clave_inicial(admin, { p_clave: 'limpieza2026' });
  srv.F.admin_persona(admin, { p: { dni: '30111222', nombre: 'Marta', apellido: 'Giménez', rol: 'colaborador' } });
  const marta = srv.M.personas.find(p => p.nombre === 'Marta');
  marta.debe_cambiar_clave = false;
  srv.M.usuarios.find(u => u.id === marta.auth_id).clave = 'marta-2026';
  srv.F.admin_aplicar(admin, { p: { asigs: [{ id: 'a1', c: String(marta.id), sede: String(srv.M.sedes[0].id), dias: [1, 2, 3, 4, 5], ti: 480, tf: 840, modalidad: 'hora', valor: 7000, activa: true }] } });

  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
    const errores = [];
    const nuevoContexto = async opciones => {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, locale: 'es-AR' }, opciones || {}));
      ctx.on('page', p => {
        p.on('pageerror', e => errores.push('pageerror: ' + e.message));
        p.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|status of 503/.test(m.text())) errores.push('console: ' + m.text()); });
      });
      return ctx;
    };

    // Lo que publica el hosting
    const ctx = await nuevoContexto();
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    const pedidos = [];
    page.on('request', r => pedidos.push(r.url()));
    const respuesta = await page.goto(URL_SITIO, { waitUntil: 'load' });
    await page.waitForSelector('form[data-form="ingreso"]');
    igual(await page.title(), 'Plataforma de trabajo', 'título del sitio');
    igual((await page.textContent('.acceso h1')).trim(), 'Ingresá a la plataforma', 'la aplicación arranca en el ingreso');
    igual(pedidos.filter(u => u.indexOf(URL_SITIO) !== 0), [], 'no pide nada a otros servidores');
    igual(await page.getAttribute('meta[name="robots"]', 'content'), 'noindex', 'no se ofrece a los buscadores');
    igual(await page.locator('script:not([src])').count(), 0, 'la página no lleva código suelto: todo sale de archivos del propio sitio');
    const csp = respuesta.headers()['content-security-policy'] || '';
    contiene(csp, "script-src 'self'", 'el navegador solo acepta código del propio sitio');
    contiene(csp, "form-action 'none'", 'y ningún formulario puede mandar el DNI o la clave a otra dirección');
    igual(await page.evaluate(() => new Promise(res => {
      document.addEventListener('securitypolicyviolation', () => res('bloqueado'), { once: true });
      const s = document.createElement('script');
      s.textContent = 'window.__colado = 1';
      document.head.appendChild(s);
      setTimeout(() => res(window.__colado ? 'corrió' : 'bloqueado'), 300);
    })), 'bloqueado', 'un código metido a la fuerza en la página no corre');
    errores.length = 0; /* el intento anterior deja, a propósito, un error de política de seguridad en la consola */

    // Manifest e íconos
    const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
    igual([manifest.name, manifest.short_name, manifest.display, manifest.start_url, manifest.lang], ['Plataforma de trabajo', 'Plataforma', 'standalone', './', 'es-AR'], 'datos del manifest');
    igual(manifest.icons.map(i => i.sizes + ' ' + i.purpose), ['192x192 any', '512x512 any', '512x512 maskable'], 'íconos declarados');
    const medidas = await page.evaluate(async lista => {
      const out = [];
      for (const src of lista) {
        const im = new Image();
        im.src = src;
        await im.decode();
        out.push(im.naturalWidth + 'x' + im.naturalHeight);
      }
      return out;
    }, manifest.icons.map(i => i.src).concat(['iconos/apple-touch-icon.png']));
    igual(medidas, ['192x192', '512x512', '512x512', '180x180'], 'cada ícono existe y mide lo que dice');
    igual(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('800 20px Overpass'))), true, 'la tipografía sale del propio sitio');

    // Service worker y arranque sin conexión
    const alcance = await page.evaluate(() => navigator.serviceWorker.ready.then(r => r.scope));
    igual(alcance, URL_SITIO, 'el service worker queda registrado');
    await page.reload({ waitUntil: 'load' });
    igual(await page.evaluate(() => !!navigator.serviceWorker.controller), true, 'y controla la página');
    const guardado = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return [ks.length, (await c.keys()).map(r => new URL(r.url).pathname.replace(/\.[0-9a-f]{12}\./, '.*.')).sort()]; });
    igual(guardado, [1, ['/', '/app.*.js', '/iconos/apple-touch-icon.png', '/iconos/icono-192.png', '/iconos/icono-512.png', '/iconos/icono-adaptable-512.png', '/manifest.webmanifest', '/qr.*.js', '/tipografia/overpass-latin-wght-normal.woff2']], 'guarda la página, la aplicación, el generador de QR, el manifest, la tipografía y los íconos');
    await page.waitForSelector('form[data-form="ingreso"]');
    await page.fill('#in-dni', '30111222');
    await page.fill('#in-clave', 'marta-2026');
    await page.click('#btn-ingresar');
    await page.waitForSelector('.cabecera-app h1');
    igual((await page.textContent('.cabecera-app h1')).trim(), 'Hola, Marta', 'con conexión, entra a su jornada');
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#btn-reintentar');
    igual((await page.textContent('.acceso h1')).trim(), 'Sin conexión', 'sin conexión la aplicación abre igual y explica qué pasa, en lugar de la página de error del navegador');
    igual(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('800 20px Overpass'))), true, 'con su tipografía');
    igual(await page.evaluate(() => !!localStorage.getItem('plataforma-sesion')), true, 'y sin perder la sesión');
    await page.screenshot({ path: path.join(salida, 'sin-conexion.png') });
    await ctx.setOffline(false);
    await page.waitForSelector('.cabecera-app h1');
    igual((await page.textContent('.cabecera-app h1')).trim(), 'Hola, Marta', 'cuando el teléfono recupera la señal sigue sola donde estaba, sin pedir la clave');
    srv.M.caido = 503;
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#btn-reintentar');
    igual((await page.textContent('.acceso h1')).trim(), 'Sin conexión', 'si el que no responde es el servidor de datos, también lo explica en lugar de pedir la clave de nuevo');
    srv.M.caido = false;
    await page.click('#btn-reintentar');
    await page.waitForSelector('.cabecera-app h1');
    igual((await page.textContent('.cabecera-app h1')).trim(), 'Hola, Marta', 'y Reintentar la trae de vuelta');
    await page.click('#btn-salir');
    await page.waitForSelector('form[data-form="ingreso"]');

    // Aviso de instalación en Android
    const visible = () => page.evaluate(() => !document.getElementById('instalar').hidden);
    await page.evaluate(() => { localStorage.removeItem('plataforma-instalar-no'); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('form[data-form="ingreso"]');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
    igual(await visible(), true, 'Android: aparece el aviso cuando el navegador permite instalar');
    contiene(await page.textContent('#instalar-texto'), 'Podés instalarla en este teléfono', 'con su texto');
    igual(await page.isVisible('#instalar-si'), true, 'y el botón Instalar');
    igual(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'el aviso no desborda el teléfono');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(salida, 'instalar-android.png') });
    await page.click('#instalar-no');
    igual(await visible(), false, 'Ahora no lo cierra');
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
    igual(await visible(), false, 'y no vuelve a insistir');
    await ctx.close();

    // Aviso en iPhone: no hay botón, se explica el camino
    const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
    const ios = await nuevoContexto({ userAgent: safari });
    const p2 = await ios.newPage();
    await p2.goto(URL_SITIO, { waitUntil: 'load' });
    await p2.waitForSelector('form[data-form="ingreso"]');
    igual(await p2.evaluate(() => !document.getElementById('instalar').hidden), true, 'iPhone: aparece el aviso');
    contiene(await p2.textContent('#instalar-texto'), 'tocá Compartir y elegí Agregar a inicio', 'explica cómo instalar desde Safari');
    igual(await p2.isVisible('#instalar-si'), false, 'sin botón Instalar, porque iPhone no lo permite');
    igual((await p2.textContent('#instalar-no')).trim(), 'Entendido', 'y se puede cerrar');
    igual(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'el aviso no desborda el teléfono');
    await p2.screenshot({ path: path.join(salida, 'instalar-iphone.png') });
    await ios.close();

    const chromeIos = await nuevoContexto({ userAgent: safari.replace('Version/18.5', 'CriOS/142.0.0.0') });
    const p3 = await chromeIos.newPage();
    await p3.goto(URL_SITIO, { waitUntil: 'load' });
    contiene(await p3.textContent('#instalar-texto'), 'abrila en Safari', 'iPhone con otro navegador: manda a Safari');
    await chromeIos.close();

    // Ya instalada: sin aviso. Se simulan las dos señales que dan los teléfonos.
    const comoApp = await nuevoContexto({ userAgent: safari });
    await comoApp.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = q => (q.indexOf('display-mode: standalone') >= 0 ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q));
    });
    const p4 = await comoApp.newPage();
    await p4.goto(URL_SITIO, { waitUntil: 'load' });
    igual(await p4.evaluate(() => document.getElementById('instalar').hidden), true, 'instalada (modo aplicación): no muestra el aviso');
    await comoApp.close();
    const comoAppIos = await nuevoContexto({ userAgent: safari });
    await comoAppIos.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
    const p5 = await comoAppIos.newPage();
    await p5.goto(URL_SITIO, { waitUntil: 'load' });
    igual(await p5.evaluate(() => document.getElementById('instalar').hidden), true, 'instalada en iPhone: no muestra el aviso');
    await comoAppIos.close();

    // La pantalla de la sede sigue mostrando códigos aunque se corte la conexión
    const sede = srv.M.sedes[0];
    const vinculo = srv.F.admin_vincular(admin, { p_sede: sede.id }).codigo;
    const tablet = await nuevoContexto({ viewport: { width: 1024, height: 768 } });
    const p6 = await tablet.newPage();
    await p6.goto(URL_SITIO + '#pantalla', { waitUntil: 'load' });
    await p6.fill('#pv-codigo', vinculo);
    await p6.click('#btn-pantalla-vincular');
    await p6.waitForSelector('#pan-qr svg');
    await p6.evaluate(() => navigator.serviceWorker.ready);
    await p6.reload({ waitUntil: 'load' });
    await p6.waitForSelector('#pan-qr svg');
    await tablet.setOffline(true);
    await p6.evaluate(() => sincronizarPantalla().then(dibujarPantalla));
    igual((await p6.textContent('#pan-codigo')).replace(/\D/g, ''), srv.codigo(sede.id), 'si se corta la señal, la pantalla sigue mostrando el código que vale');
    contiene(await p6.textContent('.pan'), 'Sin conexión. Los códigos siguen valiendo.', 'y lo avisa');
    await p6.reload({ waitUntil: 'load' });
    await p6.waitForSelector('#pan-qr svg');
    igual((await p6.textContent('#pan-codigo')).replace(/\D/g, ''), srv.codigo(sede.id), 'aunque se apague y se prenda sin conexión, vuelve a mostrar códigos que valen');
    await p6.screenshot({ path: path.join(salida, 'pantalla-sin-conexion.png') });
    await tablet.close();

    // Archivos de apoyo para el hosting
    const cabeceras = fs.readFileSync(path.join(carpeta, '_headers'), 'utf8');
    contiene(cabeceras, '/sw.js\n  Cache-Control: no-cache', 'el hosting no deja vieja la versión del service worker');
    contiene(cabeceras, "connect-src 'self' https://", 'la aplicación solo puede hablar con su propio servidor de datos');
    contiene(fs.readFileSync(path.join(carpeta, 'robots.txt'), 'utf8'), 'Disallow: /', 'robots.txt cierra el sitio a buscadores');
    contiene(fs.readFileSync(path.join(carpeta, 'sw.js'), 'utf8'), "const VERSION = '", 'el service worker lleva su versión');
    const app = fs.readdirSync(carpeta).filter(n => /^app\.[0-9a-f]{12}\.js$/.test(n));
    igual(app.length, 1, 'un solo archivo de aplicación, con su huella en el nombre');
    const codigo = fs.readFileSync(path.join(carpeta, app[0]), 'utf8');
    igual(/sb_secret_|service_role/.test(codigo), false, 'la aplicación publicada no lleva ninguna llave privada del servidor');
    contiene(codigo, 'sb_publishable_', 'solo la llave pública');

    if (errores.length) { mal += errores.length; console.log('Errores en la página:\n' + errores.join('\n')); }
  } finally {
    if (browser) await browser.close();
    await srv.cerrar();
  }
  console.log(ok + ' correctas, ' + mal + ' fallas');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
