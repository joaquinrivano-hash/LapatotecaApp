-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · lo pagado del día de prueba se devuelve           ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se puede correr de nuevo sin hacer daño.
--
-- Redefine `cancelar_dia_de_prueba` de `20261022150000_cambios_de_agenda`.
-- Si alguna vez se vuelve a correr aquel archivo suelto, hay que correr este
-- después: si no, la función vuelve a la versión que no devolvía nada.
--
-- La primera versión solo tocaba el cobro del día si seguía PENDIENTE. Si el
-- dueño ya había transferido y cancelaba a tiempo, el cobro quedaba "pagado"
-- y la casa se quedaba con una plata que la política dice que se devuelve,
-- sin que nada lo mostrara. Ahora, igual que el día de jardín:
--
--   pendiente, a tiempo  → anulado: reembolsado en cero. No hay plata que mover.
--   pendiente, tarde     → queda pendiente por el cargo tardío.
--   pagado, a tiempo     → reembolsado CONSERVANDO el monto: es lo que se le
--                          debe, y aparece en "Por devolver".
--   pagado, tarde        → la casa se queda con el cargo tardío y devuelve el
--                          resto. El cobro se reparte en dos: el mismo queda
--                          pagado por el cargo, y lo demás va en un cobro
--                          aparte, reembolsado, con la fecha de emisión y de
--                          pago del original.
--
-- Se reparte en vez de sumar un cobro de devolución porque el tablero suma
-- los montos de los cobros: uno nuevo de $5.000 inflaría el ingreso del día.
-- Repartido, lo que entró sigue sumando lo mismo que entró.

/* ── Las reglas, con los mismos números que lib/config ────────────── */

-- Ver `lib/repo/supabase/reglas-en-la-base.test.ts`.

create or replace function cancelar_dia_de_prueba(estadia uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- NEGOCIO.diaDePrueba.horasParaCancelarSinCosto
  horas_sin_costo constant numeric := 24;
  -- PRECIOS.cancelacionTardiaDiaDePrueba
  cargo_tardio constant integer := 5000;
  e estadias_jardin;
  cobro pagos;
  horas numeric;
  sin_costo boolean;
  costo integer;
  a_devolver integer := 0;
begin
  select * into e from estadias_jardin where id = estadia for update;

  -- El `coalesce` no es decorativo: ver `cambios_de_agenda`.
  if not found or not coalesce(e.cliente_id = mi_cliente_id() or es_admin(), false) then
    raise exception 'No existe ese día.';
  end if;
  if e.origen <> 'dia_de_prueba' then
    raise exception 'Ese día no es un día de prueba.';
  end if;
  if e.estado <> 'esperada' then
    raise exception 'Ese día ya no se puede cancelar.';
  end if;

  horas := extract(epoch from (e.inicio_programado - now())) / 3600;
  sin_costo := horas >= horas_sin_costo;
  costo := case when sin_costo then 0 else cargo_tardio end;

  update estadias_jardin set estado = 'cancelada'
   where id = e.id
  returning * into e;

  -- El cobro DEL DÍA es el primero que se emitió. Los cargos por cambiarlo
  -- encima de la hora son aparte y se quedan como están.
  select * into cobro
    from pagos
   where referencia_id = e.id and concepto = 'dia_de_prueba'
   order by emitido_en, id
   limit 1
   for update;

  if found then
    if cobro.estado in ('pendiente', 'vencido') then
      -- No alcanzó a pagar: anularlo ES la devolución.
      update pagos set
        monto = costo,
        estado = case when costo > 0 then 'pendiente' else 'reembolsado' end,
        pagado_en = null,
        vence_en = case
          when costo > 0 then (now() at time zone 'America/Santiago')::date
        end
      where id = cobro.id;

    elsif cobro.estado = 'pagado' then
      a_devolver := greatest(0, cobro.monto - costo);

      if a_devolver > 0 and costo = 0 then
        -- Todo de vuelta: el mismo cobro queda reembolsado con su monto.
        update pagos set estado = 'reembolsado', vence_en = null
         where id = cobro.id;
      elsif a_devolver > 0 then
        -- La casa se queda con el cargo y devuelve el resto.
        update pagos set monto = costo where id = cobro.id;
        insert into pagos
          (cliente_id, concepto, referencia_id, monto, estado, metodo,
           emitido_en, pagado_en)
        values
          (cobro.cliente_id, 'dia_de_prueba', e.id, a_devolver, 'reembolsado',
           cobro.metodo, cobro.emitido_en, cobro.pagado_en);
      end if;
    end if;
  end if;

  update perros set dia_de_prueba = '{"estado": "pendiente"}'::jsonb
   where id = e.perro_id;

  return jsonb_build_object(
    'estadia', to_jsonb(e),
    'horas_de_aviso', horas,
    'sin_costo', sin_costo,
    'costo', costo,
    'a_devolver', a_devolver
  );
end $$;

revoke all on function cancelar_dia_de_prueba(uuid) from public;
grant execute on function cancelar_dia_de_prueba(uuid) to authenticated;
