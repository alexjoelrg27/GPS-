import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";
const p = (f) => join(root, f);

let failed = 0;
const ok = (m) => console.log("  ok   " + m);
const bad = (m) => {
  failed++;
  console.error("FAIL   " + m);
};

/* 1) Archivos requeridos ------------------------------------------------ */
const required = [
  "index.html",
  "css/styles.css",
  "js/app.js",
  "js/config.js",
  "manifest.webmanifest",
  "firestore.rules",
];
for (const f of required) {
  existsSync(p(f)) ? ok("existe " + f) : bad("falta " + f);
}

/* 2) Sintaxis JavaScript (ESM) ------------------------------------------ */
for (const f of ["js/app.js", "js/config.js"]) {
  try {
    execFileSync(process.execPath, ["--check", p(f)], { stdio: "pipe" });
    ok("sintaxis valida: " + f);
  } catch (e) {
    bad("error de sintaxis en " + f + "\n" + (e.stderr?.toString() || e.message));
  }
}

/* 3) IDs que usa app.js existen en index.html --------------------------- */
const app = readFileSync(p("js/app.js"), "utf8");
const html = readFileSync(p("index.html"), "utf8");
const ids = [...new Set([...app.matchAll(/el\("([^"]+)"\)/g)].map((m) => m[1]))];
const missingIds = ids.filter((id) => !html.includes(`id="${id}"`));
missingIds.length === 0
  ? ok(`los ${ids.length} IDs referenciados existen en index.html`)
  : bad("faltan IDs en index.html: " + missingIds.join(", "));

/* 4) Recursos locales referenciados existen ----------------------------- */
const refs = [...html.matchAll(/(?:href|src)="((?!https?:|data:|#)[^"]+)"/g)].map((m) => m[1]);
for (const ref of [...new Set(refs)]) {
  existsSync(p(ref)) ? ok("recurso " + ref) : bad("recurso no encontrado: " + ref);
}

/* 5) No hay credenciales reales filtradas ------------------------------- */
const cfg = readFileSync(p("js/config.js"), "utf8");
const leaks = [...cfg.matchAll(/AIza[0-9A-Za-z_\-]{30,}/g)];
leaks.length === 0
  ? ok("sin API keys reales en js/config.js (usa marcadores TU_...)")
  : bad("posible API key real en js/config.js: " + leaks.map((m) => m[0].slice(0, 12) + "...").join(", "));

console.log(failed ? `\n${failed} prueba(s) fallaron` : "\nTodas las pruebas pasaron");
process.exit(failed ? 1 : 0);
