-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · la hora real y la hora en que se marcó            ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- El cuidador marca de un toque, y a veces lo hace después: el perro llegó a
-- las 8:00 y él alcanzó a marcarlo a las 8:40, con las manos ocupadas.
--
-- `inicio_real` es la que vale para el negocio —de ahí sale el tramo cobrado
-- y el recargo—, así que tiene que poder corregirse. Estas columnas guardan
-- cuándo se apretó el botón, que es otra cosa.
--
-- La diferencia entre las dos no cobra nada. Dice qué tan al día se está
-- marcando, que es información sobre la operación y no sobre el perro.

alter table estadias_jardin
  add column if not exists inicio_marcado_en timestamptz,
  add column if not exists fin_marcado_en timestamptz;

alter table reservas_hotel
  add column if not exists inicio_marcado_en timestamptz,
  add column if not exists fin_marcado_en timestamptz;
