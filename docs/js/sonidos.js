/**
 * ============================================================================
 *  SONIDOS.JS - Pitidos cortos generados al vuelo (sin archivos de audio)
 * ============================================================================
 *  Todo se sintetiza con la Web Audio API: no hay mp3 que descargar, no hay
 *  nada que caches mal y funciona igual sin conexión.
 *
 *  Los dos casos que interesan:
 *    - "cobro"     -> se reproduce al marcar una cuota como pagada
 *    - "prestamo"  -> se reproduce al registrar un préstamo nuevo
 *
 *  El interruptor vive en localStorage (es preferencia del aparato, no del
 *  negocio, así que no tocamos la base de datos).
 * ============================================================================
 */

const CLAVE_SONIDOS = 'prestamos.pref.sonidos';
const CLAVE_AVISOS = 'prestamos.pref.avisoRecordatorio';

/* --- Preferencias --- */

export function sonidosActivados() {
  try { return localStorage.getItem(CLAVE_SONIDOS) !== '0'; } catch { return true; }
}

export function ponerSonidos(activado) {
  try { localStorage.setItem(CLAVE_SONIDOS, activado ? '1' : '0'); } catch { /* sin almacenamiento */ }
  if (activado) reproducir('prueba');
}

export function avisosDeRecordatorioActivados() {
  try { return localStorage.getItem(CLAVE_AVISOS) !== '0'; } catch { return true; }
}

export function ponerAvisosDeRecordatorio(activado) {
  try { localStorage.setItem(CLAVE_AVISOS, activado ? '1' : '0'); } catch { /* sin almacenamiento */ }
}

/* --- Motor de audio --- */

let contextoAudio = null;

/**
 * Creamos el contexto en el primer toque de la pantalla. Si lo dejamos para el
 * momento de cobrar, los navegadores lo arrancan suspendido y el primer pitido
 * sale mudo.
 */
function calentar() {
  contexto();
  for (const ev of ['pointerdown', 'keydown']) window.removeEventListener(ev, calentar);
}
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown']) {
    window.addEventListener(ev, calentar, { once: true, passive: true });
  }
}

function contexto() {
  if (!contextoAudio) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { contextoAudio = new Ctor(); } catch { return null; }
  }
  // Los navegadores arrancan el audio suspendido hasta que hay un gesto del usuario
  if (contextoAudio.state === 'suspended') contextoAudio.resume().catch(() => {});
  return contextoAudio;
}

/** Toca una nota con envolvente suave (ataque rápido, cola larga). */
function nota(ac, frecuencia, inicio, duracion, volumen = 0.16, tipo = 'triangle') {
  const t0 = ac.currentTime + inicio;
  const osc = ac.createOscillator();
  const ganancia = ac.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(frecuencia, t0);
  ganancia.gain.setValueAtTime(0.0001, t0);
  ganancia.gain.exponentialRampToValueAtTime(volumen, t0 + 0.015);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  osc.connect(ganancia);
  ganancia.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.05);
}

/**
 * Partituras. Notas en hercios (A4 = 440).
 *  - cobro:     arpegio ascendente do-mi-sol-do, como una campanita de caja
 *  - prestamo:  dos notas cálidas de confirmación
 *  - aviso:     dos pitidos sobrios para el recordatorio de la mañana
 *  - error:     corto y grave, sin alarmar
 *  - prueba:    se usa al encender el sonido desde Ajustes
 */
const PARTITURAS = {
  cobro: [
    [523.25, 0.00, 0.30, 0.15],
    [659.25, 0.07, 0.32, 0.15],
    [783.99, 0.14, 0.36, 0.16],
    [1046.5, 0.21, 0.55, 0.17],
  ],
  prestamo: [
    [440.00, 0.00, 0.26, 0.14],
    [587.33, 0.11, 0.44, 0.15],
  ],
  aviso: [
    [784.00, 0.00, 0.16, 0.13],
    [784.00, 0.20, 0.16, 0.13],
    [1046.5, 0.40, 0.40, 0.14],
  ],
  error: [
    [196.00, 0.00, 0.20, 0.13],
    [164.81, 0.13, 0.30, 0.13],
  ],
  prueba: [
    [659.25, 0.00, 0.24, 0.14],
    [880.00, 0.10, 0.40, 0.15],
  ],
};

/**
 * Toca una partitura.
 * @param {'cobro'|'prestamo'|'aviso'|'error'|'prueba'} cual
 * @param {object} [opciones]  { forzar } ignora el interruptor (para la prueba)
 */
export function reproducir(cual, opciones = {}) {
  if (!opciones.forzar && !sonidosActivados()) return false;
  const ac = contexto();
  if (!ac) return false;
  const partitura = PARTITURAS[cual];
  if (!partitura) return false;
  for (const [frec, inicio, dur, vol] of partitura) nota(ac, frec, inicio, dur, vol);
  return true;
}

export const sonarCobro = () => reproducir('cobro');
export const sonarPrestamo = () => reproducir('prestamo');
export const sonarAviso = () => reproducir('aviso', { forzar: true });
