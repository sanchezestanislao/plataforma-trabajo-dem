'use strict';

/* Reglas, datos de ejemplo y acciones. Sin acceso al DOM: este archivo se puede probar en Node.
   Modelo: un colaborador tiene una o más asignaciones (sede, días, turno, modalidad, valor).
   Cada asignación genera un tramo por día trabajado; el semáforo se calcula por tramo.
   Se trabaja todos los días, las 24 horas: los horarios se guardan en minutos desde las 00:00 del día
   en que empieza el tramo, y un turno nocturno termina pasado el minuto 1440. */

const VERSION = 3;
const CLAVE = 'prototipo-jornadas-v' + VERSION;
const INICIO = '2026-11-27';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIA_ISO = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SEMANA = [1, 2, 3, 4, 5, 6, 7];
/* Agenda nacional: lo que queda de 2026 y el calendario 2027 que surge de la Ley 27.399.
   Faltan los días no laborables con fines turísticos de 2027: se agregan cuando se publiquen. */
const CALENDARIO = [
  { f: '2026-11-23', nombre: 'Día de la Soberanía Nacional', tipo: 'feriado', nota: 'Trasladado del 20 de noviembre' },
  { f: '2026-12-07', nombre: 'Día no laborable con fines turísticos', tipo: 'no_laborable' },
  { f: '2026-12-08', nombre: 'Inmaculada Concepción de María', tipo: 'feriado' },
  { f: '2026-12-25', nombre: 'Navidad', tipo: 'feriado' },
  { f: '2027-01-01', nombre: 'Año Nuevo', tipo: 'feriado' },
  { f: '2027-02-08', nombre: 'Carnaval', tipo: 'feriado' },
  { f: '2027-02-09', nombre: 'Carnaval', tipo: 'feriado' },
  { f: '2027-03-24', nombre: 'Día Nacional de la Memoria por la Verdad y la Justicia', tipo: 'feriado' },
  { f: '2027-03-25', nombre: 'Jueves Santo', tipo: 'no_laborable' },
  { f: '2027-03-26', nombre: 'Viernes Santo', tipo: 'feriado' },
  { f: '2027-04-02', nombre: 'Día del Veterano y de los Caídos en la Guerra de Malvinas', tipo: 'feriado' },
  { f: '2027-05-01', nombre: 'Día del Trabajador', tipo: 'feriado' },
  { f: '2027-05-25', nombre: 'Día de la Revolución de Mayo', tipo: 'feriado' },
  { f: '2027-06-20', nombre: 'Paso a la Inmortalidad del General Manuel Belgrano', tipo: 'feriado' },
  { f: '2027-06-21', nombre: 'Paso a la Inmortalidad del General Martín Miguel de Güemes', tipo: 'feriado', nota: 'Trasladado del 17 de junio' },
  { f: '2027-07-09', nombre: 'Día de la Independencia', tipo: 'feriado' },
  { f: '2027-08-16', nombre: 'Paso a la Inmortalidad del General José de San Martín', tipo: 'feriado', nota: 'Trasladado del 17 de agosto' },
  { f: '2027-10-11', nombre: 'Día del Respeto a la Diversidad Cultural', tipo: 'feriado', nota: 'Trasladado del 12 de octubre' },
  { f: '2027-11-20', nombre: 'Día de la Soberanía Nacional', tipo: 'feriado', nota: 'Cae sábado: puede cambiar de fecha si sale una norma' },
  { f: '2027-12-08', nombre: 'Inmaculada Concepción de María', tipo: 'feriado' },
  { f: '2027-12-25', nombre: 'Navidad', tipo: 'feriado' }
];
const TIPOS_FERIADO = { feriado: 'Feriado nacional', no_laborable: 'Día no laborable' };
/* Recargo sugerido para la hora trabajada, en porcentaje sobre el valor hora. */
const SUGERIDO = { recFeriado: 100, recNoLab: 0 };
const MOTIVOS = { licencia: 'Licencia', vacaciones: 'Vacaciones', aviso: 'Ausencia con aviso', franco: 'Franco' };
const TIPOS_LIC = { vacaciones: 'Vacaciones', licencia: 'Licencia', franco: 'Franco' };
const LIC_FRASE = { vacaciones: 'de vacaciones', licencia: 'con licencia', franco: 'de franco' };
const TIPOS_NOV = { infra: 'Infraestructura crítica', equipo: 'Elementos o equipos dañados', insumos: 'Falta de insumos', otra: 'Otra solicitud' };
const CRITICIDAD = { baja: 'Baja', media: 'Media', alta: 'Alta' };
const ESTADOS_NOV = { abierta: 'Abierta', en_curso: 'En curso', resuelta: 'Resuelta' };
const MOTIVOS_EXTRA = [
  'Me quedé a terminar el encerado del hall.',
  'Hubo un derrame en el depósito y lo limpié antes de irme.',
  'Cubrí el sector de un compañero hasta que llegó el relevo.',
  'Me pidieron dejar lista la sala para un evento.'
];

/* ---------- Fechas y horas ---------- */

function pad(n) { return String(n).padStart(2, '0'); }
/* Hora del día de un minuto relativo: 1800 (las 06:00 del día siguiente) se muestra 06:00. */
function hm(m) {
  if (m == null) return 'Sin marcar';
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return pad(Math.floor(x / 60)) + ':' + pad(x % 60);
}
function aMin(s) {
  const p = /^(\d{1,2}):(\d{2})/.exec(s || '');
  if (!p) return null;
  const h = +p[1], mi = +p[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}
function dur(m) {
  m = Math.max(0, Math.round(m));
  const h = Math.floor(m / 60), r = m % 60;
  if (h && r) return h + ' h ' + r + ' min';
  if (h) return h + ' h';
  return r + ' min';
}
function cap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
function enLista(l) { return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1]; }
function fechaObj(iso) { const p = iso.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
function isoDe(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
function sumarDias(iso, n) { const d = fechaObj(iso); d.setUTCDate(d.getUTCDate() + n); return isoDe(d); }
function diasEntre(a, b) { return Math.round((fechaObj(b).getTime() - fechaObj(a).getTime()) / 86400000); }
function diaSemana(iso) { return fechaObj(iso).getUTCDay(); }
function dIso(iso) { return diaSemana(iso) || 7; }
function fechaLarga(iso) { const d = fechaObj(iso); return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()]; }
function fechaCorta(iso) { const d = fechaObj(iso); return DIAS_C[d.getUTCDay()] + ' ' + d.getUTCDate(); }
function fechaMedia(iso) { const d = fechaObj(iso); return d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()]; }
function mesDe(iso) { return iso.slice(0, 7); }
function nombreMes(iso) { return MESES[fechaObj(iso).getUTCMonth()]; }
function listaDias(ds) {
  const o = ds.slice().sort((a, b) => a - b), k = o.join('');
  if (o.length >= 7) return 'todos los días';
  if (k === '12345') return 'de lunes a viernes';
  if (k === '123456') return 'de lunes a sábado';
  const n = o.map(d => DIA_ISO[d] + (d >= 6 ? 's' : ''));
  if (n.length === 1) return 'los ' + n[0];
  return 'los ' + n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];
}
function lunesDe(iso) { return sumarDias(iso, 1 - dIso(iso)); }
function esFecha(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && isoDe(fechaObj(s)) === s; }
function vigente(a, f) { return (!a.desde || f >= a.desde) && (!a.hasta || f <= a.hasta); }
function seCruzan(x, y) { return (!x.hasta || !y.desde || y.desde <= x.hasta) && (!y.hasta || !x.desde || x.desde <= y.hasta); }
function diasCorridos(desde, hasta) { return Math.max(0, diasEntre(desde, hasta) + 1); }
/* Fin de un turno en minutos relativos: si la hora de fin no es posterior al inicio, termina al día siguiente. */
function finRel(ti, hasta) { return hasta > ti ? hasta : hasta + 1440; }
/* Hora del día llevada a minutos relativos de un tramo: lo anterior al inicio se entiende como del día siguiente. */
function aRel(j, m) { return m == null ? null : (m < j.ti % 1440 ? m + 1440 : m); }
function diasValidos(lista) {
  const o = [];
  for (const x of lista || []) { const d = Number(x); if (d >= 1 && d <= 7 && o.indexOf(d) < 0) o.push(d); }
  return o.sort((a, b) => a - b);
}

/* ---------- Azar reproducible para los datos de ejemplo ---------- */

function rnd(S) {
  let t = (S.rng = (S.rng + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function ent(S, a, b) { return a + Math.floor(rnd(S) * (b - a + 1)); }

/* ---------- Regla central: el estado de un tramo ----------
   P.gracia  minutos de tolerancia en la llegada (verde)
   P.rojo    demora a partir de la cual el tramo queda en rojo
   P.margen  minutos de más a partir de los cuales se abre el control excedente
   rel       la hora actual en minutos relativos al día del tramo */

function evaluar(j, P, rel) {
  const r = { estado: '', detalle: '', demora: 0, desde: j.ti, excedente: null, pendiente: false, extra: 0, normales: 0, enRevision: 0, inasistencia: false, enVivo: false };
  if (j.justif) {
    r.estado = 'justificada';
    r.detalle = MOTIVOS[j.justif] || 'Justificada';
    return r;
  }
  if (j.entrada == null) {
    if (!j.cerrada) {
      const d = rel == null ? -1 : rel - j.ti;
      if (d <= P.gracia) {
        r.estado = 'programada';
        r.detalle = d < 0 ? 'Turno sin empezar' : 'Todavía no ingresó';
        return r;
      }
      r.demora = d;
      r.enVivo = true;
      r.estado = d <= P.rojo ? 'amarillo' : 'rojo';
      r.detalle = 'Sin ingresar, ' + dur(d) + ' de demora';
      return r;
    }
    r.estado = 'rojo';
    r.detalle = 'Inasistencia';
    r.inasistencia = true;
    return r;
  }
  r.demora = Math.max(0, j.entrada - j.ti);
  const desde = Math.max(j.entrada, j.ti);
  r.desde = desde;
  if (!j.cerrada) {
    r.estado = 'en_curso';
    r.detalle = r.demora > P.gracia ? 'En curso, llegó ' + dur(r.demora) + ' tarde' : 'En curso';
    return r;
  }
  const sinSalida = j.salida == null;
  const exc = sinSalida ? null : j.salida - j.tf;
  const hayExc = sinSalida || exc > P.margen;
  const disputa = !!(j.decl && j.decl.tipo === 'otras');
  if ((hayExc || disputa) && !j.rev) {
    r.pendiente = true;
    r.estado = 'revision';
    r.excedente = exc;
    r.detalle = sinSalida ? 'En revisión: salida sin marcar' : hayExc ? 'En revisión: ' + dur(exc) + ' de más' : 'En revisión: horas declaradas distintas';
    r.normales = Math.max(0, Math.min(sinSalida ? j.tf : j.salida, j.tf) - desde);
    r.enRevision = hayExc && !sinSalida ? exc : 0;
    return r;
  }
  const salidaVal = j.rev ? j.salidaVal : j.salida;
  r.normales = Math.max(0, Math.min(salidaVal, j.tf) - desde);
  if (j.rev === 'extra') r.extra = Math.max(0, salidaVal - j.tf);
  if (r.demora > P.rojo) {
    r.estado = 'rojo';
    r.detalle = 'Llegada con ' + dur(r.demora) + ' de demora';
  } else {
    const obs = [];
    if (r.demora > P.gracia) obs.push('llegada ' + dur(r.demora) + ' tarde');
    if (j.rev === 'olvido') obs.push('salida sin marcar');
    const antes = j.tf - salidaVal;
    if (antes > P.gracia) obs.push('salida ' + dur(antes) + ' antes');
    if (obs.length) { r.estado = 'amarillo'; r.detalle = cap(obs.join(', ')); }
    else if (r.extra > 0) { r.estado = 'estrella'; r.detalle = 'Hora extra verificada: ' + dur(r.extra); }
    else { r.estado = 'verde'; r.detalle = 'Jornada completa'; }
  }
  if (r.extra > 0 && r.estado !== 'estrella') r.detalle += '. Hora extra verificada: ' + dur(r.extra);
  return r;
}

/* ---------- Consultas ---------- */

function colab(S, id) { return S.colabs.find(c => c.id === id) || null; }
function asig(S, id) { return S.asigs.find(a => a.id === id) || null; }
function asigsDe(S, cId) { return S.asigs.filter(a => a.c === cId); }
function porId(S, id) { return S.jornadas.find(j => j.id === id) || null; }
function sedeNombre(S, id) { const s = S.sedes.find(x => x.id === id); return s ? s.nombre : ''; }
function nombreCompleto(c) { return c ? c.nombre + (c.apellido ? ' ' + c.apellido : '') : ''; }
/* La hora simulada en minutos relativos al día en que empezó el tramo. */
function relDe(S, j) { return S.ahora + 1440 * diasEntre(j.f, S.hoy); }
function ev(S, j) { return evaluar(j, S.P, relDe(S, j)); }
function porInicio(a, b) { return a.f < b.f ? -1 : a.f > b.f ? 1 : a.ti - b.ti; }
function activos(S) { return S.colabs.filter(c => S.asigs.some(a => a.c === c.id && a.activa)); }
function colabSel(S) {
  const act = activos(S);
  let c = act.find(x => x.id === S.ui.colab) || null;
  if (!c) {
    c = act[0] || null;
    S.ui.colab = c ? c.id : null;
  }
  return c;
}
/* Un tramo cuenta para hoy si empieza hoy, o si es un turno nocturno de ayer que sigue abierto o cerró pasada la medianoche. */
function vivoHoy(S, j) {
  if (j.f === S.hoy) return true;
  if (j.tf <= 1440 || j.f !== sumarDias(S.hoy, -1)) return false;
  return !j.cerrada || (j.salida != null && j.salida > 1440);
}
function tramosHoy(S, cId) { return S.jornadas.filter(j => j.c === cId && vivoHoy(S, j)).sort(porInicio); }
function tramosDelDia(S) { return S.jornadas.filter(j => vivoHoy(S, j)); }
/* El tramo sobre el que actúa el colaborador: el que está abierto o, si no hay, el próximo sin empezar. */
function tramoActual(S, cId) {
  const ts = tramosHoy(S, cId).filter(j => !j.justif);
  return ts.find(j => !j.cerrada && j.entrada != null) || ts.find(j => !j.cerrada) || null;
}
function ultimoCerrado(S, cId) {
  const ts = tramosHoy(S, cId).filter(j => j.cerrada && !j.justif);
  return ts.length ? ts[ts.length - 1] : null;
}
function pendientes(S) {
  return S.jornadas.filter(j => ev(S, j).pendiente).sort((a, b) => -porInicio(a, b));
}
function pendienteDeclarar(S, cId) {
  let m = null;
  for (const j of S.jornadas) {
    if (j.c !== cId || !j.cerrada || j.entrada == null || j.salida != null || j.rev || j.decl || j.justif) continue;
    if (!m || j.f > m.f) m = j;
  }
  return m;
}
/* Días seguidos sin observaciones. Un día cuenta si todos sus tramos quedaron en verde o estrella. */
function racha(S, cId) {
  const porDia = {};
  for (const j of S.jornadas) if (j.c === cId) (porDia[j.f] = porDia[j.f] || []).push(j);
  const fechas = Object.keys(porDia).sort().reverse();
  let n = 0;
  for (const f of fechas) {
    const js = porDia[f];
    if (js.some(j => !j.cerrada && !j.justif)) continue;
    const es = js.map(j => ev(S, j).estado).filter(e => e !== 'justificada' && e !== 'revision');
    if (!es.length) continue;
    if (es.every(e => e === 'verde' || e === 'estrella')) n++;
    else break;
  }
  return n;
}

/* ---------- Feriados ---------- */

function feriadoEl(S, f) { return S.feriados.find(x => x.f === f) || null; }
/* Minutos del intervalo relativo [a, b] de un tramo que caen en feriado o en día no laborable. */
function minutosFeriado(S, j, a, b) {
  const o = { feriado: 0, no_laborable: 0 };
  for (let d = 0; d <= 2; d++) {
    const ini = Math.max(a, d * 1440), fin = Math.min(b, (d + 1) * 1440);
    if (fin <= ini) continue;
    const x = feriadoEl(S, sumarDias(j.f, d));
    if (x) o[x.tipo] += fin - ini;
  }
  return o;
}
function agregarFeriado(S, d) {
  const nombre = String(d.nombre || '').trim();
  if (!esFecha(d.f)) return 'Elegí la fecha.';
  if (!nombre) return 'Escribí el nombre del feriado.';
  if (!TIPOS_FERIADO[d.tipo]) return 'Elegí si es feriado o día no laborable.';
  if (feriadoEl(S, d.f)) return 'Esa fecha ya está en el calendario.';
  S.feriados.push({ f: d.f, nombre: nombre.slice(0, 80), tipo: d.tipo, propio: true });
  S.feriados.sort((a, b) => (a.f < b.f ? -1 : 1));
  return '';
}
function editarFeriado(S, f, tipo) {
  const x = feriadoEl(S, f);
  if (!x || !TIPOS_FERIADO[tipo]) return 'Elegí si es feriado o día no laborable.';
  x.tipo = tipo;
  return '';
}
function quitarFeriado(S, f) { S.feriados = S.feriados.filter(x => x.f !== f); }
/* Para un feriado que viene: cuántos turnos por hora caen ese día y cuánto sumaría el recargo. */
function impactoFeriado(S, x) {
  const rec = x.tipo === 'feriado' ? S.P.recFeriado : S.P.recNoLab, ayer = sumarDias(x.f, -1);
  const o = { turnos: 0, porHora: 0, minHora: 0, recargo: 0 };
  for (const a of S.asigs) {
    let min = 0;
    if (trabajaEl(a, x.f) && !licenciaEl(S, a.c, x.f)) { o.turnos++; min += Math.min(a.tf, 1440) - a.ti; }
    if (a.tf > 1440 && trabajaEl(a, ayer) && !licenciaEl(S, a.c, ayer)) min += a.tf - 1440;
    if (!min || a.modalidad !== 'hora') continue;
    o.porHora++;
    o.minHora += min;
    o.recargo += min / 60 * a.valor * rec / 100;
  }
  o.recargo = Math.round(o.recargo);
  return o;
}

/* ---------- Resumen para la preliquidación ---------- */

function resumen(S, filtro, mes) {
  const o = { verde: 0, amarillo: 0, rojo: 0, estrella: 0, revision: 0, justificada: 0, jornadas: 0, asignadas: 0, normales: 0, extra: 0, enRevision: 0, sinSalida: 0, inasistencias: 0, cerradasPorColab: 0, conEntrada: 0, fer: { feriado: 0, no_laborable: 0 } };
  for (const j of S.jornadas) {
    if (mesDe(j.f) !== mes || !filtro(j)) continue;
    const e = ev(S, j);
    if (e.estado === 'justificada') { o.justificada++; continue; }
    if (!j.cerrada) continue;
    o.jornadas++;
    o[e.estado]++;
    o.asignadas += j.tf - j.ti;
    o.normales += e.normales;
    o.extra += e.extra;
    o.enRevision += e.enRevision;
    if (e.normales > 0) {
      const m = minutosFeriado(S, j, e.desde, e.desde + e.normales);
      o.fer.feriado += m.feriado;
      o.fer.no_laborable += m.no_laborable;
    }
    if (e.pendiente && j.salida == null) o.sinSalida++;
    if (e.inasistencia) o.inasistencias++;
    if (j.entrada != null) { o.conEntrada++; if (j.metodoOut === 'qr') o.cerradasPorColab++; }
  }
  return o;
}
function resumenMes(S, cId, mes) { return resumen(S, j => j.c === cId, mes); }
function resumenAsig(S, aId, mes) { return resumen(S, j => j.a === aId, mes); }
/* Lo que suma el feriado trabajado en una asignación por hora, con el recargo que definió administración. */
function recargoFeriado(S, a, r) {
  if (a.modalidad !== 'hora') return 0;
  return Math.round((r.fer.feriado * S.P.recFeriado + r.fer.no_laborable * S.P.recNoLab) / 100 * a.valor / 60);
}
/* Base de una asignación: por hora, horas validadas por valor más recargo de feriado; fija, su monto (el resto, según convenio). */
function baseAsig(S, a, r) {
  if (a.modalidad !== 'hora') return a.valor;
  return Math.round(r.normales / 60 * a.valor) + recargoFeriado(S, a, r);
}

/* ---------- Topes de horas y avisos ---------- */

function avisar(S, texto) {
  S.avisos.unshift({ id: 'v' + (S.sig++), f: S.hoy, m: S.ahora, texto: texto });
  if (S.avisos.length > 20) S.avisos.length = 20;
}
function quitarAviso(S, id) { S.avisos = S.avisos.filter(x => x.id !== id); }
/* Tope del día para una persona: el de por hora si ese día tiene algún turno por hora, si no el de fijo. */
function topeDelDia(S, cId, f) {
  const hayHora = S.jornadas.some(j => j.c === cId && j.f === f && (asig(S, j.a) || {}).modalidad === 'hora');
  return hayHora ? S.P.topeHora : S.P.topeFijo;
}
function minutosDelDia(S, cId, f) {
  let n = 0;
  for (const j of S.jornadas) {
    if (j.c !== cId || j.f !== f || j.entrada == null) continue;
    const sal = j.rev ? j.salidaVal : (j.salida != null ? j.salida : j.tf);
    n += Math.max(0, sal - j.entrada);
  }
  return n;
}
/* Avisos de planificación de las próximas cuatro semanas: topes diarios y traslado entre sedes. */
function alertas(S) {
  const out = [];
  const sumar = (mapa, k, d) => { const l = (mapa[k] = mapa[k] || []); if (l.indexOf(d) < 0) l.push(d); };
  for (const c of S.colabs) {
    const porFijo = {}, porTotal = {}, porPar = {};
    for (let i = 0; i < 28; i++) {
      const f = sumarDias(S.hoy, i);
      if (licenciaEl(S, c.id, f)) continue;
      const d = dIso(f);
      const delDia = S.asigs.filter(a => a.c === c.id && trabajaEl(a, f)).sort((x, y) => x.ti - y.ti);
      if (!delDia.length) continue;
      const fijo = delDia.reduce((n, a) => n + (a.modalidad === 'fijo' ? a.tf - a.ti : 0), 0);
      const total = delDia.reduce((n, a) => n + (a.tf - a.ti), 0);
      if (fijo > S.P.topeFijo * 60) sumar(porFijo, fijo, d);
      if (delDia.some(a => a.modalidad === 'hora') && total > S.P.topeHora * 60) sumar(porTotal, total, d);
      for (let k = 1; k < delDia.length; k++) {
        const p = delDia[k - 1], q = delDia[k], gap = q.ti - p.tf;
        if (p.sede !== q.sede && gap < S.P.traslado) {
          const x = (porPar[p.id + '|' + q.id] = porPar[p.id + '|' + q.id] || { p: p, q: q, gap: gap, dias: [] });
          if (x.dias.indexOf(d) < 0) x.dias.push(d);
        }
      }
    }
    const n = nombreCompleto(c);
    for (const t of Object.keys(porFijo)) out.push({ tipo: 'tope', c: c.id, texto: n + ' suma ' + dur(Number(t)) + ' en asignaciones fijas ' + listaDias(porFijo[t]) + ', por encima del tope de ' + S.P.topeFijo + ' h.' });
    for (const t of Object.keys(porTotal)) out.push({ tipo: 'tope', c: c.id, texto: n + ' suma ' + dur(Number(t)) + ' ' + listaDias(porTotal[t]) + ', por encima del tope de ' + S.P.topeHora + ' h para quien trabaja por hora.' });
    for (const k of Object.keys(porPar)) {
      const x = porPar[k];
      out.push({ tipo: 'traslado', c: c.id, texto: n + ' tiene ' + dur(Math.max(0, x.gap)) + ' entre ' + sedeNombre(S, x.p.sede) + ' y ' + sedeNombre(S, x.q.sede) + ' ' + listaDias(x.dias) + ', menos que el mínimo de ' + S.P.traslado + ' min para trasladarse.' });
    }
  }
  return out;
}
/* Corre un cambio de asignaciones y le avisa al supervisor si aparece un exceso de tope nuevo. */
function conAvisoDeTope(S, cambio) {
  const antes = alertas(S).filter(x => x.tipo === 'tope').map(x => x.texto);
  const err = cambio();
  if (err) return err;
  for (const x of alertas(S)) if (x.tipo === 'tope' && antes.indexOf(x.texto) < 0) avisar(S, 'Asignación por encima del tope. ' + x.texto);
  return '';
}

/* ---------- Tramos y simulación del resto del equipo ---------- */

function nuevaJornada(S, a, f, guion) {
  return {
    id: 'j' + (S.sig++), a: a.id, c: a.c, f: f, sede: a.sede, ti: a.ti, tf: a.tf,
    entrada: null, salida: null, metodoIn: null, metodoOut: null, cerrada: false, conf: false,
    decl: null, rev: null, salidaVal: null, justif: null, descargo: null,
    guion: guion || null, manual: false, tocada: false
  };
}
function trabajaEl(a, f) { return a.activa && a.dias.indexOf(dIso(f)) >= 0 && vigente(a, f); }
function guionAleatorio(S, a) {
  const r = rnd(S), ti = a.ti, tf = a.tf;
  if (r < 0.70) return { in: ti + ent(S, -6, 4), out: tf + ent(S, 0, 8) };
  if (r < 0.78) return { in: ti + ent(S, 6, 14), out: tf + ent(S, 0, 6) };
  if (r < 0.82) return { in: ti + ent(S, 17, 40), out: tf + ent(S, 0, 6) };
  if (r < 0.89) return { in: ti + ent(S, -5, 3), out: tf + ent(S, 35, 120), decl: { tipo: 'extra', hora: null, texto: MOTIVOS_EXTRA[ent(S, 0, MOTIVOS_EXTRA.length - 1)] } };
  if (r < 0.93) return { in: ti + ent(S, -5, 3), out: null };
  if (r < 0.96) return { in: ti + ent(S, -5, 3), out: tf - ent(S, 10, 40) };
  return { in: null, out: null };
}
/* Hace avanzar a quienes no maneja el usuario según su guion, hasta la hora simulada. */
function tick(S) {
  const ayer = sumarDias(S.hoy, -1);
  for (const j of S.jornadas) {
    if ((j.f !== S.hoy && j.f !== ayer) || j.cerrada || j.manual || j.justif || !j.guion) continue;
    const g = j.guion, rel = relDe(S, j);
    if (j.entrada == null && g.in != null && rel >= g.in) { j.entrada = g.in; j.metodoIn = 'qr'; }
    if (j.entrada != null && j.salida == null && g.out != null && rel >= g.out) {
      j.salida = g.out; j.metodoOut = 'qr'; j.cerrada = true;
      if (g.out - j.tf > S.P.margen) j.decl = g.decl || null; else j.conf = true;
    }
  }
}
/* El teléfono de la demo maneja los tramos de una persona; los que no tocó vuelven a su guion al soltarla. */
function tomarControl(S, cId) { for (const j of tramosHoy(S, cId)) if (!j.cerrada) j.manual = true; }
function soltarControl(S, cId) { for (const j of tramosHoy(S, cId)) if (j.manual && !j.tocada) j.manual = false; }
function elegirColab(S, id) {
  if (S.ui.colab) soltarControl(S, S.ui.colab);
  S.ui.colab = id;
  tomarControl(S, id);
  tick(S);
}
function avanzarDia(S) {
  for (const j of S.jornadas) if (!j.cerrada && j.manual && !j.tocada) j.manual = false;
  S.ahora = 1439;
  tick(S);
  for (const j of S.jornadas) {
    if (j.cerrada) continue;
    if (j.f === S.hoy && j.tf > 1440) continue;
    j.cerrada = true;
    if (j.entrada != null && j.salida == null) j.metodoOut = 'auto';
  }
  S.hoy = sumarDias(S.hoy, 1);
  for (const a of S.asigs) if (trabajaEl(a, S.hoy)) S.jornadas.push(nuevaJornada(S, a, S.hoy, guionAleatorio(S, a)));
  aplicarLicenciasHoy(S);
  const c = colabSel(S);
  let inicio = 470;
  if (c) {
    const ts = tramosHoy(S, c.id).filter(j => !j.cerrada && !j.justif);
    const abierto = ts.find(j => j.entrada != null);
    if (abierto) inicio = abierto.tf - 1440 * diasEntre(abierto.f, S.hoy) - 10;
    else if (ts.length) inicio = ts[0].ti - 1440 * diasEntre(ts[0].f, S.hoy) - 10;
  }
  S.ahora = Math.min(1439, Math.max(0, inicio));
  if (c) tomarControl(S, c.id);
  tick(S);
}

/* ---------- Acciones del colaborador ---------- */

function marcarEntrada(S, jId, metodo) {
  const j = porId(S, jId);
  if (!j || !vivoHoy(S, j) || j.cerrada || j.entrada != null || j.justif) return null;
  j.entrada = relDe(S, j); j.metodoIn = metodo || 'qr'; j.manual = true; j.tocada = true;
  return j;
}
function cerrarJornada(S, jId, datos, metodo) {
  const j = porId(S, jId);
  if (!j || !vivoHoy(S, j) || j.cerrada || j.entrada == null) return null;
  j.salida = Math.max(relDe(S, j), j.entrada);
  j.metodoOut = metodo || 'qr'; j.cerrada = true; j.manual = true; j.tocada = true;
  j.conf = !!(datos && datos.conf);
  j.decl = (datos && datos.decl) || null;
  return j;
}
/* `hora` es la hora del día que declara el colaborador. */
function declararOlvido(S, jId, hora) {
  const j = porId(S, jId);
  if (!j) return 'No se encontró la jornada.';
  const h = aRel(j, hora);
  if (h == null) return 'Indicá a qué hora terminaste.';
  if (h <= j.entrada) return 'La salida tiene que ser posterior a tu entrada de las ' + hm(j.entrada) + '.';
  j.decl = { tipo: 'olvido', hora: h, texto: '' };
  return '';
}
function enviarDescargo(S, jId, texto) {
  const j = porId(S, jId);
  const t = String(texto || '').trim();
  if (!j) return 'No se encontró la jornada.';
  if (!t) return 'Escribí qué pasó antes de enviar.';
  j.descargo = t.slice(0, 280);
  return '';
}
/* La sede donde está o estuvo recién la persona: sirve de valor inicial para una novedad. */
function sedeActual(S, cId) {
  const ts = tramosHoy(S, cId).filter(j => !j.justif);
  const t = ts.find(j => !j.cerrada && j.entrada != null) || ultimoCerrado(S, cId) || ts[0];
  if (t) return t.sede;
  const a = asigsDe(S, cId)[0];
  return a ? a.sede : '';
}
function agregarNovedad(S, cId, d) {
  const t = String(d.texto || '').trim();
  if (!TIPOS_NOV[d.tipo]) return 'Elegí de qué se trata.';
  if (!CRITICIDAD[d.crit]) return 'Elegí la urgencia.';
  if (!t) return 'Contá qué pasó antes de enviar.';
  const sede = d.sede && S.sedes.some(s => s.id === d.sede) ? d.sede : sedeActual(S, cId);
  S.novedades.unshift({ id: 'n' + (S.sig++), c: cId, sede: sede, tipo: d.tipo, crit: d.crit, texto: t.slice(0, 400), foto: d.foto || '', f: S.hoy, m: S.ahora, estado: 'abierta' });
  return '';
}

/* ---------- Acciones del supervisor ---------- */

function anotar(S, tipo, jId, texto) {
  S.bitacora.unshift({ id: 'b' + (S.sig++), f: S.hoy, m: S.ahora, tipo: tipo, j: jId, texto: texto });
  if (S.bitacora.length > 40) S.bitacora.length = 40;
}
function quienDonde(S, j) { return nombreCompleto(colab(S, j.c)) + ', ' + fechaCorta(j.f) + ' en ' + sedeNombre(S, j.sede); }
function textoResolucion(S, j) {
  const quien = quienDonde(S, j) + ': ';
  if (j.rev === 'extra') return quien + 'hora extra verificada, ' + dur(j.salidaVal - j.tf);
  if (j.rev === 'olvido') return quien + 'olvido de salida, validada a las ' + hm(j.salidaVal);
  if (j.rev === 'ajuste') return quien + 'salida corregida a las ' + hm(j.salidaVal);
  return quien + 'se mantiene el registro';
}
/* `hora` es la hora del día que valida el supervisor. */
function resolver(S, jId, tipo, hora) {
  const j = porId(S, jId);
  if (!j) return 'No se encontró la jornada.';
  if (['extra', 'olvido', 'ajuste', 'ok'].indexOf(tipo) < 0) return 'Elegí qué pasó.';
  const h = tipo === 'ok' ? j.salida : aRel(j, hora);
  if (h == null) return 'Indicá la salida validada.';
  if (h <= j.entrada) return 'La salida tiene que ser posterior a la entrada de las ' + hm(j.entrada) + '.';
  if (tipo === 'extra' && h <= j.tf) return 'Para hora extra, la salida validada tiene que ser posterior a las ' + hm(j.tf) + '.';
  j.rev = tipo; j.salidaVal = h;
  anotar(S, 'rev', j.id, textoResolucion(S, j));
  return '';
}
function justificar(S, jId, motivo) {
  const j = porId(S, jId);
  if (!j || !MOTIVOS[motivo]) return 'Elegí un motivo.';
  j.justif = motivo;
  anotar(S, 'justif', j.id, quienDonde(S, j) + ': inasistencia justificada, ' + MOTIVOS[motivo].toLowerCase());
  return '';
}
function deshacer(S, bId) {
  const i = S.bitacora.findIndex(b => b.id === bId);
  if (i < 0) return;
  const b = S.bitacora[i], j = porId(S, b.j);
  if (j && b.tipo === 'rev') { j.rev = null; j.salidaVal = null; }
  if (j && b.tipo === 'justif') j.justif = null;
  S.bitacora.splice(i, 1);
}
function fichajeAsistido(S, jId) {
  const j = porId(S, jId);
  if (!j || !vivoHoy(S, j) || j.cerrada || j.justif) return '';
  const quien = nombreCompleto(colab(S, j.c)) + ' en ' + sedeNombre(S, j.sede);
  j.manual = true; j.tocada = true;
  if (j.entrada == null) {
    j.entrada = relDe(S, j); j.metodoIn = 'supervisor';
    anotar(S, 'asistido', j.id, quien + ': entrada asistida a las ' + hm(j.entrada));
    return 'entrada';
  }
  j.salida = Math.max(relDe(S, j), j.entrada); j.metodoOut = 'supervisor'; j.cerrada = true;
  anotar(S, 'asistido', j.id, quien + ': salida asistida a las ' + hm(j.salida));
  return 'salida';
}
function estadoNovedad(S, nId, estado) {
  const n = S.novedades.find(x => x.id === nId);
  if (n && ESTADOS_NOV[estado]) n.estado = estado;
}

/* ---------- Acciones de administración ---------- */

function partirNombre(t) { const p = String(t).trim().split(/\s+/); return { nombre: p.shift() || '', apellido: p.join(' ') }; }
function editarNombre(S, cId, valor) {
  const c = colab(S, cId), n = partirNombre(valor);
  if (!c) return 'No se encontró el colaborador.';
  if (!n.nombre) return 'El nombre no puede quedar vacío.';
  c.nombre = n.nombre.slice(0, 30); c.apellido = n.apellido.slice(0, 40);
  return '';
}
/* ¿Se pisan dos turnos semanales? Tiene en cuenta los que cruzan la medianoche. */
function sePisan(x, y) {
  for (const d of x.dias) for (const e of y.dias) for (const k of [-1, 0, 1]) {
    if (((e - d - k) % 7 + 7) % 7 !== 0) continue;
    if (x.ti < y.tf + 1440 * k && y.ti + 1440 * k < x.tf) return true;
  }
  return false;
}
/* Reglas de una asignación: una sola por sede para cada persona y sin superposición de horarios. */
function validarAsig(S, cand, ignorarId) {
  if (!S.sedes.some(s => s.id === cand.sede)) return 'Elegí una sede de la lista.';
  if (cand.ti == null || cand.tf == null) return 'Completá el horario del turno.';
  if (cand.tf <= cand.ti || cand.tf - cand.ti > 1440) return 'Revisá el horario del turno.';
  if (!cand.dias || !cand.dias.length) return 'Elegí al menos un día de trabajo.';
  if (cand.modalidad !== 'fijo' && cand.modalidad !== 'hora') return 'Elegí fijo o por hora.';
  if (!(cand.valor > 0)) return 'El valor tiene que ser mayor que cero.';
  if (cand.desde && cand.hasta && cand.hasta < cand.desde) return 'La vigencia tiene que terminar después de empezar.';
  for (const o of S.asigs) {
    if (o.id === ignorarId || o.c !== cand.c || !seCruzan(o, cand)) continue;
    if (o.sede === cand.sede) return 'Ya tiene una asignación en ' + sedeNombre(S, o.sede) + '. En la misma sede, el tiempo de más se registra como hora extra.';
    if (!o.activa || !cand.activa) continue;
    if (sePisan(cand, o)) return 'Se superpone con su turno de ' + hm(o.ti) + ' a ' + hm(o.tf) + ' en ' + sedeNombre(S, o.sede) + '.';
  }
  return '';
}
function editarAsig(S, id, campo, valor, dia) {
  const a = asig(S, id);
  if (!a) return 'No se encontró la asignación.';
  const cand = { c: a.c, sede: a.sede, dias: a.dias.slice(), ti: a.ti, tf: a.tf, modalidad: a.modalidad, valor: a.valor, activa: a.activa, desde: a.desde || null, hasta: a.hasta || null };
  if (campo === 'sede') cand.sede = valor;
  else if (campo === 'ti' || campo === 'tf') {
    const m = aMin(valor);
    if (m == null) return 'Escribí una hora válida.';
    if (campo === 'ti') { cand.ti = m; cand.tf = finRel(m, a.tf % 1440); } else cand.tf = finRel(a.ti, m);
  }
  else if (campo === 'modalidad') { if (valor !== a.modalidad) { cand.modalidad = valor; cand.valor = S.ref[valor] || cand.valor; } }
  else if (campo === 'valor') cand.valor = Math.round(Number(valor));
  else if (campo === 'activa') cand.activa = !!valor;
  else if (campo === 'dia') {
    const d = Number(dia), i = cand.dias.indexOf(d);
    if (valor && i < 0) cand.dias.push(d);
    if (!valor && i >= 0) cand.dias.splice(i, 1);
    cand.dias.sort((x, y) => x - y);
  }
  return conAvisoDeTope(S, () => {
    const err = validarAsig(S, cand, id);
    if (!err) Object.assign(a, cand);
    return err;
  });
}
function agregarAsig(S, d) {
  let c = null, nuevo = null;
  if (d.colab === 'nuevo') {
    nuevo = partirNombre(d.nombre || '');
    if (!nuevo.nombre) return 'Escribí el nombre del colaborador.';
  } else {
    c = colab(S, d.colab);
    if (!c) return 'Elegí un colaborador.';
  }
  const desde = d.desde ? String(d.desde) : null, hasta = d.hasta ? String(d.hasta) : null;
  if ((desde && !esFecha(desde)) || (hasta && !esFecha(hasta))) return 'Revisá las fechas de vigencia.';
  const ti = aMin(d.ti), fin = aMin(d.tf);
  const cand = { c: c ? c.id : '', sede: d.sede, dias: diasValidos(d.dias), ti: ti, tf: ti == null || fin == null ? null : finRel(ti, fin), modalidad: d.modalidad, valor: Math.round(Number(d.valor)), activa: true, desde: desde, hasta: hasta };
  return conAvisoDeTope(S, () => {
    const err = validarAsig(S, cand, null);
    if (err) return err;
    if (nuevo) {
      c = { id: 'c' + (S.sig++), nombre: nuevo.nombre.slice(0, 30), apellido: nuevo.apellido.slice(0, 40) };
      S.colabs.push(c);
      cand.c = c.id;
    }
    const a = Object.assign({ id: 'a' + (S.sig++) }, cand);
    S.asigs.push(a);
    if (trabajaEl(a, S.hoy)) {
      const j = nuevaJornada(S, a, S.hoy, guionAleatorio(S, a));
      if (S.ui.colab === c.id) j.manual = true;
      S.jornadas.push(j);
      aplicarLicenciasHoy(S);
      tick(S);
    }
    return '';
  });
}
function ponerParam(S, k, v) {
  const lim = { gracia: [0, 180], rojo: [0, 180], margen: [0, 180], topeFijo: [1, 24], topeHora: [1, 24], traslado: [0, 180], recFeriado: [0, 300], recNoLab: [0, 300] };
  if (!lim[k]) return '';
  const n = Math.round(Number(v));
  if (v === '' || !(n >= lim[k][0] && n <= lim[k][1])) return 'Usá un número entre ' + lim[k][0] + ' y ' + lim[k][1] + '.';
  const P = Object.assign({}, S.P);
  P[k] = n;
  if (P.rojo < P.gracia) return 'La demora que pasa a rojo no puede ser menor que la gracia de llegada.';
  const antes = S.P[k];
  S.P = P;
  if ((k === 'topeFijo' || k === 'topeHora') && antes !== n) {
    const ids = [];
    for (const x of alertas(S)) if (x.tipo === 'tope' && ids.indexOf(x.c) < 0) ids.push(x.c);
    const quienes = ids.map(id => nombreCompleto(colab(S, id)));
    avisar(S, 'Administración cambió el tope diario de ' + (k === 'topeFijo' ? 'las asignaciones fijas' : 'quienes trabajan por hora') + ' de ' + antes + ' a ' + n + ' h.' +
      (quienes.length ? ' Con las asignaciones actuales ' + (quienes.length === 1 ? 'queda' : 'quedan') + ' por encima: ' + enLista(quienes) + '.' : ''));
  }
  return '';
}

/* ---------- Licencias y vacaciones ---------- */

function licenciaEl(S, cId, f) { return S.licencias.find(l => l.c === cId && l.desde <= f && f <= l.hasta) || null; }
/* Quien tiene una ausencia cargada para hoy y todavía no empezó su turno queda justificado y no ficha. */
function aplicarLicenciasHoy(S) {
  for (const j of S.jornadas) {
    if (j.f !== S.hoy || j.cerrada || j.entrada != null || j.justif) continue;
    const l = licenciaEl(S, j.c, S.hoy);
    if (l) { j.justif = l.tipo; j.lic = l.id; j.cerrada = true; }
  }
}
function agregarLicencia(S, d) {
  const c = colab(S, d.colab);
  if (!c) return 'Elegí un colaborador.';
  if (!TIPOS_LIC[d.tipo]) return 'Elegí el tipo de ausencia.';
  if (!esFecha(d.desde) || !esFecha(d.hasta)) return 'Completá las dos fechas.';
  if (d.hasta < d.desde) return 'El último día no puede ser anterior al primero.';
  if (S.licencias.some(l => l.c === c.id && l.desde <= d.hasta && d.desde <= l.hasta)) return 'Ya tiene una ausencia cargada en esas fechas.';
  S.licencias.push({ id: 'l' + (S.sig++), c: c.id, tipo: d.tipo, desde: d.desde, hasta: d.hasta });
  aplicarLicenciasHoy(S);
  return '';
}
function quitarLicencia(S, id) {
  const i = S.licencias.findIndex(l => l.id === id);
  if (i < 0) return;
  S.licencias.splice(i, 1);
  for (const j of S.jornadas) if (j.f === S.hoy && j.lic === id) { j.justif = null; j.lic = null; j.cerrada = false; }
  tick(S);
}
function proximaLicencia(S, cId) {
  let m = null;
  for (const l of S.licencias) if (l.c === cId && l.hasta >= S.hoy && (!m || l.desde < m.desde)) m = l;
  return m;
}

/* ---------- Horario contratado por sede y cobertura ---------- */

function validarFranja(S, fr) {
  if (!S.sedes.some(s => s.id === fr.sede)) return 'Elegí una sede.';
  if (fr.ti == null || fr.tf == null) return 'Completá el horario contratado.';
  if (fr.tf <= fr.ti || fr.tf - fr.ti > 1440) return 'Revisá el horario contratado.';
  if (!fr.dias || !fr.dias.length) return 'Elegí al menos un día.';
  if (!(fr.dot >= 1 && fr.dot <= 30)) return 'La dotación tiene que ser de 1 a 30 personas.';
  return '';
}
function agregarFranja(S, d) {
  const ti = aMin(d.ti), fin = aMin(d.tf);
  const fr = { sede: d.sede, dias: diasValidos(d.dias), ti: ti, tf: ti == null || fin == null ? null : finRel(ti, fin), dot: Math.round(Number(d.dot)) };
  const err = validarFranja(S, fr);
  if (err) return err;
  fr.id = 'f' + (S.sig++);
  S.franjas.push(fr);
  return '';
}
function editarFranja(S, id, campo, valor, dia) {
  const fr = S.franjas.find(x => x.id === id);
  if (!fr) return 'No se encontró la franja.';
  const cand = { sede: fr.sede, dias: fr.dias.slice(), ti: fr.ti, tf: fr.tf, dot: fr.dot };
  if (campo === 'ti' || campo === 'tf') {
    const m = aMin(valor);
    if (m == null) return 'Escribí una hora válida.';
    if (campo === 'ti') { cand.ti = m; cand.tf = finRel(m, fr.tf % 1440); } else cand.tf = finRel(fr.ti, m);
  }
  else if (campo === 'dot') cand.dot = Math.round(Number(valor));
  else if (campo === 'dia') {
    const d = Number(dia), i = cand.dias.indexOf(d);
    if (valor && i < 0) cand.dias.push(d);
    if (!valor && i >= 0) cand.dias.splice(i, 1);
    cand.dias.sort((x, y) => x - y);
  }
  const err = validarFranja(S, cand);
  if (err) return err;
  Object.assign(fr, cand);
  return '';
}
function quitarFranja(S, id) { S.franjas = S.franjas.filter(x => x.id !== id); }

/* Para una sede y una fecha, de 00:00 a 24:00: qué pide el contrato, quién está asignado y en qué tramos falta gente.
   Incluye la parte de madrugada de los turnos y franjas que empezaron el día anterior. */
function coberturaDia(S, sedeId, f) {
  const ayer = sumarDias(f, -1), d = dIso(f), dA = dIso(ayer);
  const o = { f: f, feriado: feriadoEl(S, f), franjas: [], personas: [], segmentos: [], falta: false };
  for (const x of S.franjas) {
    if (x.sede !== sedeId) continue;
    if (x.dias.indexOf(d) >= 0) o.franjas.push({ x: x, ti: x.ti, tf: Math.min(x.tf, 1440), dot: x.dot });
    if (x.tf > 1440 && x.dias.indexOf(dA) >= 0) o.franjas.push({ x: x, ti: 0, tf: x.tf - 1440, dot: x.dot, viene: true });
  }
  for (const a of S.asigs) {
    if (a.sede !== sedeId) continue;
    if (trabajaEl(a, f)) o.personas.push({ a: a, c: colab(S, a.c), ti: a.ti, tf: Math.min(a.tf, 1440), lic: licenciaEl(S, a.c, f) });
    if (a.tf > 1440 && trabajaEl(a, ayer)) o.personas.push({ a: a, c: colab(S, a.c), ti: 0, tf: a.tf - 1440, lic: licenciaEl(S, a.c, ayer), viene: true });
  }
  o.franjas.sort((x, y) => x.ti - y.ti);
  o.personas.sort((x, y) => x.ti - y.ti || (x.a.id < y.a.id ? -1 : 1));
  const cortes = {};
  for (const x of o.franjas) { cortes[x.ti] = 1; cortes[x.tf] = 1; }
  for (const p of o.personas) { cortes[p.ti] = 1; cortes[p.tf] = 1; }
  const pts = Object.keys(cortes).map(Number).sort((a, b) => a - b);
  for (let i = 0; i + 1 < pts.length; i++) {
    const ini = pts[i], fin = pts[i + 1];
    const req = o.franjas.reduce((n, x) => n + (x.ti <= ini && fin <= x.tf ? x.dot : 0), 0);
    if (!req) continue;
    const pres = o.personas.filter(p => !p.lic && p.ti <= ini && fin <= p.tf).length;
    const ult = o.segmentos[o.segmentos.length - 1];
    if (ult && ult.tf === ini && ult.req === req && ult.pres === pres) ult.tf = fin;
    else o.segmentos.push({ ti: ini, tf: fin, req: req, pres: pres, falta: Math.max(0, req - pres) });
  }
  o.falta = o.segmentos.some(g => g.falta > 0);
  return o;
}
function causaHueco(o, g) {
  const aus = o.personas.filter(p => p.lic && p.ti < g.tf && g.ti < p.tf);
  if (aus.length) return aus.map(p => nombreCompleto(p.c) + ' ' + LIC_FRASE[p.lic.tipo]).join(' y ');
  return 'sin asignación';
}
/* Franjas contratadas sin cubrir desde hoy, agrupadas cuando se repiten. Un hueco de noche se cuenta entero,
   desde el día en que empieza, aunque cruce la medianoche. */
function huecos(S, dias) {
  const piezas = [];
  for (const s of S.sedes) {
    let cola = null;
    for (let i = 0; i < dias; i++) {
      const f = sumarDias(S.hoy, i), o = coberturaDia(S, s.id, f), hs = [];
      for (const g of o.segmentos) {
        if (!g.falta) continue;
        const causa = causaHueco(o, g), u = hs[hs.length - 1];
        if (u && u.tf === g.ti && u.falta === g.falta && u.causa === causa) u.tf = g.tf;
        else hs.push({ ti: g.ti, tf: g.tf, falta: g.falta, causa: causa });
      }
      let nueva = null;
      for (const h of hs) {
        if (h.ti === 0 && h.tf < 1440 && cola && cola.falta === h.falta && cola.causa === h.causa) { cola.tf = 1440 + h.tf; continue; }
        const p = { sede: s.id, f: f, ti: h.ti, tf: h.tf, falta: h.falta, causa: h.causa };
        piezas.push(p);
        if (h.tf === 1440 && h.ti > 0) nueva = p;
      }
      cola = nueva;
    }
  }
  const grupos = {}, orden = [];
  for (const p of piezas) {
    const k = [p.sede, p.ti, p.tf, p.falta, p.causa].join('|');
    if (!grupos[k]) { grupos[k] = { sede: p.sede, ti: p.ti, tf: p.tf, falta: p.falta, causa: p.causa, fechas: [] }; orden.push(k); }
    grupos[k].fechas.push(p.f);
  }
  return orden.map(k => grupos[k]).sort((a, b) => (a.fechas[0] < b.fechas[0] ? -1 : a.fechas[0] > b.fechas[0] ? 1 : 0));
}

/* ---------- Datos de ejemplo ---------- */

const CURADO = {
  a1: {
    '2026-11-02': [477, 842], '2026-11-03': [479, 845], '2026-11-04': [481, 840], '2026-11-05': [476, 843], '2026-11-06': [480, 841],
    '2026-11-09': [478, 844], '2026-11-10': [491, 842], '2026-11-11': [479, 840], '2026-11-12': [482, 846], '2026-11-13': [480, 843],
    '2026-11-16': [477, 841], '2026-11-17': [483, 840], '2026-11-18': 'licencia', '2026-11-19': [480, 845], '2026-11-20': 'ausente',
    '2026-11-23': [479, 841],
    '2026-11-24': [480, 1000, { pendiente: true, decl: { tipo: 'extra', hora: null, texto: 'Me quedé a terminar la limpieza profunda del salón.' } }],
    '2026-11-25': [489, 840],
    '2026-11-26': [480, 910, { rev: 'extra' }]
  },
  a2: {
    '2026-11-12': [445, 783],
    '2026-11-26': [418, null, { pendiente: true }]
  },
  a7: {
    '2026-11-04': [898, 1081], '2026-11-06': [900, 1080], '2026-11-11': [899, 1083], '2026-11-13': [897, 1080],
    '2026-11-18': 'licencia', '2026-11-20': 'ausente', '2026-11-25': [901, 1082]
  },
  a8: {}
};
const GUION_HOY = {
  a2: { in: 421, out: 784 },
  a3: { in: 478, out: 852 },
  a4: { in: 837, out: 1203 },
  a5: { in: 852, out: 1204 },
  a6: { in: 420, out: 830, decl: { tipo: 'extra', hora: null, texto: 'Cubrí el sector de un compañero hasta que llegó el relevo.' } },
  a7: { in: 899, out: 1082 }
};

function historica(S, a, f) {
  const j = nuevaJornada(S, a, f);
  j.cerrada = true;
  const cur = CURADO[a.id] && CURADO[a.id][f];
  if (cur === 'licencia') { j.justif = 'licencia'; return j; }
  if (cur === 'ausente') return j;
  let g, extra = {};
  if (cur) {
    g = { in: cur[0], out: cur[1] };
    extra = cur[2] || {};
    if (extra.decl) g.decl = extra.decl;
  } else if (CURADO[a.id]) {
    g = { in: a.ti + ent(S, -4, 3), out: a.tf + ent(S, 0, 7) };
  } else {
    g = guionAleatorio(S, a);
  }
  if (g.in == null) {
    if (rnd(S) < 0.5) j.justif = 'aviso';
    return j;
  }
  j.entrada = g.in; j.metodoIn = 'qr';
  if (g.out == null) {
    j.metodoOut = 'auto';
  } else {
    j.salida = g.out; j.metodoOut = 'qr';
    if (g.out - j.tf > S.P.margen) j.decl = g.decl || null; else j.conf = true;
  }
  if (extra.pendiente) return j;
  if (extra.rev) { j.rev = extra.rev; j.salidaVal = j.salida; return j; }
  if (ev(S, j).pendiente) {
    if (j.salida == null) { j.rev = 'olvido'; j.salidaVal = j.tf; }
    else { j.rev = 'extra'; j.salidaVal = j.salida; }
  }
  return j;
}

function sembrar() {
  const L = [1, 2, 3, 4, 5];
  const S = {
    v: VERSION, rng: 20261127, sig: 1, hoy: INICIO, ahora: 14 * 60 + 5,
    P: { gracia: 5, rojo: 15, margen: 15, topeFijo: 8, topeHora: 10, traslado: 30, recFeriado: SUGERIDO.recFeriado, recNoLab: SUGERIDO.recNoLab },
    ref: { hora: 6500, fijo: 950000 },
    sedes: [{ id: 'centro', nombre: 'Sede Centro' }, { id: 'norte', nombre: 'Sede Norte' }, { id: 'parque', nombre: 'Sede Parque' }],
    colabs: [
      { id: 'c1', nombre: 'Marta', apellido: 'Giménez' },
      { id: 'c2', nombre: 'Diego', apellido: 'Rojas' },
      { id: 'c3', nombre: 'Lucía', apellido: 'Paredes' },
      { id: 'c4', nombre: 'Ramón', apellido: 'Ortiz' },
      { id: 'c5', nombre: 'Carla', apellido: 'Sosa' },
      { id: 'c6', nombre: 'Néstor', apellido: 'Vega' },
      { id: 'c7', nombre: 'Hugo', apellido: 'Luna' },
      { id: 'c8', nombre: 'Paula', apellido: 'Funes' }
    ],
    asigs: [
      { id: 'a1', c: 'c1', sede: 'centro', dias: L.slice(), ti: 480, tf: 840, modalidad: 'fijo', valor: 950000 },
      { id: 'a2', c: 'c2', sede: 'norte', dias: L.slice(), ti: 420, tf: 780, modalidad: 'hora', valor: 6500 },
      { id: 'a3', c: 'c3', sede: 'centro', dias: L.slice(), ti: 480, tf: 840, modalidad: 'hora', valor: 6500 },
      { id: 'a4', c: 'c4', sede: 'parque', dias: L.slice(), ti: 840, tf: 1200, modalidad: 'fijo', valor: 950000 },
      { id: 'a5', c: 'c5', sede: 'parque', dias: L.slice(), ti: 840, tf: 1200, modalidad: 'hora', valor: 6500 },
      { id: 'a6', c: 'c6', sede: 'norte', dias: L.slice(), ti: 420, tf: 780, modalidad: 'fijo', valor: 950000 },
      { id: 'a7', c: 'c1', sede: 'parque', dias: [3, 5], ti: 900, tf: 1080, modalidad: 'hora', valor: 6500 },
      { id: 'a8', c: 'c7', sede: 'centro', dias: [1, 2, 3, 4, 7], ti: 1320, tf: 1800, modalidad: 'fijo', valor: 950000 },
      { id: 'a9', c: 'c8', sede: 'centro', dias: [6, 7], ti: 480, tf: 840, modalidad: 'hora', valor: 6500 }
    ],
    franjas: [
      { id: 'f1', sede: 'centro', dias: SEMANA.slice(), ti: 480, tf: 840, dot: 2 },
      { id: 'f2', sede: 'centro', dias: SEMANA.slice(), ti: 840, tf: 1080, dot: 1 },
      { id: 'f6', sede: 'centro', dias: SEMANA.slice(), ti: 1320, tf: 1800, dot: 1 },
      { id: 'f3', sede: 'norte', dias: L.slice(), ti: 420, tf: 780, dot: 2 },
      { id: 'f4', sede: 'parque', dias: L.slice(), ti: 840, tf: 1200, dot: 2 },
      { id: 'f5', sede: 'parque', dias: [3, 5], ti: 900, tf: 1080, dot: 1 }
    ],
    licencias: [
      { id: 'l1', c: 'c1', tipo: 'licencia', desde: '2026-11-18', hasta: '2026-11-18' },
      { id: 'l2', c: 'c3', tipo: 'vacaciones', desde: '2026-11-30', hasta: '2026-12-04' },
      { id: 'l3', c: 'c4', tipo: 'licencia', desde: '2026-12-03', hasta: '2026-12-03' },
      { id: 'l4', c: 'c1', tipo: 'vacaciones', desde: '2026-12-14', hasta: '2026-12-23' }
    ],
    feriados: CALENDARIO.map(x => ({ f: x.f, nombre: x.nombre, tipo: x.tipo, nota: x.nota || '' })),
    jornadas: [], novedades: [], bitacora: [], avisos: [],
    ui: { colab: 'c1', tab: 'hoy', cierre: null, recien: null, drafts: {}, casos: {}, detalle: null, descargo: null, festejo: null, errores: {}, admin: 'cronograma', sedeGrilla: 'centro', semana: lunesDe(INICIO) }
  };
  for (const a of S.asigs) { a.activa = true; a.desde = null; a.hasta = null; }
  let f = '2026-11-01';
  while (f < S.hoy) {
    for (const a of S.asigs) if (trabajaEl(a, f)) S.jornadas.push(historica(S, a, f));
    f = sumarDias(f, 1);
  }
  for (const a of S.asigs) {
    if (!trabajaEl(a, S.hoy)) continue;
    const j = nuevaJornada(S, a, S.hoy, GUION_HOY[a.id] || null);
    if (a.id === 'a1') { j.entrada = 482; j.metodoIn = 'qr'; j.manual = true; j.tocada = true; }
    S.jornadas.push(j);
  }
  tomarControl(S, 'c1');
  tick(S);
  S.novedades = [
    { id: 'n1', c: 'c3', sede: 'centro', tipo: 'infra', crit: 'alta', texto: 'Pérdida de agua en el baño del segundo piso. Dejé el sector señalizado.', foto: '', f: '2026-11-27', m: 580, estado: 'en_curso' },
    { id: 'n2', c: 'c2', sede: 'norte', tipo: 'insumos', crit: 'media', texto: 'Quedan dos bidones de lavandina y faltan bolsas de residuos de 80 litros.', foto: '', f: '2026-11-26', m: 675, estado: 'abierta' },
    { id: 'n3', c: 'c4', sede: 'parque', tipo: 'equipo', crit: 'media', texto: 'La aspiradora industrial no enciende. Probé con otro enchufe.', foto: '', f: '2026-11-25', m: 965, estado: 'abierta' },
    { id: 'n4', c: 'c1', sede: 'centro', tipo: 'otra', crit: 'baja', texto: 'Pido un carro adicional para el tercer piso.', foto: '', f: '2026-11-19', m: 750, estado: 'resuelta' }
  ];
  const jm = S.jornadas.find(j => j.a === 'a1' && j.f === '2026-11-26');
  if (jm) S.bitacora.push({ id: 'b0', f: '2026-11-27', m: 500, tipo: 'rev', j: jm.id, texto: textoResolucion(S, jm) });
  return S;
}
