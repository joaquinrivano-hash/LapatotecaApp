/*
 * Service worker de La Patoteca.
 *
 * El prototipo guarda todo en localStorage, así que una vez cacheado el
 * armazón la app funciona sin señal — que es justo lo que pasa en el patio de
 * una casa con muros gruesos.
 *
 * Estrategia:
 *   - navegación  → red primero, caché si falla, página offline si no hay nada
 *   - estáticos   → caché primero (los bundles de Next llevan hash en el nombre)
 *   - el resto    → red, sin cachear
 *
 * Ojo: no cachea respuestas de /api. Esas son envíos reales de WhatsApp y
 * servirlas desde caché sería mentir sobre un mensaje que nunca salió.
 */

const VERSION = "patoteca-v1";
const CACHE_ARMAZON = `${VERSION}-armazon`;
const CACHE_ESTATICOS = `${VERSION}-estaticos`;
const OFFLINE = "/offline";

const ARMAZON = [
  OFFLINE,
  "/marca/icono-192.png",
  "/marca/icono-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_ARMAZON)
      .then((cache) => cache.addAll(ARMAZON))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => !nombre.startsWith(VERSION))
            .map((nombre) => caches.delete(nombre)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function esEstatico(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/marca/")
  );
}

self.addEventListener("fetch", (evento) => {
  const { request } = evento;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Los envíos reales nunca salen de la caché.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    evento.respondWith(
      fetch(request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE_ARMAZON).then((cache) => cache.put(request, copia));
          return respuesta;
        })
        .catch(async () => {
          const guardada = await caches.match(request);
          return guardada ?? (await caches.match(OFFLINE));
        }),
    );
    return;
  }

  if (esEstatico(url)) {
    evento.respondWith(
      caches.match(request).then(
        (guardada) =>
          guardada ??
          fetch(request).then((respuesta) => {
            const copia = respuesta.clone();
            caches
              .open(CACHE_ESTATICOS)
              .then((cache) => cache.put(request, copia));
            return respuesta;
          }),
      ),
    );
  }
});
