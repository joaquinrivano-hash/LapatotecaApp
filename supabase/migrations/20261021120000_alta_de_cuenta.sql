/*
 * El alta de una cuenta de dueño, desde el navegador.
 *
 * La política "me registro" en `clientes` exige `perfil_id = auth.uid()`, y
 * está bien que lo exija: es lo que impide crear una ficha de cliente
 * apuntando a la cuenta de otra persona.
 *
 * El problema es quién escribe esa columna. `perfil_id` existe en la base y
 * NO existe en el tipo `Cliente` de TypeScript, a propósito: amarra el
 * cliente con su cuenta de Supabase, lo usan las políticas, y la app no
 * tiene por qué verlo (`lib/repo/esquema.test.ts` lo deja anotado). Entonces
 * el repositorio nunca lo manda, el insert llega con `perfil_id` nulo y la
 * política lo rechaza.
 *
 * Dárselo al navegador habría sido el arreglo fácil y el equivocado: volver
 * a poner en manos del cliente el dato que decide de quién es la ficha. El
 * valor por defecto lo resuelve en el lugar correcto —la base pone quién
 * está pidiendo— y de paso hace que la columna no se pueda falsear ni a
 * propósito desde la consola.
 *
 * Se puede correr de nuevo sin hacer daño: fijar el mismo default dos veces
 * no cambia nada.
 */

alter table clientes alter column perfil_id set default auth.uid();

/*
 * Un admin creando la ficha de un cliente que todavía no tiene cuenta.
 *
 * Ahí `auth.uid()` es el del admin y no corresponde: la ficha no es suya. La
 * política ya lo permite (`or es_admin()`), así que el default se pisa
 * mandando `perfil_id` explícito en null, y el cliente se enlaza después,
 * cuando esa persona se registre. Queda anotado acá porque el default hace
 * que ese caso NO sea el comportamiento por omisión y es fácil olvidarlo.
 */

comment on column clientes.perfil_id is
  'La cuenta de Supabase del dueño. Por defecto, quien está creando la fila: '
  'así el navegador no puede apuntar la ficha a otra persona. Un admin que '
  'carga a un cliente sin cuenta manda null explícito.';
