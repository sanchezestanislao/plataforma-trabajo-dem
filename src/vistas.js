'use strict';

/* Vistas y eventos. Usa las reglas y acciones de logica.js. */

let S = null;
let avisoT = null;
/* El sitio publicado define CONFIG (servidor y llave pública): ahí corre la versión real, con real.js. Sin CONFIG, es la demo. */
const REAL = typeof CONFIG !== 'undefined';
const RUTAS = ['colaborador', 'supervisor', 'administracion'];
const $ = (s, r) => (r || document).querySelector(s);
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const NOMBRE_ESTADO = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo', estrella: 'Estrella', revision: 'En revisión', justificada: 'Justificada', programada: 'Sin empezar', en_curso: 'En curso' };
const ESTRELLA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2l3 6.3 6.9 1-5 4.8 1.2 6.9L12 17.9l-6.1 3.3 1.2-6.9-5-4.8 6.9-1z"/></svg>';
const ICONOS = {
  hoy: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  jornadas: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="2.5" width="8" height="19" rx="4"/><circle cx="12" cy="7" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="17" r="1.2"/></svg>',
  novedades: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.3v.2"/></svg>',
  capacitacion: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/></svg>'
};
const FESTEJOS = [
  ['Excelente, {n}', 'Terminamos otra jornada juntos. Que tengas un feliz descanso :)'],
  ['Muy bien, {n}', 'Jornada completa y a horario. A descansar, que mañana seguimos.'],
  ['Gracias, {n}', 'Otro día bien hecho. Nos vemos en el próximo turno.'],
  ['Listo, {n}', 'Hoy salió todo en orden. Que disfrutes tu descanso.']
];
const METODO = REAL
  ? { qr: 'QR de la sede', codigo: 'código de la pantalla', impreso: 'QR impreso', ubicacion: 'ubicación del teléfono', supervisor: 'asistida por supervisor', auto: 'cierre automático', declarada: 'avisada por la persona' }
  : { qr: 'QR y ubicación', supervisor: 'asistida por supervisor', auto: 'cierre automático' };
const LETRA_DIA = { 1: 'L', 2: 'M', 3: 'M', 4: 'J', 5: 'V', 6: 'S', 7: 'D' };
const LIC_CORTA = { vacaciones: 'Vacac.', licencia: 'Licencia', franco: 'Franco' };
const nb = t => String(t).replace(/ /g, '&nbsp;');
const ADMIN_TABS = REAL
  ? [['cronograma', 'Cronograma'], ['personas', 'Personas'], ['personal', 'Asignaciones'], ['sedes', 'Sedes'], ['licencias', 'Licencias y vacaciones'], ['feriados', 'Feriados'], ['reglas', 'Reglas'], ['preliquidacion', 'Preliquidación']]
  : [['cronograma', 'Cronograma'], ['personal', 'Personal y asignaciones'], ['licencias', 'Licencias y vacaciones'], ['feriados', 'Feriados'], ['reglas', 'Reglas'], ['preliquidacion', 'Preliquidación']];

/* ---------- Estado en el navegador ---------- */

function guardar() {
  if (REAL) return;
  try { localStorage.setItem(CLAVE, JSON.stringify(S)); } catch (e) { /* sin almacenamiento, la demo sigue en memoria */ }
}
function valido(o) {
  return !!(o && o.v === VERSION && o.ui && ['jornadas', 'asigs', 'franjas', 'licencias', 'feriados', 'avisos'].every(k => Array.isArray(o[k])));
}
function cargar() {
  try {
    const t = localStorage.getItem(CLAVE);
    if (!t) return null;
    const o = JSON.parse(t);
    return valido(o) ? o : null;
  } catch (e) { return null; }
}
function aviso(t) {
  const el = $('#aviso');
  el.textContent = t;
  el.classList.add('visible');
  clearTimeout(avisoT);
  avisoT = setTimeout(() => el.classList.remove('visible'), 5000);
}
function ruta() {
  const h = location.hash.replace('#', '');
  if (REAL) { const p = rutasPermitidas(); return p.indexOf(h) >= 0 ? h : rutaInicial(); }
  return RUTAS.indexOf(h) >= 0 ? h : 'colaborador';
}

/* ---------- Piezas compartidas ---------- */

function luz(estado) {
  const n = NOMBRE_ESTADO[estado] || '';
  if (estado === 'estrella') return '<span class="luz luz-estrella" role="img" aria-label="' + n + '">' + ESTRELLA + '</span>';
  return '<span class="luz luz-' + estado + '" role="img" aria-label="' + n + '"></span>';
}
function chip(estado, numero) {
  return '<span class="chip-luz">' + luz(estado) + (numero == null ? '' : '<b>' + numero + '</b>') + '</span>';
}
function qrSvg() {
  let s = 7, h = '';
  const azar = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const enMarca = (x, y) => (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if (!enMarca(x, y) && azar() < 0.46) h += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
  const marca = (x, y) => '<rect x="' + x + '" y="' + y + '" width="7" height="7"/><rect class="hueco" x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5"/><rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3"/>';
  return '<svg class="qr" viewBox="-2 -2 25 25" aria-hidden="true">' + h + marca(0, 0) + marca(14, 0) + marca(0, 14) + '</svg>';
}
function declTexto(j) {
  const d = j.decl;
  if (!d) return 'Todavía no declaró.';
  if (d.tipo === 'extra') return 'Se quedó trabajando.' + (d.texto ? ' ' + d.texto : '');
  if (d.tipo === 'olvido') return 'Se olvidó de marcar la salida. Dice que terminó a las ' + hm(d.hora) + '.';
  return 'Dice que sus horas fueron otras. ' + (d.texto || '');
}
function corto(c) { return c ? c.nombre + (c.apellido ? ' ' + c.apellido.charAt(0) + '.' : '') : ''; }
function rango(desde, hasta) {
  if (desde === hasta) return 'el ' + fechaMedia(desde);
  if (mesDe(desde) === mesDe(hasta)) return 'del ' + fechaObj(desde).getUTCDate() + ' al ' + fechaMedia(hasta);
  return 'del ' + fechaMedia(desde) + ' al ' + fechaMedia(hasta);
}
function modTexto(m) { return m === 'hora' ? 'Por hora' : 'Fijo'; }
function sedesOp(sel, lista) {
  return (lista || S.sedes.filter(s => s.activa !== false || s.id === sel)).map(s => '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.nombre) + '</option>').join('');
}
function modOp(sel) {
  return '<option value="fijo"' + (sel === 'fijo' ? ' selected' : '') + '>Fijo</option><option value="hora"' + (sel === 'hora' ? ' selected' : '') + '>Por hora</option>';
}
/* Siete casillas de lunes a domingo. `datos` son los atributos que identifican qué se edita. */
function diasHtml(idBase, datos, dias) {
  return '<span class="dias">' + SEMANA.map(d =>
    '<label title="' + cap(DIA_ISO[d]) + '"><input type="checkbox" id="' + idBase + '-' + d + '" ' + datos + ' data-dia="' + d + '"' + (dias.indexOf(d) >= 0 ? ' checked' : '') + ' aria-label="' + cap(DIA_ISO[d]) + '"><span>' + LETRA_DIA[d] + '</span></label>').join('') + '</span>';
}
function borradorDias(clave, base) { const v = S.ui.drafts[clave]; return Array.isArray(v) ? v : base.slice(); }
function pillFeriado(f) {
  const x = feriadoEl(S, f);
  return x ? '<span class="pill fer" title="' + esc(x.nombre) + '">' + (x.tipo === 'feriado' ? 'Feriado' : 'No laborable') + '</span>' : '';
}

/* ---------- Colaborador ---------- */

function vistaColab() {
  const c = colabSel(S);
  if (!c) return '<div class="pagina"><p class="vacio">' + (REAL ? 'Todavía no tenés turnos asignados. Cuando administración cargue tu asignación, tu turno aparece acá.' : 'No hay colaboradores con asignaciones activas. Agregá una desde Administración.') + '</p></div>';
  const tabs = [['hoy', 'Hoy'], ['jornadas', 'Mis jornadas'], ['novedades', 'Novedades'], ['capacitacion', 'Capacitación']];
  const cuerpo = S.ui.tab === 'jornadas' ? jornadasHtml(c) : S.ui.tab === 'novedades' ? novedadesColabHtml(c) : S.ui.tab === 'capacitacion' ? capacitacionHtml(c) : hoyHtml(c);
  return '<div class="' + (REAL ? 'app-colab' : 'demo-colab') + '">' +
    '<div class="telefono">' +
      '<div class="cabecera-app"><p class="fecha-app">' + cap(fechaLarga(S.hoy)) + ', ' + hm(S.ahora) + '</p><h1>Hola, ' + esc(c.nombre) + '</h1></div>' +
      '<div class="pantalla" id="pantalla">' + cuerpo + '</div>' +
      '<nav class="tabs" aria-label="Secciones de la aplicación">' +
        tabs.map(t => '<button type="button" data-a="tab" data-tab="' + t[0] + '" id="tab-' + t[0] + '"' + (S.ui.tab === t[0] ? ' aria-current="true"' : '') + '>' + ICONOS[t[0]] + '<span>' + t[1] + '</span></button>').join('') +
      '</nav>' +
    '</div>' +
    (REAL ? '' : '<aside class="guia">' + guiaHtml(c) + '</aside>') +
  '</div>';
}

function hoyHtml(c) {
  if (REAL && S.ui.fichaje) {
    const f = fichajeHtml();
    if (f) return f;
    /* El turno que se estaba fichando ya no existe (cambió la asignación): se vuelve a la pantalla de hoy. */
    cerrarCamara();
    S.ui.fichaje = null;
  }
  const ts = tramosHoy(S, c.id);
  const pend = pendienteDeclarar(S, c.id);
  const fer = feriadoEl(S, S.hoy);
  let h = pend ? olvidoHtml(pend) : '';
  if (fer && ts.some(j => !j.justif)) h += '<p class="nota info">Hoy es ' + (fer.tipo === 'feriado' ? 'feriado' : 'día no laborable') + ': ' + esc(fer.nombre) + '. Tu turno se registra igual y la liquidación lo distingue.</p>';
  if (!ts.length) return h + '<p class="nota info">Hoy no tenés turnos asignados. Tus jornadas anteriores están en Mis jornadas.</p>' + ausenciaHtml(c);
  const rec = S.ui.recien ? ts.find(j => j.id === S.ui.recien && j.cerrada && !j.justif) : null;
  if (rec) return h + cerradaHtml(c, rec, ev(S, rec));
  const act = tramoActual(S, c.id);
  const lista = ts.length > 1 ? turnosHoyHtml(ts, act) : '';
  if (!act) {
    const ult = ultimoCerrado(S, c.id);
    if (ult) return h + cerradaHtml(c, ult, ev(S, ult)) + lista;
    return h + '<p class="nota info">Hoy figura como ' + esc(ev(S, ts[0]).detalle.toLowerCase()) + '. No hace falta fichar.</p>';
  }
  if (act.entrada == null) return h + lista + sinEntradaHtml(act, ev(S, act)) + ausenciaHtml(c);
  if (S.ui.cierre) return h + formCierreHtml(act);
  return h + lista + enCursoHtml(act, ev(S, act)) + ausenciaHtml(c);
}

function turnosHoyHtml(ts, act) {
  return '<ul class="turnos-hoy" aria-label="Tus turnos de hoy">' + ts.map(j => {
    const e = ev(S, j);
    return '<li' + (act && act.id === j.id ? ' aria-current="true"' : '') + '>' + chip(e.estado) + '<div><p class="dia">' + esc(sedeNombre(S, j.sede)) + '</p><p class="horas-t">' + hm(j.ti) + ' a ' + hm(j.tf) + (j.f !== S.hoy ? ', desde ayer' : '') + '. ' + esc(e.detalle) + '</p></div></li>';
  }).join('') + '</ul>';
}

function ausenciaHtml(c) {
  const l = proximaLicencia(S, c.id);
  if (!l || l.desde <= S.hoy || l.desde > sumarDias(S.hoy, 45)) return '';
  const que = l.tipo === 'vacaciones' ? 'vacaciones' : l.tipo === 'franco' ? 'un franco' : 'una licencia';
  return '<p class="ayuda">Tenés ' + que + ' ' + rango(l.desde, l.hasta) + '.</p>';
}

function olvidoHtml(j) {
  return '<form class="nota info form-nota" data-form="olvido" data-j="' + j.id + '" novalidate>' +
    '<p><strong>El ' + fechaLarga(j.f) + ' no marcaste la salida en ' + esc(sedeNombre(S, j.sede)) + '.</strong> ¿A qué hora terminaste?</p>' +
    '<div class="fila-form"><label class="oculto" for="olvido-hora">Hora en que terminaste</label>' +
    '<input type="time" id="olvido-hora" value="' + hm(j.tf) + '">' +
    '<button class="btn chico primario" type="submit" id="btn-olvido">Avisar a mi supervisor</button></div>' +
    '<p class="error" role="alert">' + esc(S.ui.errores.olvido || '') + '</p>' +
  '</form>';
}

function sinEntradaHtml(j, e) {
  let n = '';
  if (e.enVivo) n = '<p class="nota ' + (e.estado === 'rojo' ? 'falta' : 'obs') + '">Tu turno empezó a las ' + hm(j.ti) + '. Marcá la entrada apenas llegues.</p>';
  if (REAL) {
    const modo = sedeDe(j).verificacion;
    return '<section class="bloque">' +
      '<div><p class="sede">' + esc(sedeNombre(S, j.sede)) + '</p><p class="turno-txt">Tu turno es de ' + hm(j.ti) + ' a ' + hm(j.tf) + '.</p></div>' + n +
      '<button class="btn primario ancho" type="button" data-a="entrada" id="btn-entrada">Marcar entrada</button>' +
      '<p class="ayuda">' + (modo === 'ubicacion' ? 'Al marcar, la aplicación usa la ubicación de tu teléfono para confirmar que estás en la sede.'
        : modo === 'impreso' ? 'Al marcar, vas a leer el QR que está pegado en la sede. La hora la pone el sistema.'
        : 'Al marcar, vas a leer el código de la pantalla de la sede. La hora la pone el sistema.') + '</p>' +
    '</section>';
  }
  return '<section class="bloque">' +
    '<div><p class="sede">' + esc(sedeNombre(S, j.sede)) + '</p><p class="turno-txt">Tu turno es de ' + hm(j.ti) + ' a ' + hm(j.tf) + '.</p></div>' + n +
    '<div class="qr-caja">' + qrSvg() + '<p>QR de ' + esc(sedeNombre(S, j.sede)) + '</p></div>' +
    '<button class="btn primario ancho" type="button" data-a="entrada" id="btn-entrada">Marcar entrada</button>' +
    '<p class="ayuda">En la versión real, este paso lee el QR de la sede y verifica tu ubicación. En esta demo está simulado.</p>' +
  '</section>';
}

function notaEntrada(j, e) {
  if (j.metodoIn === 'supervisor') return '<p class="nota info">Tu supervisor registró tu entrada a las ' + hm(j.entrada) + '.</p>';
  if (e.demora > S.P.rojo) return '<p class="nota falta">Entrada con ' + dur(e.demora) + ' de demora: el turno queda en rojo. Si pasó algo, contalo desde Mis jornadas.</p>';
  if (e.demora > S.P.gracia) return '<p class="nota obs">Entrada con ' + dur(e.demora) + ' de demora: el turno queda en amarillo.</p>';
  return '<p class="nota ok">Llegaste a horario. Buen comienzo.</p>';
}

function enCursoHtml(j, e) {
  const rel = relDe(S, j);
  return '<section class="bloque">' +
    '<div><p class="sede">' + esc(sedeNombre(S, j.sede)) + '</p><p class="turno-txt">Llevás ' + dur(Math.max(0, rel - j.entrada)) + ' de jornada.</p></div>' +
    '<div class="tiempos"><div class="tiempo"><span>Entrada</span><strong>' + hm(j.entrada) + '</strong></div><div class="tiempo"><span>Tu turno termina</span><strong>' + hm(j.tf) + '</strong></div></div>' +
    notaEntrada(j, e) +
    (rel > j.tf ? '<p class="nota info">Tu turno terminó a las ' + hm(j.tf) + '. Cuando termines, cerrá la jornada.</p>' : '') +
    '<button class="btn primario ancho" type="button" data-a="abrir-cierre" id="btn-abrir-cierre">Cerrar jornada</button>' +
  '</section>';
}

function formCierreHtml(j) {
  const k = S.ui.cierre, d = S.ui.drafts;
  const exc = relDe(S, j) - j.tf;
  let medio;
  if (exc > S.P.margen) {
    medio = '<fieldset class="campo"><legend>Registramos ' + dur(exc) + ' de más. ¿Qué pasó?</legend>' +
      '<label class="opcion"><input type="radio" name="que" id="que-extra" value="extra"' + (k.que === 'extra' ? ' checked' : '') + '><span>Me quedé trabajando</span></label>' +
      '<label class="opcion"><input type="radio" name="que" id="que-olvido" value="olvido"' + (k.que === 'olvido' ? ' checked' : '') + '><span>Me olvidé de marcar la salida</span></label></fieldset>';
    if (k.que === 'extra') medio += '<label class="campo" for="cierre-texto">¿En qué te quedaste?<textarea id="cierre-texto" data-draft="cierreTexto" rows="2" maxlength="200">' + esc(d.cierreTexto || '') + '</textarea></label>';
    if (k.que === 'olvido') medio += '<label class="campo" for="cierre-hora">¿A qué hora terminaste?<input type="time" id="cierre-hora" data-draft="cierreHora" value="' + esc(d.cierreHora || hm(j.tf)) + '"></label>';
  } else {
    medio = '<label class="opcion"><input type="checkbox" id="cierre-ok"' + (k.ok ? ' checked' : '') + (k.otras ? ' disabled' : '') + '><span>Confirmo que trabajé de ' + hm(j.entrada) + ' a ' + hm(S.ahora) + '</span></label>' +
      '<button type="button" class="enlace" data-a="otras-horas" id="btn-otras">' + (k.otras ? 'Mis horas coinciden' : 'Mis horas fueron otras') + '</button>';
    if (k.otras) medio += '<label class="campo" for="cierre-texto">Contanos qué fue distinto<textarea id="cierre-texto" data-draft="cierreTexto" rows="2" maxlength="200">' + esc(d.cierreTexto || '') + '</textarea></label>';
  }
  return '<form class="bloque" data-form="cierre" novalidate>' +
    '<div><p class="sede">Cierre de jornada</p><p class="turno-txt">' + esc(sedeNombre(S, j.sede)) + '</p></div>' +
    '<div class="tiempos"><div class="tiempo"><span>Entrada</span><strong>' + hm(j.entrada) + '</strong></div><div class="tiempo"><span>Salida</span><strong>' + hm(S.ahora) + '</strong></div></div>' +
    medio +
    '<p class="error" role="alert">' + esc(k.error || '') + '</p>' +
    '<button class="btn primario ancho" type="submit" id="btn-cerrar">Cerrar jornada</button>' +
    (REAL ? '<p class="ayuda">Al cerrar, la aplicación te pide el código de la sede y registra la salida con la hora del sistema.</p>' : '') +
    '<button class="btn ancho" type="button" data-a="cancelar-cierre" id="btn-cancelar-cierre">Volver</button>' +
  '</form>';
}

function cerradaHtml(c, j, e) {
  const n = esc(c.nombre), sede = sedeNombre(S, j.sede);
  const prox = tramosHoy(S, c.id).filter(t => !t.cerrada && !t.justif)[0] || null;
  let titulo, msj;
  if (j.metodoOut === 'supervisor') {
    titulo = 'Jornada cerrada, ' + n;
    msj = 'Tu supervisor registró la salida a las ' + hm(j.salida) + '.';
  } else if (prox) {
    if (e.estado === 'verde' || e.estado === 'estrella') { titulo = 'Muy bien, ' + n; msj = 'Turno en ' + sede + ' cerrado y a horario.'; }
    else if (e.estado === 'revision') { titulo = 'Gracias, ' + n; msj = 'Tu supervisor va a revisar el tiempo de este turno.'; }
    else if (e.estado === 'amarillo') { titulo = 'Turno cerrado, ' + n; msj = 'Gracias por marcar la salida. Quedó una observación en este turno.'; }
    else { titulo = 'Turno cerrado, ' + n; msj = 'Gracias por marcar la salida. Si pasó algo con la llegada, contalo desde Mis jornadas.'; }
  } else if (e.estado === 'verde' || e.estado === 'estrella') {
    const f = FESTEJOS[((diasEntre(INICIO, j.f) % FESTEJOS.length) + FESTEJOS.length) % FESTEJOS.length];
    titulo = f[0].replace('{n}', n);
    msj = f[1];
  } else if (e.estado === 'revision') {
    titulo = 'Gracias, ' + n;
    msj = 'Tu supervisor va a revisar el tiempo de hoy. Que tengas un buen descanso.';
  } else if (e.estado === 'amarillo') {
    titulo = 'Jornada cerrada, ' + n;
    msj = 'Gracias por marcar la salida. Hoy quedó una observación y mañana arrancamos de nuevo.';
  } else {
    titulo = 'Jornada cerrada, ' + n;
    msj = 'Gracias por marcar la salida. Si hoy pasó algo con la llegada, contalo desde Mis jornadas.';
  }
  if (prox) msj += ' Tu próximo turno de hoy empieza a las ' + hm(prox.ti) + ' en ' + sedeNombre(S, prox.sede) + '.';
  const pos = e.estado === 'rojo' ? 0 : e.estado === 'amarillo' ? 1 : 2;
  const focos = [0, 1, 2].map(i => {
    if (i !== pos) return '<span class="foco"></span>';
    if (e.estado === 'estrella') return '<span class="foco on con-estrella">' + ESTRELLA + '</span>';
    if (e.estado === 'revision') return '<span class="foco on en-revision"></span>';
    return '<span class="foco on ' + (i === 0 ? 'rojo' : i === 1 ? 'ambar' : 'verde') + '"></span>';
  }).join('');
  let lineaRacha = '';
  if (!prox) {
    const r = racha(S, c.id);
    lineaRacha = r >= 2 ? '<p class="racha">Llevás ' + r + ' jornadas seguidas sin observaciones.</p>' : r === 1 ? '<p class="racha">Hoy arranca una racha nueva.</p>' : '';
  }
  const botones = prox
    ? '<button class="btn primario ancho" type="button" data-a="proximo" id="btn-proximo">Ver mi próximo turno</button>'
    : '<button class="btn ancho" type="button" data-a="tab" data-tab="jornadas" id="btn-ver-jornadas">Ver mis jornadas</button>' +
      '<button class="btn ancho" type="button" data-a="tab" data-tab="novedades" id="btn-ir-novedades">Cargar una novedad</button>';
  return '<section class="cierre-ok' + (S.ui.festejo === j.id ? ' festejo' : '') + '">' +
    '<div class="semaforo-v" aria-hidden="true">' + focos + '</div>' +
    '<h2>' + titulo + '</h2>' +
    '<p class="mensaje">' + esc(msj) + '</p>' +
    '<p class="resultado">' + chip(e.estado) + '<span>' + esc(e.detalle) + (j.salida == null ? ', con entrada a las ' + hm(j.entrada) : ', de ' + hm(j.entrada) + ' a ' + hm(j.salida)) + ' en ' + esc(sede) + '</span></p>' +
    lineaRacha +
    '<div class="acciones">' + botones + '</div>' +
  '</section>';
}

function jornadasHtml(c) {
  const mes = mesDe(S.hoy);
  const varias = asigsDe(S, c.id).length > 1;
  const js = S.jornadas.filter(j => j.c === c.id && mesDe(j.f) === mes).sort((a, b) => -porInicio(a, b));
  const r = resumenMes(S, c.id, mes), n = racha(S, c.id);
  const filas = js.map(j => {
    const e = ev(S, j);
    let horas = '';
    if (!j.justif && j.entrada != null) {
      const sal = j.rev && j.salidaVal != null ? j.salidaVal : j.salida;
      horas = hm(j.entrada) + ' a ' + (sal == null ? (j.cerrada ? 'sin marcar' : 'en curso') : hm(sal));
    }
    let mas = '';
    if (e.estado === 'rojo' && j.cerrada) {
      if (j.descargo) mas = '<p class="descargo">Tu aviso: ' + esc(j.descargo) + '</p>';
      else if (S.ui.descargo === j.id) {
        mas = '<form class="form-descargo" data-form="descargo" data-j="' + j.id + '" novalidate><label class="oculto" for="descargo-txt">Qué pasó</label>' +
          '<textarea id="descargo-txt" data-draft="descargo" rows="2" maxlength="280" placeholder="Se demoró el colectivo por un corte">' + esc(S.ui.drafts.descargo || '') + '</textarea>' +
          '<p class="error" role="alert">' + esc(S.ui.errores.descargo || '') + '</p>' +
          '<button class="btn chico primario" type="submit" id="btn-descargo">Enviar a mi supervisor</button></form>';
      } else mas = '<button class="enlace" type="button" data-a="abrir-descargo" data-j="' + j.id + '" id="desc-' + j.id + '">Contar qué pasó</button>';
    } else if (e.estado === 'revision') {
      mas = '<p class="descargo">' + (j.salida == null && !j.decl ? 'Avisá desde Hoy a qué hora terminaste.' : 'Tu supervisor define cómo queda.') + '</p>';
    }
    return '<li class="fila"><div class="riel">' + luz(e.estado) + '</div><div class="cont"><div class="linea1"><span class="dia">' + cap(fechaCorta(j.f)) + pillFeriado(j.f) + '</span><span class="horas">' + horas + '</span></div>' +
      (varias ? '<p class="sede-mini">' + esc(sedeNombre(S, j.sede)) + '</p>' : '') + '<p class="det">' + esc(e.detalle) + '</p>' + mas + '</div></li>';
  }).join('');
  return '<section class="bloque">' +
    '<h2 class="titulo-tab">Mis jornadas de ' + nombreMes(S.hoy) + '</h2>' +
    '<ul class="cuentas">' +
      '<li>' + chip('verde', r.verde) + '<span>en verde</span></li>' +
      '<li>' + chip('estrella', r.estrella) + '<span>con estrella</span></li>' +
      '<li>' + chip('amarillo', r.amarillo) + '<span>en amarillo</span></li>' +
      '<li>' + chip('rojo', r.rojo) + '<span>en rojo</span></li>' +
    '</ul>' +
    (n >= 2 ? '<p class="nota ok">Llevás ' + n + ' jornadas seguidas sin observaciones.</p>' : '') +
    (varias ? '<p class="ayuda">Trabajás en más de una sede: cada turno tiene su propia luz.</p>' : '') +
    '<ul class="lista-jornadas">' + filas + '</ul>' +
  '</section>';
}

function novedadesColabHtml(c) {
  const d = S.ui.drafts;
  const tipo = d.novTipo || 'insumos', crit = d.novCrit || 'media';
  const mias = S.novedades.filter(n => n.c === c.id);
  const ids = asigsDe(S, c.id).map(a => a.sede);
  const misSedes = S.sedes.filter(s => ids.indexOf(s.id) >= 0);
  const sedeSel = d.novSede && ids.indexOf(d.novSede) >= 0 ? d.novSede : sedeActual(S, c.id);
  return '<section class="bloque">' +
    '<h2 class="titulo-tab">Novedades</h2>' +
    '<form class="bloque" data-form="novedad" novalidate>' +
      (misSedes.length > 1 ? '<label class="campo" for="nov-sede">¿En qué sede?<select id="nov-sede" data-draft="novSede">' + sedesOp(sedeSel, misSedes) + '</select></label>' : '') +
      '<label class="campo" for="nov-tipo">¿De qué se trata?<select id="nov-tipo" data-draft="novTipo">' +
        Object.keys(TIPOS_NOV).map(k => '<option value="' + k + '"' + (k === tipo ? ' selected' : '') + '>' + TIPOS_NOV[k] + '</option>').join('') + '</select></label>' +
      '<fieldset class="campo"><legend>Urgencia</legend><div class="segmento">' +
        Object.keys(CRITICIDAD).map(k => '<label><input type="radio" name="nov-crit" id="nov-crit-' + k + '" value="' + k + '" data-draft="novCrit"' + (k === crit ? ' checked' : '') + '><span>' + CRITICIDAD[k] + '</span></label>').join('') + '</div></fieldset>' +
      '<label class="campo" for="nov-texto">¿Qué pasó?<textarea id="nov-texto" data-draft="novTexto" rows="3" maxlength="400" placeholder="Se rompió el secador de manos del baño de planta baja">' + esc(d.novTexto || '') + '</textarea></label>' +
      (REAL ? '' : '<label class="campo" for="nov-foto">Foto, si ayuda a entenderlo<input type="file" id="nov-foto" accept="image/*"></label>') +
      '<p class="error" role="alert">' + esc(S.ui.errores.nov || '') + '</p>' +
      '<button class="btn primario ancho" type="submit" id="btn-nov">Enviar novedad</button>' +
    '</form>' +
    '<h3 class="subtitulo">Mis novedades</h3>' +
    (mias.length ? '<ul class="lista-nov">' + mias.map(n => '<li><div class="linea1"><span class="dia">' + TIPOS_NOV[n.tipo] + '</span><span class="pill est-' + n.estado + '">' + ESTADOS_NOV[n.estado] + '</span></div><p class="det">' + esc(n.texto) + '</p><p class="descargo">' + esc(sedeNombre(S, n.sede)) + ', ' + fechaCorta(n.f) + ' ' + hm(n.m) + (n.foto ? '. Con foto: ' + esc(n.foto) : '') + '</p></li>').join('') + '</ul>'
      : '<p class="ayuda">Todavía no cargaste novedades. Cuando veas algo roto o falte un insumo, avisá desde acá.</p>') +
  '</section>';
}

function capacitacionHtml(c) {
  const r = resumenMes(S, c.id, mesDe(S.hoy));
  const cursos = ['Uso seguro de productos de limpieza', 'Limpieza de áreas críticas', 'Cuidado de máquinas y equipos'];
  return '<section class="bloque">' +
    '<h2 class="titulo-tab">Capacitación</h2>' +
    '<p class="nota info">Este espacio llega en una próxima etapa: cursos cortos desde el teléfono y premios a medida que se completan.</p>' +
    '<h3 class="subtitulo">Lo que ya suma este mes</h3>' +
    '<ul class="logros">' +
      '<li><b>' + racha(S, c.id) + '</b><span>jornadas seguidas sin observaciones</span></li>' +
      '<li><b>' + r.estrella + '</b><span>estrellas por horas extra verificadas</span></li>' +
      '<li><b>' + r.cerradasPorColab + ' de ' + r.conEntrada + '</b><span>turnos cerrados por vos</span></li>' +
    '</ul>' +
    '<h3 class="subtitulo">Cursos de ejemplo</h3>' +
    '<ul class="lista-nov">' + cursos.map(t => '<li><div class="linea1"><span class="dia">' + t + '</span><span class="pill">Próximamente</span></div></li>').join('') + '</ul>' +
  '</section>';
}

function guiaHtml(c) {
  const ts = tramosHoy(S, c.id).filter(j => !j.justif);
  const act = tramoActual(S, c.id) || ultimoCerrado(S, c.id);
  const a0 = asigsDe(S, c.id).filter(a => a.activa)[0];
  const corr = act ? 1440 * diasEntre(act.f, S.hoy) : 0;
  const ti = (act ? act.ti : a0 ? a0.ti : 480) - corr, tf = (act ? act.tf : a0 ? a0.tf : 840) - corr;
  const boton = (min, id) => min >= S.ahora && min <= 1439 ? '<button class="btn chico" type="button" data-a="hora" data-min="' + min + '" id="' + id + '">Poner ' + hm(min) + '</button>' : '';
  const sig = ts.find(j => !j.cerrada && j.entrada == null) || null;
  const sigMin = sig ? sig.ti - 1440 * diasEntre(sig.f, S.hoy) : -1;
  let dos = '';
  if (new Set(ts.map(j => j.sede)).size > 1) {
    dos = '<li><h3>Dos sedes en un día</h3><p>Hoy ' + esc(c.nombre) + ' tiene turnos en ' + Array.from(new Set(ts.map(j => j.sede))).map(id => esc(sedeNombre(S, id))).join(' y ') + '. Cerrá el primero' + (sig ? ', llevá el reloj a las ' + hm(sig.ti) : '') + ' y marcá la entrada en la otra sede. Cada turno tiene su propia luz.</p>' + (sig ? boton(sigMin, 'pr-sede') : '') + '</li>';
  }
  const noct = S.asigs.find(a => a.activa && a.tf > 1440);
  const noche = noct ? '<li><h3>Turno de noche</h3><p>' + esc(colab(S, noct.c).nombre) + ' trabaja de ' + hm(noct.ti) + ' a ' + hm(noct.tf) + ', ' + listaDias(noct.dias) + '. Elegí su teléfono un día que le toque, marcá la entrada y pasá al día siguiente: el turno sigue abierto y se cierra a la mañana.</p></li>' : '';
  return '<h2>Probá el recorrido del colaborador</h2>' +
    '<label class="campo campo-linea" for="sel-colab">Este teléfono es de<select id="sel-colab">' +
      activos(S).map(x => {
        const as = asigsDe(S, x.id).filter(a => a.activa);
        return '<option value="' + x.id + '"' + (x.id === c.id ? ' selected' : '') + '>' + esc(nombreCompleto(x)) + ', ' + (as.length > 1 ? as.length + ' sedes' : hm(as[0].ti) + ' a ' + hm(as[0].tf)) + '</option>';
      }).join('') + '</select></label>' +
    '<ul class="pruebas">' +
      '<li><h3>Cerrar a horario</h3><p>Con el reloj cerca de las ' + hm(tf) + ', tocá Cerrar jornada y confirmá tus horas.</p></li>' +
      dos +
      '<li><h3>Quedarse de más</h3><p>Llevá el reloj a las ' + hm(tf + 80) + ' y cerrá. El turno pasa a control excedente y aparece en Supervisor.</p>' + boton(tf + 80, 'pr-extra') + '</li>' +
      '<li><h3>Olvidar la salida</h3><p>Sin cerrar, pasá al día siguiente. El sistema cierra solo y la app pregunta a qué hora terminaste.</p></li>' +
      '<li><h3>Llegar tarde</h3><p>En un día nuevo, poné las ' + hm(ti + 12) + ' antes de marcar la entrada y queda en amarillo. Con más de ' + S.P.rojo + ' minutos, en rojo.</p>' + boton(ti + 12, 'pr-tarde') + '</li>' +
      noche +
    '</ul>' +
    '<p class="ayuda">El QR y la ubicación están simulados. Los datos son de ejemplo y se guardan solo en este navegador. El resto del equipo ficha solo a medida que avanza el reloj.</p>';
}

/* ---------- Supervisor ---------- */

function casoHtml(j) {
  const c = colab(S, j.c), a = asig(S, j.a), k = S.ui.casos[j.id] || {};
  const sinSalida = j.salida == null;
  const hayExc = sinSalida || j.salida - j.tf > S.P.margen;
  const ops = hayExc ? [['extra', 'Fue hora extra'], ['olvido', 'Olvidó marcar la salida']] : [['ajuste', 'Corregir la salida'], ['ok', 'Mantener el registro']];
  let que = k.que;
  if (!ops.some(o => o[0] === que)) que = hayExc ? (sinSalida || (j.decl && j.decl.tipo === 'olvido') ? 'olvido' : 'extra') : 'ajuste';
  let hora = k.hora;
  if (hora == null) {
    const dicha = j.decl && j.decl.hora != null ? j.decl.hora : null;
    if (que === 'extra') hora = sinSalida ? (dicha != null && dicha > j.tf ? dicha : j.tf + 60) : j.salida;
    else if (que === 'olvido') hora = dicha != null ? dicha : j.tf;
    else hora = j.salida;
  }
  const min = minutosDelDia(S, j.c, j.f), tope = topeDelDia(S, j.c, j.f);
  return '<li class="caso">' +
    '<div class="caso-quien"><p class="nombre">' + esc(nombreCompleto(c)) + '</p><p class="sub">' + cap(fechaLarga(j.f)) + '<br>' + esc(sedeNombre(S, j.sede)) + '</p><p><span class="pill">' + modTexto(a ? a.modalidad : 'fijo') + '</span>' + pillFeriado(j.f) + '</p></div>' +
    '<dl class="caso-datos">' +
      '<div><dt>Turno asignado</dt><dd>' + hm(j.ti) + ' a ' + hm(j.tf) + '</dd></div>' +
      '<div><dt>Entrada</dt><dd>' + hm(j.entrada) + '</dd></div>' +
      '<div><dt>Salida registrada</dt><dd>' + (sinSalida ? 'Sin marcar' : hm(j.salida)) + '</dd></div>' +
      '<div><dt>Tiempo de más</dt><dd>' + (sinSalida ? 'Sin dato, cierre automático' : j.salida > j.tf ? dur(j.salida - j.tf) : 'Ninguno') + '</dd></div>' +
      '<div class="ancho"><dt>Dice el colaborador</dt><dd>' + esc(declTexto(j)) + '</dd></div>' +
      (min > tope * 60 ? '<div class="ancho"><dt>Tope diario</dt><dd>Con este registro suma ' + dur(min) + ' ese día, por encima del tope de ' + tope + ' h.</dd></div>' : '') +
    '</dl>' +
    '<form class="caso-form" data-form="resolver" data-j="' + j.id + '" novalidate>' +
      '<fieldset><legend>Qué pasó</legend>' +
        ops.map(o => '<label class="radio"><input type="radio" name="que-' + j.id + '" id="que-' + j.id + '-' + o[0] + '" value="' + o[0] + '" data-caso="' + j.id + '" data-campo="que"' + (o[0] === que ? ' checked' : '') + '><span>' + o[1] + '</span></label>').join('') +
      '</fieldset>' +
      '<label class="linea" for="val-' + j.id + '">Salida validada<input type="time" id="val-' + j.id + '" data-caso="' + j.id + '" data-campo="hora" value="' + hm(hora) + '"' + (que === 'ok' ? ' disabled' : '') + '></label>' +
      '<p class="error" role="alert">' + esc(k.error || '') + '</p>' +
      '<button class="btn chico primario" type="submit" id="res-' + j.id + '">Resolver</button>' +
    '</form>' +
  '</li>';
}

function detalleHtml(j) {
  const c = colab(S, j.c), e = ev(S, j), p = [], fer = feriadoEl(S, j.f);
  p.push('<strong>' + esc(nombreCompleto(c)) + ', ' + fechaLarga(j.f) + '.</strong> ' + esc(e.detalle) + '.');
  if (!j.justif) {
    p.push('Turno de ' + hm(j.ti) + ' a ' + hm(j.tf) + ' en ' + esc(sedeNombre(S, j.sede)) + '.');
    if (fer) p.push((fer.tipo === 'feriado' ? 'Feriado: ' : 'Día no laborable: ') + esc(fer.nombre) + '.');
    if (j.entrada != null) p.push('Entrada ' + hm(j.entrada) + ' (' + (METODO[j.metodoIn] || METODO.qr) + (REAL ? esc(evidenciaTexto(j.ubiIn)) : '') + ').');
    if (j.cerrada && j.entrada != null) p.push(j.salida == null ? (j.metodoOut === 'declarada' ? 'Salida sin marcar: la persona avisó la hora.' : 'Salida sin marcar (cierre automático).') : 'Salida ' + hm(j.salida) + ' (' + (METODO[j.metodoOut] || METODO.qr) + (REAL ? esc(evidenciaTexto(j.ubiOut)) : '') + ').');
    if (j.rev && j.salidaVal != null && j.salidaVal !== j.salida) p.push('Salida validada por supervisión: ' + hm(j.salidaVal) + '.');
    if (j.decl) p.push('Declaración: ' + esc(declTexto(j)));
    if (j.descargo) p.push('Aviso del colaborador: ' + esc(j.descargo));
  }
  return '<p class="detalle" id="detalle-jornada">' + p.join(' ') + '</p>';
}

function tableroHtml() {
  const mes = mesDe(S.hoy);
  const delMes = S.jornadas.filter(j => mesDe(j.f) === mes);
  const dias = Array.from(new Set(delMes.map(j => j.f))).sort();
  const n = dias.length;
  let h = '<div class="tablero-wrap"><div class="tablero" style="grid-template-columns:max-content repeat(' + n + ',30px)"><div></div>' +
    dias.map(f => {
      const fer = feriadoEl(S, f);
      return '<div class="t-dia' + (fer ? ' fer' : '') + '" title="' + cap(fechaLarga(f)) + (fer ? ', ' + esc(fer.nombre) : '') + '"><span>' + LETRA_DIA[dIso(f)] + '</span>' + fechaObj(f).getUTCDate() + '</div>';
    }).join('');
  for (const c of S.colabs) {
    for (const a of asigsDe(S, c.id)) {
      const mapa = {};
      for (const j of delMes) if (j.a === a.id) mapa[j.f] = j;
      if (!Object.keys(mapa).length) continue;
      h += '<div class="t-nombre">' + esc(nombreCompleto(c)) + '<span>' + esc(sedeNombre(S, a.sede)) + ', ' + hm(a.ti) + ' a ' + hm(a.tf) + '</span></div>' + dias.map((f, i) => {
        const j = mapa[f], cls = 't-celda' + (i === 0 ? ' pri' : '') + (i === n - 1 ? ' ult' : '');
        if (!j) return '<div class="' + cls + '"></div>';
        const e = ev(S, j);
        return '<div class="' + cls + '"><button type="button" class="t-luz" data-a="detalle" data-j="' + j.id + '" id="tl-' + j.id + '" aria-pressed="' + (S.ui.detalle === j.id) + '" aria-label="' + esc(nombreCompleto(c) + ', ' + sedeNombre(S, a.sede) + ', ' + fechaLarga(f) + ': ' + e.detalle) + '">' + luz(e.estado) + '</button></div>';
      }).join('');
    }
  }
  h += '</div></div>';
  h += '<ul class="leyenda">' +
    '<li>' + chip('verde') + 'Correcto</li><li>' + chip('estrella') + 'Hora extra verificada</li><li>' + chip('amarillo') + 'Con observación</li>' +
    '<li>' + chip('rojo') + 'Inasistencia o demora mayor a ' + S.P.rojo + ' min</li><li>' + chip('revision') + 'En revisión</li><li>' + chip('justificada') + 'Justificada</li><li>' + chip('en_curso') + 'En curso</li>' +
    '<li><span class="t-dia fer muestra">F</span>Feriado o día no laborable</li></ul>';
  const jd = S.ui.detalle ? porId(S, S.ui.detalle) : null;
  h += jd ? detalleHtml(jd) : '<p class="detalle" id="detalle-jornada">Tocá una luz para ver el detalle de ese turno.</p>';
  return h;
}

function vistaSupervisor() {
  const mes = mesDe(S.hoy);
  const orden = {};
  S.colabs.forEach((c, i) => { orden[c.id] = i; });
  const hoyJs = tramosDelDia(S).sort((a, b) => orden[a.c] - orden[b.c] || porInicio(a, b));
  const pend = pendientes(S);
  const enCurso = hoyJs.filter(j => ev(S, j).estado === 'en_curso').length;
  const sinIng = hoyJs.filter(j => ev(S, j).enVivo).length;
  const novAb = S.novedades.filter(n => n.estado !== 'resuelta').length;
  const inas = S.jornadas.filter(j => mesDe(j.f) === mes && j.cerrada && j.entrada == null && !j.justif).sort((a, b) => -porInicio(a, b)).slice(0, 8);
  const fer = feriadoEl(S, S.hoy);

  const equipo = hoyJs.map(j => {
    const c = colab(S, j.c), e = ev(S, j);
    let accion = '';
    if (!j.cerrada && !j.justif) accion = '<button class="btn chico" type="button" data-a="asistido" data-j="' + j.id + '" id="asis-' + j.id + '">' + (j.entrada == null ? 'Fichar entrada' : 'Fichar salida') + '</button>';
    return '<tr><td><span class="nombre">' + esc(nombreCompleto(c)) + '</span></td><td>' + esc(sedeNombre(S, j.sede)) + '</td><td>' + hm(j.ti) + ' a ' + hm(j.tf) + (j.f !== S.hoy ? ', desde ayer' : '') + '</td>' +
      '<td>' + (j.justif ? 'No ficha' : j.entrada == null ? 'Pendiente' : hm(j.entrada) + (j.metodoIn === 'supervisor' ? ', asistida' : '') + (REAL ? respaldoCorto(j.ubiIn) : '')) + '</td>' +
      '<td>' + (j.justif ? 'No ficha' : j.salida == null ? (j.cerrada && j.entrada != null ? 'Sin marcar' : 'Pendiente') : hm(j.salida) + (j.metodoOut === 'supervisor' ? ', asistida' : '') + (REAL ? respaldoCorto(j.ubiOut) : '')) + '</td>' +
      '<td><span class="estado-celda">' + chip(e.estado) + '<span>' + esc(e.detalle) + '</span></span></td><td class="num">' + accion + '</td></tr>';
  }).join('');

  const novs = S.novedades.map(n => {
    const c = colab(S, n.c);
    return '<li class="renglon"><span class="pill crit-' + n.crit + '">' + CRITICIDAD[n.crit] + '</span>' +
      '<div><p class="nombre">' + TIPOS_NOV[n.tipo] + '</p><p>' + esc(n.texto) + '</p><p class="sub">' + esc(nombreCompleto(c)) + ', ' + esc(sedeNombre(S, n.sede)) + ', ' + fechaCorta(n.f) + ' ' + hm(n.m) + (n.foto ? ', con foto' : '') + '</p></div>' +
      '<div class="renglon-accion"><label class="oculto" for="est-' + n.id + '">Estado de la novedad</label><select id="est-' + n.id + '" data-nov="' + n.id + '">' +
        Object.keys(ESTADOS_NOV).map(k => '<option value="' + k + '"' + (k === n.estado ? ' selected' : '') + '>' + ESTADOS_NOV[k] + '</option>').join('') + '</select></div></li>';
  }).join('');

  const bit = S.bitacora.slice(0, 6).map(b => '<li class="renglon dos"><div><p>' + esc(cap(b.texto)) + '</p><p class="sub">Supervisión, ' + fechaCorta(b.f) + ' ' + hm(b.m) + '</p></div>' +
    (b.tipo === 'rev' || b.tipo === 'justif' ? '<div class="renglon-accion"><button class="btn chico" type="button" data-a="deshacer" data-b="' + b.id + '" id="des-' + b.id + '">Deshacer</button></div>' : '<span></span>') + '</li>').join('');

  const avisos = S.avisos.map(x => '<li class="renglon dos"><div><p>' + esc(x.texto) + '</p><p class="sub">Administración, ' + fechaCorta(x.f) + ' ' + hm(x.m) + '</p></div>' +
    '<div class="renglon-accion"><button class="btn chico" type="button" data-a="quitar-aviso" data-id="' + x.id + '" id="av-' + x.id + '">Visto</button></div></li>').join('');

  return '<div class="pagina">' +
    '<div class="titulo-pagina"><h1>Supervisión</h1><p>' + cap(fechaLarga(S.hoy)) + ', ' + hm(S.ahora) + (fer ? '. ' + (fer.tipo === 'feriado' ? 'Feriado: ' : 'Día no laborable: ') + esc(fer.nombre) : '') + '</p></div>' +
    '<ul class="indicadores">' +
      '<li><b>' + pend.length + '</b><span>' + (pend.length === 1 ? 'turno para resolver' : 'turnos para resolver') + '</span></li>' +
      '<li><b>' + enCurso + '</b><span>trabajando ahora</span></li>' +
      '<li><b>' + sinIng + '</b><span>con demora, sin ingresar</span></li>' +
      '<li><b>' + novAb + '</b><span>' + (novAb === 1 ? 'novedad abierta' : 'novedades abiertas') + '</span></li>' +
    '</ul>' +
    (avisos ? '<section class="seccion"><h2>Avisos de administración</h2><p class="bajada">Cambios de tope y asignaciones que lo superan. Quedan acá hasta que los marques como vistos.</p><ul class="panel">' + avisos + '</ul></section>' : '') +
    (REAL ? marcasHtml() : '') +
    '<section class="seccion"><h2>Control excedente de horas</h2><p class="bajada">Cada turno con tiempo de más o sin salida espera acá. Hasta que lo resuelvas no suma horas a la liquidación. En una misma sede, el tiempo de más siempre es hora extra.</p>' +
      '<ul class="panel">' + (pend.length ? pend.map(casoHtml).join('') : '<li class="vacio">No hay turnos para resolver. Todo el tiempo trabajado está validado.</li>') + '</ul></section>' +
    '<section class="seccion"><h2>Equipo de hoy</h2><div class="panel tabla-wrap"><table><thead><tr><th>Colaborador</th><th>Sede</th><th>Turno</th><th>Entrada</th><th>Salida</th><th>Estado</th><th class="num">Fichaje asistido</th></tr></thead><tbody>' +
      (equipo || '<tr><td colspan="7">No hay turnos asignados hoy.</td></tr>') + '</tbody></table></div></section>' +
    '<section class="seccion"><h2>Inasistencias sin justificar</h2><ul class="panel">' +
      (inas.length ? inas.map(j => '<li class="renglon">' + chip('rojo') + '<div><p class="nombre">' + esc(nombreCompleto(colab(S, j.c))) + '</p><p class="sub">' + cap(fechaLarga(j.f)) + ', ' + esc(sedeNombre(S, j.sede)) + ' de ' + hm(j.ti) + ' a ' + hm(j.tf) + '. ' + (j.descargo ? 'Avisó: ' + esc(j.descargo) : 'Sin aviso del colaborador.') + '</p></div>' +
        '<form class="renglon-accion" data-form="justificar" data-j="' + j.id + '"><label class="oculto" for="mot-' + j.id + '">Motivo</label><select id="mot-' + j.id + '"><option value="aviso">Ausencia con aviso</option><option value="licencia">Licencia</option><option value="franco">Franco</option></select>' +
        '<button class="btn chico" type="submit" id="jus-' + j.id + '">Justificar</button></form></li>').join('') : '<li class="vacio">No hay inasistencias sin justificar este mes.</li>') + '</ul></section>' +
    '<section class="seccion"><h2>Tablero de ' + nombreMes(S.hoy) + '</h2><div class="panel">' + tableroHtml() + '</div></section>' +
    '<section class="seccion"><h2>Novedades</h2><ul class="panel">' + (novs || '<li class="vacio">No hay novedades cargadas.</li>') + '</ul></section>' +
    '<section class="seccion"><h2>Últimas resoluciones</h2><p class="bajada">Cada corrección queda registrada con fecha y hora, y se puede deshacer.</p><ul class="panel">' + (bit || '<li class="vacio">Todavía no hay resoluciones.</li>') + '</ul></section>' +
  '</div>';
}

/* ---------- Administración ---------- */

function vistaAdmin() {
  const t = ADMIN_TABS.some(x => x[0] === S.ui.admin) ? S.ui.admin : 'cronograma';
  const sinSedes = REAL && !S.sedes.length && (t === 'cronograma' || t === 'personal');
  const cuerpo = sinSedes ? '<p class="panel vacio">Primero cargá una sede en la pestaña Sedes.</p>'
    : t === 'personas' ? adminPersonas() : t === 'sedes' ? adminSedes()
    : t === 'personal' ? adminPersonal() : t === 'licencias' ? adminLicencias() : t === 'feriados' ? adminFeriados() : t === 'reglas' ? adminReglas() : t === 'preliquidacion' ? adminLiquidacion() : adminCronograma();
  return '<div class="pagina">' +
    '<div class="titulo-pagina"><h1>Administración</h1><p>' + cap(fechaLarga(S.hoy)) + ', ' + hm(S.ahora) + '</p></div>' +
    (REAL ? primerosPasosHtml() : '') +
    '<nav class="subtabs" aria-label="Secciones de administración">' +
      ADMIN_TABS.map(x => '<button type="button" data-a="admin" data-tab="' + x[0] + '" id="adm-' + x[0] + '"' + (x[0] === t ? ' aria-current="true"' : '') + '>' + x[1] + '</button>').join('') +
    '</nav>' + cuerpo +
  '</div>';
}
function regla(k, titulo, unidad, texto, min, max) {
  return '<div class="regla"><label for="p-' + k + '">' + titulo + '</label><span class="par"><input type="number" id="p-' + k + '" data-param="' + k + '" min="' + min + '" max="' + max + '" value="' + S.P[k] + '"><span>' + unidad + '</span></span><p>' + texto + '</p></div>';
}

function diaGrilla(o, y, alto, col) {
  const esHoy = o.f === S.hoy;
  let estado, cuerpo = '';
  if (!o.franjas.length) estado = '<span class="pill">Sin contrato</span>';
  else if (o.falta) estado = '<span class="pill crit-alta">Falta cubrir</span>';
  else estado = '<span class="pill est-resuelta">Cubierto</span>';
  for (const x of o.franjas) cuerpo += '<div class="g-franja" style="top:' + y(x.ti) + 'px;height:' + (y(x.tf) - y(x.ti)) + 'px"></div>';
  /* Quienes se superponen comparten el ancho en carriles; quien está solo en su horario lo ocupa entero. */
  const grupos = [];
  let g = null;
  for (const p of o.personas) {
    if (!g || p.ti >= g.fin) { g = { fin: 0, carriles: [], bloques: [] }; grupos.push(g); }
    let l = g.carriles.findIndex(t => t <= p.ti);
    if (l < 0) { l = g.carriles.length; g.carriles.push(0); }
    g.carriles[l] = p.tf;
    g.fin = Math.max(g.fin, p.tf);
    g.bloques.push({ p: p, l: l });
  }
  for (const gr of grupos) {
    const n = gr.carriles.length, ancho = 78 / n, angosto = n === 2, vertical = n >= 3;
    for (const b of gr.bloques) {
      const p = b.p, altoB = y(p.tf) - y(p.ti);
      const que = p.lic ? TIPOS_LIC[p.lic.tipo] : modTexto(p.a.modalidad);
      const texto = vertical
        ? '<b>' + esc(corto(p.c)) + '</b>'
        : angosto
          ? '<b>' + esc(p.c ? p.c.nombre : '') + '</b>' + (p.lic ? '<span>' + LIC_CORTA[p.lic.tipo] + '</span>' : '<span>' + hm(p.a.ti) + '</span><span class="tercero">' + hm(p.a.tf) + '</span>')
          : '<b>' + esc(corto(p.c)) + '</b><span>' + hm(p.a.ti) + ' a ' + hm(p.a.tf) + '</span><span class="tercero">' + que + '</span>';
      cuerpo += '<div class="g-pers' + (p.lic ? ' aus' : '') + (angosto ? ' angosto' : '') + (vertical ? ' vertical' : '') + (altoB < 70 ? ' bajo' : '') + (altoB < 40 ? ' minimo' : '') + '" style="top:' + y(p.ti) + 'px;height:' + altoB + 'px;left:' + (b.l * ancho).toFixed(2) + '%;width:' + ancho.toFixed(2) + '%" title="' + esc(nombreCompleto(p.c) + ', ' + hm(p.a.ti) + ' a ' + hm(p.a.tf) + ', ' + que.toLowerCase() + (p.viene ? ', viene del día anterior' : '')) + '">' + texto + '</div>';
    }
  }
  for (const s of o.segmentos) {
    const altoS = y(s.tf) - y(s.ti);
    const dice = (s.falta ? 'Falta ' + s.falta + (s.falta === 1 ? ' persona' : ' personas') : 'Cubierto') + ' de ' + hm(s.ti) + ' a ' + (s.tf === 1440 ? '24:00' : hm(s.tf)) + ': ' + s.pres + ' de ' + s.req;
    cuerpo += '<div class="g-seg ' + (s.falta ? 'falta' : 'ok') + '" style="top:' + y(s.ti) + 'px;height:' + altoS + 'px" title="' + dice + '" aria-label="' + dice + '">' + (altoS >= 16 ? '<b>' + s.pres + '/' + s.req + '</b>' : '') + '</div>';
  }
  return '<div class="g-dia' + (esHoy ? ' hoy' : '') + '" style="grid-column:' + col + '"><div class="g-cab"><span class="g-fecha"><strong>' + cap(fechaCorta(o.f)) + (esHoy ? ', hoy' : '') + '</strong>' + pillFeriado(o.f) + '</span>' + estado + '</div><div class="g-cuerpo" style="height:' + alto + 'px">' + cuerpo + '</div></div>';
}

function adminCronograma() {
  const sede = S.sedes.some(s => s.id === S.ui.sedeGrilla) ? S.ui.sedeGrilla : S.sedes[0].id;
  const lunes = S.ui.semana || lunesDe(S.hoy);
  const dias = SEMANA.map(i => sumarDias(lunes, i - 1));
  const cbs = dias.map(f => coberturaDia(S, sede, f));
  let t0 = 1440, t1 = 0;
  for (const o of cbs) for (const x of o.franjas.concat(o.personas)) { t0 = Math.min(t0, x.ti); t1 = Math.max(t1, x.tf); }
  if (t0 >= t1) { t0 = 480; t1 = 1080; }
  t0 = Math.max(0, Math.floor(t0 / 60) * 60 - 60);
  t1 = Math.min(1440, Math.ceil(t1 / 60) * 60 + 60);
  const largo = t1 - t0 > 900;
  const px = largo ? 0.5 : 0.7, paso = largo ? 120 : 60;
  const alto = Math.round((t1 - t0) * px);
  const y = m => Math.round((Math.min(t1, Math.max(t0, m)) - t0) * px);
  let eje = '';
  for (let h = Math.ceil(t0 / paso) * paso; h <= t1; h += paso) eje += '<span style="top:' + y(h) + 'px">' + (h === 1440 ? '24:00' : hm(h)) + '</span>';

  const selSedes = S.sedes.map(s => {
    const n = dias.filter(f => coberturaDia(S, s.id, f).falta).length;
    return '<button type="button" data-a="sede-grilla" data-sede="' + s.id + '" id="sg-' + s.id + '"' + (s.id === sede ? ' aria-current="true"' : '') + '><b>' + esc(s.nombre) + '</b><span>' + (n ? n + (n === 1 ? ' día con franjas sin cubrir' : ' días con franjas sin cubrir') : 'Semana cubierta') + '</span></button>';
  }).join('');

  const d = S.ui.drafts;
  const franjas = S.franjas.filter(x => x.sede === sede).sort((a, b) => a.ti - b.ti);
  const filasFr = franjas.map(x => {
    const at = 'data-franja="' + x.id + '"';
    return '<li class="fila-flex">' + diasHtml('fr-dia-' + x.id, at + ' data-campo="dia"', x.dias) +
      '<span class="par"><input type="time" id="fr-ti-' + x.id + '" ' + at + ' data-campo="ti" value="' + hm(x.ti) + '" aria-label="Desde"><span>a</span><input type="time" id="fr-tf-' + x.id + '" ' + at + ' data-campo="tf" value="' + hm(x.tf) + '" aria-label="Hasta"></span>' +
      (x.tf > 1440 ? '<span class="pill">Termina al día siguiente</span>' : x.tf - x.ti === 1440 ? '<span class="pill">Las 24 horas</span>' : '') +
      '<span class="par"><input type="number" class="corto" id="fr-dot-' + x.id + '" ' + at + ' data-campo="dot" min="1" max="30" value="' + x.dot + '" aria-label="Personas contratadas"><span>' + (x.dot === 1 ? 'persona' : 'personas') + '</span></span>' +
      '<button class="btn chico empuja" type="button" data-a="quitar-franja" data-id="' + x.id + '" id="fr-q-' + x.id + '">Quitar</button></li>';
  }).join('');
  const formFr = '<form class="form-alta" data-form="franja" novalidate>' +
    '<fieldset class="campo"><legend>Días</legend>' + diasHtml('nf-dia', 'data-draftdia="frDias" data-base="7"', borradorDias('frDias', SEMANA)) + '</fieldset>' +
    '<label class="campo" for="nf-ti">Desde<input type="time" id="nf-ti" data-draft="frTi" value="' + esc(d.frTi || '08:00') + '"></label>' +
    '<label class="campo" for="nf-tf">Hasta<input type="time" id="nf-tf" data-draft="frTf" value="' + esc(d.frTf || '12:00') + '"></label>' +
    '<label class="campo" for="nf-dot">Personas<input type="number" id="nf-dot" data-draft="frDot" min="1" max="30" value="' + esc(d.frDot || '1') + '"></label>' +
    '<button class="btn primario" type="submit" id="btn-franja">Agregar franja contratada</button>' +
    '<p class="error" role="alert">' + esc(S.ui.errores.franja || '') + '</p>' +
  '</form>';

  const hs = huecos(S, 28).map(h => {
    const n = h.fechas.length, cuando = n === 1 ? cap(fechaLarga(h.fechas[0])) + '.' : n + ' días entre el ' + fechaMedia(h.fechas[0]) + ' y el ' + fechaMedia(h.fechas[n - 1]) + '.';
    return '<li class="renglon dos"><div><p class="nombre">' + esc(sedeNombre(S, h.sede)) + ', ' + hm(h.ti) + ' a ' + hm(h.tf) + '</p><p class="sub">Falta ' + h.falta + (h.falta === 1 ? ' persona' : ' personas') + (h.causa === 'sin asignación' ? ', sin asignación' : ': ' + esc(h.causa)) + '. ' + cuando + '</p></div>' +
      '<div class="renglon-accion"><button class="btn chico" type="button" data-a="ver-hueco" data-sede="' + h.sede + '" data-f="' + h.fechas[0] + '">Ver en la grilla</button></div></li>';
  }).join('');

  return '<section class="seccion" id="grilla-seccion">' +
      '<h2>Grilla por sede</h2><p class="bajada">Cada columna es un día, de lunes a domingo. La banda de color es el horario contratado por el cliente y los bloques son las personas asignadas. La tira de la derecha cuenta las personas asignadas sobre las contratadas: en rojo, falta gente.</p>' +
      '<div class="sedes-sel">' + selSedes + '</div>' +
      '<div class="panel">' +
        '<div class="semana-nav"><strong>Semana ' + rango(dias[0], dias[6]) + '</strong>' +
          '<button class="btn chico" type="button" data-a="semana" data-d="-7" id="sem-ant">Semana anterior</button>' +
          '<button class="btn chico" type="button" data-a="semana" data-d="0" id="sem-hoy">Esta semana</button>' +
          '<button class="btn chico" type="button" data-a="semana" data-d="7" id="sem-sig">Semana siguiente</button></div>' +
        '<div class="grilla-wrap"><div class="grilla" style="--hora:' + Math.round(60 * px) + 'px"><div class="g-eje" style="height:' + alto + 'px">' + eje + '</div>' + cbs.map((o, i) => diaGrilla(o, y, alto, i + 2)).join('') + '</div></div>' +
        '<ul class="leyenda"><li><span class="m-franja"></span>Horario contratado</li><li><span class="m-pers"></span>Persona asignada</li><li><span class="m-pers aus"></span>Con licencia, vacaciones o franco</li><li><span class="m-seg"></span>Asignadas sobre contratadas: cubierto</li><li><span class="m-seg falta"></span>Falta gente</li></ul>' +
      '</div></section>' +
    '<section class="seccion"><h2>Horario contratado en ' + esc(sedeNombre(S, sede)) + '</h2><p class="bajada">Lo que el cliente contrató: días, franja horaria y cuántas personas tienen que estar. Si la hora de fin no es posterior a la de inicio, la franja termina al día siguiente.</p>' +
      '<div class="panel"><ul>' + (filasFr || '<li class="vacio">Esta sede todavía no tiene horario contratado.</li>') + '</ul>' + formFr + '</div></section>' +
    '<section class="seccion"><h2>Franjas sin cubrir en las próximas cuatro semanas</h2><p class="bajada">Todas las sedes, desde hoy. Se cubren con una asignación nueva o una cobertura con fecha desde ' + (REAL ? 'Asignaciones' : 'Personal y asignaciones') + '.</p>' +
      '<ul class="panel">' + (hs || '<li class="vacio">Todo el horario contratado está cubierto.</li>') + '</ul></section>';
}

function adminPersonal() {
  const d = S.ui.drafts;
  let filas = '';
  for (const c of S.colabs) {
    const n = esc(nombreCompleto(c));
    asigsDe(S, c.id).forEach((a, i) => {
      const at = 'data-asig="' + a.id + '"';
      const vig = a.desde || a.hasta ? (a.desde && a.hasta ? cap(rango(a.desde, a.hasta)) : a.desde ? 'Desde el ' + fechaMedia(a.desde) : 'Hasta el ' + fechaMedia(a.hasta)) : 'Permanente';
      filas += '<tr>' +
        '<td>' + (i === 0 && !REAL ? '<input type="text" id="c-nombre-' + c.id + '" data-colab="' + c.id + '" value="' + n + '" maxlength="60" aria-label="Nombre">' : (REAL && i === 0 ? '<span class="nombre">' + n + '</span>' : '<span class="mismo">' + (REAL ? '' : n) + '</span>')) + '</td>' +
        '<td><select id="a-sede-' + a.id + '" ' + at + ' data-campo="sede" aria-label="Sede">' + sedesOp(a.sede) + '</select></td>' +
        '<td>' + diasHtml('a-dia-' + a.id, at + ' data-campo="dia"', a.dias) + '</td>' +
        '<td><span class="par"><input type="time" id="a-ti-' + a.id + '" ' + at + ' data-campo="ti" value="' + hm(a.ti) + '" aria-label="Inicio del turno"><span>a</span><input type="time" id="a-tf-' + a.id + '" ' + at + ' data-campo="tf" value="' + hm(a.tf) + '" aria-label="Fin del turno"></span></td>' +
        '<td><select id="a-mod-' + a.id + '" ' + at + ' data-campo="modalidad" aria-label="Modalidad de pago">' + modOp(a.modalidad) + '</select></td>' +
        '<td><span class="par"><input type="number" id="a-valor-' + a.id + '" ' + at + ' data-campo="valor" value="' + a.valor + '" min="1" step="100" aria-label="' + (a.modalidad === 'hora' ? 'Valor hora' : 'Monto fijo mensual') + '"><span>' + (a.modalidad === 'hora' ? 'por hora' : 'por mes') + '</span></span></td>' +
        '<td>' + vig + '</td>' +
        '<td><label class="tilde"><input type="checkbox" id="a-activa-' + a.id + '" ' + at + ' data-campo="activa"' + (a.activa ? ' checked' : '') + ' aria-label="Asignación activa"></label></td>' +
      '</tr>';
    });
  }
  const al = alertas(S);
  const elegibles = S.colabs.filter(c => c.activa !== false);
  const selC = d.asigColab || (REAL ? (elegibles[0] || {}).id : 'nuevo'), mod = d.asigMod || 'hora';
  const form = '<form class="form-alta" data-form="asig" novalidate>' +
    '<label class="campo" for="as-colab">Colaborador<select id="as-colab" data-draft="asigColab">' + (REAL ? '' : '<option value="nuevo"' + (selC === 'nuevo' ? ' selected' : '') + '>Nuevo colaborador</option>') +
      elegibles.map(c => '<option value="' + c.id + '"' + (c.id === selC ? ' selected' : '') + '>' + esc(nombreCompleto(c)) + '</option>').join('') + '</select></label>' +
    (selC === 'nuevo' ? '<label class="campo" for="as-nombre">Nombre y apellido<input type="text" id="as-nombre" data-draft="asigNombre" maxlength="60" value="' + esc(d.asigNombre || '') + '"></label>' : '') +
    '<label class="campo" for="as-sede">Sede<select id="as-sede" data-draft="asigSede">' + sedesOp(d.asigSede || (S.sedes.filter(s => s.activa !== false)[0] || S.sedes[0]).id) + '</select></label>' +
    '<fieldset class="campo"><legend>Días</legend>' + diasHtml('as-dia', 'data-draftdia="asigDias" data-base="5"', borradorDias('asigDias', [1, 2, 3, 4, 5])) + '</fieldset>' +
    '<label class="campo" for="as-ti">Turno desde<input type="time" id="as-ti" data-draft="asigTi" value="' + esc(d.asigTi || '08:00') + '"></label>' +
    '<label class="campo" for="as-tf">Turno hasta<input type="time" id="as-tf" data-draft="asigTf" value="' + esc(d.asigTf || '14:00') + '"></label>' +
    '<label class="campo" for="as-mod">Modalidad de pago<select id="as-mod" data-draft="asigMod">' + modOp(mod) + '</select></label>' +
    '<label class="campo" for="as-valor">' + (mod === 'hora' ? 'Valor hora' : 'Monto fijo mensual') + '<input type="number" id="as-valor" data-draft="asigValor" min="1" step="100" value="' + esc(d.asigValor || valorSugerido(S, mod) || '') + '"></label>' +
    '<label class="campo" for="as-desde">Vigente desde, opcional<input type="date" id="as-desde" data-draft="asigDesde" value="' + esc(d.asigDesde || '') + '"></label>' +
    '<label class="campo" for="as-hasta">Vigente hasta, opcional<input type="date" id="as-hasta" data-draft="asigHasta" value="' + esc(d.asigHasta || '') + '"></label>' +
    '<button class="btn primario" type="submit" id="btn-asig">Agregar asignación</button>' +
    '<p class="error" role="alert">' + esc(S.ui.errores.asig || '') + '</p>' +
  '</form>';
  return '<section class="seccion"><h2>' + (REAL ? 'Asignaciones' : 'Personal y asignaciones') + '</h2><p class="bajada">' + (REAL ? 'Las personas se dan de alta en la pestaña Personas. ' : '') + 'Una asignación es una persona en una sede, con sus días, su turno y su modalidad de pago. Quien trabaja en dos sedes tiene dos, y cada una puede ser fija o por hora. En una misma sede hay una sola: el tiempo de más ahí es hora extra. Un turno que termina antes de la hora en que empieza cruza la medianoche.</p>' +
    '<div class="panel"><div class="tabla-wrap"><table class="tabla-edit"><thead><tr><th>Colaborador</th><th>Sede</th><th>Días</th><th>Turno asignado</th><th>Modalidad</th><th>' + (REAL ? 'Valor' : 'Valor de ejemplo') + '</th><th>Vigencia</th><th>Activa</th></tr></thead><tbody>' + filas + '</tbody></table></div>' +
    (al.length ? '<ul class="alertas">' + al.map(x => '<li class="nota obs">' + esc(x.texto) + '</li>').join('') + '</ul>' : '') +
    form + '</div></section>';
}

function adminLicencias() {
  const d = S.ui.drafts;
  const ls = S.licencias.slice().sort((a, b) => {
    const pa = a.hasta < S.hoy ? 1 : 0, pb = b.hasta < S.hoy ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return pa ? (a.desde < b.desde ? 1 : -1) : (a.desde < b.desde ? -1 : 1);
  });
  const filas = ls.map(l => {
    const c = colab(S, l.c);
    const estado = l.hasta < S.hoy ? '<span class="pill">Terminada</span>' : l.desde <= S.hoy ? '<span class="pill est-en_curso">En curso</span>' : '<span class="pill est-resuelta">Próxima</span>';
    const sedes = asigsDe(S, l.c).filter(a => a.activa).map(a => sedeNombre(S, a.sede)).join(' y ');
    return '<tr><td><span class="nombre">' + esc(nombreCompleto(c)) + '</span></td><td>' + TIPOS_LIC[l.tipo] + '</td><td>' + cap(rango(l.desde, l.hasta)) + '</td><td class="num">' + diasCorridos(l.desde, l.hasta) + '</td><td>' + esc(sedes || 'Sin asignaciones') + '</td><td>' + estado + '</td>' +
      '<td class="num"><button class="btn chico" type="button" data-a="quitar-licencia" data-id="' + l.id + '" id="lic-q-' + l.id + '">Quitar</button></td></tr>';
  }).join('');
  const manana = sumarDias(S.hoy, 1);
  const form = '<form class="form-alta" data-form="licencia" novalidate>' +
    '<label class="campo" for="li-colab">Colaborador<select id="li-colab" data-draft="licColab">' + S.colabs.map(c => '<option value="' + c.id + '"' + (c.id === d.licColab ? ' selected' : '') + '>' + esc(nombreCompleto(c)) + '</option>').join('') + '</select></label>' +
    '<label class="campo" for="li-tipo">Tipo<select id="li-tipo" data-draft="licTipo">' + Object.keys(TIPOS_LIC).map(k => '<option value="' + k + '"' + (k === (d.licTipo || 'vacaciones') ? ' selected' : '') + '>' + TIPOS_LIC[k] + '</option>').join('') + '</select></label>' +
    '<label class="campo" for="li-desde">Primer día<input type="date" id="li-desde" data-draft="licDesde" value="' + esc(d.licDesde || manana) + '"></label>' +
    '<label class="campo" for="li-hasta">Último día<input type="date" id="li-hasta" data-draft="licHasta" value="' + esc(d.licHasta || d.licDesde || manana) + '"></label>' +
    '<button class="btn primario" type="submit" id="btn-licencia">Cargar ausencia</button>' +
    '<p class="error" role="alert">' + esc(S.ui.errores.licencia || '') + '</p>' +
  '</form>';
  return '<section class="seccion"><h2>Licencias y vacaciones</h2><p class="bajada">Al cargar una ausencia, esos días quedan justificados en el semáforo, la persona no tiene que fichar y la grilla muestra su franja sin cubrir para que se pueda asignar un reemplazo.</p>' +
    '<div class="panel"><div class="tabla-wrap"><table><thead><tr><th>Colaborador</th><th>Tipo</th><th>Fechas</th><th class="num">Días corridos</th><th>Sedes que deja sin cubrir</th><th>Estado</th><th class="num">Acción</th></tr></thead><tbody>' +
    (filas || '<tr><td colspan="7">No hay ausencias cargadas.</td></tr>') + '</tbody></table></div>' + form + '</div></section>';
}

function adminFeriados() {
  const d = S.ui.drafts;
  const sugerido = S.P.recFeriado === SUGERIDO.recFeriado && S.P.recNoLab === SUGERIDO.recNoLab;
  const desde = mesDe(S.hoy) + '-01';
  const filas = S.feriados.filter(x => x.f >= desde).map(x => {
    const paso = x.f < S.hoy, imp = paso ? null : impactoFeriado(S, x);
    return '<tr><td><span class="nombre">' + cap(fechaLarga(x.f)) + ' de ' + x.f.slice(0, 4) + '</span></td><td>' + esc(x.nombre) + (x.propio ? ' <span class="pill">Agregado</span>' : '') + (x.nota ? '<span class="sub">' + esc(x.nota) + '</span>' : '') + '</td>' +
      '<td><select id="fe-tipo-' + x.f + '" data-feriado="' + x.f + '" aria-label="Tipo de día">' + Object.keys(TIPOS_FERIADO).map(k => '<option value="' + k + '"' + (k === x.tipo ? ' selected' : '') + '>' + TIPOS_FERIADO[k] + '</option>').join('') + '</select></td>' +
      '<td class="num">' + (paso ? 'Ya pasó' : imp.turnos) + '</td><td class="num">' + (paso ? '' : imp.porHora ? imp.porHora + (imp.porHora === 1 ? ' turno, ' : ' turnos, ') + dur(imp.minHora) : 'Ninguno') + '</td><td class="num">' + (paso ? '' : '<strong>' + ARS.format(imp.recargo) + '</strong>') + '</td>' +
      '<td class="num"><button class="btn chico" type="button" data-a="quitar-feriado" data-f="' + x.f + '" id="fe-q-' + x.f + '">Quitar</button></td></tr>';
  }).join('');
  const form = '<form class="form-alta" data-form="feriado" novalidate>' +
    '<label class="campo" for="fe-f">Fecha<input type="date" id="fe-f" data-draft="ferF" value="' + esc(d.ferF || '') + '"></label>' +
    '<label class="campo" for="fe-nombre">Nombre<input type="text" id="fe-nombre" data-draft="ferNombre" maxlength="80" value="' + esc(d.ferNombre || '') + '"></label>' +
    '<label class="campo" for="fe-tipo">Tipo<select id="fe-tipo" data-draft="ferTipo">' + Object.keys(TIPOS_FERIADO).map(k => '<option value="' + k + '"' + (k === (d.ferTipo || 'feriado') ? ' selected' : '') + '>' + TIPOS_FERIADO[k] + '</option>').join('') + '</select></label>' +
    '<button class="btn primario" type="submit" id="btn-feriado">Agregar fecha</button>' +
    '<p class="error" role="alert">' + esc(S.ui.errores.feriado || '') + '</p>' +
  '</form>';
  return '<section class="seccion"><h2>Tratamiento sugerido para el pago por hora</h2><p class="bajada">El sistema separa las horas trabajadas en feriado y propone cómo pagarlas. La sugerencia sigue el criterio general de la Ley de Contrato de Trabajo: feriado nacional trabajado, pago doble; día no laborable, pago simple. Pueden cambiarla, y conviene validarla con su asesor laboral.</p>' +
      '<div class="panel reglas">' +
        regla('recFeriado', 'Hora trabajada en feriado nacional', '% de recargo', 'Sugerido: ' + SUGERIDO.recFeriado + '. La hora se paga doble.', 0, 300) +
        regla('recNoLab', 'Hora trabajada en día no laborable', '% de recargo', 'Sugerido: ' + SUGERIDO.recNoLab + '. La hora se paga simple.', 0, 300) +
        '<div class="regla"><p class="nombre">Asignaciones fijas</p><p>Se liquidan según convenio. El sistema cuenta sus horas en feriado y las muestra aparte, sin calcular importe.</p>' +
          (sugerido ? '<p><span class="pill est-resuelta">Usando lo sugerido</span></p>' : '<button class="btn chico" type="button" data-a="sugerido" id="btn-sugerido">Volver a lo sugerido</button>') + '</div>' +
      '</div></section>' +
    '<section class="seccion"><h2>Calendario de feriados</h2><p class="bajada">Agenda nacional: lo que queda de 2026 y el calendario 2027 que surge de la Ley 27.399. Faltan los días no laborables con fines turísticos de 2027, que todavía no se publicaron: se agregan desde acá, igual que los feriados provinciales o los asuetos propios. Para cada fecha que viene, el sistema estima, con las asignaciones de hoy, cuántos turnos por hora caen ese día y cuánto suma el recargo.</p>' +
      '<div class="panel"><div class="tabla-wrap"><table class="tabla-fer"><thead><tr><th>Fecha</th><th>Nombre</th><th>Tipo</th><th class="num">Turnos ese día</th><th class="num">Por hora</th><th class="num">Recargo estimado</th><th class="num">Acción</th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="7">No hay fechas cargadas.</td></tr>') + '</tbody></table></div>' + form + '</div></section>';
}

function adminReglas() {
  return '<section class="seccion"><h2>Reglas del semáforo</h2><p class="bajada">Cambiá un valor y todos los turnos se vuelven a calcular, también los de días anteriores.</p>' +
      '<div class="panel reglas">' +
        regla('gracia', 'Gracia de llegada', 'minutos', 'Hasta esta demora el turno sigue en verde.', 0, 180) +
        regla('rojo', 'Demora que pasa a rojo', 'minutos', 'Entre la gracia y este valor queda en amarillo. Por encima, en rojo.', 0, 180) +
        regla('margen', 'Margen de salida', 'minutos', 'Con más tiempo de más que este valor se abre el control excedente.', 0, 180) +
      '</div></section>' +
    '<section class="seccion"><h2>Topes de horas por día</h2><p class="bajada">Se pueden cambiar cuando haga falta. Cada cambio le llega como aviso al supervisor, igual que cada asignación que supera el tope. No bloquean la carga.</p>' +
      '<div class="panel reglas">' +
        regla('topeFijo', 'Tope en asignaciones fijas', 'horas', 'Suma de las horas fijas de una persona en el día.', 1, 24) +
        regla('topeHora', 'Tope para quien trabaja por hora', 'horas', 'Total del día de una persona con algún turno por hora, contando también sus horas fijas.', 1, 24) +
        regla('traslado', 'Tiempo mínimo entre sedes', 'minutos', 'Avisa cuando el fin de un turno y el inicio del siguiente en otra sede quedan más cerca que esto.', 0, 180) +
      '</div></section>';
}

/* ---------- Preliquidación: lo previsto del mes contra lo cumplido ---------- */

/* Porcentaje para mostrar: no dice 100 si todavía falta algo, ni 0 si ya hay algo. */
function porc(x) {
  const n = Math.round(x * 100);
  return (x > 0 && n < 1 ? 1 : x < 1 && n > 99 ? 99 : n) + ' %';
}
function cuantos(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
/* Una duración con las horas separadas de a miles, para los totales: 1.092 h. */
function durTotal(min) { return dur(min).replace(/^\d{4,}/, n => n.replace(/\B(?=(\d{3})+$)/g, '.')); }
function mesLiq() { return mesesLiquidables(S).indexOf(S.ui.mesLiq) >= 0 ? S.ui.mesLiq : mesDe(S.hoy); }
/* La barra: lo cumplido sobre lo previsto del mes. Mientras el mes corre, la marca señala dónde debería ir con los turnos ya cerrados. */
function barraAvance(t, enCurso, grande) {
  const p = x => Math.max(0, Math.min(100, Math.round(x * 1000) / 10));
  const dice = 'Cumplido ' + porc(t.avance) + ' de lo previsto para el mes' + (enCurso ? '. Con los turnos ya cerrados debería ir en ' + porc(t.esperado) : '') + '.';
  return '<span class="avance' + (grande ? ' grande' : '') + '" role="img" aria-label="' + dice + '" title="' + dice + '"><span class="av-pista">' +
    (enCurso ? '<span class="av-esp" style="width:' + p(t.esperado) + '%"></span>' : '') + '<span class="av-hecho" style="width:' + p(t.avance) + '%"></span></span>' +
    (enCurso && t.esperado > 0 ? '<span class="av-marca" style="left:' + p(t.esperado) + '%"></span>' : '') + '</span>';
}
function avanceCelda(t, enCurso) {
  const pie = '<strong>' + nb(porc(t.avance)) + '</strong>' + (enCurso && (t.cerrados || t.impHoy) ? '<span class="sub">' + nb('debería ir en ' + porc(t.esperado)) + '</span>' : '');
  return barraAvance(t, enCurso) + '<span class="av-pie">' + pie + '</span>';
}
function desviosHtml(v) {
  const ps = v.desvios.map(d => {
    if (d.tipo === 'falta') return '<span class="pill ' + (d.grave ? 'crit-alta' : 'crit-media') + '">Faltan ' + dur(d.min) + '</span>' + (d.inasistencias ? '<span class="sub">' + cuantos(d.inasistencias, 'inasistencia', 'inasistencias') + '</span>' : '');
    if (d.tipo === 'extra') return '<span class="pill">Extra: ' + dur(d.min) + '</span>';
    const que = [d.min ? dur(d.min) + ' de más' : '', d.sinSalida ? d.sinSalida + ' sin salida' : ''].filter(Boolean).join(' y ');
    return '<span class="pill est-en_curso">En revisión: ' + (que || cuantos(d.turnos, 'turno', 'turnos')) + '</span>';
  }).join('');
  if (ps) return '<span class="desvios">' + ps + '</span>';
  return v.cerrados ? '<span class="pill est-resuelta">Al día</span>' : '<span class="sub">Sin turnos cerrados</span>';
}
function situacionTexto(v) {
  if (!v.desvios.length) return v.cerrados ? 'Al día' : 'Sin turnos cerrados';
  return cap(v.desvios.map(d => d.tipo === 'falta' ? 'por debajo' : d.tipo === 'extra' ? 'con horas extra' : 'con turnos en revisión').join(', '));
}
function quienLiq(c, a) {
  return '<span class="nombre">' + esc(nombreCompleto(c)) + '</span><span class="sub">' + esc(sedeNombre(S, a.sede)) + ', ' + modTexto(a.modalidad).toLowerCase() + '</span><span class="sub">' + ARS.format(a.valor) + (a.modalidad === 'hora' ? ' la hora' : ' al mes') + '</span>';
}
/* Horas en feriado y en día no laborable de una asignación, y qué pasa con ellas: por hora suman recargo; lo fijo va según convenio. */
function feriadoLiq(a, fer) {
  const rec = recargoDe(S, a, fer);
  return (fer.feriado ? dur(fer.feriado) : 'Nada') + (fer.no_laborable ? '<span class="sub">no&nbsp;laborable: ' + nb(dur(fer.no_laborable)) + '</span>' : '') +
    (a.modalidad === 'hora' ? (rec ? '<span class="sub">incluye&nbsp;' + ARS.format(rec) + ' por&nbsp;feriado</span>' : '') : fer.feriado + fer.no_laborable ? '<span class="sub">feriado según&nbsp;convenio</span>' : '');
}
function filaLiq(c, v, enCurso) {
  const a = v.a, r = v.r;
  const chips = [['verde', r.verde], ['estrella', r.estrella], ['amarillo', r.amarillo], ['rojo', r.rojo], ['revision', r.revision]].filter(x => x[1] > 0).map(x => chip(x[0], x[1])).join('');
  return '<tr><td>' + quienLiq(c, a) + '</td>' +
    '<td class="num"><strong>' + ARS.format(v.impMes) + '</strong><span class="sub">' + nb(dur(v.prev) + ' en ' + cuantos(v.turnos, 'turno', 'turnos')) + '</span>' +
      (v.parcial ? '<span class="sub">' + nb('por parte del mes') + '</span>' : '') + (v.justificados ? '<span class="sub">' + nb(cuantos(v.justificados, 'justificado', 'justificados')) + '</span>' : '') + '</td>' +
    '<td class="c-avance">' + avanceCelda(v, enCurso) + '</td>' +
    '<td class="num"><strong>' + ARS.format(v.impCumplido) + '</strong><span class="sub">' + nb(v.cerrados ? dur(v.cumplido) + ' de ' + dur(v.prevHoy) : 'Nada todavía') + '</span></td>' +
    '<td class="num">' + feriadoLiq(a, r.fer) + '</td>' +
    '<td>' + desviosHtml(v) + '</td>' +
    '<td><span class="chips">' + chips + '</span></td></tr>';
}
/* El mes que viene todavía no empezó: de cada asignación se muestra solo lo previsto. */
function filaPrevista(c, v) {
  return '<tr><td>' + quienLiq(c, v.a) + '</td>' +
    '<td class="num"><strong>' + ARS.format(v.impMes) + '</strong>' + (v.parcial ? '<span class="sub">' + nb('por parte del mes') + '</span>' : '') + '</td>' +
    '<td class="num">' + nb(dur(v.prev)) + '<span class="sub">' + nb(cuantos(v.turnos, 'turno', 'turnos')) + '</span></td>' +
    '<td class="num">' + feriadoLiq(v.a, v.fer) + '</td>' +
    '<td class="num">' + (v.justificados ? nb(cuantos(v.justificados, 'turno', 'turnos')) : 'Ninguna') + '</td></tr>';
}
function totalPrevisto(clase, texto, t) {
  return '<tr' + (clase ? ' class="' + clase + '"' : '') + '><td>' + texto + '</td><td class="num"><strong>' + ARS.format(t.impMes) + '</strong></td><td class="num">' + nb(durTotal(t.prev)) + '<span class="sub">' + nb(cuantos(t.turnos, 'turno', 'turnos')) + '</span></td><td colspan="2"></td></tr>';
}
function totalLiq(clase, texto, t, enCurso) {
  return '<tr' + (clase ? ' class="' + clase + '"' : '') + '><td>' + texto + '</td><td class="num"><strong>' + ARS.format(t.impMes) + '</strong></td><td class="c-avance">' + avanceCelda(t, enCurso) + '</td>' +
    '<td class="num"><strong>' + ARS.format(t.impCumplido) + '</strong></td><td colspan="3"></td></tr>';
}
function resumenLiq(P) {
  const t = P.total, sinCumplir = (P.enCurso ? t.impHoy : t.impMes) - t.impCumplido;
  const cifra = (titulo, valor, sub) => '<div><p class="cifra-t">' + titulo + '</p><p class="cifra">' + valor + '</p><p class="sub">' + sub + '</p></div>';
  if (P.futuro) {
    let recargo = 0;
    for (const p of P.personas) for (const v of p.lineas) recargo += recargoDe(S, v.a, v.fer);
    return '<div class="panel liq-resumen"><div class="cifras">' +
        cifra('Previsto del mes', ARS.format(t.impMes), durTotal(t.prev) + ' en ' + cuantos(t.turnos, 'turno', 'turnos')) +
        cifra('Recargo por feriados', ARS.format(recargo), recargo ? 'Ya está incluido en lo previsto' : 'Ningún turno por hora cae en feriado con recargo') +
        cifra('Equipo', cuantos(P.personas.length, 'persona', 'personas'), cuantos(t.lineas, 'asignación', 'asignaciones') + ' con turnos en el mes') +
      '</div><p class="liq-pie">Es lo que le tocaría cobrar al equipo si se cumplen todos los turnos.</p></div>';
  }
  const notas = [
    t.debajo ? '<span class="pill crit-media">' + cuantos(t.debajo, 'asignación por debajo', 'asignaciones por debajo') + '</span>' : '',
    t.conExtra ? '<span class="pill">' + t.conExtra + ' con horas extra</span>' : '',
    t.aRevisar ? '<span class="pill est-en_curso">' + t.aRevisar + ' con turnos en revisión</span>' : ''
  ].filter(Boolean).join('');
  return '<div class="panel liq-resumen"><div class="cifras">' +
      cifra('Previsto del mes', ARS.format(t.impMes), durTotal(t.prev) + ' en ' + cuantos(t.turnos, 'turno', 'turnos')) +
      cifra(P.enCurso ? 'Cumplido hasta hoy' : 'Cumplido', ARS.format(t.impCumplido), t.cerrados ? durTotal(t.cumplido) + ' cumplidas de ' + durTotal(t.prevHoy) : 'Todavía no cerró ningún turno') +
      (P.enCurso
        ? cifra('Previsto a hoy', ARS.format(t.impHoy), t.cerrados ? cuantos(t.cerrados, 'turno cerrado', 'turnos cerrados') + (sinCumplir > 0 ? ', ' + ARS.format(sinCumplir) + ' sin cumplir' : '') : 'Empieza a contar cuando cierra el primer turno')
        : cifra('Sin cumplir', ARS.format(sinCumplir), durTotal(t.falta) + ' de los turnos del mes')) +
    '</div>' + barraAvance(t, P.enCurso, true) +
    '<p class="liq-pie"><strong>' + porc(t.avance) + '</strong> de lo previsto para el mes ' + (P.enCurso ? 'ya está cumplido.' : 'quedó cumplido.') + (P.enCurso && t.cerrados ? ' La marca muestra dónde debería ir con los turnos ya cerrados: ' + porc(t.esperado) + '.' : '') + '</p>' +
    (notas ? '<p class="liq-notas">' + notas + '</p>' : '') + '</div>';
}
function adminLiquidacion() {
  const ms = mesesLiquidables(S), mes = mesLiq(), actual = mesDe(S.hoy), P = preliquidacion(S, mes), t = P.total, nombre = nombreMes(mes + '-01');
  let filas = '';
  for (const p of P.personas) {
    for (const v of p.lineas) filas += P.futuro ? filaPrevista(p.c, v) : filaLiq(p.c, v, P.enCurso);
    if (p.lineas.length > 1) {
      const texto = 'Total de ' + esc(nombreCompleto(p.c)) + ', ' + p.lineas.length + ' asignaciones';
      filas += P.futuro ? totalPrevisto('subtotal', texto, p.total) : totalLiq('subtotal', texto, p.total, P.enCurso);
    }
  }
  const selector = '<div class="sedes-sel">' + ms.map(m => '<button type="button" data-a="liq-mes" data-mes="' + m + '" id="lm-' + m + '"' + (m === mes ? ' aria-current="true"' : '') + '><b>' + cap(nombreMes(m + '-01')) + '</b><span>' + (m === actual ? 'Mes en curso' : m < actual ? 'Mes cerrado' : 'Mes que viene') + '</span></button>').join('') + '</div>';
  const bajada = P.futuro
    ? 'Estimación del mes que viene: lo que le toca a cada asignación si se cumplen todos sus turnos, con los horarios, las ausencias y los feriados cargados hoy. Se actualiza sola cuando cambiás una asignación.'
    : P.enCurso
      ? 'Lo previsto sale de las asignaciones: los turnos del mes, por su valor. A medida que los turnos se cierran, el avance muestra cuánto ya se cumplió y dónde hay desvíos para corregir. Cuenta los turnos cerrados hasta el ' + fechaLarga(S.hoy) + '.'
      : 'Mes cerrado. Lo previsto son los turnos que le tocaron a cada asignación, y lo cumplido, sus horas validadas. Lo que siga en revisión se resuelve desde Supervisión.';
  const cabeza = '<h2>Preliquidación de ' + nombre + '</h2><p class="bajada">' + bajada + '</p>';
  if (!t.lineas) {
    return '<section class="seccion">' + cabeza + '<div class="liq-barra">' + selector + '</div>' +
      '<p class="panel vacio">' + (P.enCurso || P.futuro ? 'Todavía no hay turnos previstos para ' + nombre + '. Cuando cargues una asignación, acá aparece lo que le toca cobrar en el mes.' : 'No quedaron turnos de ' + nombre + '.') + '</p></section>';
  }
  const ejemplo = REAL ? '' : 'Valores de ejemplo. ';
  const tabla = P.futuro
    ? '<table class="tabla-liq"><thead><tr><th>Colaborador y asignación</th><th class="num">Previsto del mes</th><th class="num">Horas y turnos</th><th class="num">En feriado</th><th class="num">Ausencias cargadas</th></tr></thead><tbody>' + filas + '</tbody>' +
      '<tfoot>' + totalPrevisto('', 'Total del equipo', t) + '</tfoot></table>'
    : '<table class="tabla-liq"><thead><tr><th>Colaborador y asignación</th><th class="num">Previsto del mes</th><th>Avance</th><th class="num">Cumplido</th><th class="num">En feriado</th><th>Desvíos</th><th>Semáforo del mes</th></tr></thead><tbody>' + filas + '</tbody>' +
      '<tfoot>' + totalLiq('', 'Total del equipo', t, P.enCurso) + '</tfoot></table>';
  const pie = P.futuro
    ? ejemplo + 'Por hora: los turnos del mes por el valor hora, más el recargo de feriado. Fijo: el monto mensual, o la parte que le toca si la asignación no cubre todo el mes. Las ausencias cargadas no se esperan: por hora salen de lo previsto, y lo fijo no cambia.'
    : ejemplo + 'Por hora: lo previsto son los turnos del mes por el valor hora, más el recargo de feriado. Fijo: lo previsto es el monto mensual, o la parte que le toca si la asignación no cubre todo el mes; su avance sirve de control, y la liquidación va según convenio. Lo cumplido son las horas validadas de los turnos cerrados, sin descontar los minutos dentro de la tolerancia: un turno en verde cuenta completo. Los turnos justificados no cuentan como faltante. La hora extra y el descuento por inasistencia todavía no suman ni restan importe: figuran en Desvíos. La planilla trae estos datos, el detalle turno por turno y una columna para cargar ajustes.';
  return '<section class="seccion">' + cabeza +
    '<div class="liq-barra">' + selector + '<button class="btn primario" type="button" data-a="liq-planilla" id="btn-planilla">Descargar planilla de Excel</button></div>' +
    resumenLiq(P) +
    '<div class="panel"><div class="tabla-wrap">' + tabla + '</div><p class="pie-tabla">' + pie + '</p></div></section>';
}

/* La planilla de Excel de la preliquidación: el resumen por asignación con una columna para ajustar, el detalle turno por turno y las referencias. */
function planillaLiquidacion(P) {
  const h2 = min => Math.round(min / 60 * 100) / 100, dec = min => ({ v: h2(min), e: 'dec' }), ent = n => ({ v: n, e: 'entero' });
  const cols = [
    ['colab', 'Colaborador', 26], ['sede', 'Sede', 22], ['mod', 'Modalidad', 11], ['valor', 'Valor por hora o por mes ($)', 14],
    ['turnos', 'Turnos previstos del mes', 10], ['hPrev', 'Horas previstas del mes', 11], ['iPrev', 'Importe previsto del mes ($)', 15],
    ['cerr', 'Turnos cerrados', 9], ['hHoy', 'Horas previstas a la fecha', 11], ['hCum', 'Horas cumplidas', 11], ['hFalta', 'Horas que faltan', 10],
    ['inas', 'Inasistencias', 12], ['just', 'Turnos justificados', 11], ['hFer', 'Horas en feriado', 10], ['hNoLab', 'Horas en día no laborable', 11],
    ['rec', 'Recargo por feriado, ya incluido ($)', 14], ['iCum', 'Importe cumplido ($)', 15], ['av', 'Avance del mes', 9], ['cumpl', 'Cumplimiento a la fecha', 13],
    ['hExtra', 'Horas extra verificadas', 10], ['hRev', 'Horas en revisión', 10], ['sinSal', 'Turnos sin salida', 9], ['sit', 'Situación', 46],
    ['ajuste', 'Ajuste ($)', 13], ['liquidar', 'A liquidar ($)', 15]
  ];
  const L = {};
  cols.forEach((c, i) => { L[c[0]] = columna(i); });
  const razon = (arriba, abajo, n) => 'IF(' + L[abajo] + n + '=0,0,' + L[arriba] + n + '/' + L[abajo] + n + ')';
  const resumen = [cols.map(c => ({ v: c[1], e: 'titulo' }))];
  for (const p of P.personas) for (const v of p.lineas) {
    const n = resumen.length + 1, r = v.r, a = v.a;
    const f = {
      colab: nombreCompleto(p.c), sede: sedeNombre(S, a.sede), mod: modTexto(a.modalidad), valor: ent(a.valor),
      turnos: v.turnos, hPrev: dec(v.prev), iPrev: ent(v.impMes), cerr: v.cerrados, hHoy: dec(v.prevHoy), hCum: dec(v.cumplido),
      hFalta: { v: Math.round((h2(v.prevHoy) - h2(v.cumplido)) * 100) / 100, e: 'dec', f: L.hHoy + n + '-' + L.hCum + n },
      inas: r.inasistencias, just: v.justificados, hFer: dec(r.fer.feriado), hNoLab: dec(r.fer.no_laborable), rec: ent(recargoFeriado(S, a, r)), iCum: ent(v.impCumplido),
      av: { v: v.avance, e: 'pct', f: razon('iCum', 'iPrev', n) }, cumpl: { v: v.prevHoy ? v.cumplido / v.prevHoy : 0, e: 'pct', f: razon('hCum', 'hHoy', n) },
      hExtra: dec(r.extra), hRev: dec(r.enRevision), sinSal: r.sinSalida, sit: P.futuro ? 'Todavía no empezó' : situacionTexto(v),
      ajuste: { v: null, e: 'ajuste' }, liquidar: { v: v.impCumplido, e: 'entero', f: L.iCum + n + '+' + L.ajuste + n }
    };
    resumen.push(cols.map(c => f[c[0]]));
  }
  const ult = resumen.length, nt = ult + 1, t = P.total;
  const suma = (k, e) => ({ v: resumen.slice(1).reduce((s, fila) => { const c = fila[cols.findIndex(x => x[0] === k)]; return s + (c && typeof c === 'object' ? c.v || 0 : c || 0); }, 0), e: e, f: 'SUM(' + L[k] + '2:' + L[k] + ult + ')' });
  const tot = { colab: { v: 'Total del equipo', e: 'total' }, av: { v: t.avance, e: 'totalPct', f: razon('iCum', 'iPrev', nt) }, cumpl: { v: t.prevHoy ? t.cumplido / t.prevHoy : 0, e: 'totalPct', f: razon('hCum', 'hHoy', nt) } };
  for (const k of ['turnos', 'cerr', 'inas', 'just', 'sinSal', 'iPrev', 'rec', 'iCum', 'ajuste', 'liquidar']) tot[k] = suma(k, 'totalEntero');
  for (const k of ['hPrev', 'hHoy', 'hCum', 'hFalta', 'hFer', 'hNoLab', 'hExtra', 'hRev']) tot[k] = suma(k, 'totalDec');
  resumen.push(cols.map(c => tot[c[0]] || { v: null, e: 'total' }));

  const colsT = [['Fecha', 12], ['Día', 11], ['Colaborador', 26], ['Sede', 22], ['Modalidad', 11], ['Entrada prevista', 9], ['Salida prevista', 9], ['Entrada', 9], ['Salida', 9], ['Salida validada', 10],
    ['Horas previstas', 10], ['Horas cumplidas', 10], ['Horas extra verificadas', 10], ['Horas en revisión', 10], ['Semáforo', 13], ['Detalle', 38], ['Feriado', 32], ['Entrada por', 24], ['Salida por', 24]];
  const hm0 = m => (m == null ? null : { v: m, e: 'hora' }), turnos = [];
  for (const p of P.personas) for (const v of p.lineas) {
    const quien = nombreCompleto(p.c), mod = modTexto(v.a.modalidad);
    const linea = (f, sede, ti, tf, resto) => { const x = feriadoEl(S, f); return { f: f, quien: quien, ti: ti, fila: [{ v: f, e: 'fecha' }, cap(DIAS[diaSemana(f)]), quien, sedeNombre(S, sede), mod, hm0(ti), hm0(tf)].concat(resto.slice(0, 9), [x ? x.nombre : null], resto.slice(9)) }; };
    for (const j of S.jornadas) {
      if (j.a !== v.a.id || mesDe(j.f) !== P.mes) continue;
      const e = ev(S, j), hecho = j.cerrada && !j.justif;
      turnos.push(linea(j.f, j.sede, j.ti, j.tf, [hm0(j.entrada), hm0(j.salida), j.rev ? hm0(j.salidaVal) : null, j.justif ? null : dec(j.tf - j.ti), hecho ? dec(acreditado(j, e, S.P).min) : null,
        e.extra ? dec(e.extra) : null, e.enRevision ? dec(e.enRevision) : null, NOMBRE_ESTADO[e.estado] || '', e.detalle, j.metodoIn ? cap(METODO[j.metodoIn] || '') : null, j.metodoOut ? cap(METODO[j.metodoOut] || '') : null]));
    }
    for (const x of v.porVenir) turnos.push(linea(x.f, v.a.sede, x.ti, x.tf, [null, null, null, x.lic ? null : dec(x.tf - x.ti), null, null, null, x.lic ? 'Justificada' : 'Por venir', x.lic ? TIPOS_LIC[x.lic] + ' cargada' : 'Según la asignación de hoy', null, null]));
  }
  turnos.sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : a.quien < b.quien ? -1 : a.quien > b.quien ? 1 : a.ti - b.ti));

  const anio = P.mes.slice(0, 4), cuando = fechaMedia(S.hoy) + ' de ' + S.hoy.slice(0, 4) + ', ' + hm(S.ahora);
  const N = t0 => ({ v: t0, e: 'nota' }), B = t0 => ({ v: t0, e: 'negrita' });
  const refs = [
    [B('Preliquidación de ' + nombreMes(P.mes + '-01') + ' de ' + anio)],
    [N('Estado'), N(P.futuro ? 'Mes que viene. Todavía no empezó: todo es lo previsto con lo cargado hoy.' : P.enCurso ? 'Mes en curso. Cuenta los turnos cerrados hasta el ' + cuando + '.' : 'Mes cerrado.')],
    [N('Planilla generada'), N('El ' + cuando + '.')],
    [],
    [B('Cómo se calcula')],
    [N('Previsto del mes'), N('Los turnos del mes de cada asignación: los que ya quedaron registrados y, si el mes corre, los que faltan según la asignación de hoy.')],
    [N('Por hora'), N('Importe: las horas por el valor hora, más el recargo de feriado (' + S.P.recFeriado + ' % en feriado nacional y ' + S.P.recNoLab + ' % en día no laborable).')],
    [N('Fijo'), N('El importe previsto es el monto mensual, o la parte que le toca si la asignación no cubre todo el mes. El importe cumplido avanza con las horas cumplidas. Sirve de control: la liquidación va según convenio.')],
    [N('Horas cumplidas'), N('Las horas validadas de los turnos cerrados, dentro del horario del turno y sin descontar los minutos de tolerancia (' + S.P.gracia + ' min al llegar y al salir). Un turno en verde o con estrella cuenta completo.')],
    [N('Turnos justificados'), N('Licencia, vacaciones, franco o ausencia con aviso. No cuentan como faltante: por hora salen de lo previsto y en lo fijo se dan por cumplidos.')],
    [N('Horas extra y en revisión'), N('No suman importe. Las extra ya las verificó supervisión. Las que están en revisión esperan que supervisión las resuelva.')],
    [N('Ajuste y A liquidar'), N('La columna Ajuste viene vacía para cargar sumas o descuentos. A liquidar es el importe cumplido más el ajuste.')],
    [N('Semáforo'), N('Verde: turno correcto. Amarillo: llegó o salió fuera de la tolerancia de ' + S.P.gracia + ' min. Rojo: inasistencia o demora mayor a ' + S.P.rojo + ' min. Estrella: hora extra verificada.')]
  ];
  return [
    { nombre: 'Preliquidación', anchos: cols.map(c => c[2]), fijas: 1, filtro: ult, apaisada: true, filas: resumen },
    { nombre: 'Turnos', anchos: colsT.map(c => c[1]), fijas: 1, filtro: true, apaisada: true, filas: [colsT.map(c => ({ v: c[0], e: 'titulo' }))].concat(turnos.map(x => x.fila)) },
    { nombre: 'Referencias', anchos: [28, 110], filas: refs }
  ];
}
/* Arma la planilla del mes que se está mirando y la baja al equipo. Devuelve el nombre del archivo. */
function descargarPlanilla() {
  const P = preliquidacion(S, mesLiq()), p = S.hoy.split('-').map(Number), nombre = 'preliquidacion-' + P.mes + '.xlsx';
  const bytes = xlsx(planillaLiquidacion(P), { a: p[0], m: p[1], d: p[2], h: Math.floor(S.ahora / 60), mi: S.ahora % 60 });
  const url = URL.createObjectURL(new Blob([bytes], { type: TIPO_XLSX }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return nombre;
}

/* ---------- Dibujo ---------- */

function render() {
  if (REAL && !antesDeDibujar()) return;
  if (!S) return;
  const act = document.activeElement && document.activeElement.id;
  const sc = $('#pantalla'), top = sc ? sc.scrollTop : 0;
  const r = ruta();
  if (!REAL) {
    $('#reloj-fecha').textContent = cap(fechaLarga(S.hoy));
    $('#reloj-hora').value = hm(S.ahora);
    document.querySelectorAll('.roles a').forEach(a => {
      if (a.getAttribute('href') === '#' + r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  $('#vista').innerHTML = r === 'supervisor' ? vistaSupervisor() : r === 'administracion' ? vistaAdmin() : vistaColab();
  const sc2 = $('#pantalla');
  if (sc2) sc2.scrollTop = S.ui.arriba ? 0 : top;
  S.ui.arriba = false;
  S.ui.festejo = null;
  if (act) {
    const el = document.getElementById(act);
    if (el && el !== document.activeElement) { try { el.focus({ preventScroll: true }); } catch (e) { /* sin foco */ } }
  }
  guardar();
  if (REAL) despuesDeDibujar();
}

function ponerHora(min) {
  if (min == null || isNaN(min)) { aviso('Escribí una hora válida.'); render(); return; }
  if (min < S.ahora) { aviso('El reloj de la demo solo avanza. Para volver atrás, reiniciá la demo o pasá al día siguiente.'); render(); return; }
  S.ahora = Math.min(1439, min);
  tick(S);
  render();
}
/* Lo que la persona declara al cerrar. Si falta algo, deja el mensaje en `k.error` y devuelve null. */
function datosCierre(j, k, d, val) {
  const rel = relDe(S, j), exc = rel - j.tf;
  k.error = '';
  if (exc > S.P.margen) {
    if (k.que === 'extra') return { conf: false, decl: { tipo: 'extra', hora: null, texto: String(d.cierreTexto || '').trim().slice(0, 200) } };
    if (k.que === 'olvido') {
      const h = aRel(j, aMin(val('cierre-hora')));
      if (h == null) k.error = 'Indicá a qué hora terminaste.';
      else if (h <= j.entrada || h > rel) k.error = 'La hora tiene que estar entre tu entrada y ahora.';
      else return { conf: false, decl: { tipo: 'olvido', hora: h, texto: '' } };
    } else k.error = 'Elegí qué pasó con el tiempo de más.';
  } else if (k.otras) {
    const t = String(d.cierreTexto || '').trim();
    if (!t) k.error = 'Contanos qué fue distinto o volvé a confirmar tus horas.';
    else return { conf: false, decl: { tipo: 'otras', hora: null, texto: t.slice(0, 200) } };
  } else if (!k.ok) k.error = 'Confirmá tus horas antes de cerrar.';
  else return { conf: true, decl: null };
  return null;
}
function limpiarColab() { S.ui.cierre = null; S.ui.recien = null; S.ui.descargo = null; S.ui.errores = {}; S.ui.arriba = true; }
function alternarDia(lista, dia, marcado) {
  const l = lista.slice(), i = l.indexOf(dia);
  if (marcado && i < 0) l.push(dia);
  if (!marcado && i >= 0) l.splice(i, 1);
  return l.sort((a, b) => a - b);
}

/* ---------- Eventos ---------- */

document.addEventListener('click', ev0 => {
  const b = ev0.target.closest('[data-a]');
  if (!b) return;
  if (REAL && clicReal(b)) return;
  if (!S) return;
  const a = b.dataset.a, c = colabSel(S);
  const act = c ? tramoActual(S, c.id) : null;
  let subir = false;
  if (a === 'tab') { limpiarColab(); S.ui.tab = b.dataset.tab; }
  else if (a === 'entrada') {
    const j = act ? marcarEntrada(S, act.id) : null;
    if (j) aviso('Entrada registrada a las ' + hm(j.entrada) + ' en ' + sedeNombre(S, j.sede) + '.');
  }
  else if (a === 'abrir-cierre') {
    if (act) { act.manual = true; act.tocada = true; }
    S.ui.cierre = { ok: false, otras: false, que: null, error: '' };
    S.ui.drafts.cierreTexto = ''; S.ui.drafts.cierreHora = ''; S.ui.arriba = true;
  }
  else if (a === 'cancelar-cierre') S.ui.cierre = null;
  else if (a === 'otras-horas') { if (S.ui.cierre) { S.ui.cierre.otras = !S.ui.cierre.otras; S.ui.cierre.ok = false; S.ui.cierre.error = ''; } }
  else if (a === 'proximo') { S.ui.recien = null; S.ui.arriba = true; }
  else if (a === 'abrir-descargo') { S.ui.descargo = b.dataset.j; S.ui.drafts.descargo = ''; S.ui.errores.descargo = ''; }
  else if (a === 'hora') { ponerHora(Number(b.dataset.min)); return; }
  else if (a === 'mas') { ponerHora(Math.min(1439, S.ahora + Number(b.dataset.min))); return; }
  else if (a === 'dia') { avanzarDia(S); limpiarColab(); S.ui.detalle = null; S.ui.tab = 'hoy'; S.ui.semana = lunesDe(S.hoy); aviso('Empezó el ' + fechaLarga(S.hoy) + '. Son las ' + hm(S.ahora) + '.'); }
  else if (a === 'reiniciar') { S = sembrar(); aviso('Demo reiniciada con los datos de ejemplo.'); }
  else if (a === 'asistido') {
    const que = fichajeAsistido(S, b.dataset.j);
    if (que) aviso(cap(S.bitacora[0].texto) + '.');
  }
  else if (a === 'detalle') S.ui.detalle = S.ui.detalle === b.dataset.j ? null : b.dataset.j;
  else if (a === 'deshacer') { deshacer(S, b.dataset.b); aviso('Resolución deshecha.'); }
  else if (a === 'quitar-aviso') quitarAviso(S, b.dataset.id);
  else if (a === 'admin') { S.ui.admin = b.dataset.tab; S.ui.errores = {}; }
  else if (a === 'sede-grilla') S.ui.sedeGrilla = b.dataset.sede;
  else if (a === 'semana') { const n = Number(b.dataset.d); S.ui.semana = n ? sumarDias(S.ui.semana || lunesDe(S.hoy), n) : lunesDe(S.hoy); }
  else if (a === 'ver-hueco') { S.ui.sedeGrilla = b.dataset.sede; S.ui.semana = lunesDe(b.dataset.f); S.ui.admin = 'cronograma'; subir = true; }
  else if (a === 'quitar-franja') { quitarFranja(S, b.dataset.id); aviso('Franja contratada quitada.'); }
  else if (a === 'quitar-licencia') { quitarLicencia(S, b.dataset.id); aviso('Ausencia quitada.'); }
  else if (a === 'quitar-feriado') { quitarFeriado(S, b.dataset.f); aviso('Fecha quitada del calendario.'); }
  else if (a === 'sugerido') { ponerParam(S, 'recFeriado', SUGERIDO.recFeriado); ponerParam(S, 'recNoLab', SUGERIDO.recNoLab); aviso('Tratamiento sugerido aplicado.'); }
  else if (a === 'liq-mes') S.ui.mesLiq = b.dataset.mes;
  else if (a === 'liq-planilla') {
    try { aviso('Planilla descargada: ' + descargarPlanilla() + '.'); } catch (e) { aviso('No pudimos armar la planilla. Probá de nuevo.'); }
  }
  render();
  if (subir) { const g = $('#grilla-seccion'); if (g) { try { g.scrollIntoView({ block: 'start' }); } catch (e) { /* sin desplazamiento */ } } }
});

document.addEventListener('input', ev0 => {
  const t = ev0.target;
  if (!S || !t.dataset || !t.dataset.draft) return;
  if (t.type === 'radio' && !t.checked) return;
  S.ui.drafts[t.dataset.draft] = t.value;
  guardar();
});

document.addEventListener('change', ev0 => {
  const t = ev0.target;
  if (!S || !t || !t.dataset) return;
  const ds = t.dataset;
  if (REAL && cambioReal(t)) return;
  if (t.id === 'reloj-hora') { ponerHora(aMin(t.value)); return; }
  if (t.id === 'sel-colab') { elegirColab(S, t.value); limpiarColab(); render(); return; }
  if (t.name === 'que' && S.ui.cierre) { S.ui.cierre.que = t.value; S.ui.cierre.error = ''; render(); return; }
  if (t.id === 'cierre-ok' && S.ui.cierre) { S.ui.cierre.ok = t.checked; S.ui.cierre.error = ''; guardar(); return; }
  if (ds.caso) {
    if (ds.campo === 'que') { S.ui.casos[ds.caso] = { que: t.value }; render(); }
    else { const j = porId(S, ds.caso); S.ui.casos[ds.caso] = Object.assign({}, S.ui.casos[ds.caso], { hora: j ? aRel(j, aMin(t.value)) : null, error: '' }); guardar(); }
    return;
  }
  let err = null;
  const avisosAntes = S.avisos.length;
  if (ds.colab) err = editarNombre(S, ds.colab, t.value);
  else if (ds.asig) err = editarAsig(S, ds.asig, ds.campo, t.type === 'checkbox' ? t.checked : t.value, ds.dia);
  else if (ds.franja) err = editarFranja(S, ds.franja, ds.campo, t.type === 'checkbox' ? t.checked : t.value, ds.dia);
  else if (ds.feriado) err = editarFeriado(S, ds.feriado, t.value);
  else if (ds.param) err = ponerParam(S, ds.param, t.value);
  if (err !== null) {
    if (err) aviso(err);
    else if (S.avisos.length > avisosAntes) aviso(ds.param ? 'Tope actualizado. Supervisión ya tiene el aviso.' : 'La asignación supera el tope diario. Supervisión ya tiene el aviso.');
    render();
    return;
  }
  if (ds.nov) { estadoNovedad(S, ds.nov, t.value); render(); return; }
  if (ds.draftdia) { S.ui.drafts[ds.draftdia] = alternarDia(borradorDias(ds.draftdia, ds.base === '7' ? SEMANA : [1, 2, 3, 4, 5]), Number(ds.dia), t.checked); guardar(); return; }
  if (ds.draft) {
    if (t.type === 'radio' && !t.checked) return;
    S.ui.drafts[ds.draft] = t.value;
    if (t.id === 'as-mod') { S.ui.drafts.asigValor = ''; render(); return; }
    if (t.id === 'as-colab') { render(); return; }
    if (t.id === 'li-desde' && (!S.ui.drafts.licHasta || S.ui.drafts.licHasta < t.value)) { S.ui.drafts.licHasta = t.value; render(); return; }
    guardar();
  }
});

document.addEventListener('submit', ev0 => {
  const f = ev0.target.closest('form[data-form]');
  if (!f) return;
  ev0.preventDefault();
  if (REAL) { envioReal(f); return; }
  if (!S) return;
  const tipo = f.dataset.form, c = colabSel(S), d = S.ui.drafts;
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const limpiar = claves => claves.forEach(k => { delete d[k]; });
  if (tipo === 'cierre') {
    const j = c ? tramoActual(S, c.id) : null, k = S.ui.cierre;
    if (!j || j.entrada == null || !k) { render(); return; }
    const datos = datosCierre(j, k, d, val);
    if (datos) {
      const jc = cerrarJornada(S, j.id, datos);
      S.ui.cierre = null; S.ui.arriba = true;
      if (jc) { S.ui.festejo = jc.id; S.ui.recien = jc.id; }
    }
  }
  else if (tipo === 'olvido') {
    const err = declararOlvido(S, f.dataset.j, aMin(val('olvido-hora')));
    S.ui.errores.olvido = err;
    if (!err) aviso('Enviado. Tu supervisor lo va a revisar.');
  }
  else if (tipo === 'descargo') {
    const err = enviarDescargo(S, f.dataset.j, d.descargo);
    S.ui.errores.descargo = err;
    if (!err) { S.ui.descargo = null; d.descargo = ''; aviso('Enviado a tu supervisor. Gracias por avisar.'); }
  }
  else if (tipo === 'novedad') {
    const archivo = $('#nov-foto');
    const foto = archivo && archivo.files && archivo.files[0] ? archivo.files[0].name : '';
    const err = agregarNovedad(S, c.id, { tipo: d.novTipo || 'insumos', crit: d.novCrit || 'media', texto: d.novTexto, foto: foto, sede: val('nov-sede') });
    S.ui.errores.nov = err;
    if (!err) { d.novTexto = ''; aviso('Novedad enviada. Gracias por avisar.'); }
  }
  else if (tipo === 'resolver') {
    const id = f.dataset.j, marcado = f.querySelector('input[type="radio"]:checked'), j = porId(S, id);
    const que = marcado ? marcado.value : '', hora = aMin(val('val-' + id));
    const err = resolver(S, id, que, hora);
    if (err) S.ui.casos[id] = { que: que, hora: j ? aRel(j, hora) : null, error: err };
    else { delete S.ui.casos[id]; aviso('Resuelto. ' + cap(S.bitacora[0].texto) + '.'); }
  }
  else if (tipo === 'justificar') {
    const err = justificar(S, f.dataset.j, val('mot-' + f.dataset.j));
    aviso(err || cap(S.bitacora[0].texto) + '.');
  }
  else if (tipo === 'asig') {
    const colabId = val('as-colab'), antes = S.avisos.length;
    const err = agregarAsig(S, { colab: colabId, nombre: val('as-nombre'), sede: val('as-sede'), dias: borradorDias('asigDias', [1, 2, 3, 4, 5]), ti: val('as-ti'), tf: val('as-tf'), modalidad: val('as-mod'), valor: val('as-valor'), desde: val('as-desde'), hasta: val('as-hasta') });
    S.ui.errores.asig = err;
    if (!err) {
      limpiar(['asigColab', 'asigNombre', 'asigSede', 'asigDias', 'asigTi', 'asigTf', 'asigMod', 'asigValor', 'asigDesde', 'asigHasta']);
      aviso((colabId === 'nuevo' ? 'Colaborador agregado con su asignación.' : 'Asignación agregada.') + (S.avisos.length > antes ? ' Supera el tope diario: supervisión ya tiene el aviso.' : ''));
    }
  }
  else if (tipo === 'franja') {
    const err = agregarFranja(S, { sede: S.ui.sedeGrilla, dias: borradorDias('frDias', SEMANA), ti: val('nf-ti'), tf: val('nf-tf'), dot: val('nf-dot') });
    S.ui.errores.franja = err;
    if (!err) { limpiar(['frDias', 'frTi', 'frTf', 'frDot']); aviso('Franja contratada agregada.'); }
  }
  else if (tipo === 'licencia') {
    const err = agregarLicencia(S, { colab: val('li-colab'), tipo: val('li-tipo'), desde: val('li-desde'), hasta: val('li-hasta') });
    S.ui.errores.licencia = err;
    if (!err) { limpiar(['licColab', 'licTipo', 'licDesde', 'licHasta']); tick(S); aviso('Ausencia cargada. La grilla ya muestra las franjas que quedan sin cubrir.'); }
  }
  else if (tipo === 'feriado') {
    const err = agregarFeriado(S, { f: val('fe-f'), nombre: val('fe-nombre'), tipo: val('fe-tipo') });
    S.ui.errores.feriado = err;
    if (!err) { limpiar(['ferF', 'ferNombre', 'ferTipo']); aviso('Fecha agregada al calendario.'); }
  }
  render();
});

window.addEventListener('hashchange', render);

/* ---------- Arranque ---------- */

function arrancar(previo) {
  S = valido(previo) ? previo : (cargar() || sembrar());
  if (!S.ui.errores) S.ui.errores = {};
  if (!S.ui.drafts) S.ui.drafts = {};
  if (!S.ui.casos) S.ui.casos = {};
  if (!S.ui.semana) S.ui.semana = lunesDe(S.hoy);
  colabSel(S);
  render();
}
if (REAL) arrancarReal();
else {
  if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => S);
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(arrancar);
  else arrancar((window.claude && window.claude.hot && window.claude.hot.data) || null);
}
