-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · quién marcó la llegada y quién la salida          ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se puede correr de nuevo sin hacer daño.
--
-- Ya se guardaba CUÁNDO se apretó el botón (`inicio_marcado_en`) pero no
-- QUIÉN lo apretó. Y marcar llegadas es lo que más se hace en un turno, así
-- que el trabajo más frecuente no dejaba rastro atribuible: en la planilla,
-- un turno tranquilo se parecía a uno ausente.
--
-- Son dos columnas por tabla y no una: la llegada de la mañana y el retiro
-- de la tarde los suele marcar gente distinta, que es justamente el turno
-- cambiando de manos.

alter table estadias_jardin
  add column if not exists inicio_marcado_por uuid references perfiles (id) on delete set null,
  add column if not exists fin_marcado_por uuid references perfiles (id) on delete set null;

alter table reservas_hotel
  add column if not exists inicio_marcado_por uuid references perfiles (id) on delete set null,
  add column if not exists fin_marcado_por uuid references perfiles (id) on delete set null;

create index if not exists estadias_marcadas_por
  on estadias_jardin (inicio_marcado_por);
create index if not exists reservas_marcadas_por
  on reservas_hotel (inicio_marcado_por);

/*
 * La firma la pone la base, no el navegador.
 *
 * El equipo ya puede actualizar estas filas —marcar llegadas es su trabajo—,
 * así que sin esto podría atribuirle una marca a otra persona escribiendo
 * otro id desde la consola. Y entonces la planilla diría que alguien estuvo
 * trabajando cuando no vino, que es peor que no tener el dato.
 *
 * El valor que manda la app es una conveniencia; el que vale es este.
 * Administración sí puede escribir cualquiera: corrige registros viejos.
 */
create or replace function firmar_la_marca()
returns trigger
language plpgsql
as $$
begin
  if es_admin() then
    return new;
  end if;

  if new.inicio_marcado_por is not null
    and new.inicio_marcado_por is distinct from old.inicio_marcado_por then
    new.inicio_marcado_por := auth.uid();
  end if;

  if new.fin_marcado_por is not null
    and new.fin_marcado_por is distinct from old.fin_marcado_por then
    new.fin_marcado_por := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists al_marcar_jardin on estadias_jardin;
create trigger al_marcar_jardin before update on estadias_jardin
  for each row execute function firmar_la_marca();

drop trigger if exists al_marcar_hotel on reservas_hotel;
create trigger al_marcar_hotel before update on reservas_hotel
  for each row execute function firmar_la_marca();
