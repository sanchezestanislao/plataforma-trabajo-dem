'use strict';
/* Lee una planilla .xlsx como las que arma src/planilla.js (un zip sin comprimir) para poder revisarla en las pruebas. */
const zlib = require('zlib');

function crc(datos) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(datos);
  let c = 0xFFFFFFFF;
  for (let i = 0; i < datos.length; i++) { c ^= datos[i]; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
/* Devuelve { nombre: datos } y revisa en el camino el índice y la suma de control de cada archivo. */
function leerZip(b) {
  const fin = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0) throw new Error('no es un zip');
  const cuantos = b.readUInt16LE(fin + 10), o = {};
  let p = b.readUInt32LE(fin + 16);
  for (let i = 0; i < cuantos; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('el índice del zip está roto');
    const metodo = b.readUInt16LE(p + 10), suma = b.readUInt32LE(p + 16), largo = b.readUInt32LE(p + 20);
    const largoNombre = b.readUInt16LE(p + 28), local = b.readUInt32LE(p + 42);
    const nombre = b.slice(p + 46, p + 46 + largoNombre).toString('utf8');
    if (metodo !== 0) throw new Error(nombre + ' está comprimido');
    if (b.readUInt32LE(local) !== 0x04034b50) throw new Error('la cabecera de ' + nombre + ' está rota');
    const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const datos = b.slice(inicio, inicio + largo);
    if (crc(datos) !== suma) throw new Error('la suma de control de ' + nombre + ' no coincide');
    o[nombre] = datos;
    p += 46 + largoNombre + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  if (p !== fin) throw new Error('el índice no termina donde dice el zip');
  return o;
}
/* Devuelve { archivos, hojas: { nombre: { celdas: { A1: valor }, formulas: { A1: 'B1+C1' }, filas } } }. */
function leerPlanilla(b) {
  const z = leerZip(b), texto = n => z[n].toString('utf8');
  const limpio = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const textos = [], nombres = [], hojas = {};
  texto('xl/sharedStrings.xml').replace(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g, (m, t) => { textos.push(limpio(t)); return ''; });
  texto('xl/workbook.xml').replace(/<sheet name="([^"]*)"/g, (m, t) => { nombres.push(limpio(t)); return ''; });
  nombres.forEach((nombre, i) => {
    const celdas = {}, formulas = {}, xml = texto('xl/worksheets/sheet' + (i + 1) + '.xml');
    xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m, ref, atributos, dentro) => {
      if (dentro == null) return '';
      const f = /<f>([\s\S]*?)<\/f>/.exec(dentro), v = /<v>([\s\S]*?)<\/v>/.exec(dentro);
      if (f) formulas[ref] = limpio(f[1]);
      if (v) celdas[ref] = / t="s"/.test(atributos) ? textos[Number(v[1])] : Number(v[1]);
      return '';
    });
    hojas[nombre] = { celdas: celdas, formulas: formulas, filas: (xml.match(/<row /g) || []).length, xml: xml };
  });
  return { archivos: Object.keys(z), hojas: hojas };
}

module.exports = { leerZip, leerPlanilla };
