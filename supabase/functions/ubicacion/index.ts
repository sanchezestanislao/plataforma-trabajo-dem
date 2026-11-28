// @ts-nocheck
// Convierte el enlace que da Google Maps al tocar Compartir (maps.app.goo.gl/...) en las coordenadas del lugar.
// Solo consulta el enlace corto y lee adónde redirige: nunca descarga páginas de Google Maps ni sigue enlaces a otros sitios.
// Solo la usa quien ya ingresó a la aplicación: la plataforma deja pasar pedidos con la llave pública sola,
// así que acá se le pregunta al servicio de ingreso si la sesión que llega es de verdad.
// El archivo no usa tipos a propósito: así las pruebas lo pueden correr también en Node (pruebas/logica.test.js).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (cuerpo, estado) =>
  new Response(JSON.stringify(cuerpo), { status: estado || 200, headers: Object.assign({ "Content-Type": "application/json" }, CORS) });
const esCorto = (u) => u.protocol === "https:" && (u.hostname === "maps.app.goo.gl" || (u.hostname === "goo.gl" && u.pathname.indexOf("/maps/") === 0));
const esGoogle = (u) => u.protocol === "https:" && /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(u.hostname);

// Coordenadas escritas en una dirección de Google Maps. `exacto` es false cuando solo figura el centro del mapa.
function coordenadas(direccion) {
  let t = direccion;
  try { t = decodeURIComponent(direccion); } catch (_e) { /* queda como vino */ }
  let exacto = true;
  let m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t) ||
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?),\s*\+?(-?\d+(?:\.\d+)?)/i.exec(t) ||
    /\/maps\/(?:search|place)\/(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/.exec(t);
  if (!m) { m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(t); exacto = false; }
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat: lat, lon: lon, exacto: exacto } : null;
}

// ¿El pedido viene de alguien con la sesión abierta?
async function conSesion(req) {
  const llave = req.headers.get("authorization") || "", apikey = req.headers.get("apikey") || "";
  if (!/^Bearer \S+\.\S+\.\S+$/.test(llave) || !apikey) return false;
  try {
    const r = await fetch(Deno.env.get("SUPABASE_URL") + "/auth/v1/user", { headers: { Authorization: llave, apikey: apikey } });
    try { if (r.body) await r.body.cancel(); } catch (_e) { /* nada que cerrar */ }
    return r.status === 200;
  } catch (_e) { return false; }
}

async function atender(req) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ ok: false, motivo: "pedido" }, 405);
  if (!(await conSesion(req))) return responder({ ok: false, motivo: "sesion" }, 401);
  let enlace = "";
  try { const c = await req.json(); enlace = String((c && c.enlace) || "").trim(); } catch (_e) { /* sin cuerpo */ }
  if (!enlace || enlace.length > 300) return responder({ ok: false, motivo: "enlace" });
  if (!/^https?:\/\//i.test(enlace)) enlace = "https://" + enlace;
  let url;
  try { url = new URL(enlace.replace(/^http:/i, "https:")); } catch (_e) { return responder({ ok: false, motivo: "enlace" }); }
  if (!esCorto(url)) return responder({ ok: false, motivo: "enlace" });
  for (let salto = 0; salto < 3; salto++) {
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), 6000);
    let r;
    try { r = await fetch(url.href, { method: "GET", redirect: "manual", signal: corte.signal }); }
    catch (_e) { return responder({ ok: false, motivo: "red" }); }
    finally { clearTimeout(reloj); }
    try { if (r.body) await r.body.cancel(); } catch (_e) { /* nada que cerrar */ }
    if (r.status === 404) return responder({ ok: false, motivo: "no_existe" });
    const destino = r.headers.get("location");
    if (r.status < 300 || r.status > 399 || !destino) return responder({ ok: false, motivo: "sin_ubicacion" });
    let sig;
    try { sig = new URL(destino, url); } catch (_e) { return responder({ ok: false, motivo: "sin_ubicacion" }); }
    if (esGoogle(sig)) {
      const c = coordenadas(sig.href);
      return responder(c ? { ok: true, lat: c.lat, lon: c.lon, exacto: c.exacto } : { ok: false, motivo: "sin_ubicacion" });
    }
    if (!esCorto(sig)) return responder({ ok: false, motivo: "sin_ubicacion" });
    url = sig;
  }
  return responder({ ok: false, motivo: "sin_ubicacion" });
}

Deno.serve(atender);
