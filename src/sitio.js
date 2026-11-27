/* Solo en el sitio publicado: instalación en el teléfono y funcionamiento sin conexión. */
(function () {
  const CLAVE_NO = 'plataforma-instalar-no';
  const caja = document.getElementById('instalar');
  const texto = document.getElementById('instalar-texto');
  const si = document.getElementById('instalar-si');
  const no = document.getElementById('instalar-no');
  let pedido = null;
  const instalada = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  const descartado = () => { try { return localStorage.getItem(CLAVE_NO) === '1'; } catch (e) { return false; } };
  function mostrar(modo) {
    if (!caja || instalada() || descartado()) return;
    if (modo === 'android') {
      texto.textContent = 'Podés instalarla en este teléfono y abrirla desde su ícono, como cualquier aplicación.';
      si.hidden = false;
      no.textContent = 'Ahora no';
    } else {
      texto.textContent = modo === 'ios'
        ? 'Para instalarla en el iPhone, tocá Compartir y elegí Agregar a inicio.'
        : 'Para instalarla en el iPhone, abrila en Safari, tocá Compartir y elegí Agregar a inicio.';
      si.hidden = true;
      no.textContent = 'Entendido';
    }
    caja.hidden = false;
  }
  function ocultar(recordar) {
    if (caja) caja.hidden = true;
    if (recordar) { try { localStorage.setItem(CLAVE_NO, '1'); } catch (e) { /* sin almacenamiento, vuelve a aparecer la próxima vez */ } }
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedido = e; mostrar('android'); });
  window.addEventListener('appinstalled', () => { pedido = null; ocultar(false); });
  if (si) si.addEventListener('click', () => {
    if (!pedido) return;
    pedido.prompt();
    pedido.userChoice.then(() => { pedido = null; ocultar(false); }).catch(() => { /* la persona cerró el cuadro */ });
  });
  if (no) no.addEventListener('click', () => ocultar(true));
  const ua = navigator.userAgent || '';
  const esIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (esIos) mostrar(/safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua) ? 'ios' : 'ios-otro');
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sin service worker la web funciona igual, pero necesita conexión */ });
    });
  }
})();
