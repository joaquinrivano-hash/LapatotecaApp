-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  La Patoteca · la cuenta donde se paga                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- Se puede correr de nuevo sin hacer daño.
--
-- Los datos de transferencia vivían en el código (`NEGOCIO.transferencia`),
-- vacíos a la espera de la cuenta real. Pasan a `configuracion` para que
-- Administración los complete desde /admin/configuracion sin tocar código.
--
-- `configuracion` se lee sin sesión (ver _permisos), y eso acá está bien:
-- una cuenta para transferir es justamente un dato que se le da a quien va
-- a pagar.

alter table configuracion
  add column if not exists transferencia jsonb not null default
    '{"titular":"","rut":"","banco":"","tipoDeCuenta":"","numero":"","email":""}'::jsonb;
