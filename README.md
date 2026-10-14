# 📍 GPS Live

App web móvil de **rastreo GPS en tiempo real** que muestra tu posición en un mapa
y guarda cada punto de la sesión.

- **Sin API keys, sin tarjeta, sin costo.** El mapa es **Leaflet + OpenStreetMap**.
- Sin credenciales, el rastreo se guarda en el propio navegador (**modo local**).
- **Opcional:** pega credenciales de **Firebase** en `js/config.js` y sincroniza
  cada punto a la nube (Auth anónimo + Firestore), gratis en el plan Spark.
- HTML + CSS + JavaScript puro (sin frameworks, sin build).
- Diseño móvil (glassmorphism), con seguimiento en vivo, estela del recorrido,
  velocidad, distancia, altitud, precisión y tiempo.

---

## 1) Ejecutar la app (ya funciona tal cual)

> Necesitas servirla por `http://` (no abras el archivo directamente). Ya viene
> un servidor incluido que **no requiere instalar nada**.

En PowerShell, dentro de la carpeta del proyecto:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Abre en el navegador: **http://localhost:8080**

> Si falla por permisos, ejecuta PowerShell como Administrador, o usa la extensión
> **Live Server** de VS Code.

### Probar con GPS real en el móvil

La geolocalización solo funciona en `https://` o en `localhost`. Opciones:

- **Desplegar gratis en Firebase Hosting:**

  ```bash
  npm install -g firebase-tools
  firebase login
  firebase use --add        # elige tu proyecto
  firebase deploy
  ```

  Te da una URL `https://TU_PROYECTO.web.app` que puedes abrir desde el teléfono.

- O usar un túnel HTTPS (por ejemplo `ngrok http 8080`).

## 2) OPCIONAL: sincronizar a la nube con Firebase

Sin esto, la app funciona igual: guarda el rastreo en el navegador y lo
restaura al reabrir. Con Firebase, cada punto se guarda también en Firestore.

1. Entra a https://console.firebase.google.com y crea un proyecto (plan gratis).
2. **Authentication → Comenzar → Sign-in method → Anónimo → Habilitar.**
3. **Firestore Database → Crear base de datos** (modo producción).
4. **⚙️ Configuración del proyecto → Tus apps → `</>` (Web)** → registra una app.
   Copia el objeto `firebaseConfig`.
5. **Firestore → Reglas**: pega el contenido de `firestore.rules` y publica.
6. Edita **`js/config.js`** y reemplaza los valores:

   ```js
   export const firebaseConfig = {
     apiKey: "…",
     authDomain: "…",
     projectId: "…",
     storageBucket: "…",
     messagingSenderId: "…",
     appId: "…",
   };
   ```

> No necesitas Google Maps ni ninguna API de pago: el mapa siempre es
> OpenStreetMap (gratuito).

## Estructura

```
GPS/
├─ index.html            Interfaz (incluye Leaflet por CDN)
├─ css/styles.css        Estilos (móvil, tema oscuro)
├─ js/config.js          Ajustes + credenciales opcionales de Firebase
├─ js/app.js             Mapa + GPS + guardado local/nube
├─ manifest.webmanifest  Instalable como app (PWA)
├─ serve.ps1             Servidor local sin dependencias
├─ firestore.rules       Reglas de seguridad (opcional)
├─ firebase.json         Config de Hosting para deploy (opcional)
└─ .firebaserc           ID de tu proyecto en Firebase (opcional)
```

## Cómo funciona

- Escucha tu ubicación con `navigator.geolocation.watchPosition` (alta precisión).
- Mueve un marcador en el mapa en vivo y dibuja la **estela** del recorrido.
- Guarda puntos solo cuando te mueves más de `minDistanceMeters` o cada
  `maxWriteIntervalMs` — así no desperdicia almacenamiento ni cuota.
- **Modo local:** puntos en `localStorage`; al reabrir la app se restaura la
  última sesión.
- **Modo nube (opcional):** mismos puntos en Firestore (colección `gps`),
  con restauración en tiempo real desde la nube.
- Botón de capas: Oscuro ↔ Satélite ↔ Topográfico.
- Los ajustes están en `js/config.js` (`SETTINGS`).

### Formato de cada punto en Firestore (solo modo nube)

| campo      | descripción                          |
|------------|--------------------------------------|
| `uid`      | usuario (anónimo) que lo generó      |
| `sessionId`| agrupa los puntos de una sesión      |
| `lat`,`lng`| coordenadas                          |
| `accuracy` | precisión en metros                  |
| `altitude` | altitud                              |
| `speed`    | velocidad (m/s)                      |
| `heading`  | rumbo en grados                      |
| `time`     | marca de tiempo del cliente (ms)     |
| `timestamp`| marca de tiempo del servidor         |
