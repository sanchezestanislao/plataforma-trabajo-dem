'use strict';

/* Versión real: ingreso con DNI, datos en el servidor y fichaje verificado. Solo va en el sitio publicado.
   Las reglas siguen en logica.js y las pantallas en vistas.js; acá está todo lo que habla con el servidor.
   Cada cambio corre primero sobre una copia del estado con las reglas de siempre (para validar sin esperar),
   después se manda al servidor, y la pantalla se vuelve a dibujar con lo que el servidor devuelve. */

const API = (function () {
  /* En la computadora de desarrollo el servidor de pruebas atiende en la misma dirección que la página. */
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  return { url: local ? location.origin : CONFIG.url, clave: CONFIG.clave };
})();
const CLAVE_SESION = 'plataforma-sesion';
const CLAVE_TELEFONO = 'plataforma-telefono';
const CLAVE_PANTALLA = 'plataforma-pantalla';
const CLAVE_PANTALLA_DATOS = 'plataforma-pantalla-datos';
const ROLES = { colaborador: 'Colaborador', supervisor: 'Supervisión', admin: 'Administración' };
const VERIFICACION = { pantalla: 'Código en una pantalla de la sede', impreso: 'QR impreso, fijo', ubicacion: 'Solo la ubicación del teléfono' };

let sesion = null;
let renovando = null;
let fase = 'cargando';              /* cargando | sin-red | instalar | ingreso | clave | app | pantalla */
let ocupado = false;
let sondeo = null;
let dibujoPendiente = false;
let qrEnMano = null;                /* QR leído con la cámara del teléfono, que llegó como enlace */
const R = { error: '', dni: '', sinRed: false, claveVoluntaria: false, yo: null };
let geo = { pos: null, estado: 'sin', espera: null };
let cam = { stream: null, detector: null, lazo: null, leyendo: false };
let pan = { token: null, paso: -1, desfase: 0, sinRed: false };

/* ---------- Servidor ---------- */

function leerSesion() {
  try {
    const o = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null');
    return o && o.access_token && o.refresh_token ? o : null;
  } catch (e) { return null; }
}
function guardarSesion(o) {
  /* El vencimiento se cuenta con el reloj de este teléfono, que puede estar mal puesto: por eso no se usa la hora que informa el servidor. */
  sesion = o ? { access_token: o.access_token, refresh_token: o.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (o.expires_in || 3600) } : null;
  try {
    if (sesion) localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion)); else localStorage.removeItem(CLAVE_SESION);
  } catch (e) { /* sin almacenamiento, la sesión dura lo que dure la página */ }
}
async function pedir(ruta, cuerpo, token, metodo) {
  const cab = { apikey: API.clave, 'Content-Type': 'application/json' };
  if (token) cab.Authorization = 'Bearer ' + token;
  const r = await fetch(API.url + ruta, { method: metodo || 'POST', headers: cab, body: JSON.stringify(cuerpo || {}) });
  let j = null;
  try { j = await r.json(); } catch (e) { /* respuesta sin cuerpo */ }
  return { status: r.status, ok: r.ok, j: j };
}
/* La llave de la sesión dura una hora: se renueva sola, de a un pedido por vez. */
function renovar() {
  if (!renovando) {
    renovando = (async () => {
      try {
        if (!sesion) return null;
        const r = await pedir('/auth/v1/token?grant_type=refresh_token', { refresh_token: sesion.refresh_token });
        if (r.ok && r.j && r.j.access_token) { guardarSesion(r.j); return sesion.access_token; }
        if (r.status >= 400 && r.status < 500 && r.status !== 429) { guardarSesion(null); return null; }
        throw new Error('servidor');
      } finally { renovando = null; }
    })();
  }
  return renovando;
}
async function llaveVigente() {
  if (!sesion) return null;
  if (sesion.expires_at - 90 > Date.now() / 1000) return sesion.access_token;
  return renovar();
}
/* Llama a una función del servidor. Devuelve siempre un objeto con `ok`; si el servidor manda el estado nuevo, lo adopta. */
async function llamar(nombre, args, sinSesion) {
  try {
    let llave = sinSesion ? null : await llaveVigente();
    if (!sinSesion && !llave) { alIngreso('Tu sesión se cerró. Ingresá de nuevo.'); return { ok: false, error: '' }; }
    let r = await pedir('/rest/v1/rpc/' + nombre, args, llave);
    if (r.status === 401 && llave) {
      llave = await renovar();
      if (!llave) { alIngreso('Tu sesión se cerró. Ingresá de nuevo.'); return { ok: false, error: '' }; }
      r = await pedir('/rest/v1/rpc/' + nombre, args, llave);
    }
    /* Un error del propio servidor (caído o en mantenimiento) se trata igual que la falta de señal. */
    R.sinRed = r.status >= 500;
    const j = r.j;
    if (r.ok) {
      if (j && j.estado) adoptar(j.estado);
      return j && typeof j === 'object' && 'ok' in j ? j : { ok: true, dato: j };
    }
    if (r.status >= 500) return { ok: false, error: 'El servidor no responde. Probá de nuevo en un momento.', red: true };
    const cod = j && j.code;
    if (cod === 'DEM02' || r.status === 401) { alIngreso(cod === 'DEM02' ? j.message : 'Tu sesión se cerró. Ingresá de nuevo.'); return { ok: false, error: '' }; }
    if (cod === 'DEM03') { fase = 'clave'; R.claveVoluntaria = false; return { ok: false, error: j.message }; }
    if (cod === 'DEM01' || cod === 'DEM04') return { ok: false, error: j.message };
    return { ok: false, error: 'No se pudo completar. Probá de nuevo en un momento.' };
  } catch (e) {
    R.sinRed = true;
    return { ok: false, error: 'Sin conexión. Revisá tu señal y probá de nuevo.', red: true };
  }
}
function alIngreso(mensaje) {
  guardarSesion(null);
  cerrarCamara();
  S = null;
  fase = 'ingreso';
  R.error = mensaje || '';
}

/* ---------- Estado ---------- */

function uiInicial() {
  return { colab: null, tab: 'hoy', cierre: null, recien: null, drafts: {}, casos: {}, detalle: null, descargo: null, festejo: null, errores: {},
    admin: 'cronograma', sedeGrilla: null, semana: null, fichaje: null, anular: null, vinculo: null, qrSede: null, cambiarInicial: false, editar: null };
}
const JORNADA_BASE = { entrada: null, salida: null, metodoIn: null, metodoOut: null, cerrada: false, conf: false, decl: null, rev: null, salidaVal: null, justif: null, descargo: null, lic: null, guion: null, manual: true, tocada: true };
/* Arma el estado que usan las reglas y las vistas a partir de lo que manda el servidor. */
function adoptar(o) {
  if (!o || !o.yo) return;
  if (o.yo.debeCambiarClave) { R.yo = o.yo; S = null; fase = 'clave'; R.claveVoluntaria = false; return; }
  const ui = S && S.ui ? S.ui : uiInicial();
  const p = o.hoy.split('-').map(Number);
  S = {
    v: VERSION, real: true, rng: 1, sig: 1,
    yo: o.yo, hoy: o.hoy, ahora: o.ahora, ts: o.ts, recibido: Date.now(),
    /* Diferencia entre la hora de Mendoza y la hora universal, tomada de lo que informa el servidor. */
    desfase: Date.UTC(p[0], p[1] - 1, p[2]) + o.ahora * 60000 - Math.floor(o.ts / 60000) * 60000,
    P: o.P, ref: o.ref || { hora: 0, fijo: 0 },
    sedes: o.sedes || [], colabs: o.colabs || [],
    asigs: (o.asigs || []).map(a => Object.assign({}, a, { desde: a.desde || null, hasta: a.hasta || null })),
    franjas: o.franjas || [], licencias: o.licencias || [], feriados: o.feriados || [],
    jornadas: (o.jornadas || []).map(j => Object.assign({}, JORNADA_BASE, j)),
    novedades: o.novedades || [], bitacora: o.bitacora || [], avisos: o.avisos || [], marcas: o.marcas || [],
    claveInicial: !!o.claveInicial, ui: ui
  };
  S.ui.colab = o.yo.id;
  if (fase !== 'app') S.ui.admin = !S.sedes.length ? 'sedes' : S.colabs.length < 2 ? 'personas' : S.ui.admin;
  fase = 'app';
}
/* Lleva el reloj de la pantalla con la hora del servidor. Devuelve true si cambió el día. */
function ponerReloj() {
  if (!S || !S.real) return false;
  const d = new Date(S.ts + (Date.now() - S.recibido) + S.desfase);
  const hoy = isoDe(d), cambio = hoy !== S.hoy;
  S.hoy = hoy;
  S.ahora = d.getUTCHours() * 60 + d.getUTCMinutes();
  return cambio;
}
function escribiendo() {
  const a = document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio');
}
/* Vuelve a dibujar con datos nuevos sin llevarse puesto lo que la persona tenía a medio cargar en un formulario. */
function dibujarSinPerder() {
  const sucios = {};
  document.querySelectorAll('#vista input[id], #vista textarea[id], #vista select[id]').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== el.defaultChecked) sucios[el.id] = { marcado: el.checked }; }
    else if (el.tagName === 'SELECT') { const o = el.options[el.selectedIndex]; if (o && !o.defaultSelected) sucios[el.id] = { valor: el.value }; }
    else if (el.type !== 'file' && el.value !== el.defaultValue) sucios[el.id] = { valor: el.value };
  });
  render();
  for (const id of Object.keys(sucios)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if ('marcado' in sucios[id]) el.checked = sucios[id].marcado; else el.value = sucios[id].valor;
  }
}
async function refrescar(silencioso) {
  if (fase !== 'app' || ocupado) return;
  const r = await llamar('estado');
  if (r.ok && r.dato) adoptar(r.dato);
  else if (!silencioso && r.error) aviso(r.error);
  if (S && S.ui.fichaje && S.ui.fichaje.paso === 'enviando') return;
  if (escribiendo()) dibujoPendiente = true; else dibujarSinPerder();
}
/* Cada medio minuto: el reloj avanza y, si pasó el tiempo, se piden los datos nuevos. No interrumpe a quien está escribiendo. */
async function latido() {
  if (fase !== 'app' || !S || document.hidden || ocupado) return;
  const cambioDia = ponerReloj();
  const espera = S.yo.rol === 'colaborador' ? 120000 : 60000;
  if (cambioDia || Date.now() - S.recibido > espera) await refrescar(true);
  else if (!escribiendo() && !(S.ui.fichaje && S.ui.fichaje.camara)) dibujarSinPerder();
}
/* Corre una tarea contra el servidor sin dejar que se dispare dos veces. */
async function conServidor(tarea) {
  if (ocupado) return;
  ocupado = true;
  document.body.classList.add('ocupado');
  try { await tarea(); } finally {
    ocupado = false;
    document.body.classList.remove('ocupado');
    render();
  }
}
function clonar(o) { return JSON.parse(JSON.stringify(o)); }
function igualJ(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
/* Qué cambió entre el estado A y la copia B, en la forma que espera admin_aplicar. */
function cambiosAdmin(A, B) {
  const o = {};
  const indice = (l, k) => { const m = {}; for (const x of l) m[x[k]] = x; return m; };
  const asig = a => ({ id: a.id, c: a.c, sede: a.sede, dias: a.dias, ti: a.ti, tf: a.tf, modalidad: a.modalidad, valor: a.valor, activa: a.activa, desde: a.desde || null, hasta: a.hasta || null });
  const asA = indice(A.asigs, 'id');
  const asigs = B.asigs.map(asig).filter(a => !asA[a.id] || !igualJ(asig(asA[a.id]), a));
  if (asigs.length) o.asigs = asigs;
  const frA = indice(A.franjas, 'id'), frB = indice(B.franjas, 'id');
  const franjas = B.franjas.filter(x => !frA[x.id] || !igualJ(frA[x.id], x));
  if (franjas.length) o.franjas = franjas;
  const frQ = A.franjas.filter(x => !frB[x.id]).map(x => x.id);
  if (frQ.length) o.franjasQuitar = frQ;
  const liA = indice(A.licencias, 'id'), liB = indice(B.licencias, 'id');
  const lic = B.licencias.filter(x => !liA[x.id]);
  if (lic.length) o.licencias = lic;
  const liQ = A.licencias.filter(x => !liB[x.id]).map(x => x.id);
  if (liQ.length) o.licenciasQuitar = liQ;
  const feA = indice(A.feriados, 'f'), feB = indice(B.feriados, 'f');
  const fer = B.feriados.filter(x => !feA[x.f] || !igualJ(feA[x.f], x));
  if (fer.length) o.feriados = fer;
  const feQ = A.feriados.filter(x => !feB[x.f]).map(x => x.f);
  if (feQ.length) o.feriadosQuitar = feQ;
  if (!igualJ(A.P, B.P)) o.P = B.P;
  const avA = indice(A.avisos, 'id');
  const avisos = B.avisos.filter(x => !avA[x.id]).map(x => x.texto);
  if (avisos.length) o.avisos = avisos;
  return o;
}
/* Un cambio de administración: `accion` lo aplica sobre una copia y devuelve '' o el error de las reglas. */
async function aplicarAdmin(accion) {
  const X = clonar(S);
  const err = accion(X);
  if (err) return { error: err, avisos: 0 };
  const c = cambiosAdmin(S, X);
  if (!Object.keys(c).length) return { error: '', avisos: 0 };
  const r = await llamar('admin_aplicar', { p: c });
  return { error: r.ok ? '' : (r.error || 'No se pudo guardar.'), avisos: (c.avisos || []).length };
}

/* ---------- Ingreso, primera configuración y clave ---------- */

function marcaHtml() {
  return '<div class="semaforo-v chico" aria-hidden="true"><span class="foco"></span><span class="foco"></span><span class="foco on verde"></span></div>';
}
function vistaAcceso() {
  if (fase === 'cargando') return '<div class="acceso"><p class="ayuda" role="status">Cargando…</p></div>';
  if (fase === 'sin-red') {
    return '<div class="acceso"><div class="acceso-caja">' + marcaHtml() + '<h1>Sin conexión</h1><p>No pudimos conectar con el servidor. Revisá tu señal y probá de nuevo.</p>' +
      '<button class="btn primario ancho" type="button" data-a="reintentar" id="btn-reintentar">Reintentar</button></div></div>';
  }
  if (fase === 'instalar') {
    return '<div class="acceso"><form class="acceso-caja" data-form="instalar" novalidate>' + marcaHtml() +
      '<h1>Primera configuración</h1><p>Creá la cuenta de administración. Con ella vas a cargar las sedes y dar de alta al resto del equipo.</p>' +
      '<label class="campo" for="ins-codigo">Código de configuración<input type="text" id="ins-codigo" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24"></label>' +
      '<label class="campo" for="ins-dni">Tu DNI<input type="text" id="ins-dni" inputmode="numeric" autocomplete="username" maxlength="12" placeholder="Solo números"></label>' +
      '<label class="campo" for="ins-nombre">Nombre<input type="text" id="ins-nombre" autocomplete="given-name" maxlength="30"></label>' +
      '<label class="campo" for="ins-apellido">Apellido<input type="text" id="ins-apellido" autocomplete="family-name" maxlength="40"></label>' +
      '<label class="campo" for="ins-clave">Elegí tu clave<input type="password" id="ins-clave" autocomplete="new-password" maxlength="72"></label>' +
      '<label class="campo" for="ins-clave2">Repetí la clave<input type="password" id="ins-clave2" autocomplete="new-password" maxlength="72"></label>' +
      '<p class="ayuda">Al menos 8 caracteres. El DNI y esta clave son tu ingreso de ahora en más.</p>' +
      '<p class="error" role="alert">' + esc(R.error) + '</p>' +
      '<button class="btn primario ancho" type="submit" id="btn-instalar">Crear la cuenta de administración</button></form></div>';
  }
  if (fase === 'clave') {
    const n = R.claveVoluntaria && S ? S.yo.nombre : R.yo ? R.yo.nombre : '';
    return '<div class="acceso"><form class="acceso-caja" data-form="clave" novalidate>' + marcaHtml() +
      '<h1>' + (R.claveVoluntaria ? 'Cambiar tu clave' : n ? 'Hola, ' + esc(n) + '. Elegí tu clave' : 'Elegí tu clave') + '</h1>' +
      (R.claveVoluntaria ? '' : '<p>Entraste con la clave inicial. Antes de seguir, elegí una que solo vos conozcas.</p>') +
      '<label class="campo" for="cl-nueva">Clave nueva<input type="password" id="cl-nueva" autocomplete="new-password" maxlength="72"></label>' +
      '<label class="campo" for="cl-repetir">Repetí la clave<input type="password" id="cl-repetir" autocomplete="new-password" maxlength="72"></label>' +
      '<p class="ayuda">Al menos 6 caracteres. Pueden ser números.</p>' +
      '<p class="error" role="alert">' + esc(R.error) + '</p>' +
      '<button class="btn primario ancho" type="submit" id="btn-clave">Guardar mi clave</button>' +
      (R.claveVoluntaria ? '<button class="btn ancho" type="button" data-a="cancelar-clave" id="btn-cancelar-clave">Volver</button>'
        : '<button class="btn ancho" type="button" data-a="salir" id="btn-salir-clave">Salir</button>') +
      '</form></div>';
  }
  return '<div class="acceso"><form class="acceso-caja" data-form="ingreso" novalidate>' + marcaHtml() +
    '<h1>Ingresá a la plataforma</h1>' +
    '<label class="campo" for="in-dni">DNI<input type="text" id="in-dni" inputmode="numeric" autocomplete="username" maxlength="12" placeholder="Solo números" value="' + esc(R.dni) + '"></label>' +
    '<label class="campo" for="in-clave">Clave<input type="password" id="in-clave" autocomplete="current-password" maxlength="72"></label>' +
    '<p class="error" role="alert">' + esc(R.error) + '</p>' +
    '<button class="btn primario ancho" type="submit" id="btn-ingresar">Ingresar</button>' +
    '<p class="ayuda">En tu primer ingreso usá la clave inicial que te dio administración. Si te olvidaste la clave, pedile a administración que la restablezca.</p>' +
    '</form></div>';
}
function errorDeIngreso(r) {
  const c = r.j && (r.j.error_code || r.j.code);
  if (r.status === 429) return 'Demasiados intentos. Esperá un minuto y probá de nuevo.';
  if (c === 'invalid_credentials' || r.status === 400) return 'El DNI o la clave no coinciden.';
  return 'No se pudo ingresar. Probá de nuevo en un momento.';
}
async function ingresar(dni, clave) {
  const d = String(dni || '').replace(/\D/g, '');
  R.dni = d;
  if (!/^\d{6,9}$/.test(d)) { R.error = 'Escribí tu DNI solo con números, sin puntos.'; return; }
  if (!clave) { R.error = 'Escribí tu clave.'; return; }
  let r;
  try { r = await pedir('/auth/v1/token?grant_type=password', { email: d + '@dni.invalid', password: clave }); }
  catch (e) { R.error = 'Sin conexión. Revisá tu señal y probá de nuevo.'; return; }
  if (!r.ok || !r.j || !r.j.access_token) { R.error = errorDeIngreso(r); return; }
  guardarSesion(r.j);
  R.error = '';
  const e = await llamar('estado');
  if (e.ok && e.dato) adoptar(e.dato);
  else if (fase !== 'clave' && fase !== 'ingreso') { R.error = e.error || 'No se pudo cargar. Probá de nuevo.'; fase = 'ingreso'; }
  if (fase === 'app') { programarSondeo(); usarEnlaceQR(); }
}
async function instalar(v) {
  const dni = v.dni.replace(/\D/g, '');
  if (!v.codigo.trim()) { R.error = 'Escribí el código de configuración.'; return; }
  if (!/^\d{6,9}$/.test(dni)) { R.error = 'Escribí tu DNI solo con números, sin puntos.'; return; }
  if (!v.nombre.trim()) { R.error = 'Escribí tu nombre.'; return; }
  if (v.clave.length < 8) { R.error = 'La clave tiene que tener al menos 8 caracteres.'; return; }
  if (v.clave !== v.clave2) { R.error = 'Las dos claves no coinciden.'; return; }
  const r = await llamar('instalar', { p_codigo: v.codigo, p_dni: dni, p_nombre: v.nombre, p_apellido: v.apellido, p_clave: v.clave }, true);
  if (!r.ok) { R.error = r.error || 'No se pudo crear la cuenta.'; return; }
  R.error = '';
  fase = 'ingreso';
  await ingresar(dni, v.clave);
}
async function cambiarClave(nueva, repetir) {
  if (nueva.length < 6) { R.error = 'La clave tiene que tener al menos 6 caracteres.'; return; }
  if (nueva !== repetir) { R.error = 'Las dos claves no coinciden.'; return; }
  let r;
  try {
    const llave = await llaveVigente();
    if (!llave) { alIngreso('Tu sesión se cerró. Ingresá de nuevo.'); return; }
    r = await pedir('/auth/v1/user', { password: nueva }, llave, 'PUT');
  } catch (e) { R.error = 'Sin conexión. Revisá tu señal y probá de nuevo.'; return; }
  if (!r.ok) {
    const c = r.j && (r.j.error_code || r.j.code);
    /* Administración restableció la clave o dio de baja la cuenta mientras estaba abierta. */
    if (r.status === 401 || r.status === 403) { alIngreso('Tu sesión se cerró. Ingresá de nuevo.'); return; }
    /* En el primer ingreso, "es la misma clave" puede ser un intento anterior que guardó la clave y se cortó antes de avisarle
       al servidor: se sigue adelante, y el servidor igual rechaza la clave inicial. */
    if (c !== 'same_password' || R.claveVoluntaria) {
      R.error = c === 'same_password' ? 'Elegí una clave distinta de la que tenías.' : c === 'weak_password' ? 'Esa clave es muy fácil de adivinar. Probá con otra.' : 'No se pudo cambiar la clave. Probá de nuevo.';
      return;
    }
  }
  R.error = '';
  if (R.claveVoluntaria) { R.claveVoluntaria = false; fase = 'app'; aviso('Listo, tu clave quedó cambiada.'); return; }
  const e = await llamar('clave_cambiada');
  if (!e.ok) { R.error = e.error || 'No se pudo terminar el cambio. Probá de nuevo.'; return; }
  if (fase === 'app') { aviso('Listo, tu clave quedó guardada.'); programarSondeo(); usarEnlaceQR(); }
}
async function salir() {
  const llave = sesion && sesion.access_token;
  alIngreso('');
  R.dni = '';
  clearInterval(sondeo);
  if (llave) { try { await pedir('/auth/v1/logout?scope=local', {}, llave); } catch (e) { /* sin conexión: la sesión ya se borró de este teléfono */ } }
}

/* ---------- Cabecera ---------- */

function rutasPermitidas() {
  if (!S || !S.yo) return ['colaborador'];
  if (S.yo.rol === 'admin') return (S.yo.colab ? ['colaborador'] : []).concat(['supervisor', 'administracion']);
  if (S.yo.rol === 'supervisor') return (S.yo.colab ? ['colaborador'] : []).concat(['supervisor']);
  return ['colaborador'];
}
function rutaInicial() { return S.yo.rol === 'admin' ? 'administracion' : S.yo.rol === 'supervisor' ? 'supervisor' : 'colaborador'; }
function dibujarCabecera() {
  const nav = $('#nav-roles'), cuenta = $('#cuenta'), red = $('#estado-red');
  if (red) red.hidden = !R.sinRed || fase === 'sin-red';
  if (!nav || !cuenta) return;
  if (fase !== 'app' || !S) { nav.hidden = true; nav.innerHTML = ''; cuenta.innerHTML = ''; return; }
  const nombres = { colaborador: 'Mi jornada', supervisor: 'Supervisión', administracion: 'Administración' };
  const rs = rutasPermitidas(), r = ruta();
  nav.hidden = rs.length < 2;
  nav.innerHTML = rs.map(x => '<a href="#' + x + '"' + (x === r ? ' aria-current="page"' : '') + '>' + nombres[x] + '</a>').join('');
  cuenta.innerHTML = '<span class="cuenta-nombre">' + esc(nombreCompleto(S.yo)) + '</span>' +
    '<button class="enlace" type="button" data-a="cambiar-clave" id="btn-cambiar-clave">Cambiar clave</button>' +
    '<button class="enlace" type="button" data-a="salir" id="btn-salir">Salir</button>';
}
/* vistas.js la llama antes de dibujar: resuelve las pantallas que no dependen del estado. */
function antesDeDibujar() {
  if (fase === 'pantalla') { dibujarPantalla(); return false; }
  dibujarCabecera();
  dibujoPendiente = false;
  if (fase !== 'app' || !S) {
    const foco = document.activeElement && document.activeElement.id;
    const valores = {};
    document.querySelectorAll('.acceso input').forEach(i => { if (i.id) valores[i.id] = i.value; });
    $('#vista').innerHTML = vistaAcceso();
    for (const id of Object.keys(valores)) { const el = document.getElementById(id); if (el && el.type !== 'password') el.value = valores[id]; }
    const el = foco && document.getElementById(foco);
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) { /* sin foco */ } }
    return false;
  }
  ponerReloj();
  return true;
}
function despuesDeDibujar() { engancharVideo(); dibujarQrDeSede(); }

/* ---------- Fichaje: código de la sede, ubicación y teléfono ---------- */

function telefonoId() {
  try {
    let v = localStorage.getItem(CLAVE_TELEFONO);
    if (!v) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      v = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(CLAVE_TELEFONO, v);
    }
    return v;
  } catch (e) { return null; }
}
function equipo() {
  const u = navigator.userAgent || '';
  const so = /android/i.test(u) ? 'Android' : /iphone|ipad|ipod/i.test(u) ? 'iPhone' : /windows/i.test(u) ? 'Windows' : /mac os/i.test(u) ? 'Mac' : /linux/i.test(u) ? 'Linux' : 'Otro equipo';
  const nav = /edg\//i.test(u) ? 'Edge' : /samsungbrowser/i.test(u) ? 'Samsung Internet' : /firefox|fxios/i.test(u) ? 'Firefox' : /chrome|crios/i.test(u) ? 'Chrome' : /safari/i.test(u) ? 'Safari' : 'otro navegador';
  return so + ', ' + nav;
}
/* La ubicación se pide solo al fichar y se empieza a buscar apenas se abre la pantalla, para no demorar la marca. */
function buscarUbicacion() {
  geo = { pos: null, estado: 'buscando', espera: null };
  if (!navigator.geolocation) { geo.estado = 'falla'; geo.espera = Promise.resolve(null); return geo.espera; }
  const g = geo;
  g.espera = new Promise(res => {
    navigator.geolocation.getCurrentPosition(
      p => { g.pos = { lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy }; g.estado = 'lista'; res(g.pos); },
      e => { g.estado = e && e.code === 1 ? 'negada' : 'falla'; res(null); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
  return g.espera;
}
function ubicacionEnTiempo(ms) {
  const g = geo;
  return Promise.race([g.espera || Promise.resolve(null), new Promise(r => setTimeout(() => r(g.pos), ms))]);
}
async function abrirCamara() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try {
    const formatos = await window.BarcodeDetector.getSupportedFormats();
    if (formatos.indexOf('qr_code') < 0) return false;
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    cam.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    cam.lazo = setInterval(leerCuadro, 300);
    return true;
  } catch (e) { cerrarCamara(); return false; }
}
async function leerCuadro() {
  const v = document.getElementById('fichaje-video');
  if (!v || !cam.detector || v.readyState < 2 || cam.leyendo) return;
  cam.leyendo = true;
  try {
    const r = await cam.detector.detect(v);
    if (r && r.length) alLeerQR(r[0].rawValue);
  } catch (e) { /* cuadro ilegible, sigue con el próximo */ } finally { cam.leyendo = false; }
}
function cerrarCamara() {
  clearInterval(cam.lazo);
  if (cam.stream) cam.stream.getTracks().forEach(t => t.stop());
  cam = { stream: null, detector: null, lazo: null, leyendo: false };
}
function engancharVideo() {
  const v = document.getElementById('fichaje-video');
  if (!v || !cam.stream || v.srcObject === cam.stream) return;
  v.srcObject = cam.stream;
  const p = v.play();
  if (p && p.catch) p.catch(() => { /* el navegador no dejó reproducir: queda el código escrito */ });
}
/* El QR de una sede es un enlace a la aplicación que termina en #q=<sede>.<código>. */
function leerCodigoQR(texto) {
  const m = /[#&?]q=([0-9]+)\.([0-9A-Za-z]+)/.exec(String(texto || ''));
  return m ? { sede: m[1], codigo: m[2] } : null;
}
function sedeDe(j) { return S.sedes.find(s => s.id === j.sede) || { nombre: '', verificacion: 'pantalla' }; }
async function abrirFichaje(tipo, datos) {
  const c = colabSel(S), j = c ? tramoActual(S, c.id) : null;
  if (!j) return;
  const modo = sedeDe(j).verificacion || 'pantalla';
  S.ui.fichaje = { j: j.id, tipo: tipo, datos: datos || null, paso: 'codigo', error: '', camara: false, manual: false, modo: modo, yaMeFui: false };
  S.ui.arriba = true;
  buscarUbicacion();
  if (modo === 'ubicacion') { render(); await enviarFichaje('', 'ubicacion'); return; }
  const q = qrEnMano;
  if (q && q.sede === j.sede && Date.now() - q.t < (modo === 'impreso' ? 600000 : 75000)) { qrEnMano = null; render(); await enviarFichaje(q.codigo, 'qr'); return; }
  render();
  const hay = await abrirCamara();
  const k = S && S.ui.fichaje;
  if (!k || k.paso !== 'codigo') { cerrarCamara(); return; }
  k.camara = hay;
  k.manual = !hay && modo === 'pantalla';
  render();
}
function alLeerQR(texto) {
  const k = S && S.ui.fichaje;
  if (!k || k.paso !== 'codigo') return;
  const q = leerCodigoQR(texto), j = porId(S, k.j);
  let error = '';
  if (!q) error = 'Ese QR no es de la plataforma. Buscá el de la sede.';
  else if (j && q.sede !== j.sede) error = 'Ese QR es de otra sede. Tu turno es en ' + sedeNombre(S, j.sede) + '.';
  if (error) { if (k.error !== error) { k.error = error; render(); } return; }
  enviarFichaje(q.codigo, 'qr');
}
function notaDeMarca(r) {
  if (r.geo === 'lejos') return ' Tu ubicación figura lejos de la sede: tu supervisor lo va a revisar.';
  if (r.telefono === 'compartido') return ' Este teléfono también lo usa otra persona para fichar: queda avisado a supervisión.';
  if (r.telefono === 'otro') return ' No es tu teléfono habitual: queda avisado a supervisión.';
  if (r.geo === 'sin_dato') return ' No pudimos leer tu ubicación: activala en el teléfono para la próxima vez.';
  return '';
}
async function enviarFichaje(codigo, via) {
  const k = S && S.ui.fichaje;
  if (!k || k.paso === 'enviando') return;
  k.paso = 'enviando';
  k.error = '';
  cerrarCamara();
  render();
  const pos = await ubicacionEnTiempo(via === 'ubicacion' ? 12000 : 3500);
  const r = await llamar('fichar', {
    p_jornada: Number(k.j), p_tipo: k.tipo, p_codigo: codigo || null, p_via: via,
    p_lat: pos ? pos.lat : null, p_lon: pos ? pos.lon : null, p_precision: pos ? pos.precision : null,
    p_dispositivo: telefonoId(), p_equipo: equipo(), p_datos: k.tipo === 'salida' ? k.datos : null
  });
  if (!S) { render(); return; }
  if (r.ok) {
    const j = porId(S, k.j);
    S.ui.fichaje = null;
    if (k.tipo === 'entrada') aviso('Entrada registrada a las ' + hm(r.hora) + (j ? ' en ' + sedeNombre(S, j.sede) : '') + '.' + notaDeMarca(r));
    else {
      S.ui.cierre = null; S.ui.festejo = k.j; S.ui.recien = k.j; S.ui.arriba = true;
      if (notaDeMarca(r)) aviso(notaDeMarca(r).trim());
    }
  } else {
    k.paso = 'codigo';
    k.error = r.error || 'No se pudo registrar. Probá de nuevo.';
    if (k.modo !== 'ubicacion' && !k.manual) {
      k.camara = await abrirCamara();
      k.manual = !k.camara && k.modo === 'pantalla';
    }
  }
  render();
}
function fichajeHtml() {
  const k = S.ui.fichaje, j = porId(S, k.j);
  if (!j) return '';
  const entrada = k.tipo === 'entrada';
  const donde = k.modo === 'impreso' ? 'pegado en la sede' : 'de la pantalla de la sede';
  let h = '<section class="bloque fichaje"><div><p class="sede">' + (entrada ? 'Marcar entrada' : 'Marcar salida') + '</p><p class="turno-txt">' + esc(sedeNombre(S, j.sede)) + '</p></div>';
  if (k.paso === 'enviando') return h + '<p class="nota info" role="status">Registrando tu ' + k.tipo + '…</p></section>';
  if (k.yaMeFui) {
    return h + '<form class="bloque" data-form="ya-me-fui" novalidate>' +
      '<p class="nota info">Si ya no estás en la sede, avisá a qué hora terminaste. Tu supervisor valida la hora y recién ahí suman las horas.</p>' +
      '<label class="campo" for="ymf-hora">¿A qué hora terminaste?<input type="time" id="ymf-hora" value="' + hm(k.datos && k.datos.decl && k.datos.decl.hora != null ? k.datos.decl.hora : Math.min(relDe(S, j), j.tf)) + '"></label>' +
      '<p class="error" role="alert">' + esc(k.error || '') + '</p>' +
      '<button class="btn primario ancho" type="submit" id="btn-ymf">Avisar a mi supervisor</button>' +
      '<button class="btn ancho" type="button" data-a="fichaje-ya-me-fui" id="btn-ymf-volver">Volver</button></form></section>';
  }
  if (k.modo === 'ubicacion') {
    h += '<p class="nota info">En esta sede el fichaje se confirma con la ubicación de tu teléfono.</p>' +
      '<p class="error" role="alert">' + esc(k.error || '') + '</p>' +
      '<button class="btn primario ancho" type="button" data-a="fichaje-reintentar" id="btn-fichaje-reintentar">Probar de nuevo</button>';
  } else {
    if (k.camara && !k.manual) h += '<div class="visor"><video id="fichaje-video" playsinline muted></video></div><p class="ayuda">Apuntá la cámara al QR ' + donde + '.</p>';
    if (k.modo === 'pantalla' && k.manual) {
      h += '<form class="bloque" data-form="codigo" novalidate>' +
        '<label class="campo" for="fichaje-codigo">Código de 6 números que muestra la pantalla de la sede<input type="text" id="fichaje-codigo" class="codigo" inputmode="numeric" autocomplete="off" maxlength="7" placeholder="000 000"></label>' +
        '<button class="btn primario ancho" type="submit" id="btn-codigo">Fichar con este código</button></form>';
    }
    if (k.modo === 'pantalla' && k.camara) h += '<button class="enlace" type="button" data-a="fichaje-manual" id="btn-fichaje-manual">' + (k.manual ? 'Leer el QR con la cámara' : 'Escribir el código') + '</button>';
    if (!k.camara) h += '<p class="ayuda">' + (k.modo === 'pantalla' ? 'También podés leer el QR con la cámara de tu teléfono: el enlace te trae de vuelta acá.' : 'Abrí la cámara de tu teléfono y apuntá al QR ' + donde + '. El enlace te trae de vuelta acá con el fichaje listo.') + '</p>';
    h += '<p class="error" role="alert">' + esc(k.error || '') + '</p>';
  }
  if (!entrada) h += '<button class="enlace" type="button" data-a="fichaje-ya-me-fui" id="btn-ya-me-fui">Ya me fui de la sede</button>';
  return h + '<button class="btn ancho" type="button" data-a="fichaje-cancelar" id="btn-fichaje-cancelar">Volver</button></section>';
}
/* QR leído con la cámara del teléfono: llega como enlace, con o sin sesión abierta. */
function tomarEnlaceQR() {
  const q = leerCodigoQR(location.hash);
  if (!q) return;
  qrEnMano = { sede: q.sede, codigo: q.codigo, t: Date.now() };
  try { history.replaceState(null, '', location.pathname + location.search + '#colaborador'); } catch (e) { location.hash = '#colaborador'; }
}
function usarEnlaceQR() {
  if (!qrEnMano || fase !== 'app' || !S) return;
  const q = qrEnMano, k = S.ui.fichaje;
  if (Date.now() - q.t > 600000) { qrEnMano = null; return; }
  if (k) {
    /* La pantalla de fichaje ya estaba abierta, esperando el código. */
    if (k.paso !== 'codigo') return;
    const jk = porId(S, k.j);
    qrEnMano = null;
    if (jk && q.sede !== jk.sede) { k.error = 'Ese QR es de otra sede. Tu turno es en ' + sedeNombre(S, jk.sede) + '.'; render(); return; }
    enviarFichaje(q.codigo, 'qr');
    return;
  }
  const c = colabSel(S), j = c ? tramoActual(S, c.id) : null;
  if (!j) { qrEnMano = null; aviso('Leíste el QR de la sede, pero ahora no tenés un turno para fichar.'); return; }
  if (j.sede !== q.sede) { qrEnMano = null; aviso('Ese QR es de otra sede. Tu turno es en ' + sedeNombre(S, j.sede) + '.'); return; }
  S.ui.tab = 'hoy';
  if (j.entrada == null) { abrirFichaje('entrada'); return; }
  if (!S.ui.cierre) { S.ui.cierre = { ok: false, otras: false, que: null, error: '' }; S.ui.drafts.cierreTexto = ''; S.ui.drafts.cierreHora = ''; }
  aviso('QR leído. Confirmá tus horas para cerrar la jornada.');
  render();
}

/* ---------- Supervisión: fichajes que no coinciden ---------- */

function distanciaTexto(m) { return m >= 1000 ? String(Math.round(m / 100) / 10).replace('.', ',') + ' km' : Math.round(m) + ' m'; }
function marcasHtml() {
  if (!S.marcas || !S.marcas.length) return '';
  const filas = S.marcas.map(m => {
    const que = [];
    if (m.geo === 'lejos') que.push('a ' + distanciaTexto(m.dist) + ' de la sede');
    if (m.tel === 'otro') que.push('desde un teléfono que no es el suyo');
    if (m.tel === 'compartido') que.push('desde el teléfono de ' + nombreCompleto(colab(S, m.con)));
    const confirmar = S.ui.anular === m.id;
    return '<li class="renglon">' + chip('revision') + '<div><p class="nombre">' + esc(nombreCompleto(colab(S, m.c))) + '</p><p class="sub">' + cap(m.tipo) + ' del ' + fechaLarga(m.f) + ' a las ' + hm(m.m) + ' en ' + esc(sedeNombre(S, m.sede)) + ': ' + esc(que.join(' y ')) + '.</p></div>' +
      '<div class="renglon-accion">' + (confirmar
        ? '<button class="btn chico primario" type="button" data-a="marca-anular-si" data-id="' + m.id + '" id="ma-si-' + m.id + '">Sí, anular</button><button class="btn chico" type="button" data-a="marca-anular-no" id="ma-no-' + m.id + '">No</button>'
        : '<button class="btn chico" type="button" data-a="marca-visto" data-id="' + m.id + '" id="ma-ok-' + m.id + '">Dar por bueno</button><button class="btn chico" type="button" data-a="marca-anular" data-id="' + m.id + '" id="ma-an-' + m.id + '">Anular fichaje</button>') +
      '</div></li>';
  }).join('');
  return '<section class="seccion"><h2>Fichajes para revisar</h2><p class="bajada">Marcas hechas lejos de la sede o desde un teléfono que no es el de la persona. Si anulás una, esa entrada o salida se borra y el turno vuelve a esperarla.</p><ul class="panel">' + filas + '</ul></section>';
}
/* Lo que le falta a una marca, para la tabla del equipo de hoy. */
function respaldoCorto(u) { return !u ? '' : u.g === 'lejos' ? ', lejos de la sede' : u.g === 'sin_dato' ? ', sin ubicación' : ''; }
/* Lo que respalda una marca, para el detalle del tablero. */
function evidenciaTexto(u) {
  if (!u) return '';
  const p = [];
  if (u.g === 'ok') p.push('ubicación a ' + distanciaTexto(u.d) + ' de la sede');
  else if (u.g === 'lejos') p.push('ubicación a ' + distanciaTexto(u.d) + ' de la sede, fuera del radio');
  else if (u.g === 'imprecisa') p.push('ubicación poco precisa');
  else if (u.g === 'sin_dato') p.push('sin ubicación');
  if (u.t === 'otro') p.push('otro teléfono');
  if (u.t === 'compartido') p.push('teléfono de otra persona');
  return p.length ? ', ' + p.join(', ') : '';
}

/* ---------- Administración: personas y sedes ---------- */

function primerosPasosHtml() {
  const conPantalla = S.sedes.filter(s => s.activa !== false && s.verificacion === 'pantalla');
  const hechas = [S.sedes.length > 0, S.claveInicial && S.colabs.length > 1, S.asigs.length > 0, S.sedes.length > 0 && conPantalla.every(s => (s.pantallas || []).length > 0)];
  if (hechas.every(Boolean)) return '';
  const pasos = [
    ['Cargá las sedes', 'Con su ubicación, para comparar cada fichaje con el lugar.', 'sedes'],
    ['Definí la clave inicial y dá de alta a las personas', 'Cada una ingresa con su DNI.', 'personas'],
    ['Cargá las asignaciones', 'Quién trabaja en qué sede, qué días y en qué horario.', 'personal'],
    [conPantalla.length || !S.sedes.length ? 'Vinculá la pantalla de cada sede' : 'Pantallas de sede', conPantalla.length || !S.sedes.length ? 'La tablet o computadora que muestra el QR para fichar.' : 'Ninguna sede usa pantalla: no hace falta vincular nada.', 'sedes']
  ];
  return '<section class="seccion"><h2>Para empezar</h2><ol class="panel pasos">' + pasos.map((p, i) =>
    '<li class="renglon"><span class="pill' + (hechas[i] ? ' est-resuelta' : '') + '">' + (hechas[i] ? 'Listo' : 'Paso ' + (i + 1)) + '</span><div><p class="nombre">' + p[0] + '</p><p class="sub">' + p[1] + '</p></div>' +
    '<div class="renglon-accion"><button class="btn chico" type="button" data-a="admin" data-tab="' + p[2] + '" id="paso-' + (i + 1) + '">Ir</button></div></li>').join('') + '</ol></section>';
}
function adminPersonas() {
  const rolOp = sel => Object.keys(ROLES).map(k => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + ROLES[k] + '</option>').join('');
  const clave = S.claveInicial && !S.ui.cambiarInicial
    ? '<div class="linea-flex"><p>La clave inicial está definida. Es la que usa cada persona nueva la primera vez; ahí mismo el sistema le pide elegir la suya.</p><button class="btn chico empuja" type="button" data-a="clave-inicial-cambiar" id="btn-clave-inicial-cambiar">Cambiar la clave inicial</button></div>'
    : '<form class="form-alta sin-borde" data-form="clave-inicial" novalidate>' +
        '<label class="campo" for="ci-clave">Clave inicial para las altas<input type="text" id="ci-clave" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="40"></label>' +
        '<button class="btn primario" type="submit" id="btn-clave-inicial">Guardar la clave inicial</button>' +
        '<p class="ayuda">Entre 6 y 40 caracteres. La conoce todo el equipo: por eso cada persona tiene que cambiarla en su primer ingreso, y acá ves quién todavía no lo hizo.</p>' +
        '<p class="error" role="alert">' + esc(S.ui.errores.claveInicial || '') + '</p></form>';
  const filas = S.colabs.map(c => {
    const yo = c.id === S.yo.id, ed = S.ui.editar === c.id;
    const acceso = c.activa === false ? '<span class="pill">De baja</span>'
      : c.acceso === 'pendiente' ? '<span class="pill crit-media">Sin primer ingreso</span>'
      : '<span class="pill est-resuelta">Activa</span>' + (c.uso ? '<span class="sub">Usó la plataforma el ' + fechaMedia(c.uso) + '</span>' : '');
    const tel = (c.tel ? esc(c.tel.nombre || 'Teléfono registrado') + '<span class="sub">desde el ' + fechaMedia(c.tel.desde) + '</span>' : 'Sin registrar') +
      (c.telOtros ? '<span class="sub">Fichó desde otro teléfono</span><button class="btn chico" type="button" data-a="persona-telefono" data-id="' + c.id + '" data-que="aceptar" id="pe-acep-' + c.id + '">Aceptar el nuevo</button>' : '');
    const datos = ed
      ? '<td><span class="par"><input type="text" id="pe-nombre-' + c.id + '" value="' + esc(c.nombre) + '" maxlength="30" aria-label="Nombre"><input type="text" id="pe-apellido-' + c.id + '" value="' + esc(c.apellido) + '" maxlength="40" aria-label="Apellido"></span></td>' +
        '<td><input type="text" id="pe-dni-' + c.id + '" value="' + esc(c.dni) + '" inputmode="numeric" maxlength="12" aria-label="DNI"></td>' +
        '<td><select id="pe-rol-' + c.id + '" aria-label="Rol">' + rolOp(c.rol) + '</select></td>'
      : '<td><span class="nombre">' + esc(nombreCompleto(c)) + '</span>' + (yo ? '<span class="sub">Sos vos</span>' : '') + '</td><td>' + esc(c.dni) + '</td><td>' + ROLES[c.rol] + '</td>';
    const acciones = ed
      ? '<button class="btn chico primario" type="button" data-a="persona-guardar" data-id="' + c.id + '" id="pe-g-' + c.id + '">Guardar</button><button class="btn chico" type="button" data-a="persona-editar" data-id="" id="pe-c-' + c.id + '">Cancelar</button>'
      : '<button class="btn chico" type="button" data-a="persona-editar" data-id="' + c.id + '" id="pe-e-' + c.id + '">Editar</button>' +
        (yo ? '' : '<button class="btn chico" type="button" data-a="persona-restablecer" data-id="' + c.id + '" id="pe-r-' + c.id + '">Restablecer clave</button>') +
        (c.tel || c.telOtros ? '<button class="btn chico" type="button" data-a="persona-telefono" data-id="' + c.id + '" data-que="liberar" id="pe-t-' + c.id + '">Liberar teléfono</button>' : '') +
        (yo ? '' : '<button class="btn chico" type="button" data-a="persona-baja" data-id="' + c.id + '" id="pe-b-' + c.id + '">' + (c.activa === false ? 'Reactivar' : 'Dar de baja') + '</button>');
    return '<tr' + (c.activa === false ? ' class="baja"' : '') + '>' + datos + '<td>' + acceso + '</td><td>' + tel + '</td><td class="num"><span class="botones">' + acciones + '</span></td></tr>';
  }).join('');
  const alta = '<form class="form-alta" data-form="persona-alta" novalidate>' +
    '<label class="campo" for="pa-dni">DNI<input type="text" id="pa-dni" inputmode="numeric" maxlength="12" placeholder="Solo números" data-draft="paDni" value="' + esc(S.ui.drafts.paDni || '') + '"></label>' +
    '<label class="campo" for="pa-nombre">Nombre<input type="text" id="pa-nombre" maxlength="30" data-draft="paNombre" value="' + esc(S.ui.drafts.paNombre || '') + '"></label>' +
    '<label class="campo" for="pa-apellido">Apellido<input type="text" id="pa-apellido" maxlength="40" data-draft="paApellido" value="' + esc(S.ui.drafts.paApellido || '') + '"></label>' +
    '<label class="campo" for="pa-rol">Rol<select id="pa-rol" data-draft="paRol">' + rolOp(S.ui.drafts.paRol || 'colaborador') + '</select></label>' +
    '<button class="btn primario" type="submit" id="btn-persona-alta">Dar de alta</button>' +
    '<p class="error" role="alert">' + esc(S.ui.errores.persona || '') + '</p></form>';
  return '<section class="seccion"><h2>Clave inicial</h2><div class="panel relleno">' + clave + '</div></section>' +
    '<section class="seccion"><h2>Personas</h2><p class="bajada">Cada persona ingresa con su DNI. Colaborador ficha y carga novedades; Supervisión además resuelve el día a día del equipo; Administración configura todo. Quien se va no se borra: se da de baja y su historia queda.</p>' +
    '<div class="panel"><div class="tabla-wrap"><table class="tabla-personas"><thead><tr><th>Persona</th><th>DNI</th><th>Rol</th><th>Acceso</th><th>Teléfono para fichar</th><th class="num">Acciones</th></tr></thead><tbody>' + filas + '</tbody></table></div>' + alta + '</div></section>';
}
/* Acepta "-32.8895, -68.8458" o un enlace de Google Maps. */
function leerUbicacion(texto) {
  const t = String(texto || '').trim();
  if (!t) return { lat: '', lon: '' };
  const m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t) ||
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i.exec(t) || /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(t);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return null;
  return { lat: String(lat), lon: String(lon) };
}
function verificacionOp(sel) { return Object.keys(VERIFICACION).map(k => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + VERIFICACION[k] + '</option>').join(''); }
function camposSede(p, s) {
  const d = S.ui.drafts, ubi = d[p + 'Ubi'] != null ? d[p + 'Ubi'] : (s && s.lat != null ? s.lat + ', ' + s.lon : '');
  const v = (k, def) => esc(d[p + k] != null ? d[p + k] : def);
  return '<label class="campo c-nombre" for="' + p + '-nombre">Nombre<input type="text" id="' + p + '-nombre" maxlength="60" data-draft="' + p + 'Nombre" value="' + v('Nombre', s ? s.nombre : '') + '"></label>' +
    '<label class="campo c-dir" for="' + p + '-dir">Dirección<input type="text" id="' + p + '-dir" maxlength="160" data-draft="' + p + 'Dir" value="' + v('Dir', s ? s.direccion : '') + '"></label>' +
    '<label class="campo c-ubi" for="' + p + '-ubi">Ubicación<input type="text" id="' + p + '-ubi" data-draft="' + p + 'Ubi" placeholder="-32.8895, -68.8458 o un enlace de Google Maps" value="' + esc(ubi) + '"></label>' +
    '<label class="campo c-radio" for="' + p + '-radio">Radio, en metros<input type="number" id="' + p + '-radio" min="30" max="2000" step="10" data-draft="' + p + 'Radio" value="' + v('Radio', s ? s.radio : 150) + '"></label>' +
    '<label class="campo c-ver" for="' + p + '-ver">Cómo se verifica el fichaje<select id="' + p + '-ver" data-draft="' + p + 'Ver">' + verificacionOp(d[p + 'Ver'] || (s ? s.verificacion : 'pantalla')) + '</select></label>';
}
function adminSedes() {
  const fichas = S.sedes.map(s => {
    const p = 'se' + s.id, vinc = S.ui.vinculo && S.ui.vinculo.sede === s.id && S.ui.vinculo.hasta > Date.now() ? S.ui.vinculo : null;
    const pantallas = (s.pantallas || []).map(t => '<li class="linea-flex"><span><strong>' + esc(t.nombre || 'Pantalla sin nombre') + '</strong> ' +
      (t.hace == null ? 'todavía no se conectó' : t.hace <= 3 ? '<span class="pill est-resuelta">En línea</span>' : '<span class="pill crit-media">Sin señal hace ' + dur(t.hace) + '</span>') + '</span>' +
      '<button class="btn chico empuja" type="button" data-a="pantalla-desvincular" data-id="' + t.id + '" id="pt-q-' + t.id + '">Desvincular</button></li>').join('');
    let extra = '';
    if (s.verificacion === 'pantalla') {
      extra = '<h3 class="subtitulo">Pantallas de esta sede</h3>' +
        (pantallas ? '<ul class="lista-simple">' + pantallas + '</ul>' : '<p class="nota obs">Todavía no hay una pantalla vinculada: sin ella nadie puede fichar por su cuenta en esta sede.</p>') +
        (vinc ? '<p class="nota info">Código para vincular: <strong class="codigo-grande">' + vinc.codigo.slice(0, 4) + ' ' + vinc.codigo.slice(4) + '</strong>. Vale 15 minutos y sirve una sola vez. En la tablet, la computadora o el teléfono que queda en la sede, abrí <strong>' + esc(location.host + location.pathname) + '#pantalla</strong> y escribilo.</p>' : '') +
        '<div class="botones"><button class="btn chico" type="button" data-a="sede-vincular" data-id="' + s.id + '" id="se-v-' + s.id + '">Vincular una pantalla</button>' +
        '<button class="btn chico" type="button" data-a="sede-codigo" data-id="' + s.id + '" id="se-k-' + s.id + '">Cambiar los códigos</button></div>';
    } else if (s.verificacion === 'impreso') {
      extra = '<h3 class="subtitulo">QR impreso</h3><p class="ayuda">Es siempre el mismo: sirve donde no se puede dejar una pantalla, pero una foto del cartel también funciona. Por eso el sistema mira además la ubicación y el teléfono.</p>' +
        (S.ui.qrSede === s.id ? '<div class="imprimible" id="qr-sede" data-sede="' + s.id + '" data-codigo="' + esc(s.fijo) + '"><p class="imp-titulo">' + esc(s.nombre) + '</p><div class="qr-real" id="qr-sede-svg"></div><p class="imp-ayuda">Leé este código con la cámara al llegar y al irte.</p></div>' : '') +
        '<div class="botones"><button class="btn chico" type="button" data-a="sede-qr" data-id="' + s.id + '" id="se-q-' + s.id + '">' + (S.ui.qrSede === s.id ? 'Ocultar el QR' : 'Ver el QR') + '</button>' +
        (S.ui.qrSede === s.id ? '<button class="btn chico primario" type="button" data-a="imprimir" id="se-i-' + s.id + '">Imprimir</button>' : '') +
        '<button class="btn chico" type="button" data-a="sede-codigo" data-id="' + s.id + '" id="se-k-' + s.id + '">Cambiar el QR</button></div>';
    } else {
      extra = '<p class="ayuda">Sin código: el fichaje se acepta solo si el teléfono está dentro del radio de la sede. Es la verificación más débil; usala donde no se pueda dejar ni una pantalla ni un cartel.</p>';
    }
    return '<li class="sede-ficha' + (s.activa === false ? ' baja' : '') + '"><form class="form-alta form-sede sin-borde" data-form="sede" data-id="' + s.id + '" novalidate>' + camposSede(p, s) +
      '<div class="botones ancho-total"><button class="btn chico primario" type="submit" id="se-g-' + s.id + '">Guardar</button>' +
      '<button class="btn chico" type="button" data-a="sede-aqui" data-p="' + p + '" id="se-a-' + s.id + '">Usar mi ubicación actual</button>' +
      (s.lat != null ? '<a class="btn chico" href="https://www.google.com/maps?q=' + s.lat + ',' + s.lon + '" target="_blank" rel="noopener">Ver en el mapa</a>' : '') +
      '<button class="btn chico" type="button" data-a="sede-activa" data-id="' + s.id + '" id="se-b-' + s.id + '">' + (s.activa === false ? 'Reactivar la sede' : 'Dar de baja la sede') + '</button></div>' +
      (s.lat == null ? '<p class="nota obs ancho-total">Sin ubicación cargada: los fichajes de esta sede no se comparan con ningún lugar.</p>' : '') +
      '<p class="error" role="alert">' + esc(S.ui.errores[p] || '') + '</p></form><div class="sede-extra">' + extra + '</div></li>';
  }).join('');
  return '<section class="seccion"><h2>Sedes</h2><p class="bajada">Cada sede tiene su ubicación y su forma de verificar el fichaje. La ubicación se copia de Google Maps (clic derecho sobre el lugar) o se toma parado en la sede con el botón Usar mi ubicación actual. El radio es la distancia que se acepta alrededor de ese punto: adentro de los edificios el GPS suele errar varias decenas de metros.</p>' +
    (fichas ? '<ul class="panel sedes-lista">' + fichas + '</ul>' : '<p class="panel vacio">Todavía no hay sedes cargadas.</p>') + '</section>' +
    '<section class="seccion"><h2>Agregar una sede</h2><div class="panel"><form class="form-alta form-sede sin-borde" data-form="sede" data-id="" novalidate>' + camposSede('sn', null) +
    '<div class="botones ancho-total"><button class="btn primario" type="submit" id="btn-sede-alta">Agregar sede</button>' +
    '<button class="btn" type="button" data-a="sede-aqui" data-p="sn" id="btn-sede-aqui">Usar mi ubicación actual</button></div>' +
    '<p class="error" role="alert">' + esc(S.ui.errores.sn || '') + '</p></form></div></section>';
}
function datosSede(p, id) {
  const val = k => { const el = document.getElementById(p + '-' + k); return el ? el.value : ''; };
  const u = leerUbicacion(val('ubi'));
  if (!val('nombre').trim()) return { error: 'Escribí el nombre de la sede.' };
  if (!u) return { error: 'No pudimos leer la ubicación. Pegá las dos coordenadas, por ejemplo -32.8895, -68.8458, o el enlace de Google Maps.' };
  const actual = id ? S.sedes.find(s => s.id === id) : null;
  return { p: { id: id || null, nombre: val('nombre'), direccion: val('dir'), lat: u.lat, lon: u.lon, radio: val('radio'), verificacion: val('ver'), activa: actual ? actual.activa !== false : true } };
}
function limpiarBorradores(prefijo) { for (const k of Object.keys(S.ui.drafts)) if (k.indexOf(prefijo) === 0) delete S.ui.drafts[k]; }

/* ---------- QR ---------- */

let qrListo = null;
function cargarQR() {
  if (!qrListo) {
    qrListo = new Promise((res, rej) => {
      if (typeof qrcode === 'function') { res(); return; }
      const s = document.createElement('script');
      s.src = CONFIG.qr;
      s.onload = () => res();
      s.onerror = () => { qrListo = null; rej(new Error('qr')); };
      document.head.appendChild(s);
    });
  }
  return qrListo;
}
function qrSvgDe(texto) {
  const q = qrcode(0, 'M');
  q.addData(texto);
  q.make();
  const n = q.getModuleCount(), borde = 4;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += 'M' + (x + borde) + ' ' + (y + borde) + 'h1v1h-1z';
  const lado = n + borde * 2;
  return '<svg viewBox="0 0 ' + lado + ' ' + lado + '" role="img" aria-label="Código QR" shape-rendering="crispEdges"><rect width="' + lado + '" height="' + lado + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}
function enlaceQR(sede, codigo) { return location.origin + location.pathname + '#q=' + sede + '.' + codigo; }
function dibujarQrDeSede() {
  const caja = document.getElementById('qr-sede'), destino = document.getElementById('qr-sede-svg');
  if (!caja || !destino) return;
  cargarQR().then(() => { destino.innerHTML = qrSvgDe(enlaceQR(caja.dataset.sede, caja.dataset.codigo)); }).catch(() => { destino.textContent = 'No se pudo armar el QR. Revisá la conexión.'; });
}

/* ---------- Eventos de la versión real ---------- */

const SOLO_DEMO = ['hora', 'mas', 'dia', 'reiniciar'];
/* Devuelve true si se hizo cargo del clic. */
function clicReal(b) {
  const a = b.dataset.a, id = b.dataset.id;
  if (SOLO_DEMO.indexOf(a) >= 0) return true;
  if (fase === 'pantalla') {
    if (a === 'pantalla-olvidar' || a === 'pantalla-olvidar-no') { pan.confirmar = a === 'pantalla-olvidar'; dibujarPantalla(); }
    if (a === 'pantalla-olvidar-si') { olvidarPantalla(); location.reload(); }
    return true;
  }
  if (a === 'reintentar') { arrancarReal(); return true; }
  if (a === 'salir') { conServidor(salir); return true; }
  if (a === 'cancelar-clave') { fase = 'app'; R.claveVoluntaria = false; R.error = ''; render(); return true; }
  if (!S) return true;
  if (a === 'cambiar-clave') { fase = 'clave'; R.claveVoluntaria = true; R.error = ''; render(); return true; }
  if (a === 'entrada') { abrirFichaje('entrada'); return true; }
  if (a === 'fichaje-cancelar') { cerrarCamara(); S.ui.fichaje = null; render(); return true; }
  if (a === 'fichaje-reintentar') { buscarUbicacion(); enviarFichaje('', 'ubicacion'); return true; }
  if (a === 'fichaje-manual') {
    const k = S.ui.fichaje;
    if (k) { k.manual = !k.manual; k.error = ''; }
    render();
    return true;
  }
  if (a === 'fichaje-ya-me-fui') {
    const k = S.ui.fichaje;
    if (k) { k.yaMeFui = !k.yaMeFui; k.error = ''; }
    render();
    return true;
  }
  if (a === 'asistido') {
    conServidor(async () => { const r = await llamar('sup_asistido', { p_jornada: Number(b.dataset.j) }); aviso(r.ok ? cap(S.bitacora[0].texto) + '.' : r.error); });
    return true;
  }
  if (a === 'deshacer') { conServidor(async () => { const r = await llamar('sup_deshacer', { p_id: Number(b.dataset.b) }); aviso(r.ok ? 'Resolución deshecha.' : r.error); }); return true; }
  if (a === 'quitar-aviso') { conServidor(async () => { const r = await llamar('sup_aviso', { p_id: Number(id) }); if (!r.ok && r.error) aviso(r.error); }); return true; }
  if (a === 'marca-visto') { conServidor(async () => { const r = await llamar('sup_marca', { p_id: Number(id), p_accion: 'visto' }); if (!r.ok && r.error) aviso(r.error); }); return true; }
  if (a === 'marca-anular') { S.ui.anular = id; render(); return true; }
  if (a === 'marca-anular-no') { S.ui.anular = null; render(); return true; }
  if (a === 'marca-anular-si') {
    conServidor(async () => { const r = await llamar('sup_marca', { p_id: Number(id), p_accion: 'anular' }); S.ui.anular = null; aviso(r.ok ? 'Fichaje anulado. El turno vuelve a esperar esa marca.' : r.error); });
    return true;
  }
  if (a === 'quitar-franja') { conServidor(async () => { const r = await aplicarAdmin(X => { quitarFranja(X, id); return ''; }); aviso(r.error || 'Franja contratada quitada.'); }); return true; }
  if (a === 'quitar-licencia') { conServidor(async () => { const r = await aplicarAdmin(X => { quitarLicencia(X, id); return ''; }); aviso(r.error || 'Ausencia quitada.'); }); return true; }
  if (a === 'quitar-feriado') { conServidor(async () => { const r = await aplicarAdmin(X => { quitarFeriado(X, b.dataset.f); return ''; }); aviso(r.error || 'Fecha quitada del calendario.'); }); return true; }
  if (a === 'sugerido') {
    conServidor(async () => { const r = await aplicarAdmin(X => ponerParam(X, 'recFeriado', SUGERIDO.recFeriado) || ponerParam(X, 'recNoLab', SUGERIDO.recNoLab)); aviso(r.error || 'Tratamiento sugerido aplicado.'); });
    return true;
  }
  if (a === 'clave-inicial-cambiar') { S.ui.cambiarInicial = true; render(); return true; }
  if (a === 'persona-editar') { S.ui.editar = id || null; render(); return true; }
  if (a === 'persona-guardar') {
    const c = colab(S, id), val = k => { const el = document.getElementById('pe-' + k + '-' + id); return el ? el.value : ''; };
    conServidor(async () => {
      const r = await llamar('admin_persona', { p: { id: id, dni: val('dni'), nombre: val('nombre'), apellido: val('apellido'), rol: val('rol'), activa: c ? c.activa !== false : true } });
      if (r.ok) { S.ui.editar = null; aviso('Datos guardados.'); } else aviso(r.error);
    });
    return true;
  }
  if (a === 'persona-baja') {
    const c = colab(S, id);
    conServidor(async () => {
      const r = await llamar('admin_persona', { p: { id: id, dni: c.dni, nombre: c.nombre, apellido: c.apellido, rol: c.rol, activa: c.activa === false } });
      aviso(r.ok ? (c.activa === false ? 'Persona reactivada.' : 'Persona dada de baja: ya no puede ingresar.') : r.error);
    });
    return true;
  }
  if (a === 'persona-restablecer') {
    conServidor(async () => { const r = await llamar('admin_restablecer', { p_persona: Number(id) }); aviso(r.ok ? 'Clave restablecida: vuelve a ingresar con la clave inicial y elige una nueva.' : r.error); });
    return true;
  }
  if (a === 'persona-telefono') {
    conServidor(async () => {
      const r = await llamar('admin_telefono', { p_persona: Number(id), p_accion: b.dataset.que });
      aviso(r.ok ? (b.dataset.que === 'aceptar' ? 'Teléfono nuevo aceptado.' : 'Teléfono liberado: el próximo con el que fiche queda registrado.') : r.error);
    });
    return true;
  }
  if (a === 'sede-vincular') {
    conServidor(async () => {
      const r = await llamar('admin_vincular', { p_sede: Number(id) });
      if (r.ok) S.ui.vinculo = { sede: id, codigo: r.codigo, hasta: Date.now() + 15 * 60000 }; else aviso(r.error);
    });
    return true;
  }
  if (a === 'sede-codigo') {
    conServidor(async () => { const r = await llamar('admin_sede_codigo', { p_sede: Number(id) }); aviso(r.ok ? 'Códigos cambiados. Los anteriores ya no sirven.' : r.error); });
    return true;
  }
  if (a === 'sede-activa') {
    const s = S.sedes.find(x => x.id === id);
    if (s.activa !== false && S.asigs.some(x => x.sede === id && x.activa)) { aviso('Esta sede tiene asignaciones activas. Desactivalas en Asignaciones antes de darla de baja.'); return true; }
    conServidor(async () => {
      const r = await llamar('admin_sede', { p: { id: id, nombre: s.nombre, direccion: s.direccion, lat: s.lat == null ? '' : String(s.lat), lon: s.lon == null ? '' : String(s.lon), radio: String(s.radio), verificacion: s.verificacion, activa: s.activa === false } });
      aviso(r.ok ? (s.activa === false ? 'Sede reactivada.' : 'Sede dada de baja.') : r.error);
    });
    return true;
  }
  if (a === 'pantalla-desvincular') { conServidor(async () => { const r = await llamar('admin_pantalla', { p_id: Number(id) }); aviso(r.ok ? 'Pantalla desvinculada.' : r.error); }); return true; }
  if (a === 'sede-qr') { S.ui.qrSede = S.ui.qrSede === id ? null : id; render(); return true; }
  if (a === 'imprimir') { window.print(); return true; }
  if (a === 'sede-aqui') {
    const p = b.dataset.p;
    aviso('Buscando tu ubicación…');
    buscarUbicacion().then(pos => {
      if (!S) return;
      if (!pos) { aviso('No pudimos leer tu ubicación. Revisá que el navegador tenga permiso.'); return; }
      S.ui.drafts[p + 'Ubi'] = pos.lat.toFixed(6) + ', ' + pos.lon.toFixed(6);
      aviso('Ubicación tomada, con ' + Math.round(pos.precision) + ' m de precisión. Guardá para confirmarla.');
      render();
    });
    return true;
  }
  return false;
}
/* Devuelve true si se hizo cargo del cambio. */
function cambioReal(t) {
  if (!S) return true;
  const ds = t.dataset, valor = t.type === 'checkbox' ? t.checked : t.value;
  let accion = null, exceso = '';
  if (ds.asig) { accion = X => editarAsig(X, ds.asig, ds.campo, valor, ds.dia); exceso = 'La asignación supera el tope diario. Supervisión ya tiene el aviso.'; }
  else if (ds.franja) accion = X => editarFranja(X, ds.franja, ds.campo, valor, ds.dia);
  else if (ds.feriado) accion = X => editarFeriado(X, ds.feriado, t.value);
  else if (ds.param) { accion = X => ponerParam(X, ds.param, t.value); exceso = 'Tope actualizado. Supervisión ya tiene el aviso.'; }
  if (accion) {
    conServidor(async () => {
      const r = await aplicarAdmin(accion);
      if (r.error) aviso(r.error);
      else if (r.avisos && exceso) aviso(exceso);
      else if (ds.asig && ds.campo === 'modalidad') aviso('Modalidad cambiada. Revisá que el valor sea el que corresponde.');
    });
    return true;
  }
  if (ds.nov) { conServidor(async () => { const r = await llamar('sup_novedad', { p_id: Number(ds.nov), p_estado: t.value }); if (!r.ok && r.error) aviso(r.error); }); return true; }
  return false;
}
/* Devuelve true si se hizo cargo del formulario. */
function envioReal(f) {
  const tipo = f.dataset.form;
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  if (tipo === 'ingreso') { const d = val('in-dni'), c = val('in-clave'); conServidor(() => ingresar(d, c)); return true; }
  if (tipo === 'instalar') {
    const v = { codigo: val('ins-codigo'), dni: val('ins-dni'), nombre: val('ins-nombre'), apellido: val('ins-apellido'), clave: val('ins-clave'), clave2: val('ins-clave2') };
    conServidor(() => instalar(v));
    return true;
  }
  if (tipo === 'clave') { const n = val('cl-nueva'), r2 = val('cl-repetir'); conServidor(() => cambiarClave(n, r2)); return true; }
  if (tipo === 'pantalla-vincular') { const c = val('pv-codigo'), n = val('pv-nombre'); vincularPantalla(c, n); return true; }
  if (!S) return true;
  const d = S.ui.drafts, c = colabSel(S);
  const limpiar = claves => claves.forEach(k => { delete d[k]; });
  if (tipo === 'cierre') {
    const j = c ? tramoActual(S, c.id) : null, k = S.ui.cierre;
    if (!j || j.entrada == null || !k) { render(); return true; }
    const datos = datosCierre(j, k, d, val);
    if (datos) abrirFichaje('salida', datos); else render();
    return true;
  }
  if (tipo === 'codigo') {
    const v = val('fichaje-codigo').replace(/\D/g, ''), k = S.ui.fichaje;
    if (!k) return true;
    if (v.length !== 6) { k.error = 'Escribí los 6 números del código.'; render(); return true; }
    enviarFichaje(v, 'codigo');
    return true;
  }
  if (tipo === 'ya-me-fui') {
    const k = S.ui.fichaje, j = k ? porId(S, k.j) : null;
    if (!j) return true;
    const h = aRel(j, aMin(val('ymf-hora')));
    if (h == null) { k.error = 'Indicá a qué hora terminaste.'; render(); return true; }
    if (h <= j.entrada || h > relDe(S, j)) { k.error = 'La hora tiene que estar entre tu entrada de las ' + hm(j.entrada) + ' y ahora.'; render(); return true; }
    conServidor(async () => {
      const r = await llamar('salida_declarada', { p_jornada: Number(j.id), p_hora: h });
      if (r.ok) { cerrarCamara(); S.ui.fichaje = null; S.ui.cierre = null; S.ui.recien = j.id; S.ui.arriba = true; aviso('Enviado. Tu supervisor va a validar la hora de salida.'); }
      else k.error = r.error;
    });
    return true;
  }
  if (tipo === 'olvido') {
    const j = porId(S, f.dataset.j), h = j ? aRel(j, aMin(val('olvido-hora'))) : null;
    const err = declararOlvido(clonar(S), f.dataset.j, aMin(val('olvido-hora')));
    S.ui.errores.olvido = err;
    if (err) { render(); return true; }
    conServidor(async () => { const r = await llamar('declarar_olvido', { p_jornada: Number(f.dataset.j), p_hora: h }); if (r.ok) aviso('Enviado. Tu supervisor lo va a revisar.'); else S.ui.errores.olvido = r.error; });
    return true;
  }
  if (tipo === 'descargo') {
    const err = enviarDescargo(clonar(S), f.dataset.j, d.descargo);
    S.ui.errores.descargo = err;
    if (err) { render(); return true; }
    conServidor(async () => {
      const r = await llamar('descargo', { p_jornada: Number(f.dataset.j), p_texto: d.descargo });
      if (r.ok) { S.ui.descargo = null; d.descargo = ''; aviso('Enviado a tu supervisor. Gracias por avisar.'); } else S.ui.errores.descargo = r.error;
    });
    return true;
  }
  if (tipo === 'novedad') {
    const p = { tipo: d.novTipo || 'insumos', crit: d.novCrit || 'media', texto: d.novTexto, sede: val('nov-sede') || (c ? sedeActual(S, c.id) : '') };
    const err = agregarNovedad(clonar(S), S.yo.id, p);
    S.ui.errores.nov = err;
    if (err) { render(); return true; }
    conServidor(async () => { const r = await llamar('novedad', { p: p }); if (r.ok) { d.novTexto = ''; aviso('Novedad enviada. Gracias por avisar.'); } else S.ui.errores.nov = r.error; });
    return true;
  }
  if (tipo === 'resolver') {
    const id = f.dataset.j, marcado = f.querySelector('input[type="radio"]:checked'), j = porId(S, id);
    const que = marcado ? marcado.value : '', hora = aMin(val('val-' + id));
    const err = resolver(clonar(S), id, que, hora);
    if (err) { S.ui.casos[id] = { que: que, hora: j ? aRel(j, hora) : null, error: err }; render(); return true; }
    conServidor(async () => {
      const r = await llamar('sup_resolver', { p_jornada: Number(id), p_tipo: que, p_hora: que === 'ok' ? null : aRel(j, hora) });
      if (r.ok) { delete S.ui.casos[id]; aviso('Resuelto. ' + cap(S.bitacora[0].texto) + '.'); } else S.ui.casos[id] = { que: que, hora: aRel(j, hora), error: r.error };
    });
    return true;
  }
  if (tipo === 'justificar') {
    const id = f.dataset.j, motivo = val('mot-' + id);
    conServidor(async () => { const r = await llamar('sup_justificar', { p_jornada: Number(id), p_motivo: motivo }); aviso(r.ok ? cap(S.bitacora[0].texto) + '.' : r.error); });
    return true;
  }
  if (tipo === 'asig') {
    const p = { colab: val('as-colab'), nombre: '', sede: val('as-sede'), dias: borradorDias('asigDias', [1, 2, 3, 4, 5]), ti: val('as-ti'), tf: val('as-tf'), modalidad: val('as-mod'), valor: val('as-valor'), desde: val('as-desde'), hasta: val('as-hasta') };
    conServidor(async () => {
      const r = await aplicarAdmin(X => agregarAsig(X, p));
      S.ui.errores.asig = r.error;
      if (!r.error) { limpiar(['asigColab', 'asigNombre', 'asigSede', 'asigDias', 'asigTi', 'asigTf', 'asigMod', 'asigValor', 'asigDesde', 'asigHasta']); aviso('Asignación agregada.' + (r.avisos ? ' Supera el tope diario: supervisión ya tiene el aviso.' : '')); }
    });
    return true;
  }
  if (tipo === 'franja') {
    const p = { sede: S.ui.sedeGrilla || (S.sedes[0] || {}).id, dias: borradorDias('frDias', SEMANA), ti: val('nf-ti'), tf: val('nf-tf'), dot: val('nf-dot') };
    conServidor(async () => {
      const r = await aplicarAdmin(X => agregarFranja(X, p));
      S.ui.errores.franja = r.error;
      if (!r.error) { limpiar(['frDias', 'frTi', 'frTf', 'frDot']); aviso('Franja contratada agregada.'); }
    });
    return true;
  }
  if (tipo === 'licencia') {
    const p = { colab: val('li-colab'), tipo: val('li-tipo'), desde: val('li-desde'), hasta: val('li-hasta') };
    conServidor(async () => {
      const r = await aplicarAdmin(X => agregarLicencia(X, p));
      S.ui.errores.licencia = r.error;
      if (!r.error) { limpiar(['licColab', 'licTipo', 'licDesde', 'licHasta']); aviso('Ausencia cargada. La grilla ya muestra las franjas que quedan sin cubrir.'); }
    });
    return true;
  }
  if (tipo === 'feriado') {
    const p = { f: val('fe-f'), nombre: val('fe-nombre'), tipo: val('fe-tipo') };
    conServidor(async () => {
      const r = await aplicarAdmin(X => agregarFeriado(X, p));
      S.ui.errores.feriado = r.error;
      if (!r.error) { limpiar(['ferF', 'ferNombre', 'ferTipo']); aviso('Fecha agregada al calendario.'); }
    });
    return true;
  }
  if (tipo === 'clave-inicial') {
    const v = val('ci-clave');
    conServidor(async () => {
      const r = await llamar('admin_clave_inicial', { p_clave: v });
      S.ui.errores.claveInicial = r.ok ? '' : r.error;
      if (r.ok) { S.ui.cambiarInicial = false; aviso('Clave inicial guardada.'); }
    });
    return true;
  }
  if (tipo === 'persona-alta') {
    const p = { dni: val('pa-dni'), nombre: val('pa-nombre'), apellido: val('pa-apellido'), rol: val('pa-rol') };
    conServidor(async () => {
      const r = await llamar('admin_persona', { p: p });
      S.ui.errores.persona = r.ok ? '' : r.error;
      if (r.ok) { limpiar(['paDni', 'paNombre', 'paApellido', 'paRol']); aviso('Alta lista. Ingresa con su DNI y la clave inicial, y el sistema le pide elegir la suya.'); }
    });
    return true;
  }
  if (tipo === 'sede') {
    const id = f.dataset.id, p = id ? 'se' + id : 'sn', x = datosSede(p, id);
    if (x.error) { S.ui.errores[p] = x.error; render(); return true; }
    conServidor(async () => {
      const r = await llamar('admin_sede', { p: x.p });
      S.ui.errores[p] = r.ok ? '' : r.error;
      if (r.ok) { limpiarBorradores(p); aviso(id ? 'Sede guardada.' : 'Sede agregada.'); }
    });
    return true;
  }
  return false;
}

/* ---------- Pantalla de la sede ---------- */

async function totp(secreto, paso) {
  const llave = await crypto.subtle.importKey('raw', secreto, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(paso / 4294967296));
  msg.setUint32(4, paso >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', llave, msg.buffer));
  const o = h[h.length - 1] & 15;
  const n = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) >>> 0;
  return String(n % 1000000).padStart(6, '0');
}
function bytesDe(base64) { const t = atob(base64), b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return b; }
/* La pantalla guarda lo último que supo de su sede: si se reinicia sin conexión, sigue mostrando códigos que valen. */
function recordarPantalla() {
  try { localStorage.setItem(CLAVE_PANTALLA_DATOS, JSON.stringify({ sede: pan.sede, sedeId: pan.sedeId, modo: pan.modo, fijo: pan.fijo, secreto: pan.secretoTexto, desfase: pan.desfase })); } catch (e) { /* sin almacenamiento, necesita conexión al prender */ }
}
function olvidarPantalla() {
  try { localStorage.removeItem(CLAVE_PANTALLA); localStorage.removeItem(CLAVE_PANTALLA_DATOS); } catch (e) { /* nada que borrar */ }
}
async function sincronizarPantalla() {
  if (!pan.token) return;
  const r = await llamar('pantalla_estado', { p_token: pan.token }, true);
  if (r.ok) {
    Object.assign(pan, { sede: r.sede, sedeId: r.sedeId, modo: r.verificacion, fijo: r.fijo, secreto: bytesDe(r.secreto), desfase: r.ts - Date.now(), sinRed: false, sincronizada: Date.now() });
    if (pan.secretoTexto !== r.secreto) { pan.secretoTexto = r.secreto; pan.paso = -1; }
    recordarPantalla();
  } else if (r.red) pan.sinRed = true;
  else { olvidarPantalla(); pan = { token: null, paso: -1, desfase: 0, sinRed: false, error: r.error }; }
}
async function vincularPantalla(codigo, nombre) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (c.length !== 8) { pan.error = 'El código tiene 8 números.'; dibujarPantalla(); return; }
  const r = await llamar('pantalla_vincular', { p_codigo: c, p_nombre: nombre }, true);
  if (!r.ok) { pan.error = r.error; dibujarPantalla(); return; }
  try { localStorage.setItem(CLAVE_PANTALLA, r.token); } catch (e) { /* sin almacenamiento, la pantalla se pierde al recargar */ }
  pan = { token: r.token, paso: -1, desfase: 0, sinRed: false };
  await sincronizarPantalla();
  dibujarPantalla();
}
function dibujarPantalla() {
  const v = $('#vista');
  if (!pan.token) {
    v.innerHTML = '<div class="acceso"><form class="acceso-caja" data-form="pantalla-vincular" novalidate>' + marcaHtml() +
      '<h1>Pantalla de la sede</h1><p>Esta pantalla muestra el código para fichar. Vinculala con el código que da Administración, en la pestaña Sedes.</p>' +
      '<label class="campo" for="pv-codigo">Código de vinculación<input type="text" id="pv-codigo" class="codigo" inputmode="numeric" autocomplete="off" maxlength="9" placeholder="0000 0000"></label>' +
      '<label class="campo" for="pv-nombre">Nombre de esta pantalla<input type="text" id="pv-nombre" maxlength="60" placeholder="Recepción"></label>' +
      '<p class="error" role="alert">' + esc(pan.error || '') + '</p>' +
      '<button class="btn primario ancho" type="submit" id="btn-pantalla-vincular">Vincular</button></form></div>';
    return;
  }
  const nota = pan.sinRed ? '<p class="pan-nota">Sin conexión. Los códigos siguen valiendo.</p>' : '';
  let centro;
  if (!pan.secreto) centro = '<p class="pan-espera" role="status">' + (pan.sinRed ? 'Sin conexión. Esta pantalla necesita conectarse una vez para empezar.' : 'Conectando…') + '</p>';
  else if (pan.modo === 'ubicacion') centro = '<p class="pan-espera">En esta sede el fichaje se confirma con la ubicación del teléfono. No hace falta código.</p>';
  else {
    const codigo = pan.modo === 'impreso' ? pan.fijo : pan.codigo || '';
    centro = '<div class="pan-qr" id="pan-qr">' + (pan.svg || '') + '</div>' +
      (pan.modo === 'impreso' ? '' : '<p class="pan-codigo" id="pan-codigo" aria-label="Código para fichar">' + codigo.slice(0, 3) + ' ' + codigo.slice(3) + '</p><div class="pan-barra" aria-hidden="true"><span id="pan-resto"></span></div>');
  }
  v.innerHTML = '<div class="pan"><p class="pan-sede">' + esc(pan.sede || '') + '</p><p class="pan-que">Leé el código con la aplicación al llegar y al irte</p>' + centro + nota +
    '<p class="pan-pie"><span id="pan-hora"></span>' + (pan.confirmar
      ? '<span>¿Desvincular esta pantalla?</span><button class="enlace" type="button" data-a="pantalla-olvidar-si" id="btn-pantalla-olvidar-si">Sí, desvincular</button><button class="enlace" type="button" data-a="pantalla-olvidar-no" id="btn-pantalla-olvidar-no">No</button>'
      : '<button class="enlace" type="button" data-a="pantalla-olvidar" id="btn-pantalla-olvidar">Desvincular esta pantalla</button>') + '</p></div>';
  avanzarPantalla();
}
function avanzarPantalla() {
  const ahora = Date.now() + pan.desfase, resto = document.getElementById('pan-resto'), hora = document.getElementById('pan-hora');
  if (resto) resto.style.width = (100 - (ahora % 30000) / 300) + '%';
  if (hora) hora.textContent = new Date(ahora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Mendoza' });
}
async function latidoPantalla() {
  if (!pan.token || !pan.secreto || pan.modo === 'ubicacion') return;
  const paso = pan.modo === 'impreso' ? 0 : Math.floor((Date.now() + pan.desfase) / 30000);
  if (paso === pan.paso) { avanzarPantalla(); return; }
  pan.paso = paso;
  try {
    pan.codigo = pan.modo === 'impreso' ? pan.fijo : await totp(pan.secreto, paso);
    await cargarQR();
    pan.svg = qrSvgDe(enlaceQR(pan.sedeId, pan.codigo));
  } catch (e) { pan.svg = ''; }
  dibujarPantalla();
}
async function arrancarPantalla() {
  fase = 'pantalla';
  document.body.classList.add('modo-pantalla');
  try {
    pan.token = localStorage.getItem(CLAVE_PANTALLA);
    const d = pan.token ? JSON.parse(localStorage.getItem(CLAVE_PANTALLA_DATOS) || 'null') : null;
    if (d && d.secreto) Object.assign(pan, { sede: d.sede, sedeId: d.sedeId, modo: d.modo, fijo: d.fijo, secreto: bytesDe(d.secreto), secretoTexto: d.secreto, desfase: Number(d.desfase) || 0 });
  } catch (e) { pan.token = pan.token || null; }
  dibujarPantalla();
  await sincronizarPantalla();
  dibujarPantalla();
  setInterval(latidoPantalla, 500);
  setInterval(async () => { const antes = pan.token; await sincronizarPantalla(); if (antes && !pan.token) dibujarPantalla(); }, 60000);
  const despierta = () => { if (navigator.wakeLock && !document.hidden) navigator.wakeLock.request('screen').catch(() => { /* el equipo no lo permite: conviene desactivar el apagado de pantalla */ }); };
  despierta();
  document.addEventListener('visibilitychange', despierta);
}

/* ---------- Arranque ---------- */

function programarSondeo() { clearInterval(sondeo); sondeo = setInterval(latido, 30000); }
async function arrancarReal() {
  document.body.classList.add('real');
  if (location.hash.replace('#', '') === 'pantalla') { arrancarPantalla(); return; }
  tomarEnlaceQR();
  sesion = leerSesion();
  fase = 'cargando';
  render();
  if (sesion) {
    const r = await llamar('estado');
    if (r.ok && r.dato) adoptar(r.dato);
    else if (r.red) fase = 'sin-red';
    else if (fase === 'cargando') fase = 'ingreso';
  } else {
    const r = await llamar('instalacion', {}, true);
    fase = r.red ? 'sin-red' : r.ok && r.dato && r.dato.instalada === false ? 'instalar' : 'ingreso';
  }
  if (fase === 'app') {
    if (rutasPermitidas().indexOf(location.hash.replace('#', '')) < 0) { try { history.replaceState(null, '', '#' + rutaInicial()); } catch (e) { /* queda la ruta por defecto */ } }
    programarSondeo();
  }
  render();
  usarEnlaceQR();
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => { if (e.key === CLAVE_SESION) sesion = leerSesion(); });
  window.addEventListener('online', () => { if (fase === 'sin-red') arrancarReal(); else refrescar(true); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && fase === 'app' && S && Date.now() - S.recibido > 20000) refrescar(true); });
  document.addEventListener('focusout', () => { if (dibujoPendiente) setTimeout(() => { if (dibujoPendiente && !escribiendo() && !ocupado) dibujarSinPerder(); }, 150); });
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (h === 'pantalla' && fase !== 'pantalla') { location.reload(); return; }
    if (leerCodigoQR(location.hash)) { tomarEnlaceQR(); usarEnlaceQR(); }
  });
}
