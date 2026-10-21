-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · lo de la ficha que decide la casa                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se puede correr de nuevo sin hacer daño.
--
-- El dueño manda sobre la ficha de su perro, con tres excepciones:
--
--   sexo y esterilizado → deciden si un macho entra. Desmarcarlos después
--                         de reservar le da la vuelta a la admisión.
--   excepcion_peso      → la habilitación de un perro que pasa del peso.
--                         La da Administración mirando al perro; si el
--                         dueño pudiera escribirla, se habilitaría solo.
--
-- La capa de servicios ya los descarta (`actualizarPerroComoDueno`), pero
-- con Supabase el dueño tiene la API a mano y la política "mis perros" le
-- deja actualizar la fila entera. Por eso la regla vive también acá.

alter table perros
  add column if not exists excepcion_peso jsonb;

alter table configuracion
  add column if not exists whatsapp_de_contacto text not null default '';

create or replace function proteger_ficha_de_la_casa()
returns trigger
language plpgsql
as $$
begin
  if es_equipo() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- En el alta el dueño declara sexo y castración: lo que no puede es
    -- llegar ya habilitado.
    if new.excepcion_peso is not null then
      raise exception 'La habilitación por peso la da Administración.';
    end if;
    return new;
  end if;

  if new.sexo is distinct from old.sexo
    or new.esterilizado is distinct from old.esterilizado then
    raise exception 'El sexo y la castración los corrige Administración.';
  end if;

  if new.excepcion_peso is distinct from old.excepcion_peso then
    raise exception 'La habilitación por peso la da Administración.';
  end if;

  return new;
end;
$$;

drop trigger if exists ficha_de_la_casa on perros;
create trigger ficha_de_la_casa
  before insert or update on perros
  for each row execute function proteger_ficha_de_la_casa();
