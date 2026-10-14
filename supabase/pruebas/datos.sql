
-- Cuatro cuentas. El disparador les crea el perfil con rol "cliente";
-- a dos las asciende Administración, como en la vida real.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@ejemplo.cl'),
  ('22222222-2222-2222-2222-222222222222', 'beto@ejemplo.cl'),
  ('33333333-3333-3333-3333-333333333333', 'cuidador@lapatoteca.cl'),
  ('44444444-4444-4444-4444-444444444444', 'admin@lapatoteca.cl');

update perfiles set rol = 'staff' where id = '33333333-3333-3333-3333-333333333333';
update perfiles set rol = 'admin' where id = '44444444-4444-4444-4444-444444444444';

insert into clientes (id, perfil_id, nombre, apellido, email, telefono, comuna) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Ana', 'Pérez', 'ana@ejemplo.cl', '+56911111111', 'Providencia'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Beto', 'Soto', 'beto@ejemplo.cl', '+56922222222', 'Ñuñoa');

insert into perros (id, cliente_id, nombre, raza, peso_kg, sexo, esterilizado) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'Lola', 'Mestizo', 9.5, 'hembra', true),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'Rocky', 'Beagle', 12, 'macho', true);

-- Tres cobros elegidos para que se vea la frontera del equipo: el día de
-- prueba y el día suelto nacen de su turno, la cuenta del mes no.
insert into pagos (cliente_id, concepto, monto, estado) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'dia_de_prueba', 10000, 'pendiente'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'cuenta_mensual', 86000, 'pendiente'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'dia_suelto', 18000, 'pagado');

insert into reportes (perro_ids, fecha, nota, autor_staff) values
  (array['cccccccc-0000-0000-0000-000000000001']::uuid[], current_date, 'Lola durmió la siesta', 'Javi'),
  (array['dddddddd-0000-0000-0000-000000000002']::uuid[], current_date, 'Rocky jugó harto', 'Javi');

insert into productos (id, nombre, categoria, precio, stock) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Pelota', 'juguetes', 6000, 10);

insert into configuracion (vacunas_obligatorias, duracion_vacunas_meses, campos_obligatorios, catalogos)
  values (array['octuple','antirrabica','kc'], '{"octuple":12}', array['foto'], '{"razas":["Mestizo"]}');


-- Un recuento por tabla, puesto en los zapatos de quien pregunta.
create or replace function mirar(quien uuid) returns table (
  tabla text, filas bigint
) language plpgsql as $$
begin
  perform set_config('prueba.uid', coalesce(quien::text, ''), true);
  return query
    select 'clientes', count(*) from clientes
    union all select 'perros', count(*) from perros
    union all select 'pagos', count(*) from pagos
    union all select 'reportes', count(*) from reportes
    union all select 'configuracion', count(*) from configuracion;
end $$;
