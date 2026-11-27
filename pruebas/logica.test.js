'use strict';
/* Corre las reglas en Node: node pruebas/logica.test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const codigo = fs.readFileSync(path.join(__dirname, '..', 'src', 'logica.js'), 'utf8');
const ctx = vm.createContext({ console });
const nombres = ['evaluar', 'sembrar', 'tick', 'avanzarDia', 'cerrarJornada', 'marcarEntrada', 'resolver', 'deshacer', 'justificar', 'racha', 'resumenMes', 'resumenAsig', 'baseAsig', 'recargoFeriado', 'pendientes', 'pendienteDeclarar', 'declararOlvido', 'elegirColab', 'tramosHoy', 'tramosDelDia', 'tramoActual', 'ultimoCerrado', 'ev', 'relDe', 'ponerParam', 'agregarAsig', 'editarAsig', 'editarNombre', 'fichajeAsistido', 'agregarNovedad', 'alertas', 'coberturaDia', 'huecos', 'agregarLicencia', 'quitarLicencia', 'proximaLicencia', 'agregarFranja', 'editarFranja', 'quitarFranja', 'activos', 'feriadoEl', 'agregarFeriado', 'editarFeriado', 'quitarFeriado', 'impactoFeriado', 'minutosDelDia', 'topeDelDia', 'quitarAviso', 'hm', 'dur', 'aMin', 'aRel', 'finRel', 'lunesDe', 'diasCorridos', 'listaDias', 'esFecha', 'dIso'];
vm.runInContext(codigo + '\nthis.__api = { ' + nombres.join(', ') + ' };', ctx);
const L = ctx.__api;

let ok = 0, mal = 0;
function igual(real, esperado, nombre) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a === b) ok++;
  else { mal++; console.log('FALLA  ' + nombre + '\n   esperado ' + b + '\n   real     ' + a); }
}

/* --- Regla del semáforo --- */
const P = { gracia: 5, rojo: 15, margen: 15 };
const base = { f: '2026-11-26', ti: 480, tf: 840, entrada: 482, salida: 845, cerrada: true, decl: null, rev: null, salidaVal: null, justif: null };
const J = o => Object.assign({}, base, o);
const E = o => L.evaluar(J(o), P, 2040);
igual([E({}).estado, E({}).normales, E({ entrada: 470 }).normales], ['verde', 358, 360], 'a horario es verde y llegar antes no suma');
igual([E({ entrada: 485 }).estado, E({ entrada: 486 }).detalle, E({ entrada: 495 }).estado, E({ entrada: 496 }).estado], ['verde', 'Llegada 6 min tarde', 'amarillo', 'rojo'], 'umbrales de llegada');
igual([E({ salida: 855 }).estado, E({ salida: 856 }).estado, E({ salida: 856 }).enRevision, E({ salida: 856 }).normales], ['verde', 'revision', 16, 358], 'umbral del control excedente');
igual(E({ salida: null }).detalle, 'En revisión: salida sin marcar', 'salida sin marcar queda en revisión');
igual([E({ salida: 910, rev: 'extra', salidaVal: 910 }).estado, E({ salida: 910, rev: 'extra', salidaVal: 910 }).extra], ['estrella', 70], 'extra verificada es estrella');
igual(E({ salida: null, rev: 'olvido', salidaVal: 840 }).detalle, 'Salida sin marcar', 'olvido resuelto es amarillo');
igual([E({ entrada: null, salida: null }).estado, E({ entrada: null, salida: null }).inasistencia], ['rojo', true], 'sin entrada es inasistencia');
igual(E({ entrada: null, salida: null, justif: 'vacaciones' }).detalle, 'Vacaciones', 'vacaciones es un estado neutro');
igual(E({ entrada: 489, salida: 910, rev: 'extra', salidaVal: 910 }).detalle, 'Llegada 9 min tarde. Hora extra verificada: 1 h 10 min', 'llegada tarde con extra sigue amarillo');
const vivo = (rel, o) => L.evaluar(J(Object.assign({ entrada: null, salida: null, cerrada: false }, o)), P, rel);
igual([vivo(470).detalle, vivo(483).estado, vivo(490).estado, vivo(500).estado], ['Turno sin empezar', 'programada', 'amarillo', 'rojo'], 'estados en vivo antes de ingresar');
const noche = o => L.evaluar(Object.assign({ f: '2026-11-29', ti: 1320, tf: 1800, entrada: 1318, salida: 1803, cerrada: true, decl: null, rev: null, salidaVal: null, justif: null }, o), P, 3000);
igual([noche({}).estado, noche({}).normales, noche({ entrada: 1340 }).estado, noche({ salida: 1830 }).detalle], ['verde', 480, 'rojo', 'En revisión: 30 min de más'], 'turno nocturno que cruza la medianoche');
igual([L.hm(1800), L.hm(1439), L.hm(-6), L.finRel(1320, 360), L.finRel(480, 840), L.finRel(0, 0)], ['06:00', '23:59', '23:54', 1800, 840, 1440], 'horas que cruzan la medianoche');
igual([L.aRel({ ti: 1320 }, 370), L.aRel({ ti: 1320 }, 1410), L.aRel({ ti: 480 }, 850), L.aRel({ ti: 480 }, 30)], [1810, 1410, 850, 1470], 'hora del día llevada al tramo');
igual([L.listaDias([1, 2, 3, 4, 5, 6, 7]), L.listaDias([6, 7]), L.listaDias([5, 3]), L.listaDias([1, 2, 3, 4, 5]), L.dIso('2026-11-29'), L.lunesDe('2026-11-29')], ['todos los días', 'los sábados y domingos', 'los miércoles y viernes', 'de lunes a viernes', 7, '2026-11-23'], 'días de la semana');

/* --- Datos de ejemplo --- */
const S = L.sembrar();
const de = (S0, a, f) => S0.jornadas.find(j => j.a === a && j.f === f);
igual(S.jornadas.length, 6 * 19 + 7 + 20 + 7 + 7, 'cantidad de tramos sembrados');
igual(L.ev(S, de(S, 'a1', '2026-11-26')).estado, 'estrella', 'Marta en Centro, jue 26');
igual(L.ev(S, de(S, 'a1', '2026-11-24')).detalle, 'En revisión: 2 h 40 min de más', 'Marta en Centro, mar 24');
igual(L.ev(S, de(S, 'a1', '2026-11-23')).estado, 'verde', 'el feriado del lunes 23 se trabajó');
igual(L.tramosHoy(S, 'c1').map(j => j.a), ['a1', 'a7'], 'Marta tiene dos tramos hoy');
igual(L.pendientes(S).map(j => j.a + ' ' + j.f), ['a6 2026-11-27', 'a2 2026-11-26', 'a1 2026-11-24'], 'tres casos para resolver');
igual(L.racha(S, 'c1'), 1, 'racha de Marta: el día incompleto no cuenta');
igual(L.activos(S).length, 8, 'ocho personas activas');
const h26 = de(S, 'a8', '2026-11-26');
igual([L.ev(S, h26).estado, h26.salida > 1440, L.tramosHoy(S, 'c7').length, L.ultimoCerrado(S, 'c7').id === h26.id], ['verde', true, 1, true], 'el turno de anoche de Hugo cerró hoy a la madrugada');
igual(L.tramosDelDia(S).length, 8, 'equipo de hoy: siete tramos más el nocturno que terminó a la mañana');
igual(!!de(S, 'a9', '2026-11-22'), true, 'Paula trabaja los domingos');
igual(L.alertas(S), [], 'sin alertas de tope en los datos de ejemplo');

/* --- Un día con dos sedes --- */
const S2 = L.sembrar();
L.cerrarJornada(S2, L.tramoActual(S2, 'c1').id, { conf: true });
igual([L.ev(S2, de(S2, 'a1', '2026-11-27')).estado, L.tramoActual(S2, 'c1').a, L.racha(S2, 'c1')], ['verde', 'a7', 1], 'cierra Centro, sigue Parque y la racha espera');
S2.ahora = 900; L.tick(S2);
L.marcarEntrada(S2, de(S2, 'a7', '2026-11-27').id);
S2.ahora = 1082;
L.cerrarJornada(S2, de(S2, 'a7', '2026-11-27').id, { conf: true });
igual([L.ev(S2, de(S2, 'a7', '2026-11-27')).estado, L.racha(S2, 'c1'), L.tramoActual(S2, 'c1')], ['verde', 2, null], 'con los dos tramos en verde el día suma a la racha');
igual([L.minutosDelDia(S2, 'c1', '2026-11-27'), L.topeDelDia(S2, 'c1', '2026-11-27'), L.topeDelDia(S2, 'c6', '2026-11-27')], [363 + 182, 10, 8], 'horas del día y tope que corresponde');

/* --- Turno nocturno en la demo --- */
const S7 = L.sembrar();
L.elegirColab(S7, 'c7');
L.avanzarDia(S7); L.avanzarDia(S7);
igual([S7.hoy, L.hm(S7.ahora), L.tramoActual(S7, 'c7').ti], ['2026-11-29', '21:50', 1320], 'el domingo Hugo entra a las 22:00');
S7.ahora = 1321;
L.marcarEntrada(S7, L.tramoActual(S7, 'c7').id);
L.avanzarDia(S7);
const hn = de(S7, 'a8', '2026-11-29');
igual([S7.hoy, L.hm(S7.ahora), hn.cerrada, L.tramoActual(S7, 'c7').id === hn.id, L.relDe(S7, hn)], ['2026-11-30', '05:50', false, true, 1790], 'el turno nocturno sigue abierto al cambiar el día');
S7.ahora = 362;
L.cerrarJornada(S7, hn.id, { conf: true });
igual([hn.salida, L.ev(S7, hn).estado, L.ev(S7, hn).normales, L.tramoActual(S7, 'c7').f], [1802, 'verde', 479, '2026-11-30'], 'cierra a las 06:02 y queda el turno de esta noche');
L.avanzarDia(S7); L.avanzarDia(S7);
igual(L.ev(S7, de(S7, 'a8', '2026-11-30')).estado, 'verde', 'el turno que no tocó siguió su guion');
const S8 = L.sembrar();
L.elegirColab(S8, 'c7');
for (let i = 0; i < 2; i++) L.avanzarDia(S8);
S8.ahora = 1320; L.marcarEntrada(S8, L.tramoActual(S8, 'c7').id);
L.avanzarDia(S8); L.avanzarDia(S8);
igual(L.ev(S8, de(S8, 'a8', '2026-11-29')).detalle, 'En revisión: salida sin marcar', 'un turno nocturno sin cerrar va a revisión al día subsiguiente');
igual(L.declararOlvido(S8, de(S8, 'a8', '2026-11-29').id, 365), '', 'declara que salió a las 06:05');
igual(de(S8, 'a8', '2026-11-29').decl.hora, 1805, 'la hora declarada queda en el día siguiente');
igual(L.resolver(S8, de(S8, 'a8', '2026-11-29').id, 'olvido', 365), '', 'el supervisor valida la salida de las 06:05');
igual(L.ev(S8, de(S8, 'a8', '2026-11-29')).estado, 'amarillo', 'queda amarillo por salida sin marcar');

/* --- Reglas de asignación y topes --- */
const S3 = L.sembrar();
const nueva = o => Object.assign({ colab: 'c2', sede: 'centro', dias: [1, 2, 3, 4, 5], ti: '14:00', tf: '17:00', modalidad: 'hora', valor: '6500' }, o);
igual(L.agregarAsig(S3, nueva({ sede: 'norte' })), 'Ya tiene una asignación en Sede Norte. En la misma sede, el tiempo de más se registra como hora extra.', 'misma sede: es hora extra');
igual(L.agregarAsig(S3, nueva({ ti: '12:00', tf: '16:00' })), 'Se superpone con su turno de 07:00 a 13:00 en Sede Norte.', 'no se superponen horarios');
igual(L.agregarAsig(S3, nueva({ colab: 'c7', sede: 'norte', dias: [1], ti: '05:00', tf: '09:00' })), 'Se superpone con su turno de 22:00 a 06:00 en Sede Centro.', 'detecta la superposición con un turno que viene de la noche anterior');
igual(L.agregarAsig(S3, nueva({ colab: 'c7', sede: 'norte', dias: [6], ti: '05:00', tf: '09:00' })), '', 'el sábado a la mañana Hugo está libre');
igual(L.agregarAsig(S3, nueva({})), '', 'Diego suma 3 h por hora en Centro: 9 h, dentro del tope de 10');
igual([L.alertas(S3).length, S3.avisos.length], [0, 0], 'sin alertas ni avisos dentro del tope');
igual(L.editarAsig(S3, S3.asigs[S3.asigs.length - 1].id, 'tf', '19:00'), '', 'se extiende a 5 h: 11 h en el día');
igual(L.alertas(S3).map(x => x.texto), ['Diego Rojas suma 11 h de lunes a viernes, por encima del tope de 10 h para quien trabaja por hora.'], 'alerta de tope por hora');
igual(S3.avisos[0].texto, 'Asignación por encima del tope. Diego Rojas suma 11 h de lunes a viernes, por encima del tope de 10 h para quien trabaja por hora.', 'aviso al supervisor por exceso de tope');
igual(L.ponerParam(S3, 'topeHora', '12'), '', 'administración sube el tope por hora');
igual([S3.avisos[0].texto, L.alertas(S3).length], ['Administración cambió el tope diario de quienes trabajan por hora de 10 a 12 h.', 0], 'el cambio de tope avisa al supervisor y la alerta se va');
igual(L.agregarAsig(S3, { colab: 'c6', sede: 'parque', dias: [1, 2], ti: '14:00', tf: '18:00', modalidad: 'fijo', valor: '400000' }), '', 'Néstor suma una asignación fija');
igual(L.alertas(S3).map(x => x.texto), ['Néstor Vega suma 10 h en asignaciones fijas los lunes y martes, por encima del tope de 8 h.'], 'alerta de tope en fijos');
igual(L.ponerParam(S3, 'traslado', '90'), '', 'cambia el mínimo de traslado');
igual(L.alertas(S3).filter(x => x.tipo === 'traslado').length, 3, 'alertas de traslado para Marta, Diego y Néstor');
L.quitarAviso(S3, S3.avisos[0].id);
igual(S3.avisos.length, 2, 'el supervisor marca un aviso como visto');
igual(L.editarAsig(S3, 'a2', 'modalidad', 'fijo'), '', 'cambia la modalidad de una asignación');
igual(S3.asigs[1].valor, 950000, 'cambiar la modalidad repone el valor de referencia');
igual(L.editarAsig(S3, 'a8', 'tf', '07:00'), '', 'el turno nocturno pasa a terminar a las 07:00');
igual([S3.asigs.find(a => a.id === 'a8').tf, L.editarAsig(S3, 'a8', 'ti', '23:00'), S3.asigs.find(a => a.id === 'a8').tf], [1860, '', 1860], 'editar horas conserva el cruce de medianoche');
igual(L.agregarAsig(S3, { colab: 'nuevo', nombre: 'Ana Ruiz', sede: 'norte', dias: [6, 7], ti: '09:00', tf: '13:00', modalidad: 'hora', valor: '7000' }), '', 'persona nueva para el fin de semana');
igual(L.activos(S3).length, 9, 'nueve personas activas');

/* --- Horario contratado y cobertura --- */
const S4 = L.sembrar();
const seg = (S0, sede, f) => L.coberturaDia(S0, sede, f).segmentos.map(g => L.hm(g.ti) + '-' + (g.tf === 1440 ? '24:00' : L.hm(g.tf)) + ' ' + g.pres + '/' + g.req).join(', ');
igual(seg(S4, 'centro', '2026-11-27'), '00:00-06:00 1/1, 08:00-14:00 2/2, 14:00-18:00 0/1, 22:00-24:00 0/1', 'Centro hoy: madrugada cubierta, tarde y noche del viernes vacías');
igual(seg(S4, 'centro', '2026-11-28'), '00:00-06:00 0/1, 08:00-14:00 1/2, 14:00-18:00 0/1, 22:00-24:00 0/1', 'Centro el sábado');
igual(seg(S4, 'centro', '2026-11-30'), '00:00-06:00 1/1, 08:00-14:00 1/2, 14:00-18:00 0/1, 22:00-24:00 1/1', 'Centro el lunes, con Lucía de vacaciones');
igual(seg(S4, 'parque', '2026-12-02'), '14:00-15:00 2/2, 15:00-18:00 3/3, 18:00-20:00 2/2', 'Parque un miércoles: el refuerzo suma');
igual([L.coberturaDia(S4, 'centro', '2026-12-08').feriado.nombre, L.coberturaDia(S4, 'centro', '2026-12-08').segmentos.length], ['Inmaculada Concepción de María', 4], 'el feriado también pide cobertura');
const hs = L.huecos(S4, 28).map(h => [h.sede, L.hm(h.ti) + '-' + L.hm(h.tf), h.falta, h.causa, h.fechas.length, h.fechas[0]]);
igual(hs, [
  ['centro', '14:00-18:00', 1, 'sin asignación', 20, '2026-11-27'],
  ['centro', '22:00-06:00', 1, 'sin asignación', 8, '2026-11-27'],
  ['centro', '08:00-18:00', 1, 'sin asignación', 8, '2026-11-28'],
  ['centro', '08:00-14:00', 1, 'Lucía Paredes de vacaciones', 5, '2026-11-30'],
  ['parque', '14:00-20:00', 1, 'Ramón Ortiz con licencia', 1, '2026-12-03'],
  ['centro', '08:00-14:00', 1, 'Marta Giménez de vacaciones', 8, '2026-12-14'],
  ['parque', '15:00-18:00', 1, 'Marta Giménez de vacaciones', 3, '2026-12-16']
], 'franjas sin cubrir de las próximas cuatro semanas, con la noche entera');
igual(L.agregarAsig(S4, { colab: 'c5', sede: 'centro', dias: [5, 6], ti: '22:00', tf: '06:00', modalidad: 'hora', valor: '6500' }), '', 'Carla cubre las noches de viernes y sábado en Centro');
igual(seg(S4, 'centro', '2026-11-28'), '00:00-06:00 1/1, 08:00-14:00 1/2, 14:00-18:00 0/1, 22:00-24:00 1/1', 'las noches del fin de semana quedan cubiertas');
igual(L.alertas(S4).map(x => x.texto), ['Carla Sosa suma 14 h los viernes, por encima del tope de 10 h para quien trabaja por hora.'], 'y el sistema avisa que el viernes supera el tope');
igual(L.agregarFranja(S4, { sede: 'norte', dias: [1, 2, 3, 4, 5, 6, 7], ti: '00:00', tf: '00:00', dot: '1' }), '', 'franja de 24 horas');
igual(seg(S4, 'norte', '2026-11-29'), '00:00-24:00 0/1', 'la franja de 24 horas pide cobertura el domingo');
igual(L.editarFranja(S4, 'f3', 'dot', '3'), '', 'cambia la dotación');
L.quitarFranja(S4, 'f2');
igual(seg(S4, 'centro', '2026-12-07').indexOf('14:00-18:00'), -1, 'quitar una franja la saca de la grilla');

/* --- Feriados en la liquidación --- */
const S9 = L.sembrar();
const l23 = de(S9, 'a3', '2026-11-23'), rL = L.resumenAsig(S9, 'a3', '2026-11');
const normL23 = L.ev(S9, l23).normales;
igual([L.feriadoEl(S9, '2026-11-23').tipo, L.feriadoEl(S9, '2026-12-07').tipo, L.feriadoEl(S9, '2026-11-24')], ['feriado', 'no_laborable', null], 'agenda nacional cargada');
igual([rL.fer.feriado, rL.fer.no_laborable], [normL23, 0], 'las horas del lunes 23 cuentan como feriado');
igual(L.recargoFeriado(S9, S9.asigs[2], rL), Math.round(normL23 / 60 * 6500), 'recargo sugerido: la hora en feriado se paga doble');
igual(L.baseAsig(S9, S9.asigs[2], rL), Math.round(rL.normales / 60 * 6500) + Math.round(normL23 / 60 * 6500), 'base por hora con recargo de feriado');
igual(L.ponerParam(S9, 'recFeriado', '50'), '', 'administración cambia el recargo');
igual(L.recargoFeriado(S9, S9.asigs[2], rL), Math.round(normL23 / 60 * 6500 * 0.5), 'recargo al 50%');
const rH = L.resumenAsig(S9, 'a8', '2026-11');
const hLun = de(S9, 'a8', '2026-11-23');
igual([rH.fer.feriado, L.recargoFeriado(S9, S9.asigs[7], rH), L.baseAsig(S9, S9.asigs[7], rH)], [360 + 1440 - Math.max(hLun.entrada, 1320), 0, 950000], 'el turno nocturno fijo suma horas de feriado de dos noches, sin recargo: va por convenio');
const imp = L.impactoFeriado(S9, L.feriadoEl(S9, '2026-12-08'));
igual([imp.turnos, imp.porHora, imp.minHora], [7, 3, 1080], 'turnos del martes 8 de diciembre');
igual(L.agregarFeriado(S9, { f: '2026-12-08', nombre: 'Otro', tipo: 'feriado' }), 'Esa fecha ya está en el calendario.', 'no duplica fechas');
igual(L.agregarFeriado(S9, { f: '2026-12-24', nombre: 'Asueto de la empresa', tipo: 'no_laborable' }), '', 'agrega una fecha propia');
igual(L.editarFeriado(S9, '2026-12-07', 'feriado'), '', 'cambia el tipo de un día');
L.quitarFeriado(S9, '2026-12-24');
igual(L.feriadoEl(S9, '2026-12-24'), null, 'quita una fecha');

/* --- Licencias y vacaciones --- */
const S5 = L.sembrar();
igual(L.agregarLicencia(S5, { colab: 'c3', tipo: 'franco', desde: '2026-12-04', hasta: '2026-12-10' }), 'Ya tiene una ausencia cargada en esas fechas.', 'no superpone ausencias');
igual(L.agregarLicencia(S5, { colab: 'c5', tipo: 'franco', desde: '2026-11-27', hasta: '2026-11-27' }), '', 'franco de Carla para hoy');
igual(L.ev(S5, de(S5, 'a5', '2026-11-27')).detalle, 'Franco', 'el turno de hoy queda justificado');
L.quitarLicencia(S5, S5.licencias[S5.licencias.length - 1].id);
igual(L.ev(S5, de(S5, 'a5', '2026-11-27')).detalle, 'Todavía no ingresó', 'al quitar la ausencia vuelve a esperar el fichaje');
igual([L.proximaLicencia(S5, 'c1').desde, L.diasCorridos('2026-12-14', '2026-12-23')], ['2026-12-14', 10], 'próximas vacaciones de Marta, en días corridos');
L.avanzarDia(S5);
igual([S5.hoy, L.hm(S5.ahora), S5.jornadas.filter(j => j.f === '2026-11-28').map(j => j.a)], ['2026-11-28', '07:50', ['a9']], 'el día siguiente es sábado y trabaja Paula');
igual(L.ev(S5, de(S5, 'a7', '2026-11-27')).estado, 'verde', 'el tramo que el usuario no tocó sigue su guion');
igual(L.ev(S5, de(S5, 'a1', '2026-11-27')).detalle, 'En revisión: salida sin marcar', 'el tramo abierto sin cerrar va a revisión');
L.avanzarDia(S5); L.avanzarDia(S5);
igual([S5.hoy, L.ev(S5, de(S5, 'a3', '2026-11-30')).detalle], ['2026-11-30', 'Vacaciones'], 'el lunes Lucía empieza sus vacaciones');
for (let i = 0; i < 8; i++) L.avanzarDia(S5);
igual([S5.hoy, S5.jornadas.filter(j => j.f === '2026-12-08').length], ['2026-12-08', 7], 'el feriado del 8 de diciembre se trabaja');

/* --- Supervisión --- */
const S6 = L.sembrar();
const m24 = de(S6, 'a1', '2026-11-24');
igual(L.resolver(S6, m24.id, 'extra', 830), 'Para hora extra, la salida validada tiene que ser posterior a las 14:00.', 'validación de hora extra');
igual(L.resolver(S6, m24.id, 'extra', 1000), '', 'resuelve hora extra');
igual(S6.bitacora[0].texto, 'Marta Giménez, mar 24 en Sede Centro: hora extra verificada, 2 h 40 min', 'queda en la bitácora con la sede');
L.deshacer(S6, S6.bitacora[0].id);
igual(L.ev(S6, m24).estado, 'revision', 'deshacer reabre el caso');
igual(L.justificar(S6, de(S6, 'a7', '2026-11-20').id, 'aviso'), '', 'justifica una inasistencia');
igual(L.fichajeAsistido(S6, de(S6, 'a5', '2026-11-27').id), 'entrada', 'fichaje asistido de entrada');
igual(L.agregarNovedad(S6, 'c1', { tipo: 'insumos', crit: 'alta', texto: 'Falta papel.' }), '', 'novedad sin elegir sede');
igual(S6.novedades[0].sede, 'centro', 'la novedad toma la sede donde está la persona');
L.elegirColab(S6, 'c3');
igual(L.tramosHoy(S6, 'c3')[0].manual, true, 'elegir un colaborador lo deja en manos del usuario');
L.elegirColab(S6, 'c1');
igual(L.tramosHoy(S6, 'c3')[0].manual, false, 'al soltarlo sin tocarlo vuelve a su guion');
igual(L.ponerParam(S6, 'topeFijo', '30'), 'Usá un número entre 1 y 24.', 'valida el tope');
const cal = L.sembrar().feriados;
igual([cal.filter(x => x.f.slice(0, 4) === '2027' && x.tipo === 'feriado').length, cal.filter(x => x.f.slice(0, 4) === '2027' && x.tipo === 'no_laborable').map(x => x.f)], [16, ['2027-03-25']], 'calendario 2027: 16 feriados nacionales y el Jueves Santo no laborable');
igual([cal.every(x => L.esFecha(x.f)), cal.every((x, i) => !i || cal[i - 1].f < x.f)], [true, true], 'fechas válidas, ordenadas y sin repetir');
igual(['2027-06-21', '2027-08-16', '2027-10-11'].map(f => L.dIso(f)), [1, 1, 1], 'los feriados trasladados de 2027 caen en lunes');
igual(cal.filter(x => x.f.slice(0, 4) === '2026').map(x => x.f + ' ' + x.tipo), ['2026-11-23 feriado', '2026-12-07 no_laborable', '2026-12-08 feriado', '2026-12-25 feriado'], 'lo que queda de 2026');
const ST = L.sembrar();
igual(L.ponerParam(ST, 'topeFijo', '5'), '', 'administración baja el tope de fijos');
igual(ST.avisos[0].texto, 'Administración cambió el tope diario de las asignaciones fijas de 8 a 5 h. Con las asignaciones actuales quedan por encima: Marta Giménez, Ramón Ortiz, Néstor Vega y Hugo Luna.', 'el aviso nombra a quienes quedan por encima del tope nuevo');
igual(L.alertas(ST).filter(x => x.tipo === 'tope').map(x => x.c), ['c1', 'c4', 'c6', 'c7'], 'cada alerta dice de quién es');
igual([L.ponerParam(ST, 'topeFijo', '5'), ST.avisos.length], ['', 1], 'guardar el mismo tope no repite el aviso');

const cuenta = {};
for (const j of S.jornadas) { const e = L.ev(S, j).estado; cuenta[e] = (cuenta[e] || 0) + 1; }
console.log('Estados sembrados:', JSON.stringify(cuenta));
console.log(ok + ' correctas, ' + mal + ' fallas');
process.exit(mal ? 1 : 0);
