'use strict';
/* Servidor de pruebas de la versión real. Sirve la carpeta sitio/ y contesta lo mismo que el servidor de verdad:
   el ingreso con DNI y las funciones de la base, con todos los datos en memoria. Es la copia de trabajo de
   supabase/migraciones: si cambia una función allá, se cambia acá.
   Uso suelto, para mirar la aplicación en esta computadora: node pruebas/servidor-falso.js [puerto] */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
const logica = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(raiz, 'src', 'logica.js'), 'utf8') + '\nthis.L = { CALENDARIO, sumarDias, dIso, hm, dur, fechaCorta };', logica);
const L = logica.L;

const ZONA = -180;      /* Mendoza: tres horas menos que la hora universal, todo el año */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

class Dem extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}
const error = t => { throw new Dem('DEM01', t); };
const huella = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const entero = v => (/^[0-9]{1,9}$/.test(String(v == null ? '' : v)) ? Number(v) : null);
const texto = v => (v == null ? '' : String(v));
const azar = n => crypto.randomBytes(n);

function crear(opciones) {
  const o = opciones || {};
  const carpeta = o.carpeta || path.join(raiz, 'sitio');
  const M = {
    desfase: 0, caido: false, pedidos: [], enlaces: {},
    config: { p: { gracia: 5, rojo: 15, margen: 15, topeFijo: 8, topeHora: 10, traslado: 30, recFeriado: 100, recNoLab: 0 }, ref: { hora: 0, fijo: 0 }, clave_inicial: null, instalacion_hash: null, instalacion_vence: 0, generado_hasta: null, asegurado: null },
    usuarios: [], llaves: {}, renovables: {},
    personas: [], sedes: [], pantallas: [], vinculos: [], asignaciones: [], franjas: [], licencias: [],
    feriados: L.CALENDARIO.map(x => ({ f: x.f, nombre: x.nombre, tipo: x.tipo, nota: x.nota || '', propio: false })),
    jornadas: [], dispositivos: [], marcas: [], intentos: [], novedades: [], bitacora: [], avisos: [], cambios: [],
    sig: 0
  };
  const nuevoId = () => ++M.sig;

  /* ---------- Reloj ---------- */
  const ahora = () => Date.now() + M.desfase;
  const fechaDe = ts => new Date(ts + ZONA * 60000).toISOString().slice(0, 10);
  const hoy = () => fechaDe(ahora());
  const instante = (f, min) => Date.parse(f + 'T00:00:00Z') - ZONA * 60000 + min * 60000;
  const rel = (ts, f) => Math.floor((ts - instante(f, 0)) / 60000);
  const paso = () => Math.floor(ahora() / 30000);
  function totp(secreto, n) {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(BigInt(n));
    const h = crypto.createHmac('sha256', secreto).update(b).digest();
    const d = h[h.length - 1] & 15;
    const v = (h[d] & 127) * 16777216 + (h[d + 1] << 16) + (h[d + 2] << 8) + h[d + 3];
    return String(v % 1000000).padStart(6, '0');
  }
  function distancia(lat1, lon1, lat2, lon2) {
    const r = x => x * Math.PI / 180;
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2)));
  }

  /* ---------- Cuentas ---------- */
  const persona = id => M.personas.find(p => p.id === id) || null;
  const sede = id => M.sedes.find(s => s.id === id) || null;
  const asignacion = id => M.asignaciones.find(a => a.id === id) || null;
  const jornada = id => M.jornadas.find(j => j.id === id) || null;
  function crearAcceso(dni, clave) {
    const u = { id: crypto.randomUUID(), email: dni + '@dni.invalid', clave: clave };
    M.usuarios.push(u);
    return u.id;
  }
  function cerrarSesiones(uid) {
    for (const k of Object.keys(M.renovables)) if (M.renovables[k] === uid) delete M.renovables[k];
    for (const k of Object.keys(M.llaves)) if (M.llaves[k].uid === uid) M.llaves[k].sinSesion = true;
  }
  function ponerClave(uid, clave) {
    const u = M.usuarios.find(x => x.id === uid);
    if (u) u.clave = clave;
    cerrarSesiones(uid);
  }
  function abrirSesion(u) {
    const llave = 'll-' + azar(18).toString('hex'), renovable = 'rn-' + azar(12).toString('hex');
    M.llaves[llave] = { uid: u.id, vence: Date.now() + 3600000 };
    M.renovables[renovable] = u.id;
    return { access_token: llave, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: renovable, user: { id: u.id, email: u.email }, weak_password: null };
  }
  function yo(uid, pendiente) {
    if (!uid) throw new Dem('DEM02', 'Ingresá de nuevo para seguir.');
    const r = M.personas.find(p => p.auth_id === uid);
    if (!r || !r.activa) throw new Dem('DEM02', 'Tu acceso no está habilitado. Hablá con administración.');
    if (r.debe_cambiar_clave && !pendiente) throw new Dem('DEM03', 'Antes de seguir, cambiá tu clave.');
    return r;
  }
  function exigir(uid) {
    const r = yo(uid), roles = Array.prototype.slice.call(arguments, 1);
    if (roles.indexOf(r.rol) < 0) throw new Dem('DEM04', 'No tenés permiso para hacer esto.');
    return r;
  }

  /* ---------- Turnos del día ---------- */
  function generarDia(f) {
    const d = L.dIso(f);
    for (const a of M.asignaciones) {
      const p = persona(a.persona_id);
      if (!a.activa || !p.activa || a.dias.indexOf(d) < 0) continue;
      if ((a.desde && f < a.desde) || (a.hasta && f > a.hasta)) continue;
      if (!(Math.max(a.creada, a.modificada) < instante(f, a.tf))) continue;
      if (M.jornadas.some(j => j.asignacion_id === a.id && j.f === f)) continue;
      const l = M.licencias.filter(x => x.persona_id === a.persona_id && x.desde <= f && f <= x.hasta).sort((x, y) => (x.desde < y.desde ? -1 : 1))[0] || null;
      M.jornadas.push({ id: nuevoId(), asignacion_id: a.id, persona_id: a.persona_id, sede_id: a.sede_id, f: f, ti: a.ti, tf: a.tf, entrada: null, salida: null, metodo_in: null, metodo_out: null,
        cerrada: !!l, conf: false, decl: null, rev: null, salida_val: null, justif: l ? l.tipo : null, licencia_id: l ? l.id : null, descargo: null });
    }
  }
  function asegurar(forzar) {
    const t = ahora(), h = hoy(), c = M.config;
    if (!forzar && c.generado_hasta === h && c.asegurado != null && c.asegurado <= t && c.asegurado > t - 60000) return;
    let d = c.generado_hasta ? L.sumarDias(c.generado_hasta, 1) : h;
    if (d < L.sumarDias(h, -31)) d = L.sumarDias(h, -31);
    while (d < h) { generarDia(d); d = L.sumarDias(d, 1); }
    generarDia(h);
    const sinEmpezar = j => j.f === h && j.entrada == null && !j.cerrada && j.justif == null;
    M.jornadas = M.jornadas.filter(j => {
      if (!sinEmpezar(j)) return true;
      const a = asignacion(j.asignacion_id), p = persona(j.persona_id);
      return p.activa && a.activa && a.dias.indexOf(L.dIso(h)) >= 0 && (!a.desde || h >= a.desde) && (!a.hasta || h <= a.hasta);
    });
    for (const j of M.jornadas) {
      if (!sinEmpezar(j)) continue;
      const a = asignacion(j.asignacion_id);
      j.ti = a.ti; j.tf = a.tf; j.sede_id = a.sede_id;
      const l = M.licencias.find(x => x.persona_id === j.persona_id && x.desde <= h && h <= x.hasta);
      if (l) { j.justif = l.tipo; j.licencia_id = l.id; j.cerrada = true; }
    }
    for (const j of M.jornadas) {
      if (j.cerrada || t < instante(j.f, j.tf + (j.entrada == null ? 0 : 360))) continue;
      j.cerrada = true;
      if (j.entrada != null && j.salida == null) j.metodo_out = 'auto';
    }
    M.intentos = M.intentos.filter(x => x.momento >= t - 86400000);
    c.generado_hasta = h; c.asegurado = t;
  }

  /* ---------- Estado según el rol ---------- */
  const sinNulos = x => { const r = {}; for (const k of Object.keys(x)) if (x[k] != null) r[k] = x[k]; return r; };
  const yoJson = r => ({ id: String(r.id), nombre: r.nombre, apellido: r.apellido, rol: r.rol, debeCambiarClave: r.debe_cambiar_clave, colab: M.asignaciones.some(a => a.persona_id === r.id && a.activa) });
  function estadoDe(r) {
    const t = ahora(), h = hoy(), staff = r.rol !== 'colaborador', admin = r.rol === 'admin';
    const mes = h.slice(0, 7) + '-01';
    const desde = staff ? L.sumarDias(mes, -1).slice(0, 7) + '-01' : L.sumarDias(mes, -7);
    const cuando = ts => ({ f: fechaDe(ts), m: rel(ts, fechaDe(ts)) });
    const ubi = (j, tipo) => {
      const m = M.marcas.filter(x => x.jornada_id === j.id && x.tipo === tipo && !x.anulada && x.via !== 'supervisor').pop();
      return m ? { g: m.geo, d: m.distancia_m == null ? null : Math.round(m.distancia_m), t: m.dispositivo } : null;
    };
    const e = { v: 1, yo: yoJson(r), hoy: h, ahora: rel(t, h), ts: Math.floor(t), P: M.config.p, ref: M.config.ref };
    e.sedes = M.sedes
      .filter(s => admin || (staff && (s.activa || M.jornadas.some(j => j.sede_id === s.id && j.f >= desde))) || M.asignaciones.some(a => a.sede_id === s.id && a.persona_id === r.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id - b.id)
      .map(s => (admin
        ? { id: String(s.id), nombre: s.nombre, verificacion: s.verificacion, activa: s.activa, direccion: s.direccion, lat: s.lat, lon: s.lon, radio: s.radio_m, fijo: s.codigo_fijo,
          pantallas: M.pantallas.filter(p => p.sede_id === s.id && !p.revocada).map(p => ({ id: String(p.id), nombre: p.nombre, hace: p.vista == null ? null : Math.floor((t - p.vista) / 60000) })) }
        : { id: String(s.id), nombre: s.nombre, verificacion: s.verificacion, activa: s.activa }));
    e.colabs = M.personas.filter(p => staff || p.id === r.id)
      .sort((a, b) => a.apellido.localeCompare(b.apellido, 'es') || a.nombre.localeCompare(b.nombre, 'es') || a.id - b.id)
      .map(p => {
        const base = { id: String(p.id), nombre: p.nombre, apellido: p.apellido, rol: p.rol, activa: p.activa };
        if (!admin) return base;
        const tel = M.dispositivos.filter(d => d.persona_id === p.id && d.estado === 'registrado').sort((a, b) => a.alta - b.alta)[0];
        return Object.assign(base, { dni: p.dni, acceso: p.debe_cambiar_clave ? 'pendiente' : 'activo', uso: p.ultimo_uso == null ? null : fechaDe(p.ultimo_uso),
          tel: tel ? { nombre: tel.nombre, desde: fechaDe(tel.alta) } : null, telOtros: M.dispositivos.filter(d => d.persona_id === p.id && d.estado === 'otro').length });
      });
    e.asigs = M.asignaciones.filter(a => staff || a.persona_id === r.id).map(a => ({ id: String(a.id), c: String(a.persona_id), sede: String(a.sede_id), dias: a.dias.slice(), ti: a.ti, tf: a.tf,
      modalidad: a.modalidad, valor: admin ? a.valor : 0, activa: a.activa, desde: a.desde, hasta: a.hasta }));
    e.franjas = staff ? M.franjas.map(x => ({ id: String(x.id), sede: String(x.sede_id), dias: x.dias.slice(), ti: x.ti, tf: x.tf, dot: x.dot })) : [];
    e.licencias = M.licencias.filter(l => l.hasta >= L.sumarDias(h, -90) && (staff || l.persona_id === r.id))
      .sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : a.id - b.id)).map(l => ({ id: String(l.id), c: String(l.persona_id), tipo: l.tipo, desde: l.desde, hasta: l.hasta }));
    e.feriados = M.feriados.filter(x => x.f >= desde.slice(0, 7) + '-01').sort((a, b) => (a.f < b.f ? -1 : 1)).map(x => ({ f: x.f, nombre: x.nombre, tipo: x.tipo, nota: x.nota, propio: x.propio }));
    e.jornadas = M.jornadas
      .filter(j => (staff && j.f >= desde) || (j.persona_id === r.id && (j.f >= desde || (j.cerrada && j.entrada != null && j.salida == null && j.rev == null && j.decl == null && j.justif == null))))
      .sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : a.ti - b.ti || a.id - b.id))
      .map(j => sinNulos({ id: String(j.id), a: String(j.asignacion_id), c: String(j.persona_id), f: j.f, sede: String(j.sede_id), ti: j.ti, tf: j.tf,
        entrada: j.entrada == null ? null : rel(j.entrada, j.f), salida: j.salida == null ? null : rel(j.salida, j.f), metodoIn: j.metodo_in, metodoOut: j.metodo_out,
        cerrada: j.cerrada, conf: j.conf, decl: j.decl ? sinNulos(j.decl) : null, rev: j.rev, salidaVal: j.salida_val, justif: j.justif, lic: j.licencia_id == null ? null : String(j.licencia_id), descargo: j.descargo,
        ubiIn: ubi(j, 'entrada') && sinNulos(ubi(j, 'entrada')), ubiOut: ubi(j, 'salida') && sinNulos(ubi(j, 'salida')) }));
    e.novedades = M.novedades.filter(n => (staff || n.persona_id === r.id) && (n.estado !== 'resuelta' || n.creada >= t - 60 * 86400000))
      .sort((a, b) => b.creada - a.creada || b.id - a.id)
      .map(n => Object.assign({ id: String(n.id), c: String(n.persona_id), sede: n.sede_id == null ? null : String(n.sede_id), tipo: n.tipo, crit: n.crit, texto: n.texto, foto: n.foto, estado: n.estado }, cuando(n.creada)));
    if (staff) {
      e.bitacora = M.bitacora.slice().sort((a, b) => b.id - a.id).slice(0, 40).map(b => Object.assign({ id: String(b.id), tipo: b.tipo, j: b.jornada_id == null ? null : String(b.jornada_id), texto: b.texto }, cuando(b.creada)));
      e.avisos = M.avisos.slice().sort((a, b) => b.id - a.id).slice(0, 20).map(v => Object.assign({ id: String(v.id), texto: v.texto }, cuando(v.creado)));
      e.marcas = M.marcas.filter(m => !m.revisada && !m.anulada && m.momento >= t - 21 * 86400000 && (m.geo === 'lejos' || m.dispositivo === 'otro' || m.dispositivo === 'compartido'))
        .sort((a, b) => b.id - a.id)
        .map(m => Object.assign({ id: String(m.id), j: String(m.jornada_id), c: String(m.persona_id), sede: String(jornada(m.jornada_id).sede_id), tipo: m.tipo, geo: m.geo,
          dist: m.distancia_m == null ? null : Math.round(m.distancia_m), tel: m.dispositivo, con: m.comparte_con == null ? null : String(m.comparte_con) }, cuando(m.momento)));
    } else { e.bitacora = []; e.avisos = []; e.marcas = []; }
    if (admin) e.claveInicial = M.config.clave_inicial != null;
    return e;
  }
  const conEstado = (r, extra) => Object.assign({ ok: true }, extra || {}, { estado: estadoDe(r) });
  const quienDonde = j => { const p = persona(j.persona_id); return (p.nombre + ' ' + p.apellido).trim() + ', ' + L.fechaCorta(j.f) + ' en ' + sede(j.sede_id).nombre; };
  const anotar = (r, tipo, j, t) => M.bitacora.push({ id: nuevoId(), creada: ahora(), tipo: tipo, jornada_id: j.id, autor_id: r.id, texto: t });
  const cambio = (r, que, datos) => M.cambios.push({ id: nuevoId(), momento: ahora(), autor_id: r.id, que: que, datos: datos });

  /* ---------- Funciones (las mismas que publica la base) ---------- */
  const F = {};
  const ANONIMAS = ['instalacion', 'instalar', 'pantalla_vincular', 'pantalla_estado'];

  F.instalacion = () => ({ instalada: M.personas.some(p => p.rol === 'admin') });
  F.instalar = (uid, a) => {
    const dni = texto(a.p_dni).replace(/[^0-9]/g, ''), cod = texto(a.p_codigo).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const nombre = texto(a.p_nombre).trim(), apellido = texto(a.p_apellido).trim(), c = M.config;
    if (M.personas.some(p => p.rol === 'admin')) error('La plataforma ya está configurada. Ingresá con tu DNI y tu clave.');
    if (M.intentos.filter(x => x.clave === 'i' && x.momento > Date.now() - 900000).length >= 10) return { ok: false, error: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' };
    if (!c.instalacion_hash || c.instalacion_vence < Date.now() || !cod || c.instalacion_hash !== huella(cod)) {
      M.intentos.push({ clave: 'i', momento: Date.now() });
      return { ok: false, error: 'El código de configuración no es válido o ya venció.' };
    }
    if (!/^[0-9]{6,9}$/.test(dni)) error('Escribí tu DNI solo con números, sin puntos.');
    if (!nombre || nombre.length > 30 || apellido.length > 40) error('Revisá tu nombre y apellido.');
    if (texto(a.p_clave).length < 8 || a.p_clave.length > 72) error('La clave tiene que tener al menos 8 caracteres.');
    M.personas.push({ id: nuevoId(), auth_id: crearAcceso(dni, a.p_clave), dni: dni, nombre: nombre, apellido: apellido, rol: 'admin', activa: true, debe_cambiar_clave: false, clave_cambiada: Date.now(), ultimo_uso: null, creada: Date.now() });
    c.instalacion_hash = null; c.instalacion_vence = 0; c.generado_hasta = L.sumarDias(hoy(), -1);
    return { ok: true };
  };
  F.estado = uid => {
    const r = yo(uid, true);
    if (r.debe_cambiar_clave) return { v: 1, yo: yoJson(r), ts: Math.floor(ahora()) };
    asegurar(false);
    if (r.ultimo_uso == null || r.ultimo_uso < Date.now() - 1800000) r.ultimo_uso = Date.now();
    return estadoDe(r);
  };
  F.clave_cambiada = uid => {
    const r = yo(uid, true), u = M.usuarios.find(x => x.id === r.auth_id);
    if (M.config.clave_inicial != null && u && u.clave === M.config.clave_inicial) error('Elegí una clave distinta de la inicial.');
    r.debe_cambiar_clave = false; r.clave_cambiada = Date.now();
    asegurar(false);
    return conEstado(r);
  };

  F.fichar = (uid, a) => {
    const r = yo(uid), t = ahora(), cod = texto(a.p_codigo).replace(/[^0-9A-Za-z]/g, '');
    if (a.p_tipo !== 'entrada' && a.p_tipo !== 'salida') error('No se entendió el pedido.');
    asegurar(true);
    const j = jornada(Number(a.p_jornada));
    if (!j || j.persona_id !== r.id) error('No encontramos ese turno.');
    if (j.justif != null) error('Ese turno figura justificado: no hace falta fichar.');
    if (j.cerrada) error('Ese turno ya está cerrado.');
    if (a.p_tipo === 'entrada' && j.entrada != null) error('La entrada de este turno ya está registrada.');
    if (a.p_tipo === 'salida' && j.entrada == null) error('Primero marcá la entrada.');
    const s = sede(j.sede_id), clave = 'f:' + r.id;
    if (M.intentos.filter(x => x.clave === clave && x.momento > t - 600000).length >= 8) return { ok: false, error: 'Demasiados intentos seguidos. Esperá unos minutos o pedile el fichaje asistido a tu supervisor.' };
    let lat = a.p_lat, lon = a.p_lon, via, dist = null, geo;
    if (typeof lat !== 'number' || typeof lon !== 'number' || lat < -90 || lat > 90 || lon < -180 || lon > 180) { lat = null; lon = null; }
    const precision = typeof a.p_precision === 'number' ? a.p_precision : null;
    if (s.verificacion === 'pantalla') {
      via = a.p_via === 'qr' ? 'qr' : 'codigo';
      if (![-1, 0, 1].some(i => totp(s.secreto, paso() + i) === cod)) {
        M.intentos.push({ clave: clave, momento: t });
        return { ok: false, error: 'El código no coincide o ya venció. Volvé a leer el QR de la pantalla.' };
      }
    } else if (s.verificacion === 'impreso') {
      via = 'impreso';
      if (cod.toLowerCase() !== s.codigo_fijo) {
        M.intentos.push({ clave: clave, momento: t });
        return { ok: false, error: 'Ese QR no es el de esta sede.' };
      }
    } else {
      via = 'ubicacion';
      if (lat == null) return { ok: false, error: 'Para fichar en esta sede necesitamos tu ubicación. Activala en el teléfono y probá de nuevo.' };
    }
    if (s.lat == null) geo = 'sin_sede';
    else if (lat == null) geo = 'sin_dato';
    else {
      dist = distancia(s.lat, s.lon, lat, lon);
      geo = dist <= s.radio_m + Math.min(precision || 0, 100) ? 'ok' : dist - (precision || 0) > s.radio_m ? 'lejos' : 'imprecisa';
    }
    if (s.verificacion === 'ubicacion' && geo === 'lejos') {
      return { ok: false, error: 'Tu teléfono figura a ' + (dist >= 1000 ? (Math.round(dist / 100) / 10).toFixed(1).replace('.', ',') + ' km' : Math.round(dist) + ' m') + ' de la sede. Si estás ahí, pedile el fichaje asistido a tu supervisor.' };
    }
    let tel = 'sin_dato', disp = null, comparte = null;
    if (typeof a.p_dispositivo === 'string' && a.p_dispositivo.length >= 16 && a.p_dispositivo.length <= 80) {
      const h = huella(a.p_dispositivo);
      disp = M.dispositivos.find(d => d.persona_id === r.id && d.huella === h) || null;
      if (disp) {
        if (disp.estado === 'bloqueado') error('Este teléfono no está habilitado para fichar. Hablá con tu supervisor.');
        disp.visto = t;
        tel = disp.estado === 'registrado' ? 'registrado' : 'otro';
      } else {
        const primero = !M.dispositivos.some(d => d.persona_id === r.id);
        disp = { id: nuevoId(), persona_id: r.id, huella: h, nombre: texto(a.p_equipo).slice(0, 80), estado: primero ? 'registrado' : 'otro', alta: t, visto: t };
        M.dispositivos.push(disp);
        tel = primero ? 'nuevo' : 'otro';
      }
      const otro = M.dispositivos.filter(d => d.huella === h && d.persona_id !== r.id && d.visto > t - 30 * 86400000).sort((x, y) => y.visto - x.visto)[0];
      if (otro) { comparte = otro.persona_id; tel = 'compartido'; }
    }
    if (a.p_tipo === 'entrada') { j.entrada = t; j.metodo_in = via; }
    else {
      let conf = false, decl = null;
      const d = a.p_datos;
      if (d && typeof d === 'object' && !Array.isArray(d)) {
        conf = d.conf === true;
        if (d.decl && typeof d.decl === 'object') {
          if (['extra', 'olvido', 'otras'].indexOf(d.decl.tipo) < 0) error('Elegí qué pasó con tus horas.');
          let hora = /^[0-9]{1,4}$/.test(texto(d.decl.hora)) ? Number(d.decl.hora) : null;
          if (d.decl.tipo === 'olvido') { if (hora == null || hora <= rel(j.entrada, j.f) || hora > rel(t, j.f)) error('La hora tiene que estar entre tu entrada y ahora.'); } else hora = null;
          decl = { tipo: d.decl.tipo, hora: hora, texto: texto(d.decl.texto).slice(0, 200) };
          conf = false;
        }
      }
      j.salida = Math.max(t, j.entrada); j.metodo_out = via; j.cerrada = true; j.conf = conf; j.decl = decl;
    }
    M.marcas.push({ id: nuevoId(), jornada_id: j.id, persona_id: r.id, tipo: a.p_tipo, momento: t, via: via, lat: lat, lon: lon, precision_m: precision, distancia_m: dist, geo: geo,
      dispositivo_id: disp ? disp.id : null, dispositivo: tel, comparte_con: comparte, autor_id: r.id, revisada: false, anulada: false });
    return conEstado(r, { tipo: a.p_tipo, jornada: String(j.id), hora: rel(t, j.f), geo: geo, distancia: dist == null ? null : Math.round(dist), telefono: tel });
  };
  F.salida_declarada = (uid, a) => {
    const r = yo(uid), t = ahora();
    asegurar(true);
    const j = jornada(Number(a.p_jornada));
    if (!j || j.persona_id !== r.id) error('No encontramos ese turno.');
    if (j.cerrada || j.entrada == null) error('Ese turno no está abierto.');
    if (a.p_hora == null || a.p_hora <= rel(j.entrada, j.f) || a.p_hora > rel(t, j.f)) error('La hora tiene que estar entre tu entrada de las ' + L.hm(rel(j.entrada, j.f)) + ' y ahora.');
    j.cerrada = true; j.metodo_out = 'declarada'; j.conf = false; j.decl = { tipo: 'olvido', hora: a.p_hora, texto: '' };
    return conEstado(r);
  };
  F.declarar_olvido = (uid, a) => {
    const r = yo(uid), j = jornada(Number(a.p_jornada));
    if (!j || j.persona_id !== r.id) error('No se encontró la jornada.');
    if (!j.cerrada || j.entrada == null || j.salida != null || j.rev != null || j.justif != null) error('Ese turno ya no espera tu aviso.');
    if (a.p_hora == null) error('Indicá a qué hora terminaste.');
    if (a.p_hora <= rel(j.entrada, j.f) || a.p_hora > j.tf + 1440) error('La salida tiene que ser posterior a tu entrada de las ' + L.hm(rel(j.entrada, j.f)) + '.');
    j.decl = { tipo: 'olvido', hora: a.p_hora, texto: '' };
    return conEstado(r);
  };
  F.descargo = (uid, a) => {
    const r = yo(uid), j = jornada(Number(a.p_jornada)), t = texto(a.p_texto).trim();
    if (!j || j.persona_id !== r.id) error('No se encontró la jornada.');
    if (!t) error('Escribí qué pasó antes de enviar.');
    j.descargo = t.slice(0, 280);
    return conEstado(r);
  };
  F.novedad = (uid, a) => {
    const r = yo(uid), p = a.p || {}, t = texto(p.texto).trim();
    let s = entero(p.sede);
    if (['infra', 'equipo', 'insumos', 'otra'].indexOf(p.tipo) < 0) error('Elegí de qué se trata.');
    if (['baja', 'media', 'alta'].indexOf(p.crit) < 0) error('Elegí la urgencia.');
    if (!t) error('Contá qué pasó antes de enviar.');
    if (s != null && !sede(s)) s = null;
    if (s != null && r.rol === 'colaborador' && !M.asignaciones.some(x => x.persona_id === r.id && x.sede_id === s)) s = null;
    if (s == null) { const x = M.asignaciones.filter(y => y.persona_id === r.id).sort((y, z) => (z.activa ? 1 : 0) - (y.activa ? 1 : 0) || y.id - z.id)[0]; s = x ? x.sede_id : null; }
    M.novedades.push({ id: nuevoId(), persona_id: r.id, sede_id: s, tipo: p.tipo, crit: p.crit, texto: t.slice(0, 400), foto: texto(p.foto).slice(0, 200), creada: ahora(), estado: 'abierta' });
    return conEstado(r);
  };

  F.sup_resolver = (uid, a) => {
    const r = exigir(uid, 'supervisor', 'admin'), j = jornada(Number(a.p_jornada));
    if (!j) error('No se encontró la jornada.');
    if (['extra', 'olvido', 'ajuste', 'ok'].indexOf(a.p_tipo) < 0) error('Elegí qué pasó.');
    if (!j.cerrada || j.entrada == null || j.justif != null) error('Ese turno no está para resolver.');
    if (j.rev != null) error('Ese turno ya fue resuelto. Actualizá la pantalla.');
    const ent = rel(j.entrada, j.f), h = a.p_tipo === 'ok' ? (j.salida == null ? null : rel(j.salida, j.f)) : (a.p_hora == null ? null : a.p_hora);
    if (h == null) error('Indicá la salida validada.');
    if (h <= ent) error('La salida tiene que ser posterior a la entrada de las ' + L.hm(ent) + '.');
    if (a.p_tipo === 'extra' && h <= j.tf) error('Para hora extra, la salida validada tiene que ser posterior a las ' + L.hm(j.tf) + '.');
    if (h > j.tf + 1440) error('Revisá la hora de salida.');
    j.rev = a.p_tipo; j.salida_val = h;
    anotar(r, 'rev', j, quienDonde(j) + ': ' + (a.p_tipo === 'extra' ? 'hora extra verificada, ' + L.dur(h - j.tf) : a.p_tipo === 'olvido' ? 'olvido de salida, validada a las ' + L.hm(h) : a.p_tipo === 'ajuste' ? 'salida corregida a las ' + L.hm(h) : 'se mantiene el registro'));
    return conEstado(r);
  };
  F.sup_justificar = (uid, a) => {
    const r = exigir(uid, 'supervisor', 'admin'), j = jornada(Number(a.p_jornada));
    if (!j || ['licencia', 'vacaciones', 'aviso', 'franco'].indexOf(a.p_motivo) < 0) error('Elegí un motivo.');
    if (!j.cerrada || j.entrada != null || j.justif != null) error('Ese turno no figura como inasistencia.');
    j.justif = a.p_motivo;
    anotar(r, 'justif', j, quienDonde(j) + ': inasistencia justificada, ' + (a.p_motivo === 'aviso' ? 'ausencia con aviso' : a.p_motivo));
    return conEstado(r);
  };
  F.sup_deshacer = (uid, a) => {
    const r = exigir(uid, 'supervisor', 'admin'), b = M.bitacora.find(x => x.id === Number(a.p_id));
    if (!b) error('Esa resolución ya no está.');
    const j = jornada(b.jornada_id);
    if (b.tipo === 'rev') { if (j) { j.rev = null; j.salida_val = null; } }
    else if (b.tipo === 'justif') { if (j && j.licencia_id == null) j.justif = null; }
    else error('Eso no se puede deshacer.');
    M.bitacora = M.bitacora.filter(x => x !== b);
    return conEstado(r);
  };
  F.sup_asistido = (uid, a) => {
    const r = exigir(uid, 'supervisor', 'admin'), t = ahora();
    asegurar(true);
    const j = jornada(Number(a.p_jornada));
    if (!j || j.cerrada || j.justif != null) error('Ese turno ya no admite fichaje asistido.');
    const p = persona(j.persona_id), quien = (p.nombre + ' ' + p.apellido).trim() + ' en ' + sede(j.sede_id).nombre;
    let que;
    if (j.entrada == null) { que = 'entrada'; j.entrada = t; j.metodo_in = 'supervisor'; }
    else { que = 'salida'; j.salida = Math.max(t, j.entrada); j.metodo_out = 'supervisor'; j.cerrada = true; }
    M.marcas.push({ id: nuevoId(), jornada_id: j.id, persona_id: j.persona_id, tipo: que, momento: t, via: 'supervisor', lat: null, lon: null, precision_m: null, distancia_m: null, geo: 'sin_dato',
      dispositivo_id: null, dispositivo: 'sin_dato', comparte_con: null, autor_id: r.id, revisada: true, anulada: false });
    anotar(r, 'asistido', j, quien + ': ' + que + ' asistida a las ' + L.hm(rel(t, j.f)));
    return conEstado(r, { que: que });
  };
  F.sup_novedad = (uid, a) => {
    const r = exigir(uid, 'supervisor', 'admin'), n = M.novedades.find(x => x.id === Number(a.p_id));
    if (['abierta', 'en_curso', 'resuelta'].indexOf(a.p_estado) < 0) error('Elegí el estado.');
    if (n) n.estado = a.p_estado;
    return conEstado(r);
  };
  F.sup_aviso = (uid, a) => {
    const r = exigir(uid, 'supervisor', 'admin');
    M.avisos = M.avisos.filter(x => x.id !== Number(a.p_id));
    return conEstado(r);
  };
  F.sup_marca = (uid, a) => {
    const r = exigir(uid, 'supervisor', 'admin'), m = M.marcas.find(x => x.id === Number(a.p_id));
    if (!m || m.anulada) error('Ese fichaje ya no está para revisar.');
    if (a.p_accion === 'visto') m.revisada = true;
    else if (a.p_accion === 'anular') {
      const j = jornada(m.jornada_id);
      if (j.rev != null) error('Ese turno ya fue resuelto. Deshacé la resolución antes de anular el fichaje.');
      m.revisada = true; m.anulada = true;
      if (m.tipo === 'entrada') {
        for (const x of M.marcas) if (x.jornada_id === j.id && x.tipo === 'salida' && !x.anulada) { x.anulada = true; x.revisada = true; }
        j.entrada = null; j.metodo_in = null;
      }
      j.salida = null; j.metodo_out = null; j.cerrada = false; j.conf = false; j.decl = null;
      anotar(r, 'marca', j, quienDonde(j) + ': fichaje de ' + m.tipo + ' anulado por supervisión');
      asegurar(true);
    } else error('Elegí qué hacer con el fichaje.');
    return conEstado(r);
  };

  F.admin_aplicar = (uid, a) => {
    const r = exigir(uid, 'admin'), p = a.p || {}, t = ahora(), h = hoy();
    const dias = l => Array.from(new Set((l || []).map(Number))).sort((x, y) => x - y);
    const fecha = v => (v ? String(v) : null);
    for (const x of p.asigs || []) {
      if (x.modalidad !== 'fijo' && x.modalidad !== 'hora') error('Elegí fijo o por hora.');
      const n = { sede_id: entero(x.sede), dias: dias(x.dias), ti: Number(x.ti), tf: Number(x.tf), modalidad: x.modalidad, valor: Number(x.valor), activa: x.activa !== false, desde: fecha(x.desde), hasta: fecha(x.hasta) };
      if (!sede(n.sede_id) || !n.dias.length || !(n.valor > 0) || !(n.tf > n.ti && n.tf - n.ti <= 1440)) throw new Dem('23514', 'new row violates check constraint');
      if (entero(x.id) != null) {
        const q = asignacion(entero(x.id));
        if (!q) error('No se encontró la asignación.');
        const clave = y => JSON.stringify([y.sede_id, y.dias, y.ti, y.tf, y.activa, y.desde, y.hasta]);
        if (clave(q) !== clave(n)) q.modificada = t;
        Object.assign(q, n);
      } else {
        if (!persona(entero(x.c))) throw new Dem('23503', 'insert or update violates foreign key constraint');
        M.asignaciones.push(Object.assign({ id: nuevoId(), persona_id: entero(x.c), creada: t, modificada: t }, n));
      }
    }
    for (const x of p.franjas || []) {
      const n = { dias: dias(x.dias), ti: Number(x.ti), tf: Number(x.tf), dot: Number(x.dot) };
      if (entero(x.id) != null) {
        const q = M.franjas.find(y => y.id === entero(x.id));
        if (!q) error('No se encontró la franja.');
        Object.assign(q, n);
      } else M.franjas.push(Object.assign({ id: nuevoId(), sede_id: entero(x.sede) }, n));
    }
    const frQ = (p.franjasQuitar || []).map(entero);
    M.franjas = M.franjas.filter(x => frQ.indexOf(x.id) < 0);
    for (const x of p.licencias || []) {
      if (['vacaciones', 'licencia', 'franco'].indexOf(x.tipo) < 0) error('Elegí el tipo de ausencia.');
      if (M.licencias.some(l => l.persona_id === entero(x.c) && l.desde <= x.hasta && x.desde <= l.hasta)) error('Ya tiene una ausencia cargada en esas fechas.');
      M.licencias.push({ id: nuevoId(), persona_id: entero(x.c), tipo: x.tipo, desde: x.desde, hasta: x.hasta });
    }
    const liQ = (p.licenciasQuitar || []).map(entero);
    for (const j of M.jornadas) if (j.f === h && j.entrada == null && liQ.indexOf(j.licencia_id) >= 0) { j.justif = null; j.licencia_id = null; j.cerrada = false; }
    for (const j of M.jornadas) if (liQ.indexOf(j.licencia_id) >= 0) j.licencia_id = null;
    M.licencias = M.licencias.filter(x => liQ.indexOf(x.id) < 0);
    for (const x of p.feriados || []) {
      if (['feriado', 'no_laborable'].indexOf(x.tipo) < 0) error('Elegí si es feriado o día no laborable.');
      const q = M.feriados.find(y => y.f === x.f);
      if (q) { q.nombre = texto(x.nombre).trim().slice(0, 80); q.tipo = x.tipo; }
      else M.feriados.push({ f: x.f, nombre: texto(x.nombre).trim().slice(0, 80), tipo: x.tipo, nota: texto(x.nota), propio: x.propio === true });
    }
    const feQ = p.feriadosQuitar || [];
    M.feriados = M.feriados.filter(x => feQ.indexOf(x.f) < 0);
    if (p.P && typeof p.P === 'object') {
      const lim = { gracia: [0, 180], rojo: [0, 180], margen: [0, 180], topeFijo: [1, 24], topeHora: [1, 24], traslado: [0, 180], recFeriado: [0, 300], recNoLab: [0, 300] };
      const n = Object.assign({}, M.config.p);
      for (const k of Object.keys(lim)) {
        if (!(k in p.P)) continue;
        const v = Number(p.P[k]);
        if (!Number.isInteger(v) || v < lim[k][0] || v > lim[k][1]) error('Usá un número entre ' + lim[k][0] + ' y ' + lim[k][1] + '.');
        n[k] = v;
      }
      if (n.rojo < n.gracia) error('La demora que pasa a rojo no puede ser menor que la gracia de llegada.');
      M.config.p = n;
    }
    for (const v of p.avisos || []) if (texto(v).trim()) M.avisos.push({ id: nuevoId(), creado: t, texto: texto(v).slice(0, 600) });
    M.avisos = M.avisos.sort((x, y) => y.id - x.id).slice(0, 20);
    cambio(r, 'aplicar', p);
    asegurar(true);
    return conEstado(r);
  };
  F.admin_persona = (uid, a) => {
    const r = exigir(uid, 'admin'), p = a.p || {};
    const dni = texto(p.dni).replace(/[^0-9]/g, ''), nombre = texto(p.nombre).trim(), apellido = texto(p.apellido).trim(), rol = p.rol == null ? 'colaborador' : p.rol, activa = p.activa !== false;
    if (!/^[0-9]{6,9}$/.test(dni)) error('Escribí el DNI solo con números, sin puntos.');
    if (!nombre) error('Escribí el nombre.');
    if (nombre.length > 30 || apellido.length > 40) error('El nombre es demasiado largo.');
    if (['colaborador', 'supervisor', 'admin'].indexOf(rol) < 0) error('Elegí el rol.');
    if (entero(p.id) != null) {
      const q = persona(entero(p.id));
      if (!q) error('No se encontró la persona.');
      if (M.personas.some(x => x.dni === dni && x.id !== q.id)) error('Ya hay otra persona con ese DNI.');
      if (q.rol === 'admin' && (rol !== 'admin' || !activa) && !M.personas.some(x => x.rol === 'admin' && x.activa && x.id !== q.id)) error('Tiene que quedar al menos una persona activa con rol de administración.');
      const antes = { dni: q.dni, activa: q.activa };
      Object.assign(q, { dni: dni, nombre: nombre, apellido: apellido, rol: rol, activa: activa });
      const u = M.usuarios.find(x => x.id === q.auth_id);
      if (u && dni !== antes.dni) u.email = dni + '@dni.invalid';
      if (u && antes.activa && !activa) cerrarSesiones(u.id);
    } else {
      if (M.config.clave_inicial == null) error('Antes de dar de alta personas, definí la clave inicial.');
      if (M.personas.some(x => x.dni === dni)) error('Ya hay una persona con ese DNI.');
      M.personas.push({ id: nuevoId(), auth_id: crearAcceso(dni, M.config.clave_inicial), dni: dni, nombre: nombre, apellido: apellido, rol: rol, activa: true, debe_cambiar_clave: true, clave_cambiada: null, ultimo_uso: null, creada: ahora() });
    }
    cambio(r, 'persona', p);
    asegurar(true);
    return conEstado(r);
  };
  F.admin_restablecer = (uid, a) => {
    const r = exigir(uid, 'admin'), q = persona(Number(a.p_persona));
    if (!q) error('No se encontró la persona.');
    if (q.id === r.id) error('Tu propia clave se cambia desde tu menú, con Cambiar clave.');
    if (M.config.clave_inicial == null) error('Primero definí la clave inicial.');
    ponerClave(q.auth_id, M.config.clave_inicial);
    q.debe_cambiar_clave = true;
    cambio(r, 'restablecer', { persona: q.id });
    return conEstado(r);
  };
  F.admin_telefono = (uid, a) => {
    const r = exigir(uid, 'admin'), id = Number(a.p_persona);
    if (a.p_accion === 'liberar') M.dispositivos = M.dispositivos.filter(d => d.persona_id !== id);
    else if (a.p_accion === 'aceptar') {
      const n = M.dispositivos.filter(d => d.persona_id === id && d.estado === 'otro').sort((x, y) => y.visto - x.visto)[0];
      if (!n) error('No hay un teléfono nuevo para aceptar.');
      M.dispositivos = M.dispositivos.filter(d => d.persona_id !== id || d === n);
      n.estado = 'registrado';
    } else error('Elegí qué hacer con el teléfono.');
    cambio(r, 'telefono', { persona: id, accion: a.p_accion });
    return conEstado(r);
  };
  F.admin_clave_inicial = (uid, a) => {
    const r = exigir(uid, 'admin'), c = a.p_clave;
    if (typeof c !== 'string' || c.length < 6 || c.length > 40 || c !== c.trim()) error('La clave inicial tiene que tener entre 6 y 40 caracteres, sin espacios al principio ni al final.');
    M.config.clave_inicial = c;
    for (const q of M.personas) if (q.debe_cambiar_clave && q.auth_id) ponerClave(q.auth_id, c);
    cambio(r, 'clave_inicial', null);
    return conEstado(r);
  };
  F.admin_sede = (uid, a) => {
    const r = exigir(uid, 'admin'), p = a.p || {};
    const nombre = texto(p.nombre).trim(), dir = texto(p.direccion).trim().slice(0, 160);
    const num = v => (texto(v).trim() === '' ? null : Number(texto(v).trim()));
    const lat = num(p.lat), lon = num(p.lon), radio = entero(p.radio) == null ? 150 : entero(p.radio), ver = p.verificacion == null ? 'pantalla' : p.verificacion, activa = p.activa !== false;
    if (!nombre || nombre.length > 60) error('Escribí el nombre de la sede.');
    if (Number.isNaN(lat) || Number.isNaN(lon)) throw new Dem('22P02', 'invalid input syntax for type double precision');
    if ((lat == null) !== (lon == null) || (lat != null && (lat < -90 || lat > 90 || lon < -180 || lon > 180))) error('Revisá la ubicación: hacen falta latitud y longitud.');
    if (radio < 30 || radio > 2000) error('El radio va de 30 a 2000 metros.');
    if (['pantalla', 'impreso', 'ubicacion'].indexOf(ver) < 0) error('Elegí cómo se verifica el fichaje.');
    const n = { nombre: nombre, direccion: dir, lat: lat, lon: lon, radio_m: radio, verificacion: ver };
    if (entero(p.id) != null) {
      const s = sede(entero(p.id));
      if (!s) error('No se encontró la sede.');
      Object.assign(s, n, { activa: activa });
    } else M.sedes.push(Object.assign({ id: nuevoId(), secreto: azar(20), codigo_fijo: azar(9).toString('hex'), activa: true, creada: ahora() }, n));
    cambio(r, 'sede', p);
    return conEstado(r);
  };
  F.admin_sede_codigo = (uid, a) => {
    const r = exigir(uid, 'admin'), s = sede(Number(a.p_sede));
    if (!s) error('No se encontró la sede.');
    s.secreto = azar(20); s.codigo_fijo = azar(9).toString('hex');
    cambio(r, 'sede_codigo', { sede: s.id });
    return conEstado(r);
  };
  F.admin_vincular = (uid, a) => {
    const r = exigir(uid, 'admin'), id = Number(a.p_sede), cod = String(azar(4).readUInt32BE(0) % 100000000).padStart(8, '0');
    if (!sede(id)) error('No se encontró la sede.');
    M.vinculos = M.vinculos.filter(v => v.vence >= ahora() && v.sede_id !== id);
    M.vinculos.push({ codigo_hash: huella(cod), sede_id: id, vence: ahora() + 900000, creado_por: r.id });
    return { ok: true, codigo: cod, minutos: 15 };
  };
  F.admin_pantalla = (uid, a) => {
    const r = exigir(uid, 'admin'), p = M.pantallas.find(x => x.id === Number(a.p_id));
    if (p) p.revocada = true;
    return conEstado(r);
  };
  F.pantalla_vincular = (uid, a) => {
    const cod = texto(a.p_codigo).replace(/[^0-9]/g, '');
    if (M.intentos.filter(x => x.clave === 'v' && x.momento > ahora() - 900000).length >= 20) return { ok: false, error: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' };
    const v = M.vinculos.find(x => x.codigo_hash === huella(cod) && x.vence > ahora());
    if (!v || !cod) {
      M.intentos.push({ clave: 'v', momento: ahora() });
      return { ok: false, error: 'Ese código no es válido o ya venció. Pedí uno nuevo en Administración.' };
    }
    const llave = azar(32).toString('hex');
    M.pantallas.push({ id: nuevoId(), sede_id: v.sede_id, token_hash: huella(llave), nombre: texto(a.p_nombre).trim().slice(0, 60), creada: ahora(), vista: ahora(), revocada: false });
    M.vinculos = M.vinculos.filter(x => x !== v);
    return { ok: true, token: llave };
  };
  F.pantalla_estado = (uid, a) => {
    const p = M.pantallas.find(x => x.token_hash === huella(texto(a.p_token)) && !x.revocada);
    if (!p) return { ok: false, error: 'Esta pantalla ya no está vinculada. Pedí un código nuevo en Administración.' };
    const s = sede(p.sede_id);
    p.vista = ahora();
    return { ok: true, sede: s.nombre, sedeId: String(s.id), verificacion: s.verificacion, activa: s.activa, secreto: s.secreto.toString('base64'), fijo: s.codigo_fijo, periodo: 30, ts: Math.floor(ahora()) };
  };

  /* ---------- HTTP ---------- */
  let extras = {};
  try {
    const lineas = fs.readFileSync(path.join(carpeta, '_headers'), 'utf8').split('\n');
    const desde = lineas.indexOf('/*');
    for (let i = desde + 1; desde >= 0 && i < lineas.length && /^\s+\S/.test(lineas[i]); i++) { const m = /^\s+([^:]+):\s*(.*)$/.exec(lineas[i]); if (m) extras[m[1]] = m[2]; }
  } catch (e) { extras = {}; }
  const json = (res, estado, cuerpo) => { res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(cuerpo == null ? '' : JSON.stringify(cuerpo)); };
  const cuerpoDe = req => new Promise(ok => { let t = ''; req.on('data', d => { t += d; }); req.on('end', () => { try { ok(t ? JSON.parse(t) : {}); } catch (e) { ok({}); } }); });
  function sesionDe(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return { uid: null };
    const k = M.llaves[m[1]];
    if (!k || k.vence < Date.now()) return { vencida: true };
    return { uid: k.uid, llave: k };
  }
  async function atender(req, res) {
    const u = new URL(req.url, 'http://localhost');
    const esApi = u.pathname.indexOf('/auth/v1/') === 0 || u.pathname.indexOf('/rest/v1/') === 0 || u.pathname.indexOf('/functions/v1/') === 0;
    if (esApi) {
      M.pedidos.push(req.method + ' ' + u.pathname + u.search);
      /* Para las pruebas: caido = true corta la conexión; un número responde con ese error del servidor. */
      if (M.caido === true) { req.socket.destroy(); return; }
      if (M.caido) { json(res, M.caido, { message: 'Service unavailable' }); return; }
      if (!req.headers.apikey) { json(res, 401, { message: 'No API key found in request' }); return; }
      const cuerpo = await cuerpoDe(req);
      if (u.pathname === '/auth/v1/token') {
        const tipo = u.searchParams.get('grant_type');
        if (tipo === 'password') {
          const us = M.usuarios.find(x => x.email === cuerpo.email && x.clave === cuerpo.password);
          if (!us) { json(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }); return; }
          json(res, 200, abrirSesion(us));
          return;
        }
        const uid = M.renovables[cuerpo.refresh_token], us = M.usuarios.find(x => x.id === uid);
        if (!us) { json(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }); return; }
        delete M.renovables[cuerpo.refresh_token];
        json(res, 200, abrirSesion(us));
        return;
      }
      const s = sesionDe(req);
      /* La función que convierte el enlace de Compartir de Google Maps en coordenadas (supabase/functions/ubicacion).
         Acá no sale a internet: contesta con los enlaces de prueba cargados en M.enlaces. */
      if (u.pathname === '/functions/v1/ubicacion') {
        if (!s.uid) { json(res, 401, { code: 401, message: 'Invalid JWT' }); return; }
        const clave = String(cuerpo.enlace || '').trim().replace(/^https?:\/\//i, '').split('?')[0];
        json(res, 200, /^(maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/i.test(clave) ? (M.enlaces[clave] || { ok: false, motivo: 'no_existe' }) : { ok: false, motivo: 'enlace' });
        return;
      }
      if (u.pathname === '/auth/v1/user' && req.method === 'PUT') {
        if (!s.uid) { json(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }); return; }
        if (s.llave.sinSesion) { json(res, 403, { code: 403, error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' }); return; }
        const us = M.usuarios.find(x => x.id === s.uid);
        if (typeof cuerpo.password !== 'string' || cuerpo.password.length < 6) { json(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' }); return; }
        if (cuerpo.password === us.clave) { json(res, 422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' }); return; }
        us.clave = cuerpo.password;
        json(res, 200, { id: us.id, email: us.email });
        return;
      }
      if (u.pathname === '/auth/v1/logout') { res.writeHead(204); res.end(); return; }
      const m = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(u.pathname);
      if (!m || req.method !== 'POST') { json(res, 404, { code: 'PGRST205', message: 'Could not find the table in the schema cache' }); return; }
      if (s.vencida) { json(res, 401, { code: 'PGRST303', message: 'JWT expired' }); return; }
      if (!F[m[1]]) { json(res, 404, { code: 'PGRST202', message: 'Could not find the function public.' + m[1] + ' in the schema cache' }); return; }
      if (!s.uid && ANONIMAS.indexOf(m[1]) < 0) { json(res, 401, { code: '42501', message: 'permission denied for function ' + m[1] }); return; }
      try { json(res, 200, F[m[1]](s.uid, cuerpo)); }
      catch (e) {
        if (!(e instanceof Dem)) { console.error('servidor de pruebas, ' + m[1] + ':', e); json(res, 500, { code: 'XX000', message: String(e.message || e) }); return; }
        json(res, 400, { code: e.codigo, details: null, hint: null, message: e.message });
      }
      return;
    }
    let ruta = decodeURIComponent(u.pathname);
    if (ruta === '/') ruta = '/index.html';
    const archivo = path.join(carpeta, ruta);
    if (archivo.indexOf(carpeta) !== 0 || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('No encontrado'); return; }
    res.writeHead(200, Object.assign({ 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }, extras));
    res.end(fs.readFileSync(archivo));
  }

  const servidor = http.createServer((req, res) => { atender(req, res).catch(e => { console.error(e); try { json(res, 500, { message: 'error' }); } catch (x) { /* ya respondido */ } }); });
  const api = {
    M: M, F: F, totp: totp, rel: rel, instante: instante, asegurar: asegurar,
    url: '',
    /* Pone el reloj del servidor en una fecha y hora de Mendoza: reloj('2026-11-27', '07:55'). */
    reloj(f, hhmm) { const p = hhmm.split(':').map(Number); M.desfase = instante(f, p[0] * 60 + p[1]) - Date.now(); },
    avanzar(min) { M.desfase += min * 60000; },
    hoy: hoy, ahora: ahora,
    /* Deja listo un código de primera configuración, como hace el dueño del sistema antes de entregarlo. */
    instalacion(codigo) { M.config.instalacion_hash = huella(String(codigo).replace(/[^A-Za-z0-9]/g, '').toUpperCase()); M.config.instalacion_vence = Date.now() + 3600000; },
    codigo(sedeId) { return totp(sede(Number(sedeId)).secreto, paso()); },
    vencerLlaves() { for (const k of Object.keys(M.llaves)) M.llaves[k].vence = 0; },
    cerrar() { return new Promise(ok => { servidor.closeAllConnections(); servidor.close(() => ok()); }); }
  };
  return new Promise(ok => {
    servidor.listen(o.puerto || 0, '127.0.0.1', () => { api.url = 'http://localhost:' + servidor.address().port + '/'; ok(api); });
  });
}

module.exports = { crear };

if (require.main === module) {
  crear({ puerto: Number(process.argv[2]) || 8765 }).then(s => {
    s.instalacion('PRUEBA-2026');
    console.log('Versión real con datos en memoria: ' + s.url + '\nCódigo de primera configuración: PRUEBA-2026\nPantalla de sede: ' + s.url + '#pantalla');
  });
}
