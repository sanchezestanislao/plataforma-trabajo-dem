'use strict';
/* Corre las reglas en Node: node pruebas/logica.test.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const codigo = fs.readFileSync(path.join(__dirname, '..', 'src', 'logica.js'), 'utf8');
const ctx = vm.createContext({ console });
const nombres = ['evaluar', 'sembrar', 'tick', 'avanzarDia', 'cerrarJornada', 'marcarEntrada', 'resolver', 'deshacer', 'justificar', 'racha', 'resumenMes', 'resumenAsig', 'recargoFeriado', 'pendientes', 'pendienteDeclarar', 'declararOlvido', 'elegirColab', 'tramosHoy', 'tramosDelDia', 'tramoActual', 'ultimoCerrado', 'ev', 'relDe', 'ponerParam', 'agregarAsig', 'editarAsig', 'editarNombre', 'fichajeAsistido', 'agregarNovedad', 'alertas', 'coberturaDia', 'huecos', 'agregarLicencia', 'quitarLicencia', 'proximaLicencia', 'agregarFranja', 'editarFranja', 'quitarFranja', 'activos', 'feriadoEl', 'agregarFeriado', 'editarFeriado', 'quitarFeriado', 'impactoFeriado', 'minutosDelDia', 'topeDelDia', 'quitarAviso', 'hm', 'dur', 'aMin', 'aRel', 'finRel', 'lunesDe', 'diasCorridos', 'listaDias', 'esFecha', 'dIso', 'esPropia', 'vivoHoy', 'colabSel', 'valorSugerido', 'avanceAsig', 'desviosDe', 'preliquidacion', 'mesesLiquidables', 'mesAnterior', 'mesSiguiente', 'acreditado'];
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
/* Lo que un turno cerrado da por cumplido: sus minutos validados, sin descontar los que quedan dentro de la tolerancia de 5 minutos. */
const tramoCumplido = (S, j) => {
  const e = L.ev(S, j);
  if (j.entrada == null || !e.normales) return [j.ti, j.ti];
  const sale = j.rev ? j.salidaVal : j.salida == null ? j.tf : j.salida;
  return [j.entrada - j.ti <= 5 ? j.ti : j.entrada, j.tf - sale <= 5 ? j.tf : sale];
};
const solapa = (t, a, b) => Math.max(0, Math.min(t[1], b) - Math.max(t[0], a));
const normL23 = solapa(tramoCumplido(S9, l23), 0, 1440);
igual([L.feriadoEl(S9, '2026-11-23').tipo, L.feriadoEl(S9, '2026-12-07').tipo, L.feriadoEl(S9, '2026-11-24')], ['feriado', 'no_laborable', null], 'agenda nacional cargada');
igual([rL.fer.feriado, rL.fer.no_laborable], [normL23, 0], 'las horas del lunes 23 cuentan como feriado');
igual(L.recargoFeriado(S9, S9.asigs[2], rL), Math.round(normL23 / 60 * 6500), 'recargo sugerido: la hora en feriado se paga doble');
igual(L.avanceAsig(S9, S9.asigs[2], '2026-11').impCumplido, Math.round(rL.acreditados / 60 * 6500) + Math.round(normL23 / 60 * 6500), 'importe cumplido por hora, con el recargo de feriado');
igual(L.ponerParam(S9, 'recFeriado', '50'), '', 'administración cambia el recargo');
igual(L.recargoFeriado(S9, S9.asigs[2], rL), Math.round(normL23 / 60 * 6500 * 0.5), 'recargo al 50%');
const rH = L.resumenAsig(S9, 'a8', '2026-11');
const hDom = de(S9, 'a8', '2026-11-22'), hLun = de(S9, 'a8', '2026-11-23');
igual([rH.fer.feriado, L.recargoFeriado(S9, S9.asigs[7], rH), L.avanceAsig(S9, S9.asigs[7], '2026-11').impMes], [solapa(tramoCumplido(S9, hDom), 1440, 2880) + solapa(tramoCumplido(S9, hLun), 0, 1440), 0, 950000], 'el turno nocturno fijo suma horas de feriado de dos noches, sin recargo: va por convenio');
igual([L.ev(S9, hDom).estado, L.ev(S9, hLun).estado, rH.fer.feriado], ['verde', 'verde', 480], 'y como los dos quedaron en verde, cuentan completos: seis horas de la madrugada y dos de la noche del lunes');
const imp = L.impactoFeriado(S9, L.feriadoEl(S9, '2026-12-08'));
igual([imp.turnos, imp.porHora, imp.minHora], [7, 3, 1080], 'turnos del martes 8 de diciembre');
igual(L.agregarFeriado(S9, { f: '2026-12-08', nombre: 'Otro', tipo: 'feriado' }), 'Esa fecha ya está en el calendario.', 'no duplica fechas');
igual(L.agregarFeriado(S9, { f: '2026-12-24', nombre: 'Asueto de la empresa', tipo: 'no_laborable' }), '', 'agrega una fecha propia');
igual(L.editarFeriado(S9, '2026-12-07', 'feriado'), '', 'cambia el tipo de un día');
L.quitarFeriado(S9, '2026-12-24');
igual(L.feriadoEl(S9, '2026-12-24'), null, 'quita una fecha');

/* --- Preliquidación: lo previsto del mes contra lo cumplido --- */
const SP = L.sembrar();
const asigP = id => SP.asigs.find(a => a.id === id);
const cumplidos = (S, id, mes) => S.jornadas.filter(j => j.a === id && j.f.slice(0, 7) === mes && j.cerrada && !j.justif).reduce((n, j) => { const t = tramoCumplido(S, j); return n + t[1] - t[0]; }, 0);
const vM = L.avanceAsig(SP, asigP('a1'), '2026-11'), cumM = cumplidos(SP, 'a1', '2026-11');
igual([vM.turnos, vM.justificados, vM.prev, vM.prog, vM.cerrados, vM.prevHoy, vM.porVenir.map(x => x.f)], [20, 1, 7200, 7560, 18, 6480, ['2026-11-30']],
  'lo previsto de Marta en noviembre: los 21 días hábiles menos su licencia, con el lunes 30 todavía por venir');
igual([vM.cumplido, vM.falta, vM.impMes, vM.impHoy, vM.impCumplido, vM.parcial], [cumM, 6480 - cumM, 950000, Math.round(950000 * (6480 + 360) / 7560), Math.round(950000 * (cumM + 360) / 7560), false],
  'lo fijo: el monto del mes entero; lo cumplido avanza con las horas cumplidas y la licencia se da por cumplida');
igual([vM.avance < vM.esperado, vM.esperado < 1, vM.avance, vM.esperado], [true, true, vM.impCumplido / 950000, vM.impHoy / 950000], 'con una inasistencia va por detrás de donde debería ir, y el mes todavía no terminó');
const vL = L.avanceAsig(SP, asigP('a3'), '2026-11');
igual([vL.turnos + vL.justificados, vL.porVenir.map(x => x.lic), vL.fer.feriado, vL.impMes], [21, ['vacaciones'], 360, Math.round(vL.prev / 60 * 6500) + 39000],
  'por hora: las vacaciones del lunes 30 salen de lo previsto y el feriado del 23 suma su recargo');
igual([vL.cumplido, vL.impHoy, vL.impCumplido, vL.impCumplido <= vL.impHoy, vL.impHoy <= vL.impMes], [cumplidos(SP, 'a3', '2026-11'), Math.round(vL.prevHoy / 60 * 6500) + 39000, Math.round(cumplidos(SP, 'a3', '2026-11') / 60 * 6500) + L.recargoFeriado(SP, asigP('a3'), vL.r), true, true],
  'lo cumplido son las horas cumplidas por el valor hora, con el feriado trabajado');
L.ponerParam(SP, 'recFeriado', '50');
igual(L.avanceAsig(SP, asigP('a3'), '2026-11').impMes, vL.impMes - 19500, 'cambiar el recargo de feriado cambia lo previsto');
L.ponerParam(SP, 'recFeriado', '100');
const dM = L.desviosDe(vM), vH = L.avanceAsig(SP, asigP('a8'), '2026-11');
igual([dM.map(d => d.tipo), dM[0].min, dM[0].grave, dM[0].inasistencias], [['falta', 'extra', 'revision'], 6480 - cumM, true, 1], 'los desvíos de Marta: lo que faltó, la extra verificada y lo que espera revisión');
igual([vH.r.verde, vH.r.normales < vH.prevHoy, vH.cumplido, vH.falta, vH.avance, L.desviosDe(vH)], [vH.cerrados, true, vH.prevHoy, 0, vH.esperado, []],
  'quien tiene todos sus turnos en verde está al día: los minutos de menos dentro de la tolerancia no se descuentan');
const jT = { f: '2026-11-26', ti: 480, tf: 840, entrada: 487, salida: 838, cerrada: true, decl: null, rev: null, salidaVal: null, justif: null };
const cuenta = cambios => { const j = Object.assign({}, jT, cambios), e = L.evaluar(j, P, 2040); return [e.estado, e.normales, L.acreditado(j, e, P)]; };
igual([cuenta({ entrada: 484 }), cuenta({})], [['verde', 354, { desde: 480, min: 360 }], ['amarillo', 351, { desde: 487, min: 353 }]],
  'un turno en verde cuenta completo; quien llegó fuera de la tolerancia cuenta desde que llegó, sin perder los dos minutos del final');
igual([cuenta({ entrada: 484, salida: null, rev: 'olvido', salidaVal: 840 }), cuenta({ entrada: 480, salida: 815 }), cuenta({ entrada: null, salida: null })],
  [['amarillo', 356, { desde: 480, min: 360 }], ['amarillo', 335, { desde: 480, min: 335 }], ['rojo', 0, { desde: 480, min: 0 }]],
  'olvidarse de marcar la salida no descuenta la llegada dentro de la tolerancia; irse 25 minutos antes, sí; la inasistencia no cumple nada');
const PL = L.preliquidacion(SP, '2026-11');
const sumaP = k => PL.personas.reduce((n, p) => n + p.lineas.reduce((m, v) => m + v[k], 0), 0);
igual([PL.enCurso, PL.personas.length, PL.total.lineas, PL.personas[0].lineas.length, PL.personas[0].total.impMes], [true, 8, 9, 2, 950000 + L.avanceAsig(SP, asigP('a7'), '2026-11').impMes], 'una línea por asignación, agrupadas por persona');
igual([PL.total.impMes, PL.total.impHoy, PL.total.impCumplido, PL.total.prev, PL.total.avance], [sumaP('impMes'), sumaP('impHoy'), sumaP('impCumplido'), sumaP('prev'), sumaP('impCumplido') / sumaP('impMes')], 'el total del equipo es la suma de las líneas');
igual([PL.total.debajo, PL.total.conExtra, PL.total.aRevisar, PL.total.falta], [8, 5, 3, PL.total.prevHoy - PL.total.cumplido], 'y cuenta cuántas asignaciones tienen cada desvío');
igual(L.agregarAsig(SP, { colab: 'c8', sede: 'norte', dias: [1, 2, 3, 4, 5], ti: '15:00', tf: '19:00', modalidad: 'hora', valor: '7000' }), '', 'una asignación nueva, cargada hoy');
const vN = L.avanceAsig(SP, SP.asigs[SP.asigs.length - 1], '2026-11');
igual([vN.turnos, vN.prev, vN.cerrados, vN.impMes, vN.impCumplido, vN.avance, L.desviosDe(vN)], [2, 480, 0, 56000, 0, 0, []], 'apenas se carga ya tiene su previsto del mes: el turno de hoy y el del lunes');
igual(L.preliquidacion(SP, '2026-11').personas.find(p => p.c.id === 'c8').lineas.length, 2, 'y figura en la preliquidación aunque todavía no cerró ningún turno');
igual(L.agregarAsig(SP, { colab: 'nuevo', nombre: 'Ana Prueba', sede: 'norte', dias: [1, 2, 3, 4, 5, 6], ti: '18:00', tf: '22:00', modalidad: 'fijo', valor: '600000' }), '', 'una asignación fija que empieza a fin de mes');
const ana = SP.asigs[SP.asigs.length - 1], vA = L.avanceAsig(SP, ana, '2026-11');
igual([vA.turnos, vA.parcial, vA.impMes], [3, true, Math.round(600000 * 3 / 25)], 'le toca la parte del monto mensual de sus tres turnos sobre los 25 del mes');
const SI = L.sembrar();
const turnosDiego = L.avanceAsig(SI, SI.asigs[1], '2026-11').turnos;
SI.colabs[1].activa = false;
igual([turnosDiego, L.avanceAsig(SI, SI.asigs[1], '2026-11').turnos], [21, 20], 'a quien está de baja no se le prevén los turnos que faltan');
SI.colabs[1].activa = true;
SI.asigs[1].hasta = '2026-11-27';
igual(L.avanceAsig(SI, SI.asigs[1], '2026-11').porVenir.length, 0, 'ni a una asignación cuya vigencia termina hoy');
igual([L.mesAnterior('2027-01'), L.mesSiguiente('2026-12'), L.mesSiguiente('2027-01'), L.mesesLiquidables(SP)], ['2026-12', '2027-01', '2027-02', ['2026-11', '2026-12']], 'se ofrecen el mes en curso y el que viene; el anterior, solo si dejó turnos');
const SD = L.sembrar(), PD = L.preliquidacion(SD, '2026-12'), vD = PD.personas[0].lineas[0], vDL = L.avanceAsig(SD, SD.asigs[2], '2026-12');
igual([PD.futuro, PD.enCurso, vD.turnos, vD.justificados, vD.prev, vD.cerrados, vD.impMes, vD.impCumplido, vD.parcial, vD.porVenir.length], [true, false, 15, 8, 5400, 0, 950000, 0, false, 23],
  'el mes que viene sale entero de las asignaciones: los 23 días hábiles de diciembre de Marta, menos sus ocho de vacaciones');
igual([vDL.turnos, vDL.justificados, vDL.fer, vDL.impMes], [19, 4, { feriado: 720, no_laborable: 360 }, 19 * 6 * 6500 + 12 * 6500], 'y ya cuenta los feriados que caen en sus turnos: el 8 y el 25 de diciembre con recargo, y el 7 sin');
for (let i = 0; i < 5; i++) L.avanzarDia(SP);
igual([SP.hoy, L.mesesLiquidables(SP)], ['2026-12-02', ['2026-11', '2026-12', '2027-01']], 'al cambiar el mes, el anterior queda para liquidar');
const cerrado = L.preliquidacion(SP, '2026-11'), vC = cerrado.personas[0].lineas[0];
igual([cerrado.enCurso, vC.cerrados, vC.prevHoy, vC.impHoy, vC.esperado, vC.porVenir.length, cerrado.total.esperado], [false, 20, 7200, 950000, 1, 0, 1], 'en el mes cerrado cuentan todos los turnos y no queda nada por venir');
igual([L.avanceAsig(SP, ana, '2026-12').parcial, L.avanceAsig(SP, ana, '2026-12').impMes], [false, 600000], 'y la asignación fija nueva, en su primer mes completo, vale el monto entero');

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

/* --- Lo que la versión real le pide a las reglas --- */
igual([['qr', 'codigo', 'impreso', 'ubicacion'].map(L.esPropia), ['supervisor', 'auto', 'declarada', null].map(L.esPropia)], [[true, true, true, true], [false, false, false, false]], 'marcas que hace la propia persona');
const SR = L.sembrar();
const jr = de(SR, 'a1', '2026-11-27');
SR.ahora = 845;
L.cerrarJornada(SR, jr.id, { conf: true }, 'codigo');
const antesR = L.resumenMes(SR, 'c1', '2026-11').cerradasPorColab;
jr.metodoOut = 'declarada';
igual([jr.salida, antesR - L.resumenMes(SR, 'c1', '2026-11').cerradasPorColab], [845, 1], 'un cierre con el código de la sede cuenta como cerrado por la persona; uno avisado, no');
const SV = L.sembrar();
const tarde = { id: 'jx', a: 'a4', c: 'c4', f: '2026-11-26', sede: 'parque', ti: 840, tf: 1200, entrada: 838, salida: null, cerrada: false, justif: null };
igual([L.vivoHoy(SV, tarde), L.vivoHoy(SV, Object.assign({}, tarde, { cerrada: true, salida: 1205 })), L.vivoHoy(SV, Object.assign({}, tarde, { cerrada: true, salida: 1450 })), L.vivoHoy(SV, Object.assign({}, tarde, { f: '2026-11-25' }))],
  [true, false, true, false], 'un turno de ayer sigue vivo si quedó abierto o cerró pasada la medianoche, aunque no sea nocturno');
const SY = L.sembrar();
SY.real = true; SY.yo = { id: 'c3' }; SY.ui.colab = 'c1';
igual([L.colabSel(SY).id, SY.ui.colab], ['c3', 'c1'], 'en la versión real el teléfono es de quien ingresó');
SY.yo = { id: 'c99' };
igual(L.colabSel(SY), null, 'y quien no tiene asignaciones activas no tiene pantalla de fichaje');
for (const a of SY.asigs) if (a.c === 'c3') a.activa = false;
SY.yo = { id: 'c3' };
igual(L.colabSel(SY), null, 'tampoco quien las tiene todas inactivas');
const SG = L.sembrar();
igual([L.valorSugerido(SG, 'hora'), L.valorSugerido(SG, 'fijo')], [6500, 950000], 'con valores de referencia, se proponen esos');
SG.ref = { hora: 0, fijo: 0 };
SG.asigs.find(a => a.id === 'a9').valor = 7200;
igual([L.valorSugerido(SG, 'hora'), L.valorSugerido(SG, 'hora', 'a9'), L.valorSugerido(SG, 'otra')], [7200, 6500, 0], 'sin referencia, se propone el valor de la última asignación de esa modalidad');
igual([L.editarAsig(SG, 'a1', 'modalidad', 'hora'), SG.asigs.find(a => a.id === 'a1').valor], ['', 7200], 'al pasar una asignación a por hora toma ese valor en lugar de dejar el monto mensual');
SG.asigs = SG.asigs.filter(a => a.modalidad !== 'fijo' || a.id === 'a4');
igual([L.editarAsig(SG, 'a2', 'modalidad', 'fijo'), SG.asigs.find(a => a.id === 'a2').valor], ['', 950000], 'y a fijo, el de otra asignación fija');
SG.asigs = SG.asigs.filter(a => a.modalidad !== 'fijo');
igual([L.editarAsig(SG, 'a3', 'modalidad', 'fijo'), SG.asigs.find(a => a.id === 'a3').valor], ['', 6500], 'si no hay de dónde tomarlo, conserva el valor y queda para corregir');

/* --- Piezas de la versión real que no necesitan navegador (src/real.js) --- */
const real = donde => {
  const c = vm.createContext({ console, CONFIG: { url: 'https://datos.ejemplo.com.ar', clave: 'sb_publishable_ejemplo', qr: 'qr.js' }, location: Object.assign({ origin: 'https://app.ejemplo.com.ar', pathname: '/', hash: '', search: '' }, donde) });
  vm.runInContext(codigo + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'real.js'), 'utf8') + '\nthis.__real = { API, leerUbicacion, leerCodigoQR, cambiosAdmin, distanciaTexto, evidenciaTexto, respaldoCorto, enlaceQR, clonar };', c);
  return c.__real;
};
const R = real({ hostname: 'app.ejemplo.com.ar' });
igual([R.API.url, real({ hostname: 'localhost', origin: 'http://localhost:8765' }).API.url], ['https://datos.ejemplo.com.ar', 'http://localhost:8765'], 'publicada, la aplicación habla con su servidor de datos; en la computadora de desarrollo, con el servidor de pruebas');
igual([R.leerUbicacion('-32.8895, -68.8458'), R.leerUbicacion(' -32.8895   -68.8458 '), R.leerUbicacion('-32.8895;-68.8458'), R.leerUbicacion('')],
  [{ lat: '-32.8895', lon: '-68.8458' }, { lat: '-32.8895', lon: '-68.8458' }, { lat: '-32.8895', lon: '-68.8458' }, { lat: '', lon: '' }], 'lee coordenadas escritas a mano, y acepta que falten');
igual([R.leerUbicacion('https://www.google.com/maps/place/X/@-32.8911,-68.8869,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-32.8908!4d-68.8872'), R.leerUbicacion('https://www.google.com/maps/@-32.8911,-68.8869,17z'), R.leerUbicacion('https://maps.google.com/?q=-32.8895,-68.8458'), R.leerUbicacion('https://www.google.com/maps/search/?api=1&query=-32.8895%2C-68.8458')],
  [{ lat: '-32.8908', lon: '-68.8872' }, { lat: '-32.8911', lon: '-68.8869' }, { lat: '-32.8895', lon: '-68.8458' }, { lat: '-32.8895', lon: '-68.8458' }], 'lee enlaces de Google Maps: prefiere el punto del lugar al centro del mapa');
igual([R.leerUbicacion('frente a la plaza'), R.leerUbicacion('95, 10'), R.leerUbicacion('-32.8895'), R.leerUbicacion('Av. San Martín 1100, Mendoza')], [null, null, null, null], 'y rechaza lo que no es una ubicación');
igual([R.leerUbicacion('https://share.google/sJIzX73O8LNmVxDjO'), R.leerUbicacion('https://maps.app.goo.gl/AbCdEf123456'), R.leerUbicacion('https://www.google.com/maps/place/Plaza+Independencia')], [null, null, null], 'los enlaces cortos de Compartir no traen la ubicación adentro: no hay nada que leer');
igual([R.leerUbicacion('(-32.8895, -68.8458)'), R.leerUbicacion('-32,8895, -68,8458'), R.leerUbicacion('-32,8895 -68,8458'), R.leerUbicacion('-32,8895;-68,8458')],
  [{ lat: '-32.8895', lon: '-68.8458' }, { lat: '-32.8895', lon: '-68.8458' }, { lat: '-32.8895', lon: '-68.8458' }, { lat: '-32.8895', lon: '-68.8458' }], 'acepta paréntesis y coma decimal');
/* Casos públicos: la oficina de Google en Zúrich es 47°21'56.0"N 8°31'29.3"E y su código plus, 8FVC9G8F+6W; la fuente Merlion de
   Singapur está en 1.286785, 103.854503 y es 6PH57VP3+PR6; la sede de Google es 849VCWC8+R9, o CWC8+R9 Mountain View. */
const cerca = (u, lat, lon, tol) => !!u && Math.abs(Number(u.lat) - lat) <= tol && Math.abs(Number(u.lon) - lon) <= tol;
igual([cerca(R.leerUbicacion('47°21\'56.0"N 8°31\'29.3"E'), 47.365556, 8.524806, 0.000002), R.leerUbicacion('32°53\'22.2"S 68°50\'44.9"W'), R.leerUbicacion('68°50\'44.9"O 32°53\'22.2"S')],
  [true, { lat: '-32.8895', lon: '-68.845806' }, { lat: '-32.8895', lon: '-68.845806' }], 'lee grados, minutos y segundos, con sur y oeste en negativo y en cualquier orden');
igual([cerca(R.leerUbicacion('8FVC9G8F+6W'), 47.365556, 8.524806, 0.00013), cerca(R.leerUbicacion('6PH57VP3+PR6'), 1.286785, 103.854503, 0.00003), cerca(R.leerUbicacion('849vcwc8+r9'), 37.4220, -122.0841, 0.0002)],
  [true, true, true], 'lee el código plus completo de un lugar');
igual([R.leerUbicacion('7VP3+PR6 Singapore', { lat: 1.35, lon: 103.82 }), R.leerUbicacion('CWC8+R9 Mountain View, California', { lat: 37.39, lon: -122.08 }), R.leerUbicacion('9G8F+6W Zurich', { lat: 47.41, lon: 8.47 })],
  [R.leerUbicacion('6PH57VP3+PR6'), R.leerUbicacion('849VCWC8+R9'), R.leerUbicacion('8FVC9G8F+6W')], 'y el acortado, completándolo con un lugar cercano');
const enMendoza = R.leerUbicacion('4563+XX Mendoza');
igual([Math.abs(Number(enMendoza.lat) + 32.8895) < 0.5 && Math.abs(Number(enMendoza.lon) + 68.8458) < 0.5, R.leerUbicacion('8FVC9G8F+'), R.leerUbicacion('ABCD+12'), R.leerUbicacion('9G8+6W')], [true, null, null, null], 'sin otra referencia, un código acortado se busca cerca de Mendoza; uno mal escrito no se lee');
igual([R.leerCodigoQR('https://app.ejemplo.com.ar/#q=12.123456'), R.leerCodigoQR('#q=3.a1b2c3d4e5f6a7b8c9'), R.leerCodigoQR('https://app.ejemplo.com.ar/#colaborador'), R.leerCodigoQR('https://otra.com/?q=hola')],
  [{ sede: '12', codigo: '123456' }, { sede: '3', codigo: 'a1b2c3d4e5f6a7b8c9' }, null, null], 'del QR de una sede saca la sede y el código');
igual(R.leerCodigoQR(R.enlaceQR('7', '654321')), { sede: '7', codigo: '654321' }, 'y lee lo mismo que escribe la pantalla de la sede');
igual([R.distanciaTexto(42.4), R.distanciaTexto(999), R.distanciaTexto(1000), R.distanciaTexto(6699)], ['42 m', '999 m', '1 km', '6,7 km'], 'distancias en metros o en kilómetros');
igual([R.evidenciaTexto({ g: 'ok', d: 12, t: 'registrado' }), R.evidenciaTexto({ g: 'lejos', d: 6699, t: 'otro' }), R.evidenciaTexto({ g: 'sin_dato', t: 'compartido' }), R.evidenciaTexto(null), R.respaldoCorto({ g: 'sin_dato' }), R.respaldoCorto({ g: 'ok' })],
  [', ubicación a 12 m de la sede', ', ubicación a 6,7 km de la sede, fuera del radio, otro teléfono', ', sin ubicación, teléfono de otra persona', '', ', sin ubicación', ''], 'respaldo de una marca, en palabras');
const A0 = L.sembrar();
A0.avisos = [{ id: '9', f: A0.hoy, m: 600, texto: 'viejo' }];
igual(R.cambiosAdmin(A0, R.clonar(A0)), {}, 'sin cambios, no hay nada que mandar al servidor');
const B0 = R.clonar(A0);
L.editarAsig(B0, 'a2', 'tf', '14:00');
igual(L.agregarAsig(B0, { colab: 'c8', sede: 'norte', dias: [6], ti: '15:00', tf: '18:00', modalidad: 'hora', valor: '7000' }), '', 'una asignación nueva sobre la copia');
L.editarFranja(B0, 'f3', 'dot', '3');
L.quitarFranja(B0, 'f5');
L.agregarFranja(B0, { sede: 'norte', dias: [6], ti: '08:00', tf: '12:00', dot: '1' });
L.agregarLicencia(B0, { colab: 'c2', tipo: 'franco', desde: '2026-12-10', hasta: '2026-12-10' });
L.quitarLicencia(B0, 'l3');
L.agregarFeriado(B0, { f: '2026-12-24', nombre: 'Asueto', tipo: 'no_laborable' });
L.editarFeriado(B0, '2026-12-08', 'no_laborable');
L.quitarFeriado(B0, '2026-12-25');
L.ponerParam(B0, 'topeFijo', '6');
const dif = R.cambiosAdmin(A0, B0);
igual([dif.asigs.map(a => [/^[0-9]/.test(a.id) || a.id === 'a2' ? a.id : 'nueva', a.c, a.tf]), dif.franjas.map(x => [x.id === 'f3' ? 'f3' : 'nueva', x.dot]), dif.franjasQuitar, dif.licencias.map(l => [l.c, l.tipo]), dif.licenciasQuitar],
  [[['a2', 'c2', 840], ['nueva', 'c8', 1080]], [['f3', 3], ['nueva', 1]], ['f5'], [['c2', 'franco']], ['l3']], 'a administración le manda solo lo que cambió: asignaciones, franjas y ausencias');
igual([dif.feriados.map(x => x.f + ' ' + x.tipo), dif.feriadosQuitar, dif.P.topeFijo, dif.avisos.length, /cambió el tope diario/.test(dif.avisos[0])],
  [['2026-12-08 no_laborable', '2026-12-24 no_laborable'], ['2026-12-25'], 6, 1, true], 'y feriados, reglas y el aviso nuevo para supervisión, sin repetir los que ya estaban');

/* --- La planilla de Excel que se arma en el navegador (src/planilla.js) --- */
const { leerPlanilla } = require('./planilla-leer.js');
const ctxP = vm.createContext({ console, TextEncoder });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'planilla.js'), 'utf8') + '\nthis.__p = { xlsx, columna, serieFecha, crc32 };', ctxP);
const PX = ctxP.__p;
igual([PX.columna(0), PX.columna(25), PX.columna(26), PX.columna(701), PX.columna(702)], ['A', 'Z', 'AA', 'ZZ', 'AAA'], 'letras de las columnas');
igual([PX.serieFecha('1900-03-01'), PX.serieFecha('2026-11-27')], [61, 46353], 'las fechas, como las cuenta Excel');
igual(PX.crc32(new TextEncoder().encode('123456789')), 0xCBF43926, 'suma de control de los archivos del zip');
const bytesP = PX.xlsx([
  { nombre: 'Uno: dos/tres', anchos: [20, 10], fijas: 1, filtro: 2, filas: [
    [{ v: 'Quién', e: 'titulo' }, { v: 'Importe', e: 'titulo' }, { v: 'Fecha', e: 'titulo' }, { v: 'Hora', e: 'titulo' }, { v: 'Con ajuste', e: 'titulo' }],
    ['Pérez & <Hijos>', { v: 1234.5, e: 'dec' }, { v: '2026-11-27', e: 'fecha' }, { v: 1803, e: 'hora' }, { v: 1234.5, e: 'dec', f: 'B2+0' }],
    [{ v: 'Total', e: 'total' }, { v: 1234.5, e: 'totalDec', f: 'SUM(B2:B2)' }, null, '', { v: null, e: 'ajuste' }, 0]] },
  { nombre: 'Notas', filas: [['  con espacios  '], [], ['Pérez & <Hijos>']] }
], { a: 2026, m: 11, d: 27, h: 14, mi: 5 });
const pl = leerPlanilla(Buffer.from(bytesP)), h1 = pl.hojas['Uno  dos tres'], crudo = Buffer.from(bytesP).toString('utf8');
igual(pl.archivos, ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'],
  'el archivo es un zip sano con las partes de una planilla, y el nombre de la hoja sale sin los signos que Excel no admite');
igual([h1.celdas.A2, h1.celdas.B2, h1.celdas.C2, h1.celdas.D2, h1.celdas.E2, h1.formulas.E2, h1.formulas.B3, h1.celdas.F3, 'C3' in h1.celdas, 'D3' in h1.celdas],
  ['Pérez & <Hijos>', 1234.5, 46353, 363 / 1440, 1234.5, 'B2+0', 'SUM(B2:B2)', 0, false, false], 'textos, números, fechas, horas y fórmulas con su valor ya calculado');
igual([crudo.split('Pérez &amp; &lt;Hijos&gt;').length - 1, /<t xml:space="preserve">  con espacios  <\/t>/.test(crudo), /uniqueCount="8"/.test(crudo)], [1, true, true], 'cada texto se guarda una sola vez, sin romper el archivo con signos ni perder espacios');
igual([/<pane ySplit="1" topLeftCell="A2"/.test(h1.xml), /<autoFilter ref="A1:F2"\/>/.test(h1.xml), /<col min="2" max="2" width="10" customWidth="1"\/>/.test(h1.xml)], [true, true, true], 'títulos fijos, filtros y anchos de columna');

/* --- La función del servidor que convierte el enlace de Compartir de Google Maps en coordenadas --- */
const pedidosAGoogle = [];
let respuestas = {};
const ctxF = vm.createContext({
  console, URL, Request, Response, AbortController, setTimeout, clearTimeout,
  Deno: { serve(f) { ctxF.atender = f; }, env: { get: k => (k === 'SUPABASE_URL' ? 'https://datos.ejemplo.com.ar' : undefined) } },
  fetch: async (u, o) => {
    /* El servicio de ingreso: reconoce una sola sesión. */
    if (u === 'https://datos.ejemplo.com.ar/auth/v1/user') return new Response('{}', { status: o.headers.Authorization === 'Bearer sesion.de.prueba' && o.headers.apikey === 'sb_publishable_ejemplo' ? 200 : 401 });
    pedidosAGoogle.push(u + ' ' + o.redirect);
    const r = respuestas[u];
    if (!r) throw new Error('sin red');
    return new Response(r.cuerpo || null, { status: r.estado, headers: r.destino ? { location: r.destino } : {} });
  }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'ubicacion', 'index.ts'), 'utf8'), ctxF);
const pedirUbicacion = async (enlace, metodo, cabeceras) => {
  const cab = cabeceras || { Authorization: 'Bearer sesion.de.prueba', apikey: 'sb_publishable_ejemplo' };
  const r = await ctxF.atender(new Request('https://servidor.ejemplo/functions/v1/ubicacion', metodo === 'OPTIONS' ? { method: 'OPTIONS' } : { method: metodo || 'POST', headers: cab, body: metodo === 'GET' ? undefined : JSON.stringify({ enlace: enlace }) }));
  return [r.status, metodo !== 'OPTIONS' && metodo !== 'GET' ? await r.json() : null, r.headers.get('access-control-allow-origin')];
};
/* Lo que contestó Google de verdad para un enlace compartido desde Google Maps: el punto del lugar va en !3d y !4d; lo que sigue a la arroba es el centro del mapa. */
const DESTINO = 'https://www.google.com/maps/place/Cl%C3%ADnica+del+Pilar+Dalvian/@-32.874068,-68.8877066,17z/data=!4m6!3m5!1s0x967e091d0358d1cb:0xebb220873f616fc8!8m2!3d-32.8740725!4d-68.8851317!16s%2Fg%2F11nvmqxqvn?entry=tts&g_ep=EgoyMDI2MTEyMy4wIOC7DCoASAFQAw%3D%3D';
(async () => {
  respuestas = {
    'https://maps.app.goo.gl/o9TK4y9btVsLxUmq8': { estado: 302, destino: DESTINO },
    'https://maps.app.goo.gl/SoloMapa?g_st=ic': { estado: 302, destino: 'https://www.google.com/maps/@-32.8911,-68.8869,17z?entry=tts' },
    'https://maps.app.goo.gl/Buscado': { estado: 301, destino: 'https://www.google.com/maps/search/-32.889500,+-68.845800?entry=tts' },
    'https://maps.app.goo.gl/SinPunto': { estado: 302, destino: 'https://www.google.com/maps/place/Un+lugar/data=!4m2!3m1!1s0x0:0x1?entry=gps' },
    'https://maps.app.goo.gl/Borrado': { estado: 404 },
    'https://maps.app.goo.gl/Pagina': { estado: 200, cuerpo: '<html>!3d-1.5!4d-2.5</html>' },
    'https://maps.app.goo.gl/AOtroSitio': { estado: 302, destino: 'https://otro-sitio.com.ar/maps/@-32.1,-68.1,17z' },
    'https://goo.gl/maps/Viejo': { estado: 302, destino: 'https://maps.app.goo.gl/o9TK4y9btVsLxUmq8' }
  };
  igual(await pedirUbicacion('https://maps.app.goo.gl/o9TK4y9btVsLxUmq8'), [200, { ok: true, lat: -32.8740725, lon: -68.8851317, exacto: true }, '*'], 'del enlace de Compartir saca el punto del lugar, no el centro del mapa');
  igual((await pedirUbicacion('maps.app.goo.gl/o9TK4y9btVsLxUmq8'))[1], { ok: true, lat: -32.8740725, lon: -68.8851317, exacto: true }, 'aunque llegue sin https adelante');
  igual((await pedirUbicacion('https://goo.gl/maps/Viejo'))[1], { ok: true, lat: -32.8740725, lon: -68.8851317, exacto: true }, 'y también el formato viejo, que pasa por otro enlace corto');
  igual([(await pedirUbicacion('https://maps.app.goo.gl/SoloMapa?g_st=ic'))[1], (await pedirUbicacion('https://maps.app.goo.gl/Buscado'))[1]],
    [{ ok: true, lat: -32.8911, lon: -68.8869, exacto: false }, { ok: true, lat: -32.8895, lon: -68.8458, exacto: true }], 'si solo hay centro del mapa lo marca como no exacto; unas coordenadas buscadas sí lo son');
  igual([(await pedirUbicacion('https://maps.app.goo.gl/SinPunto'))[1], (await pedirUbicacion('https://maps.app.goo.gl/Borrado'))[1], (await pedirUbicacion('https://maps.app.goo.gl/Pagina'))[1], (await pedirUbicacion('https://maps.app.goo.gl/NoContesta'))[1]],
    [{ ok: false, motivo: 'sin_ubicacion' }, { ok: false, motivo: 'no_existe' }, { ok: false, motivo: 'sin_ubicacion' }, { ok: false, motivo: 'red' }], 'explica por qué no pudo: sin punto, enlace borrado, respuesta que no es un salto o sin red');
  igual((await pedirUbicacion('https://maps.app.goo.gl/AOtroSitio'))[1], { ok: false, motivo: 'sin_ubicacion' }, 'no acepta coordenadas de un sitio que no es Google');
  const antesDe = pedidosAGoogle.length;
  igual([(await pedirUbicacion('https://www.google.com/maps/place/X/@-32.1,-68.1,17z'))[1], (await pedirUbicacion('https://share.google/sJIzX73O8LNmVxDjO'))[1], (await pedirUbicacion('https://servidor-interno.local/admin'))[1], (await pedirUbicacion('https://goo.gl/otra-cosa'))[1], (await pedirUbicacion(''))[1]],
    [{ ok: false, motivo: 'enlace' }, { ok: false, motivo: 'enlace' }, { ok: false, motivo: 'enlace' }, { ok: false, motivo: 'enlace' }, { ok: false, motivo: 'enlace' }], 'solo atiende enlaces cortos de Google Maps');
  igual(pedidosAGoogle.length, antesDe, 'y para los demás no sale a buscar nada');
  igual(pedidosAGoogle.every(x => /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\/\S+ manual$/.test(x)), true, 'nunca descarga una página de Google Maps ni sigue el salto por su cuenta');
  igual([(await pedirUbicacion('', 'OPTIONS')).slice(0, 1).concat((await pedirUbicacion('', 'OPTIONS'))[2]), (await pedirUbicacion('', 'GET'))[0]], [[200, '*'], 405], 'contesta la consulta previa del navegador y rechaza lo que no es un pedido de la aplicación');
  const sinSesion = pedidosAGoogle.length, mio = 'https://maps.app.goo.gl/o9TK4y9btVsLxUmq8';
  igual([await pedirUbicacion(mio, 'POST', { apikey: 'sb_publishable_ejemplo' }), await pedirUbicacion(mio, 'POST', { Authorization: 'Bearer otra.sesion.vencida', apikey: 'sb_publishable_ejemplo' }), await pedirUbicacion(mio, 'POST', { Authorization: 'Bearer sb_publishable_ejemplo', apikey: 'sb_publishable_ejemplo' })],
    [[401, { ok: false, motivo: 'sesion' }, '*'], [401, { ok: false, motivo: 'sesion' }, '*'], [401, { ok: false, motivo: 'sesion' }, '*']], 'sin una sesión abierta de verdad no atiende: ni con la llave pública sola, ni con una sesión vencida');
  igual(pedidosAGoogle.length, sinSesion, 'y no sale a buscar nada');

  const cuenta = {};
  for (const j of S.jornadas) { const e = L.ev(S, j).estado; cuenta[e] = (cuenta[e] || 0) + 1; }
  console.log('Estados sembrados:', JSON.stringify(cuenta));
  console.log(ok + ' correctas, ' + mal + ' fallas');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
