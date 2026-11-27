'use strict';
/* Sirve la carpeta sitio/ por HTTP y verifica lo que la hace instalable: manifest, íconos, service worker,
   carga sin conexión y aviso de instalación. Uso: node pruebas/sitio.js */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const PUERTO = 8765;
const URL_SITIO = 'http://localhost:' + PUERTO + '/';
const carpeta = path.join(__dirname, '..', 'sitio');
const salida = path.join(__dirname, '..', 'capturas-sitio');
fs.mkdirSync(salida, { recursive: true });

let ok = 0, mal = 0;
function igual(real, esperado, nombre) {
  if (JSON.stringify(real) === JSON.stringify(esperado)) ok++;
  else { mal++; console.log('FALLA  ' + nombre + '\n   esperado ' + JSON.stringify(esperado) + '\n   real     ' + JSON.stringify(real)); }
}
function contiene(real, parte, nombre) {
  if (String(real).indexOf(parte) >= 0) ok++;
  else { mal++; console.log('FALLA  ' + nombre + '\n   debía contener ' + JSON.stringify(parte) + '\n   real           ' + JSON.stringify(String(real).slice(0, 300))); }
}
async function esperarServidor() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(URL_SITIO); if (r.ok) return; } catch (e) { /* todavía no levantó */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('el servidor local no respondió');
}

(async () => {
  const servidor = spawn('python3', ['-m', 'http.server', String(PUERTO), '--bind', '127.0.0.1', '--directory', carpeta], { stdio: 'ignore' });
  let browser;
  try {
    await esperarServidor();
    browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
    const errores = [];
    const nuevoContexto = async opciones => {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, locale: 'es-AR' }, opciones || {}));
      ctx.on('page', p => {
        p.on('pageerror', e => errores.push('pageerror: ' + e.message));
        p.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
      });
      return ctx;
    };

    // Lo que publica el hosting
    const ctx = await nuevoContexto();
    const page = await ctx.newPage();
    const pedidos = [];
    page.on('request', r => pedidos.push(r.url()));
    await page.goto(URL_SITIO, { waitUntil: 'load' });
    igual(await page.title(), 'Plataforma de trabajo', 'título del sitio');
    igual((await page.textContent('.cabecera-app h1')).trim(), 'Hola, Marta', 'la aplicación arranca');
    igual(pedidos.filter(u => u.indexOf(URL_SITIO) !== 0), [], 'no pide nada a otros servidores');
    igual(await page.getAttribute('meta[name="robots"]', 'content'), 'noindex', 'no se ofrece a los buscadores');

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

    // Service worker y uso sin conexión
    const alcance = await page.evaluate(() => navigator.serviceWorker.ready.then(r => r.scope));
    igual(alcance, URL_SITIO, 'el service worker queda registrado');
    await page.reload({ waitUntil: 'load' });
    igual(await page.evaluate(() => !!navigator.serviceWorker.controller), true, 'y controla la página');
    const guardado = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return [ks.length, (await c.keys()).length]; });
    igual(guardado, [1, 7], 'guarda la página, el manifest, la tipografía y los cuatro íconos');
    await page.click('#btn-abrir-cierre');
    await page.check('#cierre-ok');
    await page.click('#btn-cerrar');
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    igual((await page.textContent('.cabecera-app h1')).trim(), 'Hola, Marta', 'abre sin conexión');
    contiene(await page.textContent('.pantalla'), 'Turno en Sede Centro cerrado y a horario', 'y conserva lo que se hizo antes de perder la señal');
    igual(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('800 20px Overpass'))), true, 'con su tipografía');
    await page.screenshot({ path: path.join(salida, 'sin-conexion.png') });
    await ctx.setOffline(false);

    // Aviso de instalación en Android
    const visible = () => page.evaluate(() => !document.getElementById('instalar').hidden);
    await page.evaluate(() => { localStorage.removeItem('plataforma-instalar-no'); });
    await page.reload({ waitUntil: 'load' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
    igual(await visible(), true, 'Android: aparece el aviso cuando el navegador permite instalar');
    contiene(await page.textContent('#instalar-texto'), 'Podés instalarla en este teléfono', 'con su texto');
    igual(await page.isVisible('#instalar-si'), true, 'y el botón Instalar');
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

    // Archivos de apoyo para el hosting
    const cabeceras = fs.readFileSync(path.join(carpeta, '_headers'), 'utf8');
    contiene(cabeceras, '/sw.js\n  Cache-Control: no-cache', 'el hosting no deja vieja la versión del service worker');
    contiene(fs.readFileSync(path.join(carpeta, 'robots.txt'), 'utf8'), 'Disallow: /', 'robots.txt cierra el sitio a buscadores');
    contiene(fs.readFileSync(path.join(carpeta, 'sw.js'), 'utf8'), "const VERSION = '", 'el service worker lleva su versión');

    if (errores.length) { mal += errores.length; console.log('Errores en la página:\n' + errores.join('\n')); }
  } finally {
    if (browser) await browser.close();
    servidor.kill();
  }
  console.log(ok + ' correctas, ' + mal + ' fallas');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
