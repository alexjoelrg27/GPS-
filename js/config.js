/*
 * ===========================================================================
 *  CONFIGURACION
 * ===========================================================================
 *
 *  LA APP FUNCIONA SIN NINGUNA CLAVE.
 *  El mapa usa Leaflet + OpenStreetMap (gratis, sin API key, sin tarjeta).
 *  Sin credenciales, el rastreo se guarda en el propio navegador (modo local).
 *
 *  OPCIONAL — sincronizar a la nube con Firebase:
 *  1) console.firebase.google.com → crea proyecto → Authentication →
 *     Sign-in method → Anónimo → Habilitar.
 *  2) Firestore Database → Crear base de datos (producción).
 *  3) ⚙️ Configuración → Tus apps → </> (Web) → copia firebaseConfig aquí abajo.
 *  4) En Firestore → Reglas, publica el contenido de firestore.rules.
 *
 *  Mientras apiKey siga como "TU_..." la app vive en modo local.
 */

export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};

/* -------------------------------------------------------------------------- */
/*  Ajustes de la app (puedes tocarlos)                                        */
/* -------------------------------------------------------------------------- */
export const SETTINGS = {
  // Coleccion de Firestore donde se guardan los puntos (solo modo nube).
  collection: "gps",

  // Si la distancia al ultimo punto guardado es mayor a esto (metros), se
  // escribe aunque no haya pasado el tiempo minimo.
  minDistanceMeters: 5,

  // Tiempo minimo entre escrituras (ms). Evita gastar cuota.
  maxWriteIntervalMs: 6000,

  // Opciones de geolocalizacion (W3C).
  geoOptions: {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 20000,
  },

  // Zoom inicial y posicion por defecto si aun no hay GPS.
  defaultZoom: 14,
  defaultCenter: { lat: -0.1807, lng: -78.4678 }, // Quito, Ecuador

  // Capa inicial: "dark" (oscuro) | "satellite" (satelite) | "terrain" (topo)
  mapType: "dark",

  // Distancia inicial en km para calcular distancia (no cambiar).
  earthRadiusKm: 6371,
};
