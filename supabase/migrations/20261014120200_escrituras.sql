-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · lo que el dueño y el equipo pueden escribir        ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Las políticas de 0002 dejaban leer bien y escribir mal. Agendar un día de
-- prueba CREA un cobro, comprar en la tienda DESCUENTA stock y cerrar la
-- jornada en el jardín VUELVE A COTIZAR y ajusta el cobro. Con las reglas
-- anteriores las tres fallaban con "permission denied", cada una por un
-- motivo distinto.

/* ── El dueño agenda, y eso nace como cobro pendiente ─────────────── */

-- Puede crear el cobro de lo que agenda, y solo el suyo. Las dos
-- condiciones de más importan: nace PENDIENTE y sin fecha de pago, así que
-- nadie se da por pagado solo. Marcarlo pagado sigue siendo de
-- Administración, que es quien mira la transferencia.
drop policy if exists "agendo y queda pendiente" on pagos;
create policy "agendo y queda pendiente" on pagos
  for insert with check (
    cliente_id = mi_cliente_id()
    and estado = 'pendiente'
    and pagado_en is null
  );

-- OJO, y está anotado en CLAUDE.md: RLS puede verificar QUIÉN cobra y en qué
-- ESTADO nace el cobro, pero no CUÁNTO. El monto lo calcula el navegador, así
-- que alguien con la consola abierta puede crearse un cobro de $0. Mientras
-- el cobro nazca pendiente y lo marque una persona, eso aparece a la vista en
-- la pantalla de pagos. Antes de que haya pasarela, la cotización tiene que
-- moverse al servidor.

/* ── El equipo cierra la jornada, y eso ajusta el cobro ───────────── */

-- Acá se corrige una decisión de 0002. "El equipo no ve la plata" era una
-- buena idea en abstracto y choca con la operación real: el check-out del
-- jardín vuelve a cotizar con la hora real —de ahí sale el recargo fuera de
-- horario— y tiene que crear, corregir o borrar ese cobro.
--
-- En vez de abrirle los pagos enteros, se le abren los tres conceptos que
-- nacen de su turno. La deuda del cliente, los planes, los abonos y la cuenta
-- del mes siguen siendo de Administración: lo que el equipo ve es lo que
-- acaba de pasar en la casa, no lo que el dueño debe.
drop policy if exists "el equipo cobra lo de su turno" on pagos;
create policy "el equipo cobra lo de su turno" on pagos
  for all using (
    es_equipo()
    and concepto in ('dia_suelto', 'dia_de_prueba', 'saldo_hotel')
  )
  with check (
    es_equipo()
    and concepto in ('dia_suelto', 'dia_de_prueba', 'saldo_hotel')
  );

/* ── Comprar descuenta stock sin poder tocar el precio ────────────── */

-- La tentación era darle UPDATE sobre `productos` al dueño. Sería un error:
-- con UPDATE podría cambiarle el PRECIO a un producto, y ese precio lo leen
-- todos los demás. Un permiso que se pide para restar uno al stock no puede
-- venir con la capacidad de reescribir la vitrina.
--
-- Por eso una función que hace exactamente una cosa. `security definer` la
-- deja saltarse RLS sobre `productos`, pero lo único que sabe hacer es restar.
create or replace function descontar_stock(producto uuid, cantidad integer)
returns productos
language plpgsql
security definer
set search_path = public
as $$
declare fila productos;
begin
  if cantidad < 0 then
    raise exception 'La cantidad a descontar no puede ser negativa.';
  end if;

  -- Nunca queda negativo: si no alcanza, queda en cero y la pantalla de
  -- inventario lo muestra agotado. Es la misma regla que `ajustarStock` ya
  -- tenía en el repositorio local, puesta donde no se puede evitar.
  update productos
     set stock = greatest(0, stock - cantidad)
   where id = producto
  returning * into fila;

  if not found then
    raise exception 'No existe el producto %', producto;
  end if;

  return fila;
end $$;

revoke all on function descontar_stock(uuid, integer) from public;
grant execute on function descontar_stock(uuid, integer) to authenticated;
