/*
 * Traslado de ida y vuelta, y paseos por cantidad.
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

/*
 * Los paseos se compran por cantidad y el equipo los reparte durante la
 * estadía. Sin esta columna un pack de cinco paseos se guarda como uno
 * solo y el equipo no sabe cuántos debe.
 */

alter table servicios
  add column if not exists cantidad integer;

comment on column servicios.cantidad is
  'Solo paseo: cuántos se compraron de una vez.';

/*
 * Paseos de 15 minutos en la estadía de hotel.
 *
 * Va aparte y no reemplaza a `paseos_contratados`: las reservas ya
 * guardadas tienen ahí sus paseos de 30 min, y renombrar esa columna las
 * dejaría diciendo otra duración de la que se cobró.
 */

alter table reservas_hotel
  add column if not exists paseos_cortos_contratados integer not null default 0;

comment on column reservas_hotel.paseos_cortos_contratados is
  'Paseos de 15 min. Los de 30 min siguen en paseos_contratados.';
