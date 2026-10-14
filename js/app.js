import { firebaseConfig, SETTINGS } from "./config.js";

/* ============================ Referencias DOM ============================ */
const el = (id) => document.getElementById(id);
const ui = {
  dot: el("dot"),
  authStatus: el("authStatus"),
  gpsStatus: el("gpsStatus"),
  accBadge: el("accBadge"),
  statSpeed: el("statSpeed"),
  statDist: el("statDist"),
  statAlt: el("statAlt"),
  statTime: el("statTime"),
  metaPoints: el("metaPoints"),
  metaSession: el("metaSession"),
  toggleBtn: el("toggleBtn"),
  centerBtn: el("centerBtn"),
  followBtn: el("followBtn"),
  layersBtn: el("layersBtn"),
  sheet: el("sheet"),
  sheetHandle: el("sheetHandle"),
  toast: el("toast"),
  overlay: el("overlay"),
  overlayText: el("overlayText"),
};

/* ============================== Estado =================================== */
const state = {
  uid: null,
  sessionId: null,
  tracking: false,
  watchId: null,
  map: null,
  tileLayer: null,
  layerIndex: 0,
  marker: null,
  accuracyCircle: null,
  polyline: null,
  follow: true,
  located: false,
  cloud: false,       // true solo si hay credenciales de Firebase y se conectó
  authReady: false,
  trail: [],          // puntos {lat,lng,time,acc,speed,alt,heading}
  lastSaved: null,    // {lat,lng,time}
  distanceKm: 0,
  startedAt: null,
  lastFix: null,
  unsub: null,
};

const LS_SESSION = "gps.activeSession";
const LS_SESSION_TIME = "gps.activeSessionStart";
const LS_LAST_TRAIL = "gps.lastTrail";

/* Capas gratuitas: sin API key, sin tarjeta, sin cuota. */
const MAP_LAYERS = [
  {
    id: "dark",
    label: "Oscuro",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
    cssFilter: "invert(0.92) hue-rotate(180deg) brightness(0.92) saturate(0.65)",
  },
  {
    id: "satellite",
    label: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    attribution: "Esri · Maxar · Earthstar Geographics",
  },
  {
    id: "terrain",
    label: "Topográfico",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
    subdomains: "abc",
    attribution: "© OpenStreetMap · SRTM · OpenTopoMap",
  },
];

/* ============================ Utilidades ================================= */
function toast(msg, kind = "info", ms = 3200) {
  ui.toast.textContent = msg;
  ui.toast.className = "toast is-visible" + (kind === "error" ? " is-error" : kind === "ok" ? " is-ok" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (ui.toast.className = "toast"), ms);
}

function setDot(kind) {
  ui.dot.className = "dot dot--" + kind;
}

function haversineKm(a, b) {
  const R = SETTINGS.earthRadiusKm;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function newSessionId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

function kmhFromMps(mps) {
  if (mps == null || isNaN(mps) || mps < 0) return 0;
  return mps * 3.6;
}

function cloudConfigured() {
  return firebaseConfig && firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith("TU_");
}

/* ============================== Mapa (Leaflet) =========================== */
function initMap() {
  state.map = L.map("map", {
    center: [SETTINGS.defaultCenter.lat, SETTINGS.defaultCenter.lng],
    zoom: SETTINGS.defaultZoom,
    zoomControl: false,
    attributionControl: true,
  });

  const wanted = MAP_LAYERS.findIndex((l) => l.id === SETTINGS.mapType);
  state.layerIndex = wanted >= 0 ? wanted : 0;
  setLayer(state.layerIndex);

  state.marker = L.marker([SETTINGS.defaultCenter.lat, SETTINGS.defaultCenter.lng], {
    icon: makeUserIcon(),
    interactive: false,
    keyboard: false,
  }).addTo(state.map);

  state.accuracyCircle = L.circle([SETTINGS.defaultCenter.lat, SETTINGS.defaultCenter.lng], {
    radius: 0,
    color: "#38bdf8",
    weight: 1,
    opacity: 0.4,
    fillColor: "#38bdf8",
    fillOpacity: 0.12,
    interactive: false,
  }).addTo(state.map);

  state.polyline = L.polyline([], {
    color: "#22d3a7",
    weight: 5,
    opacity: 0.95,
    lineJoin: "round",
    lineCap: "round",
    interactive: false,
  }).addTo(state.map);

  // Arrastrar el mapa desactiva "seguir".
  state.map.on("dragstart", () => setFollow(false));
}

function setLayer(index) {
  const cfg = MAP_LAYERS[index];
  if (!cfg || !state.map) return;
  if (state.tileLayer) state.map.removeLayer(state.tileLayer);
  state.tileLayer = L.tileLayer(cfg.url, {
    maxZoom: cfg.maxZoom,
    attribution: cfg.attribution,
    subdomains: cfg.subdomains || "abc",
  });
  state.tileLayer.addTo(state.map);
  state.tileLayer.bringToBack();
  // Modo oscuro sin depender de proveedores con key: filtro CSS solo a los tiles.
  const pane = state.map.getPane("tilePane");
  if (pane) pane.style.filter = cfg.cssFilter || "";
}

function makeUserIcon() {
  return L.divIcon({
    className: "user-marker-wrap",
    html:
      '<div class="user-marker">' +
      '<div class="user-marker__inner">' +
      '<div class="user-marker__halo"></div>' +
      '<svg class="user-marker__arrow" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path fill="#38bdf8" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round" d="M12 2 20 21 12 16.6 4 21 12 2Z"/>' +
      "</svg></div></div>",
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function setMarker(lat, lng, heading) {
  if (!state.marker) return;
  state.marker.setLatLng([lat, lng]);
  const inner = state.marker.getElement()?.querySelector(".user-marker__inner");
  if (inner && heading != null && !isNaN(heading)) {
    inner.style.transform = `rotate(${heading}deg)`;
  }
}

/* Toma tu ubicación una vez y centra el mapa (sin iniciar rastreo). */
function locateOnce(force) {
  if (!navigator.geolocation) {
    toast("Tu navegador no soporta geolocalización.", "error");
    return;
  }
  if (state.located && !force) return;
  state.located = true;

  ui.gpsStatus.textContent = "Buscando tu ubicación…";
  setDot("warn");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const c = pos.coords;
      const point = {
        lat: c.latitude,
        lng: c.longitude,
        acc: c.accuracy,
        alt: c.altitude,
        speed: c.speed,
        heading: c.heading,
        time: pos.timestamp || Date.now(),
      };
      state.lastFix = point;
      setMarker(point.lat, point.lng, c.heading);
      state.accuracyCircle.setLatLng([point.lat, point.lng]);
      state.accuracyCircle.setRadius(c.accuracy || 0);
      ui.accBadge.textContent = "± " + Math.round(c.accuracy || 0) + " m";
      setDot(c.accuracy <= 20 ? "ok" : "warn");
      ui.gpsStatus.textContent = "Ubicación encontrada";
      state.map.setView([point.lat, point.lng], 17, { animate: false });
      setFollow(true);
    },
    (err) => {
      ui.gpsStatus.textContent = "GPS inactivo";
      onGeoError(err);
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  );
}

/* =========================== Seguimiento ================================ */
function setFollow(on) {
  state.follow = on;
  ui.followBtn.classList.toggle("is-active", on);
  if (on && state.lastFix) panTo(state.lastFix.lat, state.lastFix.lng);
}

function panTo(lat, lng) {
  if (!state.map) return;
  state.map.panTo([lat, lng]);
}

function startTracking() {
  if (!navigator.geolocation) {
    toast("Tu navegador no soporta geolocalización.", "error");
    return;
  }
  if (!state.authReady) {
    toast("Espera un segundo, aún arrancando…");
    return;
  }

  state.sessionId = newSessionId();
  state.startedAt = Date.now();
  state.trail = [];
  state.distanceKm = 0;
  state.lastSaved = null;
  state.lastFix = null;
  renderTrail();
  updateStats();

  localStorage.setItem(LS_SESSION, state.sessionId);
  localStorage.setItem(LS_SESSION_TIME, String(state.startedAt));
  ui.metaSession.textContent = "Sesión " + state.sessionId.slice(0, 8);

  if (state.cloud) subscribeSession(state.sessionId);

  state.tracking = true;
  ui.toggleBtn.textContent = "Detener rastreo";
  ui.toggleBtn.classList.add("is-stop");
  setFollow(true);
  ui.gpsStatus.textContent = "Adquiriendo señal GPS…";
  setDot("warn");

  state.watchId = navigator.geolocation.watchPosition(onPosition, onGeoError, SETTINGS.geoOptions);
  toast(state.cloud ? "Rastreo iniciado. Guardando en la nube…" : "Rastreo iniciado. Guardando en este dispositivo.", "ok");
}

function stopTracking() {
  if (state.watchId != null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  state.tracking = false;
  ui.toggleBtn.textContent = "Iniciar rastreo";
  ui.toggleBtn.classList.remove("is-stop");
  ui.gpsStatus.textContent = "Rastreo detenido";
  setDot(state.authReady ? "ok" : "off");
  localStorage.removeItem(LS_SESSION);
  localStorage.removeItem(LS_SESSION_TIME);
  if (!state.cloud) persistLocalTrail();
  toast("Rastreo detenido.", "info");
}

function onGeoError(err) {
  const msgs = {
    1: "Permiso de ubicación denegado. Actívalo en el navegador.",
    2: "Ubicación no disponible. Busca señal al aire libre.",
    3: "Tiempo de espera agotado buscando GPS.",
  };
  const m = msgs[err.code] || ("Error de GPS: " + err.message);
  ui.gpsStatus.textContent = "Sin señal GPS";
  setDot("err");
  toast(m, "error");
}

function onPosition(pos) {
  const c = pos.coords;
  const point = {
    lat: c.latitude,
    lng: c.longitude,
    acc: c.accuracy,
    alt: c.altitude,
    speed: c.speed,
    heading: c.heading,
    time: pos.timestamp || Date.now(),
  };
  state.lastFix = point;

  // Marcador y precisión siempre (fluido).
  setMarker(point.lat, point.lng, c.heading);
  state.accuracyCircle.setLatLng([point.lat, point.lng]);
  state.accuracyCircle.setRadius(c.accuracy || 0);
  ui.accBadge.textContent = "± " + Math.round(c.accuracy || 0) + " m";
  setDot(c.accuracy <= 20 ? "ok" : "warn");
  ui.gpsStatus.textContent = "GPS activo";

  if (state.follow) state.map.setView([point.lat, point.lng], Math.max(state.map.getZoom(), 16), { animate: false });

  // Añade al rastro solo si se movió lo suficiente (evita ruido).
  const last = state.trail[state.trail.length - 1];
  if (!last || haversineKm(last, point) * 1000 >= 2 || state.trail.length === 0) {
    state.trail.push(point);
    if (last) state.distanceKm += haversineKm(last, point);
    renderTrail();
  }

  updateStats();
  maybeSave(point);
}

/* ==================== Persistencia (nube u local) ======================= */
function maybeSave(point) {
  const now = Date.now();
  const last = state.lastSaved;
  const movedM = last ? haversineKm(last, point) * 1000 : Infinity;
  const elapsed = last ? now - last.time : Infinity;

  if (movedM >= SETTINGS.minDistanceMeters || elapsed >= SETTINGS.maxWriteIntervalMs) {
    savePoint(point);
  }
}

async function savePoint(point) {
  state.lastSaved = { lat: point.lat, lng: point.lng, time: Date.now() };
  if (state.cloud) {
    try {
      await addDoc(collection(db, SETTINGS.collection), {
        uid: state.uid,
        sessionId: state.sessionId,
        lat: point.lat,
        lng: point.lng,
        accuracy: point.acc ?? null,
        altitude: point.alt ?? null,
        speed: point.speed ?? null,
        heading: point.heading ?? null,
        time: Date.now(),
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      console.error(e);
      toast("No se pudo guardar en la nube: " + e.message, "error");
    }
  } else {
    persistLocalTrail();
  }
}

function persistLocalTrail() {
  try {
    localStorage.setItem(
      LS_LAST_TRAIL,
      JSON.stringify({
        sessionId: state.sessionId,
        startedAt: state.startedAt,
        trail: state.trail.map((p) => ({
          lat: p.lat, lng: p.lng, time: p.time,
          acc: p.acc, speed: p.speed, alt: p.alt, heading: p.heading ?? null,
        })),
      })
    );
  } catch (e) {
    console.error(e);
  }
}

function subscribeSession(sessionId) {
  if (state.unsub) state.unsub();
  const q = query(collection(db, SETTINGS.collection), where("sessionId", "==", sessionId));
  state.unsub = onSnapshot(
    q,
    (snap) => {
      const pts = snap.docs
        .map((d) => d.data())
        .filter((d) => typeof d.lat === "number" && typeof d.lng === "number")
        .sort((a, b) => (a.time || 0) - (b.time || 0));

      // Mientras rastreamos en vivo, el rastro local manda (más fluido).
      // El snapshot se usa para restaurar sesiones al reabrir la app.
      if (state.tracking) {
        ui.metaPoints.textContent = Math.max(state.trail.length, pts.length) + " puntos";
        return;
      }
      state.trail = pts.map((d) => ({
        lat: d.lat, lng: d.lng, time: d.time,
        acc: d.accuracy, speed: d.speed, alt: d.altitude, heading: d.heading,
      }));
      state.distanceKm = computeDistance(state.trail);
      renderTrail();
      if (pts.length) {
        state.startedAt = state.trail[0].time || Date.now();
        ui.metaSession.textContent = "Sesión " + sessionId.slice(0, 8);
        const lastP = state.trail[state.trail.length - 1];
        state.lastFix = lastP;
        setMarker(lastP.lat, lastP.lng, lastP.heading);
        state.accuracyCircle.setLatLng([lastP.lat, lastP.lng]);
        state.accuracyCircle.setRadius(lastP.acc || 0);
        ui.accBadge.textContent = "± " + Math.round(lastP.acc || 0) + " m";
        fitTrail();
        setFollow(false);
      }
      updateStats();
    },
    (err) => {
      console.error(err);
      toast("Error leyendo Firestore: " + err.message, "error");
    }
  );
}

function computeDistance(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversineKm(pts[i - 1], pts[i]);
  return d;
}

/* ============================== Render ================================= */
function renderTrail() {
  if (!state.polyline) return;
  state.polyline.setLatLngs(state.trail.map((p) => [p.lat, p.lng]));
  ui.metaPoints.textContent = state.trail.length + " puntos";
}

function fitTrail() {
  if (!state.map || !state.trail.length) return;
  const bounds = L.latLngBounds(state.trail.map((p) => [p.lat, p.lng]));
  state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
}

function updateStats() {
  const speed = state.lastFix?.speed;
  ui.statSpeed.textContent = kmhFromMps(speed).toFixed(1);
  ui.statDist.textContent = state.distanceKm.toFixed(2);
  ui.statAlt.textContent = state.lastFix?.alt != null ? Math.round(state.lastFix.alt) : "—";
}

setInterval(() => {
  if (state.tracking && state.startedAt) {
    ui.statTime.textContent = fmtTime(Date.now() - state.startedAt);
  } else if (state.trail.length >= 2) {
    ui.statTime.textContent = fmtTime(state.trail[state.trail.length - 1].time - state.trail[0].time);
  }
}, 1000);

/* ============================ Interacción ============================== */
function bindUI() {
  ui.toggleBtn.addEventListener("click", () => (state.tracking ? stopTracking() : startTracking()));
  ui.centerBtn.addEventListener("click", goToMe);
  ui.followBtn.addEventListener("click", () => setFollow(!state.follow));

  ui.layersBtn.addEventListener("click", () => {
    if (!state.map) return;
    state.layerIndex = (state.layerIndex + 1) % MAP_LAYERS.length;
    setLayer(state.layerIndex);
    toast("Mapa: " + MAP_LAYERS[state.layerIndex].label);
  });

  // Colapsar/expandir la hoja inferior deslizando el handle.
  let startY = 0;
  ui.sheetHandle.addEventListener("pointerdown", (e) => (startY = e.clientY));
  ui.sheetHandle.addEventListener("pointerup", (e) => {
    if (e.clientY - startY > 20) ui.sheet.classList.add("is-collapsed");
    else if (startY - e.clientY > 20) ui.sheet.classList.remove("is-collapsed");
  });
}

function goToMe() {
  if (!state.map) return;
  if (state.lastFix) {
    setFollow(true);
    state.map.setView([state.lastFix.lat, state.lastFix.lng], Math.max(state.map.getZoom(), 17));
    return;
  }
  locateOnce(true);
}

/* ============================== Arranque ================================ */
let db, addDoc, collection, query, where, onSnapshot, serverTimestamp;

function restoreLocalTrail() {
  try {
    const raw = localStorage.getItem(LS_LAST_TRAIL);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data?.trail?.length) return;
    state.sessionId = data.sessionId || newSessionId();
    state.startedAt = data.startedAt || data.trail[0].time || Date.now();
    state.trail = data.trail;
    state.distanceKm = computeDistance(state.trail);
    ui.metaSession.textContent = "Sesión " + String(state.sessionId).slice(0, 8) + " (última)";
    ui.gpsStatus.textContent = "Última sesión cargada";
    renderTrail();
    updateStats();
    const lastP = state.trail[state.trail.length - 1];
    state.lastFix = lastP;
    setMarker(lastP.lat, lastP.lng, lastP.heading);
    state.accuracyCircle.setLatLng([lastP.lat, lastP.lng]);
    state.accuracyCircle.setRadius(lastP.acc || 0);
    ui.accBadge.textContent = "± " + Math.round(lastP.acc || 0) + " m";
    fitTrail();
    setFollow(false);
  } catch (e) {
    console.error(e);
  }
}

function goLocalMode(msg) {
  state.cloud = false;
  state.uid = null;
  state.authReady = true;
  ui.authStatus.textContent = "Modo local";
  setDot("ok");
  restoreLocalTrail();
  ui.overlay.classList.add("is-hidden");
  if (msg) toast(msg, "info", 5000);
}

async function boot() {
  bindUI();

  ui.overlayText.textContent = "Cargando mapa…";
  initMap();

  if (!cloudConfigured()) {
    goLocalMode("Sin credenciales: la app funciona igual, pero guarda el rastreo en este dispositivo. Pega tus claves en js/config.js para sincronizar a la nube.");
    locateOnce();
    return;
  }

  try {
    ui.overlayText.textContent = "Conectando con Firebase…";
    const [fbApp, fbAuth, fbFs] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"),
    ]);
    const app = fbApp.initializeApp(firebaseConfig);
    const auth = fbAuth.getAuth(app);
    db = fbFs.getFirestore(app);
    addDoc = fbFs.addDoc;
    collection = fbFs.collection;
    query = fbFs.query;
    where = fbFs.where;
    onSnapshot = fbFs.onSnapshot;
    serverTimestamp = fbFs.serverTimestamp;

    fbAuth.onAuthStateChanged(auth, (user) => {
      if (user && !state.cloud) {
        state.cloud = true;
        state.uid = user.uid;
        state.authReady = true;
        ui.authStatus.textContent = "Conectado a la nube";
        setDot("ok");
        restoreLocalTrail();
        ui.overlay.classList.add("is-hidden");
        locateOnce();
      }
    });

    await fbAuth.signInAnonymously(auth);
  } catch (e) {
    console.error(e);
    goLocalMode("No se pudo conectar con Firebase (" + e.message + "). Seguimos en modo local.");
  }
}

boot();
