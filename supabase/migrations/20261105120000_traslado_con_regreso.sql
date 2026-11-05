/*
 * Traslado de ida y vuelta.
 *
 * El mismo tramo dos veces: el precio se calcula en la app con la matriz de
 * siempre, acá solo se guarda qué se cotizó. Sin esta columna el traslado
 * con regreso se guarda como si fuera solo ida, y la cotización guardada
 * deja de poder explicarse.
 *
 * Se puede correr de nuevo sin hacer daño.
 */

alter table servicios
  add column if not exists con_regreso boolean not null default false;

comment on column servicios.con_regreso is
  'Traslado de ida y vuelta: dos viajes del mismo tramo.';
