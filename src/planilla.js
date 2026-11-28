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
