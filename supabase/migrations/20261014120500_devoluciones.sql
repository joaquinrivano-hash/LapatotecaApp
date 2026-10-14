-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · dónde devolverle la plata a un cliente            ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Cancelar dentro de plazo algo que el dueño YA pagó deja plata que tiene
-- que salir de la casa. Eso necesita dos cosas que antes no existían: a qué
-- cuenta transferirle, y si ya se transfirió.

-- Se guardan en la ficha del cliente y no en el cobro: nadie se sabe su
-- número de cuenta de memoria, y pedírselo de nuevo en cada devolución es la
-- manera de que la devolución quede a medias.
alter table clientes
  add column if not exists datos_bancarios jsonb;

-- Solo aplica a un cobro reembolsado que el cliente ALCANZÓ a pagar. Si
-- estaba pendiente, anularlo ya fue la devolución y no hay plata que mover:
-- ese cobro queda en cero y nunca pasa por acá. Mientras esta columna esté
-- vacía, la plata todavía no sale.
alter table pagos
  add column if not exists devolucion_transferida_en timestamptz;

-- Lo que falta por transferir, que es lo que mira el backoffice.
create index if not exists pagos_devoluciones
  on pagos (estado)
  where estado = 'reembolsado' and devolucion_transferida_en is null;
