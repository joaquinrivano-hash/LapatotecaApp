-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · el cuidador queda fuera de los cobros             ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Las dos migraciones anteriores le dejaron al equipo los tres conceptos que
-- nacían de su turno, porque el check-out emitía el cobro. Ya no lo emite:
-- ahora el cierre guarda la hora real y nada más, y el cobro lo decide o lo
-- emite Administración desde el backoffice.
--
-- Entonces el permiso sobra, y un permiso que sobra es un permiso que algún
-- día se usa para algo que nadie pensó. Se va entero.
--
-- Lo que el equipo sigue pudiendo hacer no cambia: la agenda, las fichas,
-- marcar llegada y salida, los reportes y los incidentes. Lo que cambia es
-- que ya no hay ninguna tabla de plata que alcance.

drop policy if exists "el equipo cobra lo de su turno" on pagos;
