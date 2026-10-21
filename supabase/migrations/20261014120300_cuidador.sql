-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · el cuidador cobra lo que pasó, no lo gestiona      ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- La migración anterior le devolvió al equipo los tres conceptos que nacen
-- de su turno, porque el check-out vuelve a cotizar y tiene que ajustar el
-- cobro. Eso dejó una puerta más ancha de lo necesario: podía además marcar
-- un cobro como pagado.
--
-- Generar el cobro es consecuencia de cerrar la jornada. Darlo por pagado es
-- otra cosa: es conciliar una transferencia, y eso lo mira Administración.
-- La diferencia entre las dos es la que esta migración escribe.

drop policy if exists "el equipo cobra lo de su turno" on pagos;

create policy "el equipo cobra lo de su turno" on pagos
  for all using (
    es_equipo()
    and concepto in ('dia_suelto', 'dia_de_prueba', 'saldo_hotel')
    -- Un cobro ya pagado queda fuera de su alcance: no lo puede modificar
    -- ni borrar. Conciliado es conciliado.
    and estado <> 'pagado'
  )
  with check (
    es_equipo()
    and concepto in ('dia_suelto', 'dia_de_prueba', 'saldo_hotel')
    -- Y no puede dejarlo pagado, que es la acción que no le corresponde.
    and estado <> 'pagado'
  );
