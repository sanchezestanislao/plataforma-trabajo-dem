const CONFIG = {"url": "https://zaiqjrxohqbxrsqynjjr.supabase.co", "clave": "sb_publishable_pRQf-M-3KDkP6qVBfLUIQQ_OTom-juG", "qr": "qr.18ae399f8118.js"};
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
/* Marcas que hace la propia persona: QR de la pantalla, código escrito, QR impreso o solo ubicación. */
function esPropia(m) { return m === 'qr' || m === 'codigo' || m === 'impreso' || m === 'ubicacion'; }
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
  if (S.real) {
    const yo = S.yo ? colab(S, S.yo.id) : null;
    return yo && S.asigs.some(a => a.c === yo.id && a.activa) ? yo : null;
  }
  const act = activos(S);
  let c = act.find(x => x.id === S.ui.colab) || null;
  if (!c) {
    c = act[0] || null;
    S.ui.colab = c ? c.id : null;
  }
  return c;
}
/* Un tramo cuenta para hoy si empieza hoy, o si es de ayer y sigue abierto o cerró pasada la medianoche:
   el turno nocturno, y también el de la tarde que se alarga más allá de las 24. */
function vivoHoy(S, j) {
  if (j.f === S.hoy) return true;
  if (j.f !== sumarDias(S.hoy, -1)) return false;
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

/* Lo que un turno cerrado da por cumplido: sus minutos validados, sin descontar los que quedan dentro de la tolerancia.
   Quien llega hasta P.gracia minutos tarde cuenta desde el inicio del turno, y quien se va hasta P.gracia minutos antes,
   hasta el final. Así un turno en verde o con estrella cuenta completo, y en los demás se descuenta solo lo que pasó la tolerancia. */
function acreditado(j, e, P) {
  if (j.entrada == null || e.normales <= 0) return { desde: j.ti, min: 0 };
  const fin = e.desde + e.normales;
  const desde = e.demora <= P.gracia ? j.ti : e.desde, hasta = j.tf - fin <= P.gracia ? j.tf : fin;
  return { desde: desde, min: Math.max(0, hasta - desde) };
}

function resumen(S, filtro, mes) {
  const o = { verde: 0, amarillo: 0, rojo: 0, estrella: 0, revision: 0, justificada: 0, jornadas: 0, asignadas: 0, normales: 0, acreditados: 0, extra: 0, enRevision: 0, sinSalida: 0, inasistencias: 0, cerradasPorColab: 0, conEntrada: 0, fer: { feriado: 0, no_laborable: 0 } };
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
    const ac = acreditado(j, e, S.P);
    o.acreditados += ac.min;
    if (ac.min > 0) {
      const m = minutosFeriado(S, j, ac.desde, ac.desde + ac.min);
      o.fer.feriado += m.feriado;
      o.fer.no_laborable += m.no_laborable;
    }
    if (e.pendiente && j.salida == null) o.sinSalida++;
    if (e.inasistencia) o.inasistencias++;
    if (j.entrada != null) { o.conEntrada++; if (esPropia(j.metodoOut)) o.cerradasPorColab++; }
  }
  return o;
}
function resumenMes(S, cId, mes) { return resumen(S, j => j.c === cId, mes); }
function resumenAsig(S, aId, mes) { return resumen(S, j => j.a === aId, mes); }
/* Lo que suman los minutos en feriado de una asignación por hora, con el recargo que definió administración. */
function recargoDe(S, a, fer) {
  if (a.modalidad !== 'hora') return 0;
  return Math.round((fer.feriado * S.P.recFeriado + fer.no_laborable * S.P.recNoLab) / 100 * a.valor / 60);
}
function recargoFeriado(S, a, r) { return recargoDe(S, a, r.fer); }

/* ---------- Avance del mes: lo previsto por las asignaciones contra lo cumplido ---------- */

function mesAnterior(mes) { return mesDe(sumarDias(mes + '-01', -1)); }
function diasDelMes(mes) {
  const o = [];
  for (let f = mes + '-01'; mesDe(f) === mes; f = sumarDias(f, 1)) o.push(f);
  return o;
}
function mesSiguiente(mes) { return mesDe(sumarDias(mes + '-28', 4)); }
/* Los meses que muestra la preliquidación: el anterior, si dejó turnos, el que corre y el que viene. */
function mesesLiquidables(S) {
  const actual = mesDe(S.hoy), ant = mesAnterior(actual);
  return (S.jornadas.some(j => mesDe(j.f) === ant) ? [ant] : []).concat([actual, mesSiguiente(actual)]);
}
/* Minutos que suma el horario semanal de una asignación entre dos fechas, sin mirar vigencia ni ausencias. */
function minutosPatron(a, desde, hasta) {
  let n = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (a.dias.indexOf(dIso(f)) >= 0) n += a.tf - a.ti;
  return n;
}
/* Avance de una asignación en un mes: lo previsto contra lo cumplido.
   Lo previsto son sus turnos del mes: los que ya quedaron registrados y los que faltan según la asignación de hoy.
   Del mes que viene todavía no hay nada registrado: todo sale de la asignación.
   Un turno justificado (licencia, vacaciones, franco o aviso) no se espera: por hora sale de lo previsto y en lo fijo se da por cumplido.
   Importes. Por hora: minutos por valor hora, más el recargo de feriado. Fija: su monto mensual, en proporción si la asignación
   no cubre todo el mes, y lo cumplido avanza con las horas cumplidas. La hora extra no suma importe: figura aparte.
     turnos, prev   turnos y minutos que se esperan en el mes        prevHoy    minutos de los turnos ya cerrados
     cumplido       minutos que esos turnos dan por cumplidos        falta      lo que les faltó: prevHoy menos cumplido
     porVenir       los turnos que faltan del mes                    impMes, impHoy, impCumplido   lo mismo en pesos
     avance, esperado   impCumplido e impHoy sobre impMes */
function avanceAsig(S, a, mes) {
  const r = resumenAsig(S, a.id, mes), actual = mesDe(S.hoy), enCurso = mes === actual, c = colab(S, a.c);
  const v = {
    a: a, r: r, enCurso: enCurso, turnos: 0, cerrados: r.jornadas, justificados: 0,
    prog: 0, prev: 0, prevHoy: r.asignadas, cumplido: r.acreditados, falta: Math.max(0, r.asignadas - r.acreditados), justHoy: 0,
    fer: { feriado: 0, no_laborable: 0 }, ferHoy: { feriado: 0, no_laborable: 0 }, porVenir: [],
    parcial: false, impMes: 0, impHoy: 0, impCumplido: 0, avance: 0, esperado: 0
  };
  let primero = null, ultimo = null;
  const programar = (f, ti, tf, justif, cerrada) => {
    const min = tf - ti;
    if (!primero || f < primero) primero = f;
    if (!ultimo || f > ultimo) ultimo = f;
    v.prog += min;
    if (justif) { v.justificados++; if (cerrada) v.justHoy += min; return; }
    v.turnos++;
    v.prev += min;
    const m = minutosFeriado(S, { f: f }, ti, tf);
    v.fer.feriado += m.feriado; v.fer.no_laborable += m.no_laborable;
    if (cerrada) { v.ferHoy.feriado += m.feriado; v.ferHoy.no_laborable += m.no_laborable; }
  };
  for (const j of S.jornadas) if (j.a === a.id && mesDe(j.f) === mes) programar(j.f, j.ti, j.tf, !!j.justif, !!j.cerrada);
  /* Lo que falta del mes sale de la asignación como está hoy. */
  if (mes >= actual && !(c && c.activa === false)) {
    for (let f = enCurso ? sumarDias(S.hoy, 1) : mes + '-01'; mesDe(f) === mes; f = sumarDias(f, 1)) {
      if (!trabajaEl(a, f)) continue;
      const l = licenciaEl(S, a.c, f);
      programar(f, a.ti, a.tf, !!l, false);
      v.porVenir.push({ f: f, ti: a.ti, tf: a.tf, lic: l ? l.tipo : null });
    }
  }
  if (a.modalidad === 'hora') {
    v.impMes = Math.round(v.prev / 60 * a.valor) + recargoDe(S, a, v.fer);
    v.impHoy = Math.round(v.prevHoy / 60 * a.valor) + recargoDe(S, a, v.ferHoy);
    v.impCumplido = Math.round(v.cumplido / 60 * a.valor) + recargoDe(S, a, r.fer);
  } else if (v.prog) {
    /* El monto es del mes entero: si la asignación empezó o termina adentro del mes, le toca la parte de ese tramo. */
    const dias = diasDelMes(mes), completo = minutosPatron(a, dias[0], dias[dias.length - 1]);
    const tramo = minutosPatron(a, primero, ultimo) || v.prog;
    v.parcial = completo > 0 && tramo < completo;
    v.impMes = Math.round(a.valor * (v.parcial ? tramo / completo : 1));
    v.impHoy = Math.round(v.impMes * (v.prevHoy + v.justHoy) / v.prog);
    v.impCumplido = Math.round(v.impMes * (v.cumplido + v.justHoy) / v.prog);
  }
  v.avance = v.impMes ? v.impCumplido / v.impMes : 0;
  v.esperado = v.impMes ? v.impHoy / v.impMes : 0;
  return v;
}
/* Los desvíos de una asignación: lo que faltó, lo que se hizo de más y lo que espera revisión.
   Los minutos de menos dentro de la tolerancia no llegan acá: no se descuentan. */
function desviosDe(v) {
  const r = v.r, o = [];
  if (v.falta > 0) o.push({ tipo: 'falta', min: v.falta, grave: r.rojo > 0, inasistencias: r.inasistencias });
  if (r.extra > 0) o.push({ tipo: 'extra', min: r.extra });
  if (r.revision > 0) o.push({ tipo: 'revision', turnos: r.revision, min: r.enRevision, sinSalida: r.sinSalida });
  return o;
}
/* La preliquidación de un mes: una línea por asignación con turnos en el mes, agrupadas por persona, y el total del equipo. */
function preliquidacion(S, mes) {
  const cero = () => ({ lineas: 0, turnos: 0, cerrados: 0, prev: 0, prevHoy: 0, cumplido: 0, falta: 0, extra: 0, enRevision: 0, impMes: 0, impHoy: 0, impCumplido: 0, debajo: 0, conExtra: 0, aRevisar: 0, avance: 0, esperado: 0 });
  const o = { mes: mes, enCurso: mes === mesDe(S.hoy), futuro: mes > mesDe(S.hoy), personas: [], total: cero() };
  for (const c of S.colabs) {
    const p = { c: c, lineas: [], total: cero() };
    for (const a of asigsDe(S, c.id)) {
      const v = avanceAsig(S, a, mes);
      if (!v.prog) continue;
      v.desvios = desviosDe(v);
      p.lineas.push(v);
      for (const t of [p.total, o.total]) {
        t.lineas++;
        t.turnos += v.turnos; t.cerrados += v.cerrados; t.prev += v.prev; t.prevHoy += v.prevHoy; t.cumplido += v.cumplido;
        t.falta += v.falta; t.extra += v.r.extra; t.enRevision += v.r.enRevision;
        t.impMes += v.impMes; t.impHoy += v.impHoy; t.impCumplido += v.impCumplido;
        for (const d of v.desvios) { if (d.tipo === 'falta') t.debajo++; else if (d.tipo === 'extra') t.conExtra++; else t.aRevisar++; }
      }
    }
    if (!p.lineas.length) continue;
    p.total.avance = p.total.impMes ? p.total.impCumplido / p.total.impMes : 0;
    p.total.esperado = p.total.impMes ? p.total.impHoy / p.total.impMes : 0;
    o.personas.push(p);
  }
  o.total.avance = o.total.impMes ? o.total.impCumplido / o.total.impMes : 0;
  o.total.esperado = o.total.impMes ? o.total.impHoy / o.total.impMes : 0;
  return o;
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
/* Valor que se propone para una modalidad: el de referencia o, si no hay, el de la última asignación cargada con esa modalidad. */
function valorSugerido(S, modalidad, salvoId) {
  if (S.ref && S.ref[modalidad] > 0) return S.ref[modalidad];
  let v = 0;
  for (const a of S.asigs) if (a.modalidad === modalidad && a.id !== salvoId && a.valor > 0) v = a.valor;
  return v;
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
  else if (campo === 'modalidad') { if (valor !== a.modalidad) { cand.modalidad = valor; cand.valor = valorSugerido(S, valor, id) || cand.valor; } }
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
    ui: { colab: 'c1', tab: 'hoy', cierre: null, recien: null, drafts: {}, casos: {}, detalle: null, descargo: null, festejo: null, errores: {}, admin: 'cronograma', sedeGrilla: 'centro', semana: lunesDe(INICIO), mesLiq: null }
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

'use strict';

/* Planilla de Excel (.xlsx) armada en el navegador, sin librerías y sin acceso al DOM: se puede probar en Node.
   Un .xlsx es un zip con unos pocos archivos XML. Acá va sin comprimir, que para planillas chicas alcanza.

   xlsx(hojas, cuando) devuelve los bytes del archivo.
     hojas    [{ nombre, anchos: [ancho de cada columna], filas: [[celda, …], …], fijas: filas de título que quedan quietas,
                 filtro: true para poner los filtros en la primera fila, apaisada: true }]
     celda    null, un texto, un número, o { v: valor, e: estilo, f: fórmula sin el signo igual }
     estilos  los de ESTILOS. 'fecha' toma v como 'AAAA-MM-DD' y 'hora' como minutos desde las 00:00.
     cuando   { a, m, d, h, mi }: la fecha que queda anotada adentro del archivo. */

const ESTILOS = ['normal', 'titulo', 'entero', 'dec', 'pct', 'fecha', 'hora', 'total', 'totalEntero', 'totalDec', 'totalPct', 'nota', 'ajuste', 'negrita'];
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PAQ = 'http://schemas.openxmlformats.org/package/2006';
const TIPO_OFI = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
const TIPO_XLSX = TIPO_OFI + 'sheet';

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
/* Un zip sin comprimir. archivos: [{ nombre, datos: Uint8Array }]. */
function zipSinComprimir(archivos, cuando) {
  const q = cuando || { a: 1980, m: 1, d: 1, h: 0, mi: 0 };
  const hora = ((q.h & 31) << 11) | ((q.mi & 63) << 5), dia = ((Math.max(0, q.a - 1980) & 127) << 9) | ((q.m & 15) << 5) | (q.d & 31);
  const cod = new TextEncoder();
  const partes = [], indice = [];
  let pos = 0;
  const cabecera = (largo, llenar) => { const b = new Uint8Array(largo); llenar(new DataView(b.buffer)); return b; };
  for (const x of archivos) {
    const nombre = cod.encode(x.nombre), crc = crc32(x.datos), n = x.datos.length;
    /* 0x0800: el nombre va en UTF-8. Método 0: guardado sin comprimir. */
    const comunes = (v, o) => { v.setUint16(o, 20, true); v.setUint16(o + 2, 0x0800, true); v.setUint16(o + 4, 0, true); v.setUint16(o + 6, hora, true); v.setUint16(o + 8, dia, true); v.setUint32(o + 10, crc, true); v.setUint32(o + 14, n, true); v.setUint32(o + 18, n, true); v.setUint16(o + 22, nombre.length, true); };
    const local = cabecera(30, v => { v.setUint32(0, 0x04034b50, true); comunes(v, 4); });
    const central = cabecera(46, v => { v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); comunes(v, 6); v.setUint32(42, pos, true); });
    partes.push(local, nombre, x.datos);
    indice.push(central, nombre);
    pos += 30 + nombre.length + n;
  }
  const largoIndice = indice.reduce((s, b) => s + b.length, 0);
  const fin = cabecera(22, v => { v.setUint32(0, 0x06054b50, true); v.setUint16(8, archivos.length, true); v.setUint16(10, archivos.length, true); v.setUint32(12, largoIndice, true); v.setUint32(16, pos, true); });
  const todo = partes.concat(indice, [fin]);
  const salida = new Uint8Array(todo.reduce((s, b) => s + b.length, 0));
  let o = 0;
  for (const b of todo) { salida.set(b, o); o += b.length; }
  return salida;
}

/* Texto seguro para XML: sin los caracteres de control que XML no admite. */
function xmlTexto(t) {
  return String(t == null ? '' : t).replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/* Letra de una columna: 0 es A, 25 es Z, 26 es AA. */
function columna(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}
/* Fecha 'AAAA-MM-DD' como número de serie de Excel. */
function serieFecha(iso) {
  const p = String(iso).split('-').map(Number);
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000) + 25569;
}
/* Los textos van una sola vez en una tabla aparte y cada celda guarda su número: es la forma que usa Excel y achica el archivo. */
function celdaXml(c, ref, texto) {
  if (c == null || c === '') return '';
  const o = typeof c === 'object' ? c : { v: c };
  const e = Math.max(0, ESTILOS.indexOf(o.e || 'normal')), s = e ? ' s="' + e + '"' : '';
  let v = o.v;
  if (o.e === 'fecha' && v != null && v !== '') v = serieFecha(v);
  if (o.e === 'hora' && v != null && v !== '') v = (((Math.round(v) % 1440) + 1440) % 1440) / 1440;
  if (o.f) return '<c r="' + ref + '"' + s + '><f>' + xmlTexto(o.f) + '</f>' + (typeof v === 'number' && isFinite(v) ? '<v>' + v + '</v>' : '') + '</c>';
  if (v == null || v === '') return e ? '<c r="' + ref + '"' + s + '/>' : '';
  if (typeof v === 'number') return isFinite(v) ? '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>' : '';
  return '<c r="' + ref + '"' + s + ' t="s"><v>' + texto(String(v)) + '</v></c>';
}
function hojaXml(h, primera, texto) {
  const filas = h.filas || [], columnas = filas.reduce((n, f) => Math.max(n, f.length), 1);
  const ultima = columna(columnas - 1) + Math.max(1, filas.length);
  let x = XML + '<worksheet xmlns="' + NS + '">';
  if (h.apaisada) x += '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
  x += '<dimension ref="A1:' + ultima + '"/><sheetViews><sheetView' + (primera ? ' tabSelected="1"' : '') + ' workbookViewId="0">';
  if (h.fijas) x += '<pane ySplit="' + h.fijas + '" topLeftCell="A' + (h.fijas + 1) + '" activePane="bottomLeft" state="frozen"/>';
  x += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
  if (h.anchos && h.anchos.length) x += '<cols>' + h.anchos.map((a, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + a + '" customWidth="1"/>').join('') + '</cols>';
  x += '<sheetData>';
  filas.forEach((f, i) => {
    const celdas = f.map((c, k) => celdaXml(c, columna(k) + (i + 1), texto)).join('');
    const alto = f.some(c => c && c.e === 'titulo') ? ' ht="48" customHeight="1"' : '';
    if (celdas || alto) x += '<row r="' + (i + 1) + '"' + alto + '>' + celdas + '</row>';
  });
  x += '</sheetData>';
  if (h.filtro && filas.length > 1) x += '<autoFilter ref="A1:' + columna(columnas - 1) + (h.filtro === true ? filas.length : h.filtro) + '"/>';
  x += '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
  if (h.apaisada) x += '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
  return x + '</worksheet>';
}
function estilosXml() {
  const borde = (arriba, abajo) => '<border><left/><right/><top' + (arriba ? ' style="thin"><color rgb="FF55607A"/></top>' : '/>') + '<bottom' + (abajo ? ' style="thin"><color rgb="FF55607A"/></bottom>' : '/>') + '<diagonal/></border>';
  /* numFmtId: 3 es #,##0; 4 es #,##0.00; 9 es 0%; 14 es la fecha corta del equipo; 20 es h:mm. */
  const xf = (formato, letra, relleno, bordeId, alineacion) => '<xf numFmtId="' + formato + '" fontId="' + letra + '" fillId="' + relleno + '" borderId="' + bordeId + '" xfId="0"' +
    (formato ? ' applyNumberFormat="1"' : '') + (letra ? ' applyFont="1"' : '') + (relleno ? ' applyFill="1"' : '') + (bordeId ? ' applyBorder="1"' : '') +
    (alineacion ? ' applyAlignment="1"><alignment ' + alineacion + '/></xf>' : '/>');
  const celdas = [
    xf(0, 0, 0, 0), xf(0, 1, 2, 1, 'vertical="center" wrapText="1"'), xf(3, 0, 0, 0), xf(4, 0, 0, 0), xf(9, 0, 0, 0), xf(14, 0, 0, 0), xf(20, 0, 0, 0),
    xf(0, 1, 0, 2), xf(3, 1, 0, 2), xf(4, 1, 0, 2), xf(9, 1, 0, 2), xf(0, 0, 0, 0, 'vertical="top" wrapText="1"'), xf(3, 0, 3, 0), xf(0, 1, 0, 0)
  ];
  return XML + '<styleSheet xmlns="' + NS + '">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFE5EAFB"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFFCF0D6"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="3">' + borde(false, false) + borde(false, true) + borde(true, false) + '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + celdas.length + '">' + celdas.join('') + '</cellXfs>' +
    /* El cierre va partido: en la demo este archivo viaja adentro de la página, que no admite ese texto de corrido. */
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></' + 'styleSheet>';
}
function xlsx(hojas, cuando) {
  const cod = new TextEncoder();
  /* Excel no admite en el nombre de una hoja estos signos ni más de 31 letras. */
  const nombres = hojas.map((h, i) => String(h.nombre || 'Hoja ' + (i + 1)).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31));
  const textos = new Map();
  let usos = 0;
  const texto = t => { usos++; if (!textos.has(t)) textos.set(t, textos.size); return textos.get(t); };
  const hojasXml = hojas.map((h, i) => hojaXml(h, i === 0, texto));
  /* xml:space solo cuando hace falta conservar espacios, igual que Excel. */
  const tablaTextos = XML + '<sst xmlns="' + NS + '" count="' + usos + '" uniqueCount="' + textos.size + '">' +
    Array.from(textos.keys()).map(t => '<si><t' + (/^\s|\s$|\s\s|[\t\n\r]/.test(t) ? ' xml:space="preserve"' : '') + '>' + xmlTexto(t) + '</t></si>').join('') + '</sst>';
  const archivos = [
    ['[Content_Types].xml', XML + '<Types xmlns="' + NS_PAQ + '/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="' + TIPO_OFI + 'sheet.main+xml"/>' +
      hojas.map((h, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="' + TIPO_OFI + 'worksheet+xml"/>').join('') +
      '<Override PartName="/xl/styles.xml" ContentType="' + TIPO_OFI + 'styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="' + TIPO_OFI + 'sharedStrings+xml"/></Types>'],
    ['_rels/.rels', XML + '<Relationships xmlns="' + NS_PAQ + '/relationships"><Relationship Id="rId1" Type="' + NS_REL + '/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', XML + '<workbook xmlns="' + NS + '" xmlns:r="' + NS_REL + '"><bookViews><workbookView/></bookViews><sheets>' +
      nombres.map((n, i) => '<sheet name="' + xmlTexto(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><calcPr fullCalcOnLoad="1"/></workbook>'],
    ['xl/_rels/workbook.xml.rels', XML + '<Relationships xmlns="' + NS_PAQ + '/relationships">' +
      hojas.map((h, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_REL + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (hojas.length + 1) + '" Type="' + NS_REL + '/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId' + (hojas.length + 2) + '" Type="' + NS_REL + '/sharedStrings" Target="sharedStrings.xml"/></Relationships>'],
    ['xl/styles.xml', estilosXml()],
    ['xl/sharedStrings.xml', tablaTextos]
  ].concat(hojasXml.map((x, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', x]));
  return zipSinComprimir(archivos.map(a => ({ nombre: a[0], datos: cod.encode(a[1]) })), cuando);
}

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
    admin: 'cronograma', sedeGrilla: null, semana: null, mesLiq: null, fichaje: null, anular: null, vinculo: null, qrSede: null, cambiarInicial: false, editar: null };
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
/* Códigos plus de Google Maps (Open Location Code): "47VH4563+XX" o, acortado, "4563+XX Mendoza". */
const PLUS = '23456789CFGHJMPQRVWX';
const MENDOZA = { lat: -32.8895, lon: -68.8458 };
/* Centro de la celda de un código plus completo, escrito sin el signo +. */
function decodificarPlus(c) {
  let lat = -90, lon = -180, paso = 400;
  for (let i = 0; i < Math.min(10, c.length); i += 2) { paso /= 20; lat += PLUS.indexOf(c[i]) * paso; lon += PLUS.indexOf(c[i + 1]) * paso; }
  let alto = paso, ancho = paso;
  for (let i = 10; i < c.length && i < 15; i++) { alto /= 5; ancho /= 4; const d = PLUS.indexOf(c[i]); lat += Math.floor(d / 4) * alto; lon += (d % 4) * ancho; }
  return { lat: lat + alto / 2, lon: lon + ancho / 2 };
}
/* Al código acortado le falta el comienzo: se completa con el de un lugar cercano de referencia y se elige la celda más próxima. */
function leerPlus(texto, ref) {
  const m = /^([23456789CFGHJMPQRVWX]{2,8})\+([23456789CFGHJMPQRVWX]{2,5})(?:[\s,].*)?$/i.exec(texto);
  if (!m || m[1].length % 2) return null;
  const antes = m[1].toUpperCase(), despues = m[2].toUpperCase(), faltan = 8 - antes.length;
  if (!faltan) return decodificarPlus(antes + despues);
  const r = ref || MENDOZA, area = Math.pow(20, 2 - faltan / 2);
  let a = r.lat + 90, o = r.lon + 180, paso = 400, comienzo = '';
  for (let i = 0; i < faltan; i += 2) { paso /= 20; const da = Math.floor(a / paso), dn = Math.floor(o / paso); comienzo += PLUS[da] + PLUS[dn]; a -= da * paso; o -= dn * paso; }
  const p = decodificarPlus(comienzo + antes + despues);
  if (r.lat + area / 2 < p.lat && p.lat - area >= -90) p.lat -= area; else if (r.lat - area / 2 > p.lat && p.lat + area <= 90) p.lat += area;
  if (r.lon + area / 2 < p.lon) p.lon -= area; else if (r.lon - area / 2 > p.lon) p.lon += area;
  return p;
}
/* Grados, minutos y segundos, como los muestra Google Maps: 32°53'22.2"S 68°50'44.9"W. */
function leerGrados(texto) {
  const g = /(\d{1,3})\s*°\s*(\d{1,2})\s*['′’]\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|”|'')\s*([NSEWO])/gi;
  const a = g.exec(texto), b = g.exec(texto);
  if (!a || !b) return null;
  const valor = x => (Number(x[1]) + Number(x[2]) / 60 + Number(x[3].replace(',', '.')) / 3600) * (/[SWO]/i.test(x[4]) ? -1 : 1);
  const ns = /[NS]/i.test(a[4]) ? a : /[NS]/i.test(b[4]) ? b : null, eo = ns === a ? b : a;
  return ns && !/[NS]/i.test(eo[4]) ? { lat: valor(ns), lon: valor(eo) } : null;
}
/* Lee la ubicación de una sede. Acepta las dos coordenadas (con punto o con coma decimal, o en grados y minutos), el enlace
   largo de Google Maps y el código plus. Devuelve null si no hay cómo leerla: es el caso de los enlaces cortos de Compartir,
   que son un atajo y no traen la ubicación adentro. `ref` es un lugar cercano, para completar un código plus acortado. */
function leerUbicacion(texto, ref) {
  const t = String(texto || '').trim();
  if (!t) return { lat: '', lon: '' };
  const limpio = t.replace(/[()]/g, '').trim();
  let p = null;
  const m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t) || /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t) ||
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i.exec(t) || /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(limpio);
  const coma = m ? null : /^(-?\d{1,2}),(\d+)\s*[,;\s]\s*(-?\d{1,3}),(\d+)$/.exec(limpio);
  if (m) p = { lat: Number(m[1]), lon: Number(m[2]) };
  else if (coma) p = { lat: Number(coma[1] + '.' + coma[2]), lon: Number(coma[3] + '.' + coma[4]) };
  else p = leerGrados(limpio) || leerPlus(limpio, ref);
  if (!p || !(p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180)) return null;
  return { lat: String(Math.round(p.lat * 1e6) / 1e6), lon: String(Math.round(p.lon * 1e6) / 1e6) };
}
/* El enlace que da Google Maps al tocar Compartir. No trae la ubicación adentro: la busca el servidor. */
function esEnlaceDeMaps(texto) { return /^(https?:\/\/)?(maps\.app\.goo\.gl\/|goo\.gl\/maps\/)\S+$/i.test(String(texto || '').trim()); }
async function resolverEnlace(enlace) {
  const cuerpo = { enlace: String(enlace).trim() };
  let r;
  try {
    let llave = await llaveVigente();
    if (llave) r = await pedir('/functions/v1/ubicacion', cuerpo, llave);
    if (llave && r.status === 401) { llave = await renovar(); if (llave) r = await pedir('/functions/v1/ubicacion', cuerpo, llave); }
    /* Sin sesión que renovar, a ingresar de nuevo. Si el lector de enlaces rechaza una sesión recién renovada, la falla es
       del lector y no de la persona: sigue adentro, se le avisa y puede cargar las coordenadas. */
    if (!llave) { alIngreso('Tu sesión se cerró. Ingresá de nuevo.'); return { error: '' }; }
  } catch (e) { return { error: 'Sin conexión. Revisá tu señal y probá de nuevo.' }; }
  const j = r.j || {};
  const u = r.ok && j.ok ? leerUbicacion(j.lat + ', ' + j.lon) : null;
  if (u) return { lat: u.lat, lon: u.lon, aproximada: j.exacto === false };
  if (j.motivo === 'no_existe') return { error: 'Ese enlace ya no existe o quedó mal copiado. Compartí el lugar de nuevo desde Google Maps.' };
  if (j.motivo === 'sin_ubicacion' || j.motivo === 'enlace') return { error: 'Ese enlace no trae la ubicación del lugar. Compartilo de nuevo desde Google Maps o pegá las dos coordenadas: mantené apretado sobre el lugar y copiá los dos números que aparecen.' };
  return { error: 'No pudimos consultar ese enlace ahora. Probá de nuevo en un momento o pegá las dos coordenadas del lugar.' };
}
/* El centro de las sedes ya cargadas: lo más probable es que la próxima quede cerca. */
function referenciaSedes() {
  const con = S.sedes.filter(s => s.lat != null);
  return con.length ? { lat: con.reduce((n, s) => n + s.lat, 0) / con.length, lon: con.reduce((n, s) => n + s.lon, 0) / con.length } : MENDOZA;
}
function verificacionOp(sel) { return Object.keys(VERIFICACION).map(k => '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + VERIFICACION[k] + '</option>').join(''); }
function camposSede(p, s) {
  const d = S.ui.drafts, ubi = d[p + 'Ubi'] != null ? d[p + 'Ubi'] : (s && s.lat != null ? s.lat + ', ' + s.lon : '');
  const v = (k, def) => esc(d[p + k] != null ? d[p + k] : def);
  return '<label class="campo c-nombre" for="' + p + '-nombre">Nombre<input type="text" id="' + p + '-nombre" maxlength="60" data-draft="' + p + 'Nombre" value="' + v('Nombre', s ? s.nombre : '') + '"></label>' +
    '<label class="campo c-dir" for="' + p + '-dir">Dirección<input type="text" id="' + p + '-dir" maxlength="160" data-draft="' + p + 'Dir" value="' + v('Dir', s ? s.direccion : '') + '"></label>' +
    '<label class="campo c-ubi" for="' + p + '-ubi">Ubicación<input type="text" id="' + p + '-ubi" data-draft="' + p + 'Ubi" placeholder="Enlace de Google Maps o coordenadas" value="' + esc(ubi) + '"></label>' +
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
  return '<section class="seccion"><h2>Sedes</h2><p class="bajada">Cada sede tiene su ubicación y su forma de verificar el fichaje. Para la ubicación, lo más simple es abrir el lugar en Google Maps, tocar Compartir y pegar acá ese enlace. También sirven las dos coordenadas, o tomarla parado en la sede con el botón Usar mi ubicación actual. El radio es la distancia que se acepta alrededor de ese punto: adentro de los edificios el GPS suele errar varias decenas de metros.</p>' +
    (fichas ? '<ul class="panel sedes-lista">' + fichas + '</ul>' : '<p class="panel vacio">Todavía no hay sedes cargadas.</p>') + '</section>' +
    '<section class="seccion"><h2>Agregar una sede</h2><div class="panel"><form class="form-alta form-sede sin-borde" data-form="sede" data-id="" novalidate>' + camposSede('sn', null) +
    '<div class="botones ancho-total"><button class="btn primario" type="submit" id="btn-sede-alta">Agregar sede</button>' +
    '<button class="btn" type="button" data-a="sede-aqui" data-p="sn" id="btn-sede-aqui">Usar mi ubicación actual</button></div>' +
    '<p class="error" role="alert">' + esc(S.ui.errores.sn || '') + '</p></form></div></section>';
}
function datosSede(p, id) {
  const val = k => { const el = document.getElementById(p + '-' + k); return el ? el.value : ''; };
  const enlace = esEnlaceDeMaps(val('ubi')) ? val('ubi').trim() : '';
  const u = enlace ? { lat: '', lon: '' } : leerUbicacion(val('ubi'), referenciaSedes());
  if (!val('nombre').trim()) return { error: 'Escribí el nombre de la sede.' };
  if (!u) {
    return { error: /^(https?:\/\/|www\.)|\b(share\.google|g\.co|g\.page)\b/i.test(val('ubi').trim())
      ? 'Ese enlace no es el de Google Maps. Abrí el lugar en Google Maps, tocá Compartir y pegá ese enlace, que empieza con maps.app.goo.gl. También podés pegar las dos coordenadas.'
      : 'No pudimos leer la ubicación. Pegá el enlace que da Google Maps al tocar Compartir, o las dos coordenadas, por ejemplo -32.8895, -68.8458.' };
  }
  const actual = id ? S.sedes.find(s => s.id === id) : null;
  return { enlace: enlace, p: { id: id || null, nombre: val('nombre'), direccion: val('dir'), lat: u.lat, lon: u.lon, radio: val('radio'), verificacion: val('ver'), activa: actual ? actual.activa !== false : true } };
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
    const antes = id ? S.sedes.find(s => s.id === id) : null;
    conServidor(async () => {
      let aproximada = false;
      if (x.enlace) {
        const u = await resolverEnlace(x.enlace);
        if (!S) return;
        if (u.error != null) { S.ui.errores[p] = u.error; return; }
        x.p.lat = u.lat; x.p.lon = u.lon; aproximada = u.aproximada;
      }
      const movida = x.p.lat !== '' && (!antes || String(antes.lat) !== x.p.lat || String(antes.lon) !== x.p.lon);
      const r = await llamar('admin_sede', { p: x.p });
      S.ui.errores[p] = r.ok ? '' : r.error;
      if (r.ok) {
        limpiarBorradores(p);
        aviso((id ? 'Sede guardada.' : 'Sede agregada.') + (aproximada ? ' El enlace solo traía el centro del mapa: revisá el punto con Ver en el mapa.' : movida ? ' Revisá el punto con Ver en el mapa.' : ''));
      }
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
      hExtra: dec(r.extra), hRev: dec(r.enRevision), sinSal: r.sinSalida, sit: situacionTexto(v),
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
