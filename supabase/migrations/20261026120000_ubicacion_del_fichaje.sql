-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · dónde se fichó la entrada y la salida             ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se puede correr de nuevo sin hacer daño.
--
-- Al fichar, el celular manda dónde estaba: el punto y su precisión, o el
-- motivo por el que no lo dio. La hora sola no dice si quien fichó estaba
-- en la casa; esto sí da una pista.
--
-- Es `jsonb` y no tres columnas por lado porque viene de a dos formas
-- —{lat, lng, precisionM} o {sinUbicacion}— y nunca se busca por adentro:
-- la distancia a la casa se calcula al mostrarla, así que si se corrige el
-- punto de la casa los fichajes viejos se vuelven a medir contra el bueno.
--
-- Va ANTES que su código: con el código nuevo y sin estas columnas, fichar
-- falla. Al revés no rompe nada, porque el código viejo no las nombra.
--
-- No hace falta tocar `proteger_turno_planificado`: cuida solo el horario
-- planificado, y estas columnas las escribe quien ficha, igual que
-- `entrada_real`.

alter table turnos
  add column if not exists entrada_ubicacion jsonb,
  add column if not exists salida_ubicacion jsonb;
