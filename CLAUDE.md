# La Patoteca — Prototipo navegable

Hotel y jardín canino en Providencia, Santiago de Chile. Empezó como un
**prototipo navegable** con datos mock en localStorage, y ese modo sigue
existiendo para demos y desarrollo. **En producción (`lapatoteca.cl`) corre
sobre Supabase**, con login real: el interruptor es
`NEXT_PUBLIC_ORIGEN_DATOS` (ver "La nube" y "Dónde vive cada cosa").

---

## 1. El negocio

La Patoteca cuida perros en una casa, **sin jaulas** — eso es la marca, no un
detalle. El tono de toda la UI (copy, colores, ilustraciones) debe sentirse
cálido y hogareño. Si una pantalla parece un ERP corporativo, está mal.

Tres líneas de ingreso:

- **Jardín** (guardería de día, 7:00–19:00): el volumen. ~15-18 perros por día
  entre semana, ~3 los fines de semana.
- **Hotel** (alojamiento): ~3-4 perros entre semana, 6-7 los fines de semana.
- **Servicios spot y tienda**: spa, paseos, traslados, productos.

Hotel y jardín **comparten el mismo espacio físico**: hay 25 cupos simultáneos
en total, no 25 de cada uno. Esa restricción compartida es la regla más
importante del sistema.

### Idioma, moneda, zona horaria

- Español de Chile en toda la UI. Trato de "tú".
- Montos en CLP con punto de miles y sin decimales: `$18.000`.
- Zona horaria `America/Santiago` **siempre**. Nunca uses la del navegador ni
  UTC para lógica de negocio: un check-out a las 19:30 de Santiago define un
  cobro.

---

## 2. Reglas de negocio

Todas viven en `/lib/rules` como **funciones puras con tests**. Ningún
componente calcula precios ni valida capacidad por su cuenta.
Todos los montos viven en `/lib/config/precios.ts` y los parámetros
operativos en `/lib/config/negocio.ts`. **Un precio hardcodeado en un
componente es un bug.**

### Capacidad

- Máximo **25 perros simultáneos**, compartidos entre hotel y jardín.
- Se valida **por franja horaria**, en slots de 30 minutos: un perro de jardín
  que sale a las 13:00 libera el cupo para otro que entra a las 14:00.
- El hotel ocupa slots de forma continua desde su check-in hasta su check-out,
  cruzando días.
- Si alguna franja del rango solicitado llega a 25, **la reserva se bloquea**.
  El error debe decir qué franja y qué día chocaron, no un "no hay cupo" pelado.
- Ojo: el cupo de un día es el **máximo** de las franjas, no la suma de perros
  del día. Son números distintos y el calendario debe mostrar el correcto.

### Requisitos de admisión

Se validan antes de permitir cualquier reserva:

- Peso **hasta 20 kg**.
- **Machos esterilizados** (las hembras no tienen este requisito).
- **Vacunas al día**: **óctuple, antirrábica y KC**, vigentes y sin vencer al
  día del servicio.
- **Desparasitación interna y externa al día.** Sin registro se avisa pero no
  se bloquea: los perros cargados antes de que existiera el campo no tienen por
  qué quedar rechazados de golpe.
- **100% sociable.** Sin evaluar no bloquea; evaluado como no sociable, sí.
- **Día de prueba aprobado** ($10.000) antes de la *primera* reserva del perro,
  sea de hotel o de jardín.

### Jardín

- Horario **7:00–19:00**.
- Tarifa por tiempo, tres tramos: **menos de 4 h $10.000**, **entre 4 y 8 h
  inclusive $16.000**, **más de 8 h $18.000**.
- **Fuera de horario**: $1.000 por hora iniciada después de las 19:00, con 15
  minutos de gracia, calculado desde el **check-out real** registrado por staff.
  **No se cobra solo**: queda calculado esperando que Administración decida si
  lo cobra o lo perdona. Ver "Quién cobra, y cuándo".

### Planes de jardín

Son **mensuales y se pagan por adelantado**: valen hasta el último día del mes
en que se compran. Los días no usados **no pasan al mes siguiente** y se usan
**de lunes a viernes**.

- Se cobran **por día**, y el precio por día baja según cuántos se contraten:
  **5 a 10 días $15.000/día**, **más de 10 días $14.000/día**.
- **Pase libre: $220.000 al mes**, todos los días hábiles.
- Mínimo 5 días.

El pase libre se modela con `diasTotales` igual a los días hábiles que le
quedan al mes: es el máximo que se puede usar de verdad, y así el saldo, el
consumo y los avisos de vencimiento funcionan igual que en cualquier plan.

### Hotel

- **$24.000 por bloque de 24h**, con **2 horas de tolerancia** en el check-out;
  pasada la tolerancia se cobra **$1.000 por hora iniciada**.
- **Toda estadía paga al menos un bloque.** Dejar al perro tres horas es una
  noche de hotel, no tres horas sueltas: el cobro por hora existe solo para el
  que se pasa de un bloque ya empezado. Por construcción el recargo nunca llega
  a costar más que una noche (22h × $1.000 < $24.000), así que alargarse
  siempre sale más barato que reservar un día de más.
- Descuentos por duración, umbrales **inclusivos** ("desde N noches"):
  **desde 7 noches -10%**, **desde 14 noches -15%**. Son excluyentes entre sí.
- **10% adicional** si el cliente tiene un **plan de jardín vigente**.
- Paseo opcional: **$4.000 cada uno**, de 30 min.
- Reserva con **abono del 50%**.
- **Devolución solo si se cancela con ≥48h de aviso**: devuelve el abono
  completo. Con menos de 48h, no se devuelve nada.

### Servicios spot

- **Baño** (pequeño bajo 10 kg, mediano de 10 a 25 kg):
  - Express: $13.000 / $18.000
  - Premium: $25.000 / $30.000
  - **-20% para clientes activos, SOLO en el premium.** El express ya está al
    precio de entrada.
- **Paseos sueltos**: $5.000 media hora, $10.000 la hora. **-20% para clientes**.
- **Traslados**: es una **matriz**, no un precio por kilómetro.
  - 0 a 5 km: $8.000 normal, $10.000 en punta
  - 5 a 10 km: $12.000 normal, $15.000 en punta
  - Punta: 7:00–9:00 y 17:00–20:00
  - Más allá de 10 km el folleto no define tarifa: la app cobra el último
    tramo para no quedarse sin precio.

**Cliente activo** = tiene un plan vigente con saldo, o registró una estadía en
los últimos 30 días.

### Descuentos

- **Segundo perro del mismo dueño: -20%.**
- Los descuentos son **acumulables en cascada**, aplicados en orden: duración,
  plan de jardín vigente, segundo perro, cliente activo.
  Ejemplo: hotel 15 noches $360.000 → -15% = $306.000 → -20% = $244.800.
- El desglose que ve el cliente debe mostrar cada descuento por separado con su
  monto, nunca un total sin explicación.

### Cobro del día 1

El día 1 de cada mes se emite **un solo documento por cliente** que junta:

1. La **renovación de los planes recurrentes** (suscripciones activas: se
   recarga el pack y se cobra).
2. El **consolidado de consumos sueltos del mes anterior** (días sueltos, spa,
   paseos, traslados, saldos de hotel pendientes).

Los packs comprados puntualmente se pagan al momento de comprarlos y no entran
en la renovación.

---

## 3. Stack y arquitectura

- **Next.js 14+ (App Router) + TypeScript strict + Tailwind + shadcn/ui +
  lucide-react**
- **Vitest** para los tests de `/lib/rules`
- **PWA** instalable: manifest + service worker básico
- **zustand + persist** para el estado que sobrevive al refresh

### Una app, tres caras

| Ruta | Quién | Foco |
|---|---|---|
| `/` | Cliente | Landing, reservas, tienda, mis reservas |
| `/staff` | Staff | Celular, botones grandes, check-in/out de un toque |
| `/admin` | Admin | Backoffice: clientes, calendario, pagos, planes, KPIs |

Con `NEXT_PUBLIC_ORIGEN_DATOS=supabase` (producción) se entra con correo y
contraseña, y el rol lo decide la base. Con `local` (el prototipo) el rol se
elige en un **login mock** con selector, que en producción no aparece.

### Capa de repositorio — la regla que no se rompe

`/lib/repo` define **interfaces** (`ClienteRepo`, `PerroRepo`, `ReservaRepo`,
`PagoRepo`…) con una implementación `LocalRepo` que lee el seed y persiste las
mutaciones en localStorage.

- **Toda la UI consume `repo.*`**. Ningún componente importa el seed directo.
- **Todos los métodos son `async`** desde ahora, aunque hoy resuelvan al
  instante. Así la firma no cambia cuando entre Supabase.
- Cambiar a Supabase debe ser: escribir `SupabaseRepo`, cambiar el factory en
  `/lib/repo/index.ts`, **cero cambios en componentes**.

Si para implementar una pantalla necesitas saltarte el repo, el que está mal es
el repo: agrégale el método.

### shadcn/ui sin CLI

El entorno remoto no alcanza `ui.shadcn.com`, así que los primitivos de
`components/ui` están **escritos a mano sobre Radix + cva**, con la misma API
y los mismos nombres de archivo que generaría el CLI. `components.json` está
configurado, así que desde una máquina con red `npx shadcn add <componente>`
funciona normal y se integra sin conflictos.

### Estructura

```
app/
  (portal)/    landing · reservar (hotel, jardín, planes, servicios)
               dia-de-prueba · tienda · mi-cuenta
  crear-cuenta/  alta del dueño · equipo/ (alta del personal)
               · equipo/bienvenida/ (donde llega el correo de invitación)
  ingresar/    login (correo y contraseña, o el selector en el prototipo)
               · clave/ (contraseña nueva desde el correo)
  staff/       Hoy · buscar · reportes · incidentes
  admin/       KPIs · calendario · clientes · pagos · planes · inventario
               configuracion (qué se le pide a una ficha, listas, WhatsApp
               y cuenta de la casa) · equipo (turnos y accesos) · datos
  offline/     pantalla de caída del service worker
  api/integraciones/whatsapp/   enviar · webhook
  api/equipo/invitaciones/      el correo de invitación (llave de servicio)
proxy.ts       quién entra a cada cara, decidido en el servidor
components/
  ui/          shadcn escrito a mano
  shared/      PrecioCLP, PerroAvatar, EstadoBadge, LogoPatoteca, PWA
               FormularioPerro (el alta, igual en las tres caras),
               ContactoCasa, ComoPagar, DatosTransferencia…
  staff/ admin/ portal/ ingresar/
lib/
  config/      precios.ts · negocio.ts   ← única fuente de constantes
  types.ts
  rules/       funciones puras + *.test.ts colocados
  servicios/   reglas + repositorio (asistencia, reservas, panel, cobranza…)
  repo/        interfaces + impl local + impl Supabase + factory
  auth/        identidad: mock o Supabase, puertas, enlaces de correo
  integraciones/  mensajería · direcciones (Google) · equipo (invitaciones)
  data/        seed determinista
  store/       zustand + persist
  hooks/       useConsulta · useAccion · useMontado
  utils/       fecha (America/Santiago) · formato CLP · teléfono · imagen
public/        manifest.webmanifest · sw.js · marca/ (logo e íconos)
```

### Modelo de datos

`Cliente` · `Perro` (con `Vacuna[]`, `diaDePrueba`, `alimentacion`,
`antiparasitario`, `medicamentos`, `alergias`, `indicaciones` y `notas`) ·
`ConfiguracionAdmision` · `Notificacion` · `ReservaHotel` ·
`EstadiaJardin` · `PlanComprado` · `Suscripcion` · `ServicioAgendado` ·
`Pago` · `Producto` · `OrdenTienda` · `Reporte` · `Incidente`

`EstadiaJardin` es la unidad de asistencia y tiene estados
`esperada → presente → finalizada`, guardando las **horas reales** de check-in
y check-out (de ahí sale el cobro fuera de horario).

Hotel y jardín se consultan juntos a través de una vista unificada
`OcupacionDia`, que es lo que usan capacidad, calendario y KPIs. Cuando
agregues una línea de servicio nueva que ocupe espacio, tiene que aportar ahí.

### Integraciones externas

`/lib/integraciones` sigue el mismo criterio que el repositorio: la app habla
con una interfaz, nunca con el proveedor.

**Los reportes se mandan por WhatsApp Business.** Eso trae reglas que no son
negociables y que ya están modeladas:

- Para escribirle PRIMERO a un cliente (fuera de la ventana de 24 h desde su
  último mensaje) **no se puede mandar texto libre**: hay que usar una
  plantilla aprobada en WhatsApp Manager. Las plantillas viven en
  `mensajeria/plantillas.ts` con parámetros posicionales `{{1}}`, `{{2}}`, y
  hay que darlas de alta con el mismo nombre e idioma en el panel de Meta.
- Los teléfonos se normalizan a E.164 (`+56912345678`) antes de salir.
- Un reporte que cubre varios perros manda **un mensaje por dueño**, con sus
  perros nombrados. Nadie recibe tres WhatsApps porque su vecino salió en la
  foto.
- **Todo mensaje se guarda antes de intentar enviarlo.** Si falla, queda en la
  bandeja con su motivo y se puede reintentar; nunca se pierde un reporte
  porque se cayó la red.

Dos cosas que solo aparecen cuando se manda de verdad, y que ya están
resueltas en el código:

- **El idioma de la plantilla tiene que coincidir exacto.** Meta tiene una
  lista cerrada de idiomas y el español chileno no está en ella. Con un código
  que no existe el envío falla con "template name does not exist in the
  translation" aunque el nombre esté perfecto, que es un error que no se
  entiende leyéndolo. Por eso el idioma es una constante única,
  `IDIOMA_PLANTILLAS`, y no cuatro literales sueltos.
- **La foto del reporte se sube antes de mandar el mensaje.** El equipo la saca
  en el celular y se guarda como data URL; el encabezado de imagen de WhatsApp
  pide un link HTTPS que descarga **el servidor de Meta**, y un data URL no lo
  es. La ruta de envío la sube a la API de medios y el mensaje la nombra por
  id. Si algún día las fotos viven en un bucket público, el link vuelve a
  servir y el código ya lo distingue solo.

El canal se elige con `NEXT_PUBLIC_CANAL_MENSAJERIA`: `simulado` (por defecto,
no toca la red, sirve para demos sin cuenta de Meta) o `whatsapp`. El token es
secreto y vive solo en el servidor, detrás de
`/api/integraciones/whatsapp/enviar`. Ver `.env.example`.

El webhook (`/api/integraciones/whatsapp/webhook`) traduce los estados de
entrega de Meta, pero **no los persiste**: la bandeja vive en el localStorage
del navegador y el servidor no la alcanza. El punto de enganche para cuando
exista base de datos está marcado en el archivo.

### Capa de servicios

`/lib/servicios` junta las reglas puras con el repositorio. Las reglas siguen
sin saber que existe el almacenamiento y las pantallas siguen sin calcular
precios: piden una acción y reciben el resultado ya cotizado.

Ahí vive, por ejemplo, que el check-out del jardín **vuelve a cotizar con la
hora real** (de ahí sale el recargo fuera de horario) y que cerrar dos veces
corrige el cobro en vez de duplicarlo.

Sobre los planes: el día del pack se descuenta cuando se **agenda** la
estadía, no cuando el perro llega. El check-in no toca el saldo. En un ingreso
no planificado agendar y llegar son el mismo momento, así que ahí sí se
descuenta al registrar.

### Quién cobra, y cuándo

**El cuidador no toca plata.** Marca llegada y salida y nada más: ni emite
cobros ni perdona atrasos. Lo que su turno produce es información —la hora
real de salida—, y de ahí sale el dinero después, decidido por otra persona.

El motivo es el mismo por el que no ve la cobranza: quien está entregando un
perro en la puerta, con el dueño enfrente, no debería tener que decidir si le
cobra los $2.000 del atraso. Esa conversación no es suya.

Entonces, cuándo nace cada cobro:

| | Cuándo se paga |
|---|---|
| Plan de jardín | Al comprarlo, por adelantado (nace pendiente: no hay pasarela) |
| Día suelto reservado | Al agendarlo, por adelantado |
| Día de prueba | Al agendarlo |
| Hotel | **50% al reservar**, saldo al retiro según la salida real |
| Recargo fuera de horario | **Nunca solo**: lo decide Administración |
| Ingreso no planificado | Lo emite Administración después |

Y como el día de jardín ahora está pagado antes de usarse, **cancelarlo tiene
consecuencia**: `cancelarDiaDeJardin` aplica la política y, cuando devuelve,
anula el cobro marcándolo reembolsado en cero y le devuelve el día al pack. Un
perro que ya llegó no se cancela —eso es un retiro, y lo registra el equipo—.

La condición se muestra **antes de confirmar**, con las horas que quedan, y se
recalcula en el render y no al montar: si alguien deja la pestaña abierta toda
la tarde, lo que ve tiene que ser la condición de ahora y no la de cuando
abrió.

#### Devolver la plata no es lo mismo que anular el cobro

Cancelar dentro de plazo tiene **dos caminos distintos**, y confundirlos sería
prometer una transferencia que nunca llega:

- **El cobro estaba pendiente** → anularlo YA es la devolución. No hay plata
  que mover: queda reembolsado en cero y no se le pide ninguna cuenta.
- **El dueño alcanzó a pagar** → la plata está en la casa y hay que
  devolverla. El cobro queda reembolsado **conservando el monto**, que es
  justamente lo que se le debe, y ahí sí se le piden los datos de
  transferencia.

Por eso el formulario de cuenta aparece **solo cuando hay algo que devolver**,
y nunca cuando se cancela fuera de plazo. Ofrecerle una transferencia a alguien
que nunca pagó, o a alguien que canceló tarde, es ofrecerle algo que no llega.

Los datos se guardan en la **ficha del cliente**, no en el cobro: nadie se sabe
su número de cuenta de memoria y pedírselo de nuevo en cada devolución es la
manera de que la devolución quede a medias. El RUT es **del titular**, que
puede no ser el cliente —hay cuentas a nombre de la pareja— y el banco rechaza
la transferencia si el nombre no calza.

#### Y la cancelación en sí llega a la bandeja

Una cancelación sin aviso es **invisible**: el día desaparece del calendario y
nadie se entera de quién avisó ni cuándo. Para la dueña eso importa — un cupo
que se libera con dos días es otra cosa que uno que se libera a las nueve de
la noche.

Por eso cada cancelación deja una `Notificacion` por el mismo canal que las
correcciones de ficha, en `/admin`. Una bandeja aparte sería una bandeja que
se deja de abrir.

El aviso dice el día, **con cuánta anticipación avisó** y en qué terminó el
cobro, que son los tres finales posibles: anulado porque no alcanzó a pagarlo,
pendiente de devolución porque sí pagó, o en pie porque canceló fuera de plazo.

**El aviso sale siempre, también fuera de plazo** — y ese es el que más
importa. La primera versión no lo mandaba en ese caso, porque esa rama volvía
antes; justamente la cancelación sobre la hora, que es la que deja un cupo que
ya no se alcanza a ofrecer.

Y como el día y la anticipación son **hechos y no cambios**, van sin `antes`:
la bandeja escribe la línea sola, sin el tachado ni la flecha que sí
corresponden a "9 kg → 12 kg".

Y la otra mitad: `/admin/pagos` tiene su propia tarjeta **"Por devolver"**, con
la cuenta completa a la vista para copiarla. Va aparte de los cobros pendientes
porque es al revés —ahí entra plata, acá sale— y juntarlas haría fácil
confundir cobrarle a alguien con devolverle. Una promesa que no aparece en
ninguna pantalla es una promesa que no se cumple.

`lib/servicios/cobros-pendientes.ts` junta las tres colas que quedan
esperando en el backoffice, y **no son la misma cosa**:

- El **recargo fuera de horario** es una DECISIÓN. El pack cubre el día, no
  que lo pasen a buscar a las ocho y media; pero si el dueño se quedó pegado
  en el Costanera una vez, la dueña puede perdonarlo. Dos acciones: cobrarlo
  o perdonarlo.
- El **saldo de hotel** es una EMISIÓN, no una decisión: el hotel se paga
  según la salida real y lo que falta contra el abono se debe. Lo único que
  cambió es quién lo emite.
- Los **días sin cobrar** son la red de seguridad: en la práctica son los
  ingresos no planificados, porque un día reservado desde el portal ya trae
  su cobro desde que se agendó. Si una jornada se registró y nunca se cobró,
  aparece acá hasta que alguien la emita.

**Perdonar deja rastro.** Un recargo perdonado nace como cobro en cero y
marcado reembolsado, igual que la anulación del día de prueba. Borrarlo sería
más limpio de mirar y dejaría la cobranza del mes sin poder explicarse: un
cobro que desaparece no deja constancia de que existió ni de que alguien
decidió perdonarlo.

Y por eso **"¿ya se decidió?" se contesta con "¿existe un cobro de este
concepto para esta estadía?"**: perdonar deja un cobro en cero, no deja un
vacío, así que la cola no lo vuelve a ofrecer.

La tarjeta vive en `/admin/pagos` y **se esconde sola cuando no hay nada**: un
negocio al día no necesita mirar una tarjeta vacía todos los días. Muestra
cinco dueños y resume el resto, porque un fin de semana largo puede dejar
quince y quince bloques con botones no se leen, se barren.

**Se agrupa por dueño, no por perro.** No es una preferencia de diseño: el
cobro se le hace a una persona. Dos perros de la misma casa que salieron tarde
el mismo día son UNA conversación y una transferencia; con las filas sueltas
por perro, quien cobra tiene que ir juntando mentalmente cuáles son del mismo
dueño antes de poder escribirle. Por eso cada dueño trae su total y un "Cobrar
todo" cuando tiene más de uno.

Los dueños salen ordenados por **lo que lleva más tiempo esperando**, no por
monto: lo que se añeja es lo que se termina no cobrando.

Y "Perdonar" aparece **solo en el recargo**. Un saldo de hotel o un día ya
usado no son una decisión, son una deuda.

En `/staff` el cierre avisa el atraso **en horas, sin el monto**: hay que
conversarlo con el dueño que está ahí parado, pero poner un precio en esa
pantalla convertiría la entrega del perro en una negociación con alguien que
no tiene nada que decidir.

El seed emite los dos cobros por separado y **deja los retiros tarde del
pasado ya decididos** —uno de cada seis perdonado—, porque la cola es para lo
que pasó recién y no para 60 días de historia esperando a alguien. Un día
suelto futuro también nace cobrado: se paga al agendarlo, no al llegar.

#### Emitir un cobro es avisarlo

Un cobro que aparece sin explicación es la manera segura de que el dueño
escriba preguntando qué es. Por eso `cobrarPendiente` emite **y avisa**, en la
misma llamada: si fueran dos, el día que alguien agregue otra pantalla que
cobre se le va a olvidar la segunda.

Lo que el dueño **agenda desde el portal no avisa**: ya vio el precio cotizado
antes de confirmar, y mandarle un mensaje sería contarle algo que acaba de
hacer. El aviso es para lo otro — el recargo que decidió Administración, el
saldo que salió de la hora real de salida, el día que se registró en la puerta.

Va por la capa de mensajería, así que con el canal `simulado` no toca la red y
el mensaje **queda igual en la bandeja**: el día que se enchufe WhatsApp, eso
mismo sale de verdad sin tocar una línea. Y **sin canal el cobro se emite
igual**: un mensaje que no sale no puede ser motivo para no cobrar.

En la app el dueño lo ve en la pestaña **Cobros** de Mi cuenta, con el total
por pagar arriba y cada cobro con su estado. Un cobro **reembolsado en cero no
se muestra**: es la constancia de algo que se anuló, y al dueño le diría "te
cobramos $0". Uno reembolsado **con monto** sí, pero dice "te lo devolvemos",
porque es plata que la casa le debe y no un cobro suyo.

### La hora que pasó y la hora en que se marcó

`lib/rules/marca-de-asistencia.ts`. El cuidador marca de un toque, y a veces
marca después: el perro llegó a las 8:00 y él alcanzó a tocar el botón a las
8:40, con las manos ocupadas. Las dos horas son verdad y sirven para cosas
distintas.

- **`inicioReal` / `finReal` es lo que pasó**, y es lo único que cobra. De ahí
  salen el tramo del día y el recargo.
- **`inicioMarcadoEn` / `finMarcadoEn` es cuándo se apretó el botón.** No toca
  un peso: dice qué tan al día se está marcando, que es información sobre la
  operación y no sobre el perro.

Confundirlas sería cobrarle a un dueño por lo ocupado que estuvo el equipo.

**El check-in sigue siendo de un toque**: por omisión las dos horas son el
mismo instante, que es el caso normal. Corregir es volver a llamar al mismo
servicio con la hora de verdad — y eso importa porque el retiro del jardín
**vuelve a cotizar**: escribir el campo a mano habría dejado la hora corregida
y el cobro con el número viejo.

**La hora de marca se anota solo la primera vez.** Si ya había una llegada,
corregirla es arreglar un dato, no marcar de nuevo: ponerle "ahora" le
inventaría un atraso a quien solo ordenó el registro. Y una estadía vieja, que
nunca tuvo marca, se queda sin ella — "no se sabe" es la respuesta correcta, no
la hora en que alguien la editó.

`describirDesfase` devuelve `null` bajo los
`NEGOCIO.asistencia.minutosDeMarcaAlDia`: marcar en el instante exacto es
imposible con un perro en brazos, así que un par de minutos no es un atraso, es
la vida real. Una pantalla que se queja de nada se deja de mirar.

**Dónde se corrige: en la ficha, no en la tarjeta.** La tarjeta tiene dos
blancos —el cuerpo abre la ficha, el botón grande marca— y un tercero los pone
a pelear. Probándolo se vio literal: tocar la hora abría la hoja de ajuste *y*
la ficha encima. Además el cuerpo de la tarjeta **es un `<button>`**, así que
otro botón adentro era HTML inválido.

### La ficha del perro

`components/shared/detalle-perro.tsx` es **una sola ficha para las tres
caras**: el staff la abre desde Hoy y Buscar, el admin la ve dentro de la ficha
del cliente. Mismo orden, mismos bloques. Quien usa las dos caras no tiene por
qué aprender dos formatos, y editar es lo que agrega el admin, no otra manera
de mirar los datos.

En el staff se abre tocando el cuerpo de la tarjeta; el botón grande de la
derecha sigue siendo la acción del día, así que marcar una llegada nunca abre
la ficha.

**La foto la sube el dueño** cuando crea la cuenta, no el equipo con el perro
en brazos. El admin la cambia desde la ficha del cliente si quedó mala.

El orden es el de las preguntas que aparecen con el perro en brazos: quién es,
qué come, qué cuidado especial tiene y si ya pasó algo antes. Por eso
`alimentacion` e `indicaciones` son campos propios y no un párrafo dentro de
`notas`: a la hora de almuerzo nadie lee un párrafo buscando la ración.

Los incidentes se muestran como historial de los últimos 6 meses, con el conteo
arriba ("2 anotados, 1 sobre leve") y los últimos cuatro en detalle.

### Lo que se calcula y lo que se pide

Tres datos de la ficha se **derivan** en vez de preguntarse, porque pedirlos
sería pedirle al dueño que haga una cuenta que la app puede hacer sola:

- La **edad** sale de `fechaNacimiento`, y el cumpleaños también.
- `desparasitadoHasta` sale del **antiparasitario**: el dueño dice la marca,
  cuándo se lo dio y si el formato dura 1 o 3 meses. La vigencia la calcula
  `vigenciaAntiparasitario`. `desparasitadoHasta` se conserva porque es lo que
  mira la admisión, que no tiene por qué saber de duraciones.
- El **vencimiento de cada vacuna** sale de la fecha en que se puso más la
  duración que Administración tenga configurada. Al dueño se le pide solo la
  primera: está escrita en el carnet, la otra es una cuenta.
- La **comida** dejó de ser un párrafo: son marca, medida y una o más
  raciones. `describirAlimentacion` la arma en una línea para la ficha. Lo que
  estaba escrito antes no se tira, queda como `notas`.

### Qué es obligatorio lo decide Administración

`ConfiguracionAdmision`, en el repositorio, no en `NEGOCIO`. La constante sirve
para lo que no cambia nunca —los 25 cupos—, no para algo que la dueña quiera
ajustar un martes.

`revisarAltaDePerro` (en `lib/rules/alta-perro.ts`) recibe esa configuración en
vez de leerla, así que sigue siendo una función pura y se puede probar con
cualquier combinación. La valida `crearCuenta`, no el formulario: la pantalla
adelanta el aviso, pero la que no deja pasar una ficha incompleta es la capa de
servicios, que es por donde entra todo el mundo.

**Un campo entra en `camposObligatorios` recién cuando el formulario sabe
pedirlo.** Exigir algo que no se puede llenar deja el alta trancada sin
explicación.

Y `esterilizado` no tiene valor por defecto en el formulario: predeterminarlo
en "sí" hace que un macho sin castrar pase sin que nadie lo note, y en "no" que
la mitad de las fichas nazcan mal.

### La comida se pregunta en el orden en que se piensa

Primero **con qué se mide** la porción (medida, gramos o taza), después
**cuánto y en qué comidas**, y recién entonces **la marca** y la instrucción
especial. Cada paso aparece cuando el anterior está contestado: diez campos de
golpe hacen que el dueño llene cualquier cosa para salir del paso.

La cantidad acepta **fracciones**: "1/2", "½" y "0,5" son todas correctas para
quien las escribe, y rechazar una por no ser la que esperaba el campo es
culpar a la persona de una limitación nuestra. `parsearCantidad` las entiende
y el campo escribe abajo lo que entendió ("½ taza"), para que nadie se quede
con la duda hasta guardar.

Media taza va en **singular**: "½ tazas" no lo dice nadie, así que la
pluralización mira `cantidad <= 1`, no `cantidad === 1`.

Las **raciones son varias** porque hay perros que desayunan media taza y cenan
una entera. La pantalla parte con una sola —que es el caso normal— y el "+"
vive al lado de las comidas, que es donde se nota la diferencia. La **medida**
es una sola para todas: un perro no come media taza en la mañana y 200 gramos
en la noche.

Una comida ya tomada por otra ración se muestra apagada: nadie come dos veces
al almuerzo, y dejar elegirlo produce una ficha que se contradice sola.

Y la sección dice "dinos cómo le gusta comer a tu perrito", no "lo que el
equipo mira a la hora de almuerzo": al dueño le estamos preguntando por su
perro, no explicándole nuestra operación.

### Las listas las mantiene Administración

Razas, marcas de comida y marcas de antiparasitario viven en
`Configuracion.catalogos` y se editan desde `/admin/configuracion`. Una raza
nueva no puede depender de que alguien toque el código.

Toda lista lleva **"Otra (escríbela)"**, que no es parte del catálogo sino una
opción del formulario: ninguna lista está completa y el dueño nunca puede
quedar trancado porque su raza no esté. Por eso tampoco se puede borrar.

Los desplegables son `<select>` **nativos**. En el celular abren la rueda del
sistema, que se usa con una mano y trae la accesibilidad gratis; veinte razas
en chips no caben y una lista dibujada a mano se pelea con el teclado de iOS.

### Castrado: desde los 7 meses

Antes de esa edad el veterinario todavía no la indica, así que rechazar a un
cachorro de cuatro meses sería rechazarlo por algo que ni siquiera puede
hacer. `leCorrespondeEstarCastrado` lo decide, y sin fecha de nacimiento asume
que ya tiene la edad: es lo prudente, y el dueño siempre puede agregarla.

### Lo que bloquea el alta y lo que solo avisa

`reparosDeAlta` separa las dos cosas, igual que `evaluarAdmision`:

- **Bloquea** lo que no tiene vuelta: la castración.
- **Avisa** una vacuna o un antiparasitario vencidos. Se renuevan antes de
  venir, así que rechazar ahí sería perder un cliente por algo que se arregla
  en una visita al veterinario. El mensaje dice claro que sin ponerlos al día
  no lo podemos recibir el día de prueba.
- **Se conversa** el peso. A veces hay vuelta y eso lo decide Administración
  mirando al perro, no el formulario: la cuenta se crea, Administración recibe
  una `Notificacion`, y el día de prueba queda bloqueado hasta que lo habilite
  desde la ficha del cliente (`habilitarPeso`). La excepción guarda **hasta
  cuántos kilos** se dio: si la ficha sube después, ya no es el perro que
  alguien miró. La regla es `excedePeso`, en `admision.ts`.

"Escríbenos" sin un número es una puerta pintada. `<ContactoCasa />` pone el
WhatsApp de la casa, que es `Configuracion.whatsappDeContacto` y se edita en
`/admin/configuracion`. Vacío, promete lo único que se puede cumplir: que le
escribimos nosotros.

### Lo que impide agendar se ve antes de elegir hora

`/dia-de-prueba` revisa la admisión apenas se elige el perro y el día, no
después de tocar una hora. Si falta algo que el dueño arregla solo (vacuna,
antiparasitario) le abre su ficha ahí mismo para corregir la fecha; si es algo
que se conversa (peso, castración), le pone el WhatsApp. Y siempre hay un
"Volver a mi cuenta": una pantalla que dice "no puedes" sin decir qué hacer es
la que ya nos reportaron.

### Los datos guardados se migran, no se botan

`normalizarDatos()` pone al día lo que ya está en `localStorage` y **lo vuelve
a escribir**. Si la migración viviera solo en memoria, cada carga la repetiría
y un respaldo descargado saldría con la forma vieja.

Cada paso tiene que poder correr dos veces sin hacer daño: esto se ejecuta en
cada carga. Y nunca se cambia la clave del almacén para "empezar limpio" — los
datos que alguien tiene en su celular son su demo.

### El perro que llega sin reserva

Pasa: el dueño se complicó y aparece en la puerta. La app **no bloquea** el
registro, aunque falten requisitos o no quede cupo. Muestra los reparos y pide
un toque explícito ("Registrar de todas formas").

El motivo: si el sistema se niega, el perro igual está adentro y la ocupación
del día queda mal contada. Eso es peor que el problema que el bloqueo intenta
evitar. La decisión la toma quien está mirando al perro; la app le pone
enfrente lo que necesita saber —cupos libres, vacunas vencidas, plan con
saldo, cuánto sale— y después registra la realidad.

Lo único que sí se bloquea es registrar dos veces al mismo perro el mismo día:
eso no es una decisión, es un error.

Solo aplica a perros que ya son clientes. Uno nuevo necesita su día de prueba
antes de quedarse, así que no puede entrar por esta vía. **Y eso no se
fuerza**: todo lo demás sí, porque el perro ya está en la puerta y la decisión
es de quien lo está mirando, pero la jornada completa en la casa es
exactamente lo que el día de prueba evalúa. Dejarlo entrar sería saltarse la
evaluación, no decidir sobre ella. Lo cuida `registrarIngreso`, no la
pantalla, que es por donde entra todo el mundo.

La primera versión escribía la regla en la pantalla —"solo perros que ya son
clientes"— y ofrecía a cualquiera igual, y `forzar` saltaba el reparo del día
de prueba junto con los demás. Una pantalla que enuncia una regla y la
incumple es peor que una que no la menciona.

En la lista el perro que no es cliente **igual se muestra**, apagado y con el
motivo al lado. Esconderlo haría que quien está buscando a un perro que sabe
que existe piense que la app se equivocó; y si ninguno de los resultados puede
quedarse, abajo dice qué hacer —el día de prueba lo agenda el dueño y lo
aprueba Administración—, porque no es algo que se resuelva en la puerta.

### El portal del cliente

`/lib/servicios/reservas.ts`. Todo pasa por la misma puerta: se **cotiza**
primero —con capacidad y admisión ya revisadas— y recién después se confirma.
Así la pantalla muestra el precio en vivo y los reparos sin haber creado nada.

A diferencia del ingreso no planificado del staff, acá **sí se bloquea**: el
cliente reserva a futuro y no hay ningún perro en la puerta que registrar.

- El día suelto de jardín **se paga por adelantado**, al agendarlo. Lo que se
  descuenta al agendar, si el perro tiene plan, es el día del pack.
- **Cancelarlo sigue la misma forma que el hotel**: con 24 horas o más de
  aviso no se cobra —y el día del pack vuelve al saldo—; con menos, el día se
  pierde. Son 24 y no las 48 del hotel porque es un solo día: pedir dos días
  de aviso para cancelar una jornada dejaría sin salida a cualquiera que se
  enferme la noche antes. Pasado el corte el cupo ya no se alcanza a
  revender, así que el día se cobra igual.
- La reserva de hotel queda **por confirmar** con el cobro del abono del 50%
  **pendiente**: no hay pasarela, el dueño transfiere y la reserva se
  confirma cuando Administración marca el abono pagado (`marcarPagado`). El
  cupo queda tomado desde que reserva —una reserva pendiente ocupa—, porque
  si no dos dueños podrían transferir por el mismo lugar. El saldo se cobra
  al retiro.
- **Cómo se paga se dice donde se paga.** `<ComoPagar />` va junto al abono,
  al día suelto y al total "Por pagar" de Mi cuenta: "transferencia" abre
  los datos ahí mismo y "escríbenos" / "avísanos" abren el WhatsApp de la
  casa con el mensaje escrito. Los datos de la cuenta son
  `Configuracion.transferencia`, se editan en `/admin/configuracion`, y
  vacíos dicen que llegan por WhatsApp.
- La tienda, si un producto no alcanza, **compra lo que hay y lo avisa**, en
  vez de fallar la orden entera: en una tienda de mostrador eso es lo que pasa.
- El desglose que ve el cliente muestra **cada descuento por separado**.
- **"Lo que viene" es lo que todavía no termina.** Un día finalizado, o al
  que el perro no llegó, ya pasó aunque sea de hoy, y no aparece ahí.
  "Cancelar" se ofrece solo en un día **esperado**: si el perro ya llegó es
  un retiro, y lo registra el equipo. Se vio en producción el 22-10: un
  ingreso sin reserva ya cerrado salía como si fuera una reserva, ofrecía
  cancelarlo, y al tocar fallaba con un "no pudimos" sin motivo.
- **Cuando algo falla, la pantalla dice por qué.** Un `catch` que muestra
  "no pudimos" a secas deja al dueño sin saber si reintentar o escribirnos,
  y a quien revisa sin pista. El motivo sale del servicio
  (`ReservaRechazada`, `RegistroRechazado`) o del mensaje de la base.

Los `input type="date"` se ven en el formato del navegador, que puede no ser el
chileno. Por eso llevan la fecha escrita debajo.

### La puerta de entrada del portal

`/lib/servicios/registro.ts` y las pantallas `/crear-cuenta` y
`/dia-de-prueba`.

Para un visitante sin cuenta, **"reservar" significa crear la cuenta**: la casa
exige el día de prueba antes de la primera estadía, así que no hay nada que
reservar todavía. El botón de la landing lo lleva a `/crear-cuenta`, no a la
pantalla de roles —esa es el interruptor del prototipo y vive al final de la
portada, con letra chica—.

El alta pide los datos del dueño y del perro, incluidos los **vencimientos de
las vacunas**: el día de prueba ya es una jornada completa en la casa con otros
perros, así que la admisión se aplica igual. Lo único que impide crear la
cuenta es lo que no tiene vuelta: la esterilización de los machos. Con
sobrepeso la cuenta se crea igual, el botón dice "Crear cuenta" y no "Crear
cuenta y agendar", y en vez del calendario va a su cuenta, que explica que lo
conversamos.

### La dirección se elige, no se escribe

`components/shared/campo-direccion.tsx` y `lib/integraciones/direcciones/`.
El alta pide la **dirección** con sugerencias de Google Places, limitadas a
Chile y priorizando lo que queda cerca de la casa (`NEGOCIO.ubicacion`). La
**comuna sale de lo que eligió**: no se le pregunta aparte.

- Es válida recién cuando se **elige de la lista** y trae **número**. Un
  texto escrito a mano puede no existir, y eso se descubre el día del
  traslado. Editar después de elegir la deja sin confirmar.
- La comuna es `administrative_area_level_3`, no `locality`: en el centro
  Google dice "Santiago" para direcciones de comunas vecinas.
- Se usa la API de datos y no el widget de Google, que dibuja su caja en un
  shadow DOM sin los estilos de la marca. Sugerencias y detalle van con el
  mismo token de sesión, que Google cobra como una sola búsqueda.
- **Sin `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, o si el script no carga**, el campo
  vuelve a ser dirección y comuna escritas. El alta nunca se tranca por
  nosotros. La llave es pública y se protege con restricción de dominio y de
  API en Google Cloud (ver `.env.example`).

Las contraseñas llevan **el ojo para verlas** (`InputClave`): en el celular se
escribe con el pulgar, y una mal tecleada se descubre recién cuando el login
la rechaza. Parte oculta, por si hay alguien mirando.

### "Olvidé mi contraseña": la sesión tiene que ser la del enlace

`/ingresar/clave`. La primera versión dejaba cambiar la contraseña con
**cualquier sesión abierta** en ese navegador. Y el enlace casi siempre se
abre en otro aparato que el que lo pidió: se pide en el computador y se abre
desde el correo del teléfono. Ahí Supabase no lo puede usar —le falta la
mitad (`code_verifier`) que quedó guardada donde se pidió— y, a propósito,
**no borra la sesión que había**. La pantalla veía esa sesión, mostraba el
formulario y le cambiaba la contraseña a la cuenta abierta en ese navegador,
no a la del correo. **Pasó probándolo el 22-10**: se pidió para la cuenta de
prueba, la pantalla dijo que el cambio había salido bien, la contraseña nueva
no entraba y la antigua sí — el cambio cayó en la cuenta abierta en el
navegador donde se abrió el enlace. Con el arreglo publicado se repitió la
prueba en un solo navegador y funcionó.

Ahora pregunta `sesionDelEnlaceDeClave`, que solo acepta la sesión si la
librería **usó** el enlace. La señal es que, al usarlo, la librería borra el
`code` de la barra; si sigue ahí, no se pudo usar y la sesión es ajena. Por
eso la pantalla lee la dirección en el render, antes de que nada la limpie.
Y dice **de qué cuenta** es la contraseña antes de guardarla.

#### Y el enlace tiene que servir donde se abra

Una versión anterior de este archivo decía que abrir el enlace en otro
aparato "es el límite del flujo con `code_verifier` (PKCE), no un error".
Eso estaba **mal**: es el límite de ESE flujo, no de recuperar contraseña.
Y el caso raro no era: **la mayoría abre el correo en el celular**, y Gmail
y Outlook abren su propio navegador interno, que para efectos de
almacenamiento es otro navegador. O sea que el camino "bueno" fallaba casi
siempre. Pasó con la cuenta de administración el 26-10 y hubo que arreglarla
por SQL.

El arreglo es el otro formato de enlace que Supabase ofrece: el correo trae
un **`token_hash`** y la app lo canjea con `verifyOtp`. No necesita nada
guardado en el navegador, así que el enlace sirve donde se abra.

`sesionDelEnlaceDeClave` entiende **los dos**, y eso no es por simetría:

- `?token_hash=…&type=recovery` → `verifyOtp`. Que responda bien ES la
  prueba de que la sesión salió del enlace — una garantía más fuerte que la
  del camino viejo, donde había que deducirlo mirando si la librería había
  limpiado la barra.
- `?code=…` → el camino PKCE de antes. Se mantiene porque los correos ya
  mandados lo usan y porque **la plantilla se cambia a mano en Supabase**:
  hasta que alguien la cambie, este es el único enlace que llega. Por eso el
  código se puede publicar solo, sin coordinar con nada — lo contrario de
  `planes_y_dia_de_prueba`.

Solo se acepta `type=recovery`. Un token de otro tipo tiene su propia puerta,
y escribir una contraseña no es lo que proponía ese correo.

**Y cuando no sirve, la pantalla dice POR QUÉ.** Antes había un solo mensaje
—"se abre donde lo pediste"— para tres causas, así que a quien se le había
gastado el enlace lo mandaba a repetir justo lo que no iba a funcionar. Son
tres salidas distintas: `vencido` (pide otro), `otro_navegador` (ábrelo
donde lo pediste) y `sin_enlace` (pídelo en ingreso). El mensaje de vencido
menciona que **algunos correos abren los enlaces solos para revisarlos** y
los gastan: explica el caso en que falla al primer clic, que si no parece
cosa de brujas.

El token se borra de la barra apenas se usa, como ya hacía la bienvenida del
equipo con el suyo.

### El día de prueba

Es **media jornada** de un día de jardín normal —6 horas, la mitad de las 12
que abre el jardín— con **hora de llegada a elección en bloques de 30
minutos**. Por bloque entra **un solo perro nuevo**, aparte del cupo de 25 de
la casa: dos primerizos llegando juntos es una presentación que nadie alcanza
a acompañar.

El calendario muestra disponibilidad de verdad. Dejar elegir cualquier día y
fallar al confirmar es peor que mostrar el día lleno desde el principio.

A diferencia del día suelto de jardín, **se cobra al agendar**: es la
evaluación de un perro que todavía no es cliente y el cupo queda tomado desde
ese momento. El cobro nace **pendiente** —no hay pasarela, y en la realidad los
primeros meses se paga por transferencia—; Administración lo marca pagado desde
la pantalla de pagos.

Se agenda como una `EstadiaJardin` con `origen: "dia_de_prueba"` y deja al
perro en `diaDePrueba.estado = "agendado"`.

**Se anuncia en palabras y con la hora**: "Día de prueba el próximo jueves 29
de octubre a las 09:00". `describirDia` (en `lib/utils/fecha.ts`) dice "hoy",
"mañana", "el próximo…" dentro de la semana que viene y "el jueves 5 de
noviembre" más allá; "2026-10-22" obliga al dueño a hacer la cuenta. La hora
no está en el perro sino en la estadía, así que `alertasDePerro` la recibe
de quien la tenga a mano.

En Mi cuenta el día agendado **no es una alerta**: es lo que se esperaba que
hiciera. Va en verde, sin triángulo, y cierra con "¡Te esperamos!". En el
backoffice sí sigue siendo alerta, porque el perro todavía no es cliente.

**Cancelar y reprogramar**, con 24 horas de corte:

| | Cancelar | Cambiar la fecha |
|---|---|---|
| Con 24 h o más | El cobro se anula; si ya pagó, se le devuelve entero | Sin costo |
| Con menos de 24 h | El cobro pasa a $5.000; si ya pagó, se le devuelve el resto | Se suma un cargo de $5.000 |

Si el cobro está pendiente, **anularlo es la devolución**: no hay plata que
devolver, hay un cobro que dejar de existir. Y no se borra, se marca
reembolsado en cero: un cobro que desaparece no deja rastro de que existió, y
la cobranza del mes tiene que poder explicarse.

**Si ya lo pagó, la plata está en la casa y vuelve**, igual que en el día de
jardín (ver "Devolver la plata no es lo mismo que anular el cobro"). A tiempo,
el cobro queda reembolsado **conservando el monto** y aparece en "Por
devolver". Tarde, la casa se queda con el cargo y devuelve el resto: el cobro
se **reparte** —el mismo queda pagado por $5.000 y los otros $5.000 van en un
cobro aparte, reembolsado, con la fecha de emisión y de pago del original—.
Se reparte y no se suma un cobro de devolución porque el tablero suma
montos: uno nuevo inflaría el ingreso del día, y lo que entró tiene que
seguir sumando lo que entró. La primera versión solo miraba el cobro
pendiente: quien había transferido y cancelaba a tiempo se quedaba sin su
plata y sin que nada lo mostrara.

Quien paga antes no puede salir peor parado que quien no pagó: el que no
transfirió y cancela tarde debe $5.000, así que el que transfirió los
$10.000 recupera $5.000. Las condiciones que se ven antes de pagar lo dicen
así; una versión anterior decía "no hay devolución" para el aviso tardío.

La pantalla del día de prueba muestra la condición **antes** de cancelar,
recalculada en el render, y si algo vuelve pide la cuenta ahí mismo con el
mismo formulario del día de jardín (`components/portal/cuenta-para-devolver.tsx`),
que se guarda en la ficha del cliente.

**Cada aviso tardío se cobra por su cuenta.** El cargo por mover el día
encima de la hora es un cobro aparte, y cancelar después a tiempo anula el
cobro DEL DÍA —el primero que se emitió— pero no ese cargo: el cupo que se
perdió con el cambio ya se perdió. Moverlo tarde y cancelarlo tarde son dos
cupos perdidos y dos cargos. La primera versión los juntaba en uno, y un
cambio tardío seguido de una cancelación a tiempo salía gratis.

Cancelar y mover le dejan un aviso a Administración, igual que el día de
jardín: el día, con cuánta anticipación avisó y en qué quedó el cobro. Al
mover, el día va con su antes y su después, porque eso sí cambió.

#### Y alguien tiene que cerrarlo

`lib/servicios/evaluacion.ts` y la tarjeta de `/admin`. El día de prueba es
una evaluación, y hasta que no tiene veredicto el perro **no puede reservar**
— o sea, un cliente que no vuelve.

El estado ya se podía cambiar desde la ficha del perro, con dos problemas que
lo hacían inservible: no se encontraba —había que acordarse de qué perro vino,
buscar a su dueño y entrar a editar, sin que nada avisara que faltaba una
decisión— y pasaba por la validación de la ficha completa, así que a un perro
al que le faltaba un dato no se le podía dar el veredicto. Aprobar es un
juicio sobre cómo se portó, no sobre si el formulario está lleno.

Ahora es su propia acción, con su propia cola en el tablero, ordenada por el
que lleva más tiempo esperando: lo que se añeja es lo que se termina no
decidiendo. Se esconde sola cuando no hay nada.

**Aprobar es un toque; rechazar pide el motivo.** Casi todos se aprueban, y un
rechazo sin explicación no le sirve a nadie el día que alguien lo lea. La nota
se guarda también al aprobar: "le costó la primera hora pero después jugó
bien" es justo lo que el equipo quiere leer cuando el perro llegue.

Solo entran los días que **ya pasaron**: uno agendado para el jueves no se
evalúa el martes. Y la fecha que manda es la de la jornada, no la de la ficha:
si lo reprogramaron, la estadía es la que quedó.

#### Y los que vienen, en la misma tarjeta

Esa regla —solo los que ya pasaron— es correcta para un veredicto y dejó un
agujero: un día de prueba recién agendado **no aparecía en ningún lado** del
backoffice. La cola no lo miraba, y el calendario de ocupación muestra un
número, no quién. La casa se enteraba el día que el perro aparecía en la
puerta, que es la primera vez que ese dueño le pide algo: justo el que no
puede pasar desapercibido.

`diasDePruebaQueVienen` llena la otra mitad, en la misma tarjeta y sin
botones: todavía no pasó nada que decidir. El veredicto va arriba porque es
lo que tranca a un cliente. La tarjeta se esconde cuando no hay ninguna de
las dos cosas.

Los lista **por la estadía**, no por `perro.diaDePrueba.fecha`, así que
reprogramar los mueve; y sin tope por arriba, porque un rango de "los
próximos siete días" dejaría invisible al que agendó para el mes que viene,
que es exactamente el problema que esto viene a arreglar.

**Y el dueño se entera.** Al aprobar, lo único que cambiaba en su pantalla
era que DESAPARECÍA un aviso, y la ausencia de una advertencia no se nota: el
dueño pagó, vino, y se quedaba sin saber que ya podía reservar.
`<YaPuedeReservar />` lo dice arriba de todo en Mi cuenta, con el botón.

No hay bandeja ni estado de "leído": la condición ES el estado —aprobado y
sin ninguna reserva todavía— así que el aviso se apaga solo cuando reserva,
que es justo cuando deja de hacer falta. El día de prueba mismo no cuenta
como reserva, y la de un hermano tampoco: el aviso es por perro.

Y el **rechazo** abre una conversación en vez de dar un portazo. El motivo se
escribió para la ficha —"se puso brusco con los chicos"— y leerlo así, sin
nadie al lado, es duro y no deja hacer nada; la pantalla pone el WhatsApp de
la casa. El hecho lo dice la línea de alerta, con su triángulo, y el bloque
de abajo solo ofrece la salida: decirlo dos veces en dos tonos es decirlo dos
veces.

Las condiciones se muestran **antes de pagar**, no detrás de un enlace.
Enterarse después es la manera segura de que se sientan letra chica.

#### Y el que ya era cliente no lo hace

`aprobarSinDiaDePrueba`, en `lib/servicios/evaluacion.ts`. Hay clientes que
vienen hace años y entran a la app por primera vez: el alta les crea el perro
con el día de prueba pendiente, como a cualquiera, y pedirle una evaluación
—y $10.000— a un perro que la casa conoce de memoria es tratarlo como a un
desconocido.

Administración lo aprueba **sin que venga y sin cobrarle**. El perro queda
`aprobado` con `yaEraCliente: true`, y eso es lo único que cambia: la
castración, las vacunas y el peso se siguen revisando al reservar, igual que
para todos. Saltarse el día de prueba no es saltarse la admisión.

**Es decisión de la casa, no del dueño.** El alta sigue naciendo pendiente
para todos, y en Supabase el dueño no puede tocar `dia_de_prueba`
(`proteger_el_dia_de_prueba`). Administración pasa los disparadores, así que
esto **no necesitó migración**.

Si el cliente de antes **alcanzó a agendar** su día de prueba, se cancela y
sus cobros se perdonan enteros (`perdonarCobrosDelDiaDePrueba`): lo
pendiente se anula —reembolsado en cero— y lo pagado queda reembolsado con
su monto, en "Por devolver". **Sin política de aviso**, aunque el día sea
mañana: no canceló él, la casa decidió que no le hacía falta. Por lo mismo
también se perdona el cargo por haberlo movido tarde.

Antes de confirmar, el panel dice qué va a pasar: si hay un día que se
cancela y si queda plata por devolver. Enterarse de eso después, en Pagos,
es enterarse tarde.

Tres cosas que no se dejan:

- **Saltarse un rechazo.** La casa ya lo miró y dijo que no; si fue un
  error, se corrige a mano en la ficha.
- **Saltarse un día que ya pasó.** Si ya vino, lo que falta es el
  veredicto, no saltárselo. Y si está en la casa ahora, también.
- **Aprobar dos veces.**

Se puede **repetir sin hacer daño**, y por eso el orden: primero los cobros,
después el día, al final el perro. En Supabase son llamadas separadas; si
algo falla a mitad de camino, volver a tocar el botón termina lo que faltó
sin volver a tocar lo ya hecho.

**Dónde está el botón.** En la tarjeta de días de prueba del tablero hay una
sección nueva, **"inscritos sin día de prueba"**, que es donde aparece el
cliente de antes apenas crea su cuenta: así no hay que ir a buscarlo a
Clientes. Muestra cinco, los más recientes primero, y al aprobar uno sube el
siguiente. Sirve también para ver al cliente nuevo que se inscribió y no
agendó, que es alguien a quien escribirle. En los agendados va como enlace
discreto ("¿Ya era cliente?") y no como botón en cada fila, porque casi
todos los que agendan son clientes nuevos. Y en la ficha del cliente, junto
a la habilitación por peso.

En la fila del tablero el botón va **debajo** del texto, no al lado: al lado
cortaba el nombre del dueño, que es justo como se reconoce a un cliente de
antes. Se vio así al abrirlo en un celular.

**El dueño se entera** por el mismo `<YaPuedeReservar />` de siempre, pero
sin felicitarlo por pasar una prueba que no hizo: "¡Todo listo para Pituca!
Como ya nos conocemos, no necesita día de prueba".

Y un arreglo que vino con esto: la ficha del admin guardaba el estado del
día de prueba que tenía **al abrirse**, así que aprobar con el botón y
después editar la ficha lo devolvía a pendiente. Ahora se recarga al
empezar a editar, y cambiarlo a mano le quita el `yaEraCliente`.

### El dueño corrige su ficha, y Administración se entera

`lib/servicios/perros.ts`. El dueño puede cambiar los datos de su perro sin
pedir permiso —son suyos y nadie los conoce mejor—, pero cada cambio deja una
`Notificacion` con el **antes y el después de cada campo**.

"Cambió la ficha" no le sirve a nadie: un peso que sube de 8 a 21 kg o una
castración que se desmarca cambian si el perro puede quedarse. Por eso la
comparación es en palabras (`"9 kg"` → `"12 kg"`, `"sí"` → `"no"`) y no entre
propiedades: lo que importa es lo que cambió a la vista.

**Menos el sexo y la castración.** Son los que deciden si un macho entra, y
desmarcarlos después de reservar le da la vuelta a la admisión. En la ficha
del dueño se ven pero no se tocan (`sexoYCastracionFijos`), y
`actualizarPerroComoDueno` los descarta aunque lleguen: la regla vive en la
capa de servicios, no en la pantalla. En Supabase la cuida además un trigger
(`proteger_ficha_de_la_casa`), porque ahí el dueño tiene la API a mano. Si
cambiaron de verdad, los corrige Administración.

Dos detalles que costaron un bug cada uno:

- Las fechas se comparan con `formatearFechaCorta`, que **lleva el año**. Con
  `formatearFecha` una vacuna renovada al año siguiente se veía idéntica y el
  cambio no generaba aviso.
- Guardar sin cambiar nada **no avisa**. Una bandeja con avisos vacíos se deja
  de leer, y entonces el que importa también pasa de largo.

### Avisar no es bloquear

`evaluarAdmision` distingue `problemas` (todo lo que hay que saber) de
`bloqueos` (lo que impide de verdad), y `admitido` mira solo los segundos. Hoy
el único aviso que no bloquea es la desparasitación **sin registro**; vencida sí
bloquea. Estaba escrito así en el comentario de la regla desde la etapa 1, pero
el código la contaba como impedimento y dejaba fuera a cualquier perro sin el
campo.

### El backoffice y sus definiciones

`/lib/servicios/panel.ts`, `calendario.ts`, `cobranza.ts` y `clientes.ts`.
Tres definiciones que se confunden fácil y están fijadas ahí:

- **Ocupación** se mide contra el PICO simultáneo del día, no contra los
  perros que pasaron. Un día con 22 perros que nunca coincidieron más de 17
  está al 68%, no al 88%.
- **Ingreso por cupo disponible** divide por los 25 cupos, no por los
  ocupados. Es el RevPAR del negocio: cuánto rinde el espacio que tienes.
- **Renovación de planes** es recompra: de los planes comprados en el periodo,
  cuántos son de un perro que ya había comprado antes.

El ingreso se cuenta cuando se **emite** el cobro, no cuando se paga. Y
`cuenta_mensual` no es una línea de ingreso: es una consolidación de cobros que
ya están contados, sumarla los duplicaría.

**La cuenta del día 1 es idempotente.** Emitir dos veces el mismo periodo sería
cobrarle dos veces al cliente, así que si el periodo ya existe no se vuelve a
emitir. Los cobros sueltos que entran en una cuenta quedan marcados con
`cuentaMensualId` y dejan de ser cobrables por separado.

### Un rango que termina antes de empezar

`aMs`, en `lib/rules/capacidad.ts`. Pasa por **tres causas, y dos son
normales** — no es solo un dato corrupto:

- **La llegada tarde**, que es la común y no tiene arreglo en el registro: un
  perro agendado de 9 a 15 que entra a las 16. La ocupación mira `inicioReal`
  y, mientras no haya retiro, `finProgramado`, que para entonces ya pasó. El
  perro llegó tarde y está adentro; lo que no puede pasar es que por eso
  desaparezca del calendario.
- **El retiro después de medianoche** guardado en el día de la llegada.
- Un **ingreso sin reserva con una hora de retiro ya ocurrida.** Ese sí tenía
  un bug propio y está arreglado en su origen: `opcionesDeRetiro` devolvía
  lista **vacía** pasado el cierre, y quien llamaba se inventaba una hora de
  retiro —el cierre, ya ocurrido—, así que la estadía nacía terminando antes
  de empezar. Ahora nunca devuelve vacío: pasado el cierre ofrece la hora
  siguiente, que es la estimación honesta para un perro que llegó fuera de
  horario. Un test afirmaba el bug ("pasado el cierre la lista queda vacía");
  lo reemplazó la invariante, barrida minuto a minuto.

Lo que hacía antes era desaparecer. El rango invertido no cae en ninguna
franja, así que el pico del día daba **0** y el calendario mostraba la casa
vacía con el perro adentro — mientras la lista de "quién está ese día" sí lo
mostraba, porque esa no mira las franjas. Se vio en producción justo así: el
número grande en 0 y el perro listado abajo.

Ahora se trata como "llegó y no sabemos cuándo se fue": ocupa hasta el final
de su día. Es lo único cierto que queda, y es el lado seguro para
equivocarse — contar de menos deja sobrevender un cupo, contar de más a lo
sumo bloquea una reserva que alguien puede revisar.

Sigue siendo una **red** y no el arreglo de las dos primeras causas, pero ya
no es una red a ciegas: se sabe qué la dispara. Si aparece por un camino que
no es la llegada tarde ni el cruce de medianoche, hay algo nuevo escribiendo
mal y conviene encontrarlo.

### Gráficos de barras apiladas: el error que ya se cometió dos veces

El alto de un segmento se mide contra **la barra**, no contra el techo de la
escala. La barra ya está escalada (`pico / techo`), así que usar el mismo
porcentaje adentro divide dos veces y el segmento de abajo sale achicado.

```
// mal:  height: (hotel / techo) * 100%
// bien: height: (hotel / total) * 100%
```

### Grillas: `grid` sin columnas explícitas desborda

Una `div.grid gap-2 lg:grid-cols-2` sin `grid-cols-1` deja la columna implícita
en `auto`, que se resuelve a **max-content**: basta una tarjeta con texto
`truncate` (que es `nowrap`) para que la columna mida 618 px dentro de un
contenedor de 358 y toda la página gane scroll horizontal. `min-w-0` en el hijo
no alcanza.

Siempre `grid-cols-1` junto al variante del breakpoint:

```
// mal:  <div className="grid gap-2 lg:grid-cols-2">
// bien: <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
```

El chequeo es de una línea en el navegador:
`document.documentElement.scrollWidth > clientWidth`.

### A qué hora llegan y a qué hora los buscan

`lib/rules/horarios.ts` y `lib/servicios/horarios.ts`. El calendario dice qué
tan lleno estuvo cada día; esto dice **a qué hora pasa el movimiento** dentro
del día, y cuánto se parece a lo agendado.

**Son dos paneles, no dos series en un mismo gráfico.** El tablero ya tiene
arriba un gráfico donde el ámbar es jardín y el marino es hotel; meter dos
colores para llegadas y retiros haría que alguien leyera "ámbar = jardín" sin
querer. Con un panel por pregunta cada uno tiene **una sola serie**, el título
dice cuál es, y no hay identidad de color que malinterpretar.

Los dos **comparten la escala vertical**: si cada uno se escalara solo, un
panel con 3 retiros se vería igual de alto que otro con 30 y la forma del día
—llegadas amontonadas en la mañana, retiros en la tarde— se perdería, que es
justo lo que se quiere ver.

La distribución devuelve **solo las horas entre la primera y la última con
movimiento**. Las 24 completas dejan quince barras vacías a los lados y el
movimiento real apretado en el medio.

El número va **solo en el pico**: uno en cada barra es ruido y no cabe en un
teléfono. Y el contenedor lleva `pt-4` para reservarle el espacio — sin eso la
barra más alta llega al techo y el número queda ENCIMA de ella. Se vio así al
abrirlo; el panel con el pico más bajo no lo notaba, que es exactamente por lo
que un gráfico hay que mirarlo y no solo escribirlo.

#### El detalle: cuánto se parece a lo agendado

Detrás de un toque, porque es la segunda pregunta y no la primera. Son
**porcentajes, no una serie en el tiempo**, así que van como números: un
gráfico de tres barras para tres cifras es decorar.

`clasificarPuntualidad` usa el margen de
`NEGOCIO.asistencia.minutosDePuntualidad`. Un perro que llega diez minutos
antes de lo agendado no llegó temprano: llegó. Sin margen el análisis diría que
casi nadie es puntual, que es una manera elegante de no decir nada.

Y hay una cifra que no es sobre los perros sino **sobre cuánto creerle a todo
lo demás**: cuántos registros se marcaron a destiempo. Si la mitad se marcó
horas después, las horas que se están analizando son las que el equipo alcanzó
a anotar, no las que pasaron. Se muestra solo cuando hay algo que advertir.

Solo entran jornadas y estadías **cerradas**. Una en curso no tiene hora de
retiro, y contarla como "retiro a las 00:00" sería inventar un dato.

### La planilla de turnos

`lib/rules/turnos.ts`, `lib/servicios/turnos.ts` y la pestaña **Turnos** de
`/admin/equipo`. Equipo tiene dos pestañas porque son dos trabajos distintos
con la misma gente: quién **puede** entrar (accesos) y quién **está** cuando
hay perros (turnos).

**Dos vistas de lo mismo, porque son dos preguntas distintas.** La primera
versión era solo la segunda, con el argumento de que una grilla obliga a
desplazarse de lado en el celular. El argumento sigue siendo cierto y no
alcanza: armar la semana es comparar días entre sí, y eso pide verlos lado
a lado.

- **Grilla** (`components/admin/grilla-turnos.tsx`): una columna por turno
  —"Turno 1", "Turno 2"— y una fila por media hora, con el bloque de cada
  persona pintado a lo largo de las filas que cubre. Para ARMAR la semana y
  ver dónde queda un hueco.
- **Por día**: cómo le fue a cada turno —el fichaje, los rastros, el
  atraso—, que es una lectura de a uno y no entra en una celda. Tocar un
  bloque de la grilla abre ese mismo detalle debajo.

**"Turno 1" y "Turno 2" son el ORDEN en que empiezan, no un campo.**
Guardarlo obligaría a elegir la etiqueta al asignar y a corregirla cuando
alguien entra antes. `ordenarTurnosDelDia` lo decide; a igual hora de
entrada manda el que se va antes, para que dos turnos que empiezan juntos
no bailen de columna entre una carga y otra.

Las columnas son **siempre al menos dos**, aunque la semana esté vacía: una
grilla sin columnas no se entiende, y las columnas vacías son justo las que
muestran el día que nadie cubre. Y las filas **se estiran** más allá de las
horas de atención si hay un turno fuera de ellas: una planilla que recorta
al que entra a las 6 lo deja sin existir en la pantalla donde se revisa la
planilla.

Dos cosas que solo se vieron abriéndola en el navegador:

- **Un ítem de grilla con `position: sticky` no se queda.** La columna de
  las horas estaba dentro de la grilla con `sticky left-0` y se desplazaba
  igual que todo lo demás —medido: se iba a `x = -78`—, porque el bloque
  contenedor de un ítem de grilla es su propia celda. Ahora vive FUERA del
  contenedor que se desplaza, y por eso las alturas de las filas son fijas
  y no automáticas: las dos columnas tienen que calzar fila por fila.
- **Un `<button>` centra su contenido vertical por omisión.** El nombre
  quedaba flotando en la mitad del bloque en vez de arriba, donde empieza
  el turno.

El color es una AYUDA y no el dato: el nombre va escrito en el bloque. Si
el color fuera lo único, la planilla no se podría leer en blanco y negro ni
con daltonismo, y acá se mira para decidir quién viene mañana. Se reparte
por **orden de aparición** y no por un hash del id: con un hash, dos
personas de la misma semana pueden caer en el mismo color, y entonces la
grilla dice que cubre la misma persona cuando son dos.

**Lo real llega por dos caminos y nunca se mezclan.** El fichaje
(`entradaReal` / `salidaReal`) es la hora que la persona declaró. Los
**rastros** —reportes e incidentes, que llevan su nombre y su hora— son un
PISO, no la presencia: si llegó a las 7 y el primer perro a las 8, su primer
rastro es a las 8. Por eso la pantalla escribe "Entró 07:22" para el fichaje
y *"activo desde 13:40"* en itálica para el rastro. Decirlos igual
convertiría una deducción en un hecho, y eso después se usa para conversar
sobre puntualidad. Sin ninguno de los dos, la respuesta es "no se sabe".

Los rastros son **las marcas de asistencia** —cada llegada y cada salida que
esa persona apretó— más los reportes e incidentes. Las marcas son el grueso:
marcar llegadas es lo que más se hace en un turno.

Se juntan por dos llaves distintas, y no es por gusto. Las marcas llevan el
id de la cuenta (`inicioMarcadoPor` / `finMarcadoPor`), así que calzan
exacto. Los reportes y los incidentes solo llevan `autorStaff`, que es el
NOMBRE con el que se firmó: frágil —dos personas que se llamen igual se
mezclan— y es lo que hay hasta que esos registros guarden el id.

**La firma la pone la base, no el navegador.** El equipo ya puede actualizar
esas filas, así que sin el disparador `firmar_la_marca` podría atribuirle una
marca a otra persona escribiendo otro id desde la consola, y la planilla diría
que alguien estuvo trabajando cuando no vino — peor que no tener el dato. El
valor que manda la app es una conveniencia. Administración sí puede escribir
cualquiera: corrige registros viejos.

Y la firma va con la hora de marca, por el mismo motivo: corregir un dato no
es marcar de nuevo, así que se queda con la de la primera vez. Si no, quien
ordena un registro viejo aparecería trabajando ese día.

**El turno planificado no lo puede tocar quien lo cubre.** RLS sabe acotar
filas, no columnas, así que la política que deja fichar dejaría también
reescribir el propio horario — y entonces el que llegó tarde quedaría
puntual. Lo cuida el disparador `proteger_turno_planificado`, misma idea que
`proteger_ficha_de_la_casa`.

**La cobertura se mide solo en las horas de atención**
(`NEGOCIO.turnos.horasQueSeCubren`, 07:00–21:00 del folleto), no en las 24.
De noche quedan los perros de hotel durmiendo y eso no es una pregunta de
planilla: la dueña vive en la casa. Marcar cada noche como descubierta haría
que el aviso rojo apareciera los siete días y entonces se deja de mirar,
justo antes de que aparezca el que importa.

Por lo mismo, con la planilla vacía **no se listan los huecos**: sería "nadie
cubre de 00:00 a 24:00" repetido siete veces. Ese caso lo dice una sola
línea, y en rojo solo si ese día hubo perros.

Dos detalles chicos que costaron un rato: el final del día es `"24:00"` y no
`"00:00"` —el minuto 1440 da la vuelta al reloj y un hueco de un día entero
se leía como que no dura nada—, y el botón de fichar aparece **solo si hay
turno asignado para hoy**: pedirle a alguien que fiche algo que nadie
planificó es pedirle que invente el dato.

El seed no inventa turnos. Sesenta días de planilla que nadie escribió es
llenar la pantalla de datos falsos.

**En el turno puede estar cualquiera menos un cliente.** Staff y
Administración por igual: la dueña vive en la casa y cubre horas como
cualquiera —de hecho es la que más cubre—. Dejarla fuera haría que sus horas
salieran en rojo como "sin nadie" todos los días, que es la manera segura de
que el rojo se deje de mirar. El rol dice qué PUEDE hacer en la app, no
quién está con los perros.

**En el prototipo el equipo son los cuatro del selector de ingreso**, más
Administración (`ADMIN_DEL_PROTOTIPO`), para que la demo diga lo mismo que
producción. Antes
`equipo.miembros()` devolvía una lista vacía y con eso la planilla no se
podía usar en modo demo: no había a quién asignarle un turno, así que la
pantalla existía y no se podía probar. Listar a los que YA entran por el
selector no promete nada que no exista —es `invitar` lo que no se puede
simular, porque haría creer que alguien tiene una cuenta con la que no
podría entrar, y eso sigue dando error—. El id sale del nombre
(`idDeStaff`) y el selector lo guarda como `usuarioId`, así que la llegada
que marque en `/staff` cae en SU turno; con el id sorteado, regenerar el
seed habría dejado el turno del lunes sin dueño.

#### Dónde se fichó

`lib/rules/ubicacion.ts` y `lib/utils/geolocalizacion.ts`. Al tocar
"Llegué" o "Me voy", el celular manda dónde estaba y queda en el turno
(`entradaUbicacion` / `salidaUbicacion`): el punto con su precisión, o el
motivo por el que no lo dio. La hora sola no dice si quien fichó estaba en
la casa; esto da una pista. **Una pista, no una prueba**: un GPS se puede
falsear, y se lee como lo que es.

Lo decidió la dueña el 26-10, con cuatro respuestas que explican el
diseño: en el **fichaje del turno** y no en la llegada de cada perro —que
casi siempre es en la casa y no diría nada—; en la **entrada y la
salida**; se guarda **el punto** y no solo un sí/no, para poder revisarlo;
y **sin ubicación se ficha igual**.

Eso último es la regla de siempre: un GPS que falla no puede dejar a
alguien sin su entrada, igual que un perro sin reserva se registra
igual. `ubicacionActual` **nunca falla**: sin permiso, sin señal o sin
respuesta devuelve el motivo, y la planilla dice "sin ubicación: el
celular no dio permiso". El motivo importa porque no dio permiso y no
encontró señal no se conversan igual. Y el aviso al fichar lo dice en el
momento, para que se arregle antes del próximo turno.

Tres detalles que no son obvios:

- **La hora es la del toque**, no la de cuando el GPS contesta. Buscar
  señal adentro de una casa puede tardar segundos, y esa espera no es un
  atraso de nadie.
- **El `timeout` del navegador no cuenta el aviso de permiso abierto.** Si
  nadie lo toca, el botón quedaba pegado para siempre; por eso hay un tope
  propio de 15 segundos que se rinde con "tardó demasiado".
- **La distancia se calcula al mostrar, no se guarda.** Si se corrige el
  punto de la casa, los fichajes viejos se vuelven a medir contra el bueno.

**Qué cuenta como "en la casa"** lo decide `dondeFicho`, y la precisión
manda antes que la distancia, en las dos direcciones. **Lejos** es solo
cuando ni el error alcanza a la casa: un punto a 280 m con ±140 m puede
estar en la puerta, y acusar a alguien de fichar en la calle por un GPS
movido es peor que no decir nada. **En la casa** pide además una
precisión razonable (`NEGOCIO.turnos.precisionMaximaM`): con ±2 km sacados
de la antena cualquier punto del barrio calza. Lo de en medio es
**poco precisa**. El radio (`radioDeLaCasaM`) es de 150 m porque adentro
de una casa el GPS se corre unas decenas de metros.

El punto de la casa es `NEGOCIO.ubicacion`, el mismo que usa el buscador
de direcciones. **Hasta el 26-10 era aproximado** —la esquina de Diagonal
Oriente con Manuel Montt, que alcanza para priorizar sugerencias— y para
esto tiene que ser la puerta: corrido 200 m, todos los fichajes salen
lejos. Ver el paso 12 de "Lo que falta hacer afuera".

En la planilla va al lado de la hora: "Entró 07:22 en la casa", o "a 3 km
de la casa (ver mapa)" en ámbar. El mapa aparece solo cuando hay algo que
mirar —lejos o dudosa—; al lado de cada "en la casa" sería un enlace que
nadie toca. Lo fichado antes de existir esto no dice nada, que es lo
cierto. El rastro tampoco: es deducido, no tiene celular detrás.

**A quien se le registra la ubicación hay que contárselo**, y la tarjeta
de fichar lo dice: "Al fichar guardamos dónde estás, para saber que
fichaste en la casa". Es un dato personal del equipo; esconderlo sería
la manera segura de que se sienta como vigilancia.

En la base son dos columnas `jsonb` en `turnos`
(`20261026120000_ubicacion_del_fichaje.sql`). No hizo falta tocar
`proteger_turno_planificado`, que cuida solo el horario planificado: la
ubicación la escribe quien ficha, igual que la hora. La prueba de
aislamiento lo verifica.

### El calendario y su semáforo

En la tira de días el color va al revés de un semáforo de alerta: **verde desde
80% de ocupación, amarillo desde 50%, rojo bajo 50%**. Es la lectura de
negocio: en el backoffice el día vacío es el problema, no el día lleno. Por eso
la tira lleva leyenda; el color solo nunca explica esa inversión.

Las tarjetas de los días tienen todas las filas de alto fijo. "28 sep" en una
línea se corta en los teléfonos angostos y desalinea la tira completa, así que
la fecha va en dos líneas ("lun" sobre "28") y el mes vive en el encabezado.

### La nube: las reglas viven pegadas a los datos

`supabase/migrations/`. Archivos que se pegan en el editor SQL de Supabase,
en orden, y que se pueden correr de nuevo sin hacer daño. Los dos primeros
son la base: `_esquema` crea las tablas y `_permisos` define quién ve qué;
los demás agregan lo que fue apareciendo. **Cuáles ya corrieron en
producción** no se puede saber leyendo el repo: está anotado en "Dónde vive
cada cosa".

La carpeta se llama `migrations` y los archivos llevan **marca de tiempo**
(`20261014120000_esquema.sql`) aunque el resto del repo esté en español: es
la ruta y el formato que la integración de Supabase con GitHub espera, y se
aplican **en orden alfabético**, que con marca de tiempo es el orden
cronológico. Una migración que depende de otra anterior siempre lleva marca
posterior. Pelear con la convención de una herramienta para ganar
consistencia de nombres sale caro el día que se quiera encender la
integración.

Esto es lo que reemplaza al selector de rol. En el prototipo el rol vive en
el navegador: cualquiera abre las herramientas de desarrollo, lo cambia a
`admin` y ve la cobranza completa. Con **RLS** las reglas quedan pegadas a
los datos, así que no hay pantalla que saltarse: si un dueño pide los pagos
de otro, la base devuelve cero filas. Una pantalla que esconde un dato lo
está escondiendo; la base que no lo entrega lo está protegiendo.

Tres alcances:

| | Ve |
|---|---|
| Dueño | Lo suyo. Sus perros, sus reservas, sus cobros. |
| Equipo | La agenda, las fichas, los reportes y los cobros **de su turno**. |
| Admin | Todo. |

**El dueño no solo mira: agenda y compra.** Puede crear sus reservas, sus
estadías, sus servicios y sus órdenes —siempre con su propio `cliente_id`,
que es lo que verifica el `with check`—. Agendar además le crea el cobro, y
ahí hay dos condiciones que no son decorativas: nace **pendiente** y **sin
fecha de pago**. Nadie se da por pagado solo; eso sigue siendo de
Administración, que es quien mira la transferencia.

Lo que toca plata o el saldo del pack **no lo escribe directo**: comprar un
plan, usar un día del plan, agendar el día de prueba, cancelar y mover pasan
por funciones de la base (ver "Cancelar sin poder tocar el cobro" y "El saldo
del plan y el día de prueba"). Directo agenda solo un día suelto o una reserva
de hotel por confirmar.

La frontera del equipo se corrigió una vez. "El equipo no ve la plata" era
una buena idea en abstracto y choca con la operación real: el check-out del
jardín vuelve a cotizar con la hora real —de ahí sale el recargo fuera de
horario— y tiene que crear, corregir o borrar ese cobro. En vez de abrirle
los pagos enteros, se le abren los **tres conceptos que nacen de su turno**
(`dia_suelto`, `dia_de_prueba`, `saldo_hotel`). La deuda del cliente, los
planes, los abonos y la cuenta del mes siguen siendo de Administración: el
equipo ve lo que acaba de pasar en la casa, no lo que el dueño debe.

#### Qué puede el cuidador, exactamente

Verificado una por una en la prueba de aislamiento, no supuesto:

| Puede | No puede |
|---|---|
| Ver la agenda de hoy y la de los días que vienen | Marcar un cobro como pagado |
| Marcar llegada y salida | Tocar un cobro ya conciliado |
| Mandar reportes y anotar incidentes | Ver la cuenta del mes de un cliente |
| Abrir la ficha de cualquier perro | Sumar las ganancias |
| Cobrar el día que acaba de cerrar | Emitir una cuenta mensual |
| | Cambiar el precio de la vitrina |

La línea que separa las dos columnas: **generar el cobro es consecuencia de
cerrar la jornada; darlo por pagado es conciliar una transferencia.** Lo
primero sale del turno, lo segundo lo mira Administración. Por eso un cobro
ya pagado queda **fuera de su alcance**: no lo puede modificar ni borrar, y
el intento de marcarlo pagado no falla en silencio sino con error.

Y por eso "sumar las ganancias" da cero: los conceptos que no nacen del
turno —planes, abonos, servicios, tienda, cuenta mensual— no los ve, así que
no hay nada que sumar.

#### Lo que RLS no puede cuidar: el monto

Una política verifica **quién** cobra y **en qué estado** nace el cobro. No
puede verificar **cuánto**. El monto lo calcula el navegador, así que alguien
con la consola abierta puede crearse un cobro de $0, y ninguna política lo
va a detener — no es un agujero en las reglas, es el límite de dónde están
escritas.

Hoy eso está acotado y a la vista: el cobro nace pendiente y lo marca pagado
una persona mirando la transferencia, así que un cobro falso aparece raro en
la pantalla de pagos. **Antes de que exista una pasarela de pago, la
cotización tiene que moverse al servidor** — una ruta que cotice con las
mismas reglas puras y escriba el cobro ella. Mientras el único camino a la
plata sea una transferencia que un humano concilia, se puede vivir con esto;
con cobro automático, no.

#### Descontar stock sin poder tocar el precio

La tentación era darle `update` sobre `productos` al dueño para que la
compra descontara stock. Sería un error: con `update` podría cambiarle el
**precio** a un producto, y ese precio lo leen todos los demás. Un permiso
que se pide para restar uno al stock no puede venir con la capacidad de
reescribir la vitrina.

Por eso `descontar_stock()`, una función `security definer` que se salta RLS
sobre `productos` y lo único que sabe hacer es **restar**, nunca bajo cero.
Es la misma regla que `ajustarStock` ya tenía en el repositorio local,
puesta donde no se puede evitar.

#### Cancelar sin poder tocar el cobro

Cancelar un día toca dos cosas: el día y su cobro. El dueño podía escribir el
día y **no el cobro** —en `pagos` solo crea—, así que en producción la
cancelación quedaba **a medias**: el día cancelado (y fuera del calendario de
admin y staff), el cobro todavía pendiente y, en el día de prueba, el perro
marcado "agendado" para un día que ya no existía, sin poder tomar otro. En el
prototipo no se veía porque el repositorio local no tiene RLS.

Darle `update` sobre `pagos` habría sido el mismo error que darle `update`
sobre `productos`: se dejaría cualquier cobro en $0 desde la consola. Así que
se hizo como `descontar_stock()`: tres funciones `security definer`
(`20261022150000_cambios_de_agenda.sql`) que hacen el cambio **entero y en
una transacción** —el día, el cobro, el pack, el perro—:
`cancelar_dia_de_prueba`, `reprogramar_dia_de_prueba` y
`cancelar_dia_de_jardin`. La app llega a ellas por `repo.agenda`, que en el
prototipo es `lib/repo/agenda-local.ts`, la misma secuencia escrita sobre las
colecciones. **Si cambias una, cambia la otra.** `cancelar_dia_de_prueba`
vive hoy en `20261022170000_devolver_el_dia_de_prueba.sql`, que la redefine
para devolver lo ya pagado: la versión de `cambios_de_agenda` es la vieja.

Cuatro cosas que no son obvias:

- **El aviso se mide con el reloj de la base**, no con el del navegador. Si
  contara la hora del teléfono, atrasarlo sería cancelar gratis. `ahora` en
  `repo.agenda` solo existe para el prototipo y los tests.
- **Las reglas están escritas dos veces**: el corte de 24 h y los $5.000
  viven en `lib/config` y también en el SQL. Cada constante SQL lleva arriba
  el nombre de su gemela (`-- NEGOCIO.jardin.horasParaCancelarSinCosto`) y
  `lib/repo/supabase/reglas-en-la-base.test.ts` las compara. Cambiar una sin
  la otra hace caer `npm test`.
- **Lo agendado no se reescribe por fuera.** RLS acota filas, no columnas, y
  la política "el equipo opera" dejaba al dueño actualizar cualquier columna
  de sus estadías y reservas: podía correr la hora de llegada para que una
  cancelación tardía pareciera a tiempo, o darse por confirmada una reserva
  de hotel. El disparador `proteger_lo_agendado` rechaza todo `update`
  directo del dueño; las funciones pasan porque corren como su dueña y no
  como `authenticated`, y el equipo pasa porque marcar llegadas es su
  trabajo. La app ya no le pide al dueño ningún `update` sobre esas tablas.
- **El `coalesce` de la verificación de dueño no es decorativo.** Para el
  cuidador `mi_cliente_id()` es nulo, `not (nulo)` también, y un `if` nulo no
  entra: la primera versión dejaba al cuidador cancelar el día de cualquiera.
  Lo pilló la prueba de aislamiento.

Y otro agujero de la misma familia, en los avisos: el dueño puede
**insertar** en `notificaciones` pero no leerlas, y `crear` del repositorio
pedía la fila de vuelta (`.select()`, que es `insert … returning`). Postgres
exige la política de **lectura** para devolverla, así que el insert permitido
fallaba: el dueño corregía la ficha de su perro, se guardaba, y le salía un
error. `NotificacionesSupabase.crear` inserta sin pedirla, con el id puesto
por el navegador — elegir la llave de una fila que uno mismo no puede ver no
sirve de nada.

Por lo mismo, el aviso de una cancelación sale con `dejarAviso`
(`lib/servicios/avisos.ts`), que no tranca: la cancelación ya quedó hecha en
la base, y si un aviso que no sale hiciera decir "no pudimos cancelar", el
dueño lo intentaría de nuevo sobre algo que sí se canceló.

#### El saldo del plan y el día de prueba

`20261022160000_planes_y_dia_de_prueba.sql`. Dos agujeros más de la misma
familia, y uno de ellos ya estaba pasando:

- **Comprar un plan desde el portal no funcionaba en la nube.** El cobro
  nacía "pagado" por Webpay —que no existe—, la base lo rechazaba porque el
  dueño solo crea cobros pendientes, y para entonces el plan **ya estaba
  creado y se podía usar sin cobro**. Ahora nace pendiente, como el abono
  del hotel: el dueño transfiere y Administración lo marca pagado.
- **El dueño podía escribir `planes` y el día de prueba de su perro.** Con
  eso se bajaba `dias_usados` a cero, se armaba un plan de 99 días por $0 o
  se marcaba el día de prueba como aprobado sin venir.

Bloquear el `update` no alcanzaba: el dueño también podía **insertar** un
plan, un perro que naciera aprobado, un día "con plan" que nunca se
descontó —para cancelarlo a tiempo y que el pack le devolviera un día— o un
día de prueba sin cobro para después "moverlo" y quedar agendado gratis.
Así que:

- **Comprar, usar un día del plan y agendar el día de prueba** son
  funciones (`comprar_plan_de_jardin`, `agendar_dia_con_plan`,
  `agendar_dia_de_prueba`), y llegan por `repo.agenda` igual que las
  cancelaciones. Días, precio y vencimiento del plan los calcula la base:
  si los mandara la app, un plan de 99 días por $0 sería una línea de
  consola. El día de prueba tiene que durar la media jornada exacta y su
  cotización tiene que calzar con el precio.
- **`proteger_los_planes`** no deja al dueño ni crear ni tocar un plan.
- **`proteger_el_dia_de_prueba`** no deja al dueño cambiar `dia_de_prueba`
  ni inscribir un perro que no nazca pendiente. Va aparte de
  `proteger_ficha_de_la_casa` a propósito: redefinir aquella función en una
  migración posterior haría que volver a correr su archivo suelto se llevara
  esta regla sin avisar. Aprobar o rechazar (`resolverDiaDePrueba`) lo hace
  Administración, que pasa. `actualizarPerroComoDueno` además descarta el
  campo, igual que el sexo y la castración.
- **`lo_que_agenda_el_dueno`** acota lo que el dueño inserta directo: un
  día suelto esperado, sin plan y sin horas reales, o una reserva de hotel
  pendiente y sin abono. Todo lo demás tiene su función.

Que haya cupo y que el perro cumpla la admisión sigue en la app, como con
todo lo que se agenda: es una pregunta de capacidad, no de plata. Lo que se
evita es que alguien se regale días o se salte la evaluación.

Las constantes nuevas (precio y duración del día de prueba, tramos y pase
libre, mínimo de días, solo días hábiles) llevan su anotación y entran en
`reglas-en-la-base.test.ts`, que además verifica que los tramos sigan siendo
**dos y contiguos**, que es lo único que la función sabe calcular.

Un detalle de los tests: agendar un día que ya pasó ahora se rechaza, en la
base y en el prototipo. Varios tests agendaban días de junio con la hora
real; ahora pasan un `ahora` de antes, como ya hacían los del día de prueba.

Dos decisiones que se explican solas una vez escritas:

- **`configuracion` se lee sin sesión.** La pantalla de crear cuenta
  necesita las razas y los campos obligatorios para dibujarse, y todavía no
  hay nadie identificado. No hay nada reservado ahí —son las mismas listas
  que el folleto— y cerrarla dejaría el formulario sin desplegables.
- **El rol lo asciende Administración, nunca el interesado.** Si un dueño
  pudiera editar su fila de `perfiles`, se haría admin en una línea de
  consola. Una cuenta nueva nace `cliente` por disparador.

#### Cómo entra alguien del equipo

El alta del portal **exige un perro**, porque es el alta de un dueño. La
cuidadora no tiene perro que inscribir, así que por ahí no entra. Y el rol no
se puede pedir al registrarse, porque entonces cualquiera se haría admin en el
primer formulario.

Por eso la invitación va **al revés**: Administración deja anotado el correo en
`invitaciones` ANTES, y cuando esa persona se registra, el disparador le pone
el rol que le corresponde. Quien llega por su cuenta, sin invitación anotada,
nace `cliente`.

Tres detalles que son la diferencia entre que funcione y que sea un agujero:

- **El correo se compara en minúscula.** "Maria@" y "maria@" son la misma
  persona para todo el mundo menos para una comparación de texto.
- **La invitación se gasta al usarse.** Una que sirve para siempre es una que
  alguien reutiliza.
- **El rol lo decide la base, no la llave.** Lo pone el disparador leyendo
  la invitación. La `service_role` key que usa el correo (ver abajo) solo
  crea la cuenta y manda el enlace: no elige el rol.

El **primer admin** sí se asciende a mano, una vez, desde el editor SQL: no hay
ningún admin todavía que pueda invitarlo. De ahí en adelante invita él.

**Invitar manda un correo de verdad**, y para eso usa la `service_role` key,
que es justo lo que la primera versión evitaba. Se cambió porque una
invitación que hay que reenviar a mano por WhatsApp no es una invitación. La
llave vive solo en el servidor, detrás de `/api/equipo/invitaciones`, y esa
ruta revisa **primero** que quien pide sea Administración: con la llave,
cualquiera que llegara a la URL podría crear cuentas. La decisión está en
`lib/integraciones/equipo/servidor.ts`, separada de Supabase para probarla
sin red.

Tres cosas que no son obvias:

- **Invitar crea la cuenta en ese momento.** `inviteUserByEmail` inserta en
  `auth.users`, el disparador corre ahí mismo, lee la invitación y le pone el
  rol. Por eso el correo se anota ANTES de mandar, y por eso después la
  invitación aparece usada aunque la persona no haya abierto nada: lo que dice
  si ya entró es si **confirmó**, y eso lo responde el GET de la ruta.
- **El cliente PKCE no lee el enlace de invitación.** Llega con la sesión en
  el fragmento (`#access_token=…`) y `createBrowserClient` lo descarta. La
  página de llegada, `/crear-cuenta/equipo/bienvenida`, lo lee a mano
  (`leerEnlaceDeCorreo`), lo borra de la barra y abre la sesión con
  `setSession`. Ahí solo se pide la contraseña: el nombre lo escribió
  Administración al invitar y viaja en los metadatos.
- **Sin la llave o sin SMTP la invitación no se pierde.** Queda anotada, la
  pantalla dice por qué no salió el correo y ofrece el enlace a
  `/crear-cuenta/equipo` por WhatsApp, que sigue funcionando como antes.

**En producción no hay llave, a propósito** (ver "Dónde vive cada cosa"), así
que WhatsApp es el camino normal y la pantalla lo trata así: sin aviso
amarillo, sin intentar un correo que no va a salir, y con "Por WhatsApp" como
botón principal. Al anotar, el aviso trae el botón para mandarlo — un
`window.open` después de un `await` lo bloquea el celular, y el toque nuevo
no. El nombre no se pide al invitar: lo escribe la persona al crear su
cuenta, y con ese firma los reportes.

Para que el correo llegue hacen falta dos cosas en el panel de Supabase: un
**SMTP propio** —ya está, es Resend, ver "Dónde vive cada cosa"— y el dominio
de la app en las **Redirect URLs**.

El otro correo que manda el sistema es la **confirmación** al registrarse, y
sale por el mismo Resend. El remitente que Supabase trae por defecto no sirve
para operar: solo escribe a los miembros del equipo del proyecto y con un tope
de pocos envíos por hora.

Ese tope costó una tarde entera de diagnóstico, así que vale escribir cómo se
ve desde adentro: Supabase responde `Error sending confirmation email` y
**deshace el registro** — la cuenta NO queda creada. Se comprobó mirando
`auth.users` después de varios intentos fallidos: no quedó ninguna cuenta
huérfana. Por eso el mensaje invita a reintentar, que es lo único que
funciona.

La primera versión del mensaje decía lo contrario —que la cuenta ya existía y
que no la volviera a crear— porque se dio por supuesto que el registro
sobrevivía al fallo del correo. Habría dejado a la persona esperando un correo
de una cuenta que no existe. Lo que lo corrigió fue mirar la tabla, no
razonarlo.

Y una trampa del cambio a Resend: **conectar un SMTP propio NO sube el tope
de envíos**. Sigue en el número bajo del remitente incluido hasta que se suba
a mano en Authentication → Rate Limits. Sin eso parece que Resend quedó mal
configurado cuando lo que pasa es que Supabase no lo deja mandar.

#### Grants y políticas son dos cosas

Se confunden fácil y hacen falta las dos: el **grant** dice si un rol puede
tocar la tabla, la **política** dice qué filas se lleva. Una tabla con
políticas perfectas y sin grant devuelve "permission denied"; una con grant y
sin políticas la entrega entera.

El proyecto está creado con **"Automatically expose new tables" apagado** y
**"Enable automatic RLS" encendido**. Por eso `0002_permisos.sql` nombra cada
tabla a propósito en su bucle de grants: una tabla nueva nace sin alcance y
hay que darle permiso explícito. Es más trabajo y es el lado correcto para
equivocarse — lo que se olvide queda invisible en vez de quedar expuesto.

El visitante sin cuenta alcanza exactamente dos tablas, y solo para leer:
`productos` (la vitrina) y `configuracion` (las listas que el formulario de
alta necesita para dibujarse).

`unique (cliente_id, periodo)` en `cuentas_mensuales` baja a la base la
idempotencia de la cuenta del día 1. Antes la cuidaba el servicio; ahora la
cuida el lugar donde no se puede olvidar.

#### Saber qué build está publicada, desde afuera

Igual que con las migraciones: una sesión no ve Vercel, pero **sí puede
preguntarle al sitio qué código está sirviendo**. Sirve para no dar por
publicado algo que no lo está.

La técnica: elegir una cadena que **solo exista desde cierto commit** y que
sobreviva a la minificación —un literal de texto, un id, una clave de
objeto—, abrir una página PÚBLICA que cargue ese código, y buscarla en el
JS que el navegador descarga de verdad:

```js
page.on("response", async (r) => {
  if ((r.headers()["content-type"] ?? "").includes("javascript"))
    cuerpos.push(await r.text());
});
```

Tres trampas, las tres pisadas el 22-10:

- **Buscar en los chunks equivocados da falso negativo.** Primero se buscó
  algo de `/admin` en los chunks de `/ingresar`: el código de admin no se
  carga ahí, así que "no está" no significaba nada. La página tiene que ser
  una que cargue el código que se busca.
- **`document.querySelectorAll("script[src]")` no los ve todos.** Next carga
  parte por importación dinámica. Hay que escuchar las respuestas de red.
- **Un nombre de constante no sirve de marcador**: la minificación lo borra.
  Un literal como `"admin:casa"` sí queda.

Lo más convincente no es la ausencia sino **encontrar el código viejo**. Acá
el JS publicado decía `onClick:()=>x("staff",{staff:e})` cuando el commit
nuevo tiene `{ staff: nombre, usuarioId: idDeStaff(nombre) }`: eso no se
discute.

Y las cabeceras ayudan a confirmarlo: `x-vercel-cache: HIT` con un `age` de
más de media hora dice que el edge sigue sirviendo lo mismo de antes del
push — un deploy nuevo habría invalidado esa caché.

#### Saber si una migración ya corrió, desde afuera

Sin sesión no se puede leer ninguna tabla del dominio, pero **sí se puede
preguntar si una columna existe**, y eso alcanza para verificar una
migración sin pedirle a nadie que abra el editor SQL:

```
GET /rest/v1/<tabla>?select=<columna>&limit=1
```

- `400` con `column ... does not exist` → la migración NO corrió.
- `401` con `permission denied` → la columna existe; Postgres la resolvió y
  recién después chocó con el grant.

La diferencia está en el orden en que Postgres falla, y es confiable. Lo
mismo sirve para una tabla entera: `404` con `Could not find the table` es
que no existe, y `401` es que existe y está cerrada.

**Siempre con un control al lado** —una columna inventada, o una tabla que
se sabe que existe— porque un `401` aislado no distingue "existe" de
"cualquier otro problema de permisos".

Para una migración que agrega **funciones** y no columnas (como
`cambios_de_agenda` o `planes_y_dia_de_prueba`), lo mismo con `rpc`:

```
GET /rest/v1/rpc/<funcion>?<parametro>=00000000-0000-0000-0000-000000000000
```

- `404` con `PGRST202` (`Searched for the function …`) → NO existe.
- `401` con `permission denied for function` → existe y la clave anónima no
  la puede llamar, que es lo esperado: todas llevan `revoke all … from
  public`.

Con `GET`, nunca `POST`: PostgREST corre el `GET` en una transacción de solo
lectura, así que aunque la función se pudiera ejecutar no escribiría nada.
Los nombres de los parámetros cuentan —el `404` lista los que buscó—. Los
controles que se usaron el 22-10-2026: `funcion_que_no_existe` (da `404`) y
`descontar_stock` con `producto` y `cantidad` (existe, da `401`).

#### Borrar un cliente de prueba

Para dejar la base limpia después de probar. Todo lo de un cliente cuelga de
su ficha (`clientes`) y se va en cascada: perros, días, hotel, planes,
servicios, cobros, órdenes, avisos y mensajes. Quedan dos cosas aparte:

- **Los reportes** guardan sus perros en una lista (`perro_ids`) sin llave
  foránea: el que era solo de ese perro se borra, y en uno compartido se le
  saca el perro y el reporte queda.
- **La cuenta de acceso** vive en `auth.users`, y borrar la ficha no la
  toca. Se borra después —si no, ese correo no se puede volver a registrar—
  y en ese orden: borrarla primero deja la ficha suelta, sin dueño.

Las consultas siempre filtran `perfiles.rol = 'cliente'`: un correo del
equipo no se borra por error. Corren desde el editor SQL, que es dueño de las
tablas y por eso no lo frena RLS. Las del 22-10-2026, con las que se borró la
cuenta de prueba `garbarian5@gmail.com` y su perra Emma, están en el
historial de la sesión; se rehacen con este mismo esquema.

#### Las políticas se prueban, no se leen

```
./supabase/pruebas/aislamiento.sh
```

Levanta un Postgres desechable, corre las migraciones dos veces, siembra
cuatro cuentas y le pregunta a la base qué ve cada una; después recorre lo
que cada rol tiene que poder hacer y lo que no. El andamio de la prueba arranca tan cerrado
como el proyecto real —sin privilegios por defecto— así que caza las dos
fallas: un RLS olvidado y un grant olvidado. Correrlo después de tocar cualquier
`create policy` es obligatorio: una política que aísla hoy puede dejar de
aislar con el próximo cambio y **la base no avisa**, solo devuelve una fila
que no correspondía. Con RLS apagado en una sola tabla, la prueba muestra a
un visitante anónimo leyendo todos los cobros.

#### Cada archivo se repite por su cuenta

Cada política se borra justo antes de crearse, con su nombre. La tentación
era borrarlas todas de una al principio del archivo de permisos, que es
menos código; el problema es que ese archivo dejaría de ser repetible solo:
alguien va a volver a correr uno suelto en el editor SQL —para releerlo,
para arreglar un typo— y se llevaría por delante las políticas de las
migraciones posteriores **sin devolverlas**. La prueba lo cubre: corre la
tanda entera, vuelve a correr solo el archivo de permisos y verifica que las
políticas de los que vinieron después sigan ahí.

### Datos que persisten

`RepositorioLocal` guarda todo el set en `localStorage` bajo
`patoteca:datos:v1`. La primera visita siembra el seed; de ahí en adelante los
datos son del usuario y **nunca se regeneran solos** — solo con
`sistema.reiniciar()`, que es destructivo y va detrás de una confirmación.
`sistema.exportar()` e `importar()` existen para no perder una demo, y
`/admin/datos` es la pantalla que los expone: muestra el anclaje y el peso del
set, descarga el respaldo, lo restaura y regenera el seed anclado a hoy.

El seed se ancla al día de hoy, así que el dashboard siempre muestra "los
últimos 60 días" sin envejecer. Es determinista: misma semilla y mismo
anclaje, mismos datos.

Como `localStorage` no existe en el servidor, las pantallas que leen datos son
**componentes cliente**. En el servidor el almacén cae a memoria, así que nada
revienta durante el render.

---

### La PWA

`public/manifest.webmanifest` y `public/sw.js`. El service worker se registra
**solo en producción** (`components/shared/pwa.tsx`): en desarrollo se pelea
con el recargado en caliente de Next y sirve pantallas viejas, así que para
probarlo hay que correr `npm run build && npm start`.

Estrategia de caché: navegación red primero con caída a `/offline`, estáticos
(`/_next/static/`, `/marca/`) caché primero, y **nada de `/api/`** — esas
respuestas son envíos reales de WhatsApp y servirlas desde caché sería mentir
sobre un mensaje que nunca salió.

El aviso de instalación se decide en el render, no en un efecto. iOS no dispara
`beforeinstallprompt`, así que ahí el aviso explica el botón "Agregar a inicio"
en vez de ofrecer un botón que no existe.

### Una fecha sin hora es un día, no un instante

`"2026-09-21"` es un día del calendario de Santiago. Si se lo deja leer como
ISO se entiende como medianoche del reloj de quien mira, y desde cualquier zona
al este de Chile (un servidor en UTC, un dueño de viaje en Madrid) la pantalla
muestra el día anterior. `enZona()` lo ancla al **mediodía** de Santiago —al
mediodía y no a la medianoche porque en Chile el cambio de horario ocurre a las
24:00 y hay días cuya medianoche no existe.

## 4. Marca

El patrón es el **folleto oficial (agosto 2026)**. Los colores se muestrearon
del PDF, no se estimaron a ojo.

### Logo

`public/marca/` tiene el logotipo blanco con transparencia, sacado del propio
folleto, y los iconos ya compuestos (círculo rosa + logotipo) en 512, 192, 180
y 32 px. Se usan con `<LogoPatoteca />`; nunca rehagas el círculo con CSS.

El logotipo es "LA PATOTECA" con una casita formando la A y una huella en
lugar de la O. La bajada es **"Hotel y guardería para perros"**. El negocio es
una guardería; "jardín" es como se llama el servicio de día.

### Colores

| Token | Valor | Para qué |
|---|---|---|
| `--marca-rosa` | `#fe5c82` | El círculo del logo. **Decorativo**: 2,97:1 contra blanco, no lleva texto. |
| `--primary` | `#d6175a` | Botones y acciones. Es el fucsia del folleto profundizado hasta 5,09:1 para que el texto blanco se lea. |
| `--foreground` | `#1b2f63` | Azul marino del folleto. Todo el texto. |
| `--accent` | `#f59c00` | Ámbar del folleto. Lleva texto **marino**, nunca blanco (con blanco queda en 2,18:1). |
| `--background` | `#fdf6ec` | Crema del folleto. |

### Gráficos

Hotel = **azul marino** `#24458f`, jardín = **ámbar** `#c77b00`. Los dos salen
del folleto y están validados como paleta categórica contra el crema: ΔE 36,0 a
vista normal y 30,1 en protanopía.

El folleto pinta el jardín de rosa, pero acá el rosa es el color de **acción**:
una barra rosa al lado de un botón rosa se lee como si fuera tocable. Por eso
el dato usa el ámbar, que también es de marca.

Un tercer color de serie hay que **volver a validarlo** con el script antes de
usarlo. Si no pasa, la tercera categoría va en facetas o small multiples, no en
un hue nuevo.

El cupo del día es el **pico** de las franjas. Cuando lo muestres en un
gráfico, la línea de capacidad va dibujada y el pico etiquetado.

### Tono

Cálido, cercano, hogareño. Tipografía redondeada, **mucho aire**. Mobile-first
y 100% responsive — el staff lo usa en el celular con el perro en brazos, así
que los targets táctiles van generosos.

- Nada de tablas densas en `/staff`: tarjetas grandes.
- En `/admin` las tablas están bien, pero con respiración.
- Estados vacíos con ilustración y una frase, nunca un "No data".

---

## 5. Convenciones

- Código, tipos y nombres de archivo en **español** (`ReservaHotel`,
  `calcularPrecioHotel`), salvo términos técnicos establecidos.
- Fechas: guardar en ISO; formatear siempre con los helpers de
  `/lib/utils/fecha`, nunca con `toLocaleDateString` suelto.
- Montos: enteros CLP, sin decimales. Formatear con `<PrecioCLP />` o
  `formatearCLP()`.
- Los tests de reglas van **colocados** junto a la regla: `precio-hotel.ts` +
  `precio-hotel.test.ts`.
- Commits pequeños y descriptivos, en español.
- Al cierre de cada etapa: `build`, `lint` y `test` verdes antes de avanzar.

### Las ramas

Tres niveles, para que probar algo nuevo nunca toque la app que el dueño está
usando en su celular:

| Rama | Qué es | Vercel |
|---|---|---|
| `main` | **Producción.** Solo entra lo que ya se probó. | Despliegue de producción |
| `pruebas` | **Integración.** Acá se junta y se prueba lo que viene. | Vista previa fija |
| `prueba/<algo>` | Una funcionalidad en curso, sale de `pruebas` y vuelve ahí. | Vista previa por rama |
| `claude/<nombre>` | Lo mismo que `prueba/<algo>`, pero creada por una sesión de Claude en la nube: cada sesión trae la suya asignada y no la elige. | Vista previa por rama |
| `v0.01` | Foto congelada del prototipo terminado (las 5 etapas). No se le commitea. | Vista previa fija |

El flujo es `prueba/<algo>` → `pruebas` → `main`. Nada llega a `main` sin haber
pasado por `pruebas` y sin `build`, `lint` y `test` verdes.

Ojo con el nombre: la rama de una funcionalidad es `prueba/` en **singular**.
Git no deja que exista `pruebas` y `pruebas/whatsapp` a la vez —una referencia
no puede ser archivo y carpeta al mismo tiempo— y el error que tira no dice eso.

### Dónde vive cada cosa

Lo que no está en el código no lo ve ninguna sesión nueva. Esto es lo que hay
afuera, y se actualiza cuando cambia:

| Qué | Dónde |
|---|---|
| Dominio `lapatoteca.cl` | Comprado en **NIC Chile**, delegado a `ns1/ns2.vercel-dns.com`. `lapatoteca.cl` redirige a `www`. |
| Hosting | Proyecto de Vercel **`lapatoteca`**: tiene el dominio y publica `main` como Production. |
| Proyecto viejo | **`lapatoteca-app`** en Vercel quedó sin el dominio y está por borrarse. Ahí vive `lapatoteca-apppruebas.vercel.app`, que apuntaba a `prueba/vista-dueno`. **No se cargan variables ahí.** |
| Base y login | Supabase, proyecto `kcxzoesspkggpchvqlnw`, plan Pro (US$25 + IVA al mes, el servidor Micro lo cubre el crédito). |
| Migraciones corridas | **Las 16**, al 22 de octubre de 2026 — hasta `20261022170000_devolver_el_dia_de_prueba`. `cambios_de_agenda` y `planes_y_dia_de_prueba` se verificaron desde afuera después de correrlas: sus seis funciones existen y dan `401` sin sesión. La 16ª la corrió la dueña y la confirmó con la consulta de `pg_proc` (dio `true`). La 17ª, `20261026120000_ubicacion_del_fichaje`, está en `pruebas` y **sin confirmar** (paso 11 de "Lo que falta hacer afuera"): tiene que correr ANTES de pasar su código a `main`. Se corren a mano en el editor SQL; no hay integración automática, así que esta línea se actualiza al correr una nueva. |
| Confirmación de correo | **Encendida.** Quien se registra recibe un enlace y hasta que no lo abre no tiene sesión. Se apaga en Authentication → Sign In → Email si alguna vez estorba. |
| Correo saliente | **Resend**, dominio `lapatoteca.cl` verificado (región Brasil). Los tres registros DNS los puso Resend solo, con el *Auto configure* de Vercel. La API key vive en Supabase → Authentication → SMTP, con usuario `resend` y remitente `hola@lapatoteca.cl`. |
| Buscador de direcciones | Llave de Google Cloud con el correo de la empresa, restringida a los dominios de `lapatoteca.cl`, `*.vercel.app` y `localhost:3000`, y a Maps JavaScript API + Places API (New). |

Variables en Vercel (proyecto `lapatoteca`, Production y Preview):
`NEXT_PUBLIC_ORIGEN_DATOS=supabase`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Las
`NEXT_PUBLIC_` van como tipo **Config**, no Secret: terminan en el navegador
igual, y Vercel no deja marcarlas secretas. Lo que las protege son las
políticas de RLS y las restricciones de la llave. Tres trampas que ya costaron
una tarde:

- **Vercel las mete al construir.** Cargar o corregir una variable no cambia
  lo publicado: hay que hacer **Redeploy**, sin caché.
- **El nombre tiene que ser exacto.** Una `Z` de más al final
  (`…_API_KEYZ`) dejó el buscador apagado sin ningún error a la vista.
- **Hay que cargarlas en el proyecto que tiene el dominio.** Con dos
  proyectos conectados al mismo repo, las dos publicaciones salen bien y
  solo una se ve.

Para saber si una variable `NEXT_PUBLIC_` entró, se busca su valor en los
`.js` de la página publicada: si quedó `process.env.NOMBRE` sin reemplazar,
no estaba al construir.

Y una que **no** es `NEXT_PUBLIC_` y **se decidió no cargar**:
`SUPABASE_SERVICE_ROLE_KEY`. La usaría una sola ruta,
`/api/equipo/invitaciones`, para mandar el correo de invitación al equipo.
El 22-10-2026 la dueña eligió invitar a mano por WhatsApp: se invita poca
gente al año, y una llave que se salta RLS entera —quien la tenga lee y
cambia toda la base— no vale ese ahorro. Sin ella `/admin/equipo` funciona
en "modo WhatsApp" (ver "Cómo entra alguien del equipo").

Si algún día se carga, con tres cuidados: la **Secret key nueva**
(`sb_secret_…`, Project Settings → API Keys), que se revoca sola sin tocar
nada más —revocar la `service_role` antigua obliga a cambiar también la llave
pública y cierra todas las sesiones—; **solo en Production**, no en Preview,
porque las vistas previas corren código de cualquier rama sin pasar por
`pruebas`; y marcada **Sensitive**. La versión de `supabase-js` acepta la
llave nueva, pero no se probó con la invitación: si al invitar sale un error
de llave, se cambia por la antigua.

#### Lo que vive en la base y se edita desde la app

No está en el código ni en Vercel: está en la tabla `configuracion` de
Supabase y se cambia en `/admin/configuracion`. Una sesión nueva no lo ve.

| Qué | Para qué | Estado al 22-10-2026 |
|---|---|---|
| WhatsApp de la casa | Lo que ve el dueño cuando algo "se conversa" (un perro con sobrepeso, un link de pago). | **Cargado** (verificado desde afuera) |
| Cuenta para transferir | Lo que se abre al tocar "transferencia" en los cobros, el abono y el día suelto. | **Cargada**, los seis campos (verificado desde afuera) |
| Campos obligatorios, vacunas, listas | Qué se le pide a una ficha nueva y qué ofrecen los desplegables. | Los de fábrica, salvo que alguien los haya cambiado |

Vacíos no rompen nada: la app dice "te escribimos nosotros" o "te mandamos
los datos por WhatsApp", que es lo único que se puede cumplir.

**Ojo: todo lo de `configuracion` se lee sin sesión**, también el titular,
el RUT y el número de cuenta. La tabla está abierta porque el formulario de
alta la necesita antes de que exista una cuenta (ver "La nube"). Si la
cuenta es de la empresa, es lo mismo que ponerla en una boleta; si el RUT es
personal, conviene mover los datos de pago a algo que solo vea quien tiene
sesión. **Es de la empresa** (lo dijo la dueña el 22-10-2026), así que se
queda como está.

#### Qué migraciones corrieron en producción

Producción corre sobre Supabase y las migraciones se pegan **a mano** en el
editor SQL. Entonces el código de `main` puede estar leyendo una columna que
la base todavía no tiene, y eso no lo detecta ningún test ni el build: se ve
cuando alguien abre la pantalla.

Ya pasó con las dos del 21-10: llegaron a `main` sin que nadie confirmara
que corrieron (después se confirmó que sí). Si no hubieran corrido,
`/admin/configuracion` **se caía** (los datos de transferencia llegan vacíos)
y habilitar a un perro con sobrepeso fallaba. Parte del motivo es que en
Supabase `configuracion.obtener()` no completa con los valores de fábrica los
campos que la fila no trae, como sí hace `normalizarDatos()` en el modo
local.

Y pasó a propósito con `cambios_de_agenda` y `planes_y_dia_de_prueba`, que
no tienen un orden que no rompa nada (ver más abajo): el código llegó a
`main` y las dos se corrieron apenas quedó publicado, el mismo 22-10.

| Migración | Qué agrega | ¿Corrió en producción? |
|---|---|---|
| `20261014…` (las ocho primeras) | Esquema, permisos, escrituras, cuidador, devoluciones, invitaciones, hora marcada | Corridas (confirmado al 22-10-2026) |
| `20261021120000_ficha_que_decide_la_casa` | `perros.excepcion_peso`, `configuracion.whatsapp_de_contacto` y el disparador que no deja al dueño cambiar sexo, castración ni la excepción de peso | Corrida (al 22-10-2026) |
| `20261021130000_datos_de_transferencia` | `configuracion.transferencia` | Corrida (al 22-10-2026) |
| `20261021140000_alta_de_cuenta` | `clientes.perfil_id` toma solo el usuario que crea la ficha: sin eso, el alta del dueño falla | Corrida (al 22-10-2026) |
| `20261022120000_turnos` | La tabla `turnos`, sus permisos y el disparador que protege el turno planificado | Corrida (al 22-10-2026) |
| `20261022140000_marcado_por` | Quién marcó cada llegada y salida, firmado por la base (`firmar_la_marca`) | Corrida (al 22-10-2026) |
| `20261022150000_cambios_de_agenda` | Cancelar y mover lo agendado con su cobro, en la base; el disparador que no deja al dueño reescribir estadías ni reservas. **Sin ella, cancelar desde el portal falla** (antes de este cambio quedaba a medias) | Corrida el 22-10-2026, verificada desde afuera |
| `20261022160000_planes_y_dia_de_prueba` | Comprar y usar un plan y agendar el día de prueba, en la base; los disparadores que no dejan al dueño tocar planes, aprobarse el día de prueba ni insertar días o reservas por fuera. **Va junto con su código**: con una sin la otra, agendar el día de prueba y usar el plan fallan (ver abajo) | Corrida el 22-10-2026, verificada desde afuera |
| `20261022170000_devolver_el_dia_de_prueba` | Redefine `cancelar_dia_de_prueba` para que lo ya pagado quede en "Por devolver". **No está acoplada**: sin ella el código nuevo funciona igual, con el comportamiento viejo (lo pagado no se devuelve), así que se puede correr después de publicar. Si alguna vez se vuelve a correr `cambios_de_agenda` suelto, hay que correr esta después | Corrida el 22-10-2026, confirmada con `pg_proc` |
| `20261026120000_ubicacion_del_fichaje` | `turnos.entrada_ubicacion` y `turnos.salida_ubicacion`, dónde estaba el celular al fichar. **Va antes que su código**: con el código nuevo y sin estas columnas, fichar falla; al revés no rompe nada, porque el código viejo no las nombra | **Sin confirmar** |

La regla de acá en adelante:

- **Quien agrega una migración la anota en esta tabla como sin confirmar.**
- **Quien la corre en Supabase la marca con la fecha.** Una sesión no ve la
  base: lo que no está marcado se trata como que no corrió.
- **Antes de pasar `pruebas` a `main`, se revisa esta tabla.** Código que
  depende de una migración sin correr no debería llegar a producción.

`planes_y_dia_de_prueba` es la primera que **no se puede correr antes**
sin romper lo publicado: el código viejo agenda el día de prueba y usa el
plan escribiendo directo, justo lo que la migración bloquea; y el código
nuevo llama funciones que sin ella no existen. Las dos fallan limpio —no
dejan nada a medias—, pero durante el intervalo nadie puede agendar el día
de prueba ni usar su plan. Se corre la migración y se publica `main` en
seguida, minutos y no días.

Se publicó el 22-10-2026 con el código primero, que es el orden que deja el
intervalo más corto: Vercel tarda un par de minutos en construir y mientras
tanto sigue sirviendo la versión anterior. Las dos migraciones se corrieron
apenas quedó publicado, en orden, y se verificaron desde afuera (ver "Saber
si una migración ya corrió, desde afuera": las seis funciones pasaron de
`404` a `401`). La próxima migración que venga acoplada así se publica igual.

La prueba de aislamiento (`supabase/pruebas/aislamiento.sh`) ya corrió en
verde con las once primeras, en la sesión que juntó las ramas (`39f7663`),
con las quince (hasta `planes_y_dia_de_prueba`) el 22-10-2026, en la
sesión que arregló las cancelaciones y cerró los planes y el día de prueba,
con las dieciséis (hasta `devolver_el_dia_de_prueba`) ese mismo día, y con
las diecisiete (hasta `ubicacion_del_fichaje`) el 26-10-2026. Eso dice que las migraciones hacen lo que dicen en
un Postgres limpio; si corrieron en producción lo dice la tabla.

#### Dónde quedamos (cierre del 22-10-2026)

Para retomar sin leer el historial. `main`, `pruebas` y la rama de la sesión
quedaron en el mismo commit: todo el código de ese día está publicado en
producción, con `build`, `lint`, `test` y la prueba de aislamiento en verde.

**Lo que le toca a la dueña**, en este orden (el detalle de cada uno está en
"Lo que falta hacer afuera"):

1. ~~**Paso 9**: correr `20261022170000_devolver_el_dia_de_prueba` en el
   editor SQL~~ — corrida el 22-10-2026, la consulta de `pg_proc` dio `true`.
2. ~~**Paso 7**: mandarle a `pxeclt@gmail.com` el enlace por WhatsApp desde
   `/admin/equipo`~~ — mandado el 22-10-2026; falta que cree su cuenta.
3. ~~Decir **de quién es la cuenta para transferir**~~ — de la empresa
   (22-10-2026): puede seguir leyéndose sin sesión.
4. ~~Confirmar **la regla nueva del día de prueba pagado y cancelado
   tarde**~~ — confirmada el 22-10-2026: "se sigue la política", o sea el
   cargo de $5.000 y se devuelve el resto. Si algún día cambia, se revierte
   en `aDevolverAlCancelar`, su gemela en SQL y el texto de
   `components/shared/politicas-dia-de-prueba.tsx`.
5. **Desconectar `lapatoteca-app` del repo en Vercel** (paso 10 de "Lo que
   falta hacer afuera"). La dueña lo pidió; una sesión no ve Vercel.
6. **El fichaje con ubicación** (26-10) está en `pruebas`. Para pasarlo a
   `main`: correr su migración primero (paso 11) y mandar el punto exacto
   de la casa (paso 12).
7. **Cambiar la plantilla del correo de "olvidé mi contraseña"** en
   Supabase (paso 13). Hasta entonces el enlace sigue fallando al abrirlo
   desde el correo del celular.

**Lo que sigue en código**, sugerido y sin empezar:

- **La tienda no funciona en la nube**: la orden nace "pagada" con un webpay
  que no existe y la base rechaza el cobro (ver "Decisiones de producto
  abiertas"). Es lo más urgente: hoy un dueño no puede comprar.
- **El tablero cuenta lo devuelto como ingreso.** `lib/servicios/panel.ts`
  suma `pago.monto` sin mirar el estado, así que un cobro reembolsado con
  monto —una devolución pendiente o ya hecha— infla el ingreso del día, el
  ingreso por cupo y el reparto por línea. Viene de antes: el día de jardín
  ya devolvía así. Lo correcto es probablemente no contar los `reembolsado`,
  revisando antes que la cobranza y la cuenta del día 1 no dependan de eso.
- Las **decisiones de producto abiertas** de abajo.

**Cómo retomar**: traer `main` y `pruebas`, correr `npm test`, leer esta
sección y "Lo que falta hacer afuera", y preguntarle a la dueña cuáles de
los pasos de arriba ya hizo.

#### Lo que falta hacer afuera, y lo que falta decidir

Lo que una sesión no puede hacer sola. Se tacha acá cuando se hace.

**Afuera del código** (lo hace la dueña o quien tenga acceso a los paneles):

0. ~~**Producción no se estaba actualizando**~~ — **se destrabó el 22-10 a
   las 11:25 UTC** con un push nuevo a `main` (`7d70919`): Vercel lo publicó
   en menos de un minuto y el sitio pasó a servir el código del último
   commit, verificado desde afuera con los textos de `fb4c702` ("Todavía
   estás a tiempo, así que te devolvemos lo que pagaste."). **La causa no se
   confirmó**, y por eso queda anotado cómo se ve y qué mirar si vuelve.

   Cómo se vio: entre ~04:46 y 11:24 UTC ningún push a `main` se publicó.
   El JS de producción tenía `agendar_dia_con_plan` (entró con `850720c`,
   03:34 UTC) y no la marca del selector, `usuarioId: idDeStaff(nombre)`
   (entró con `cc1dc5e`, 04:46 UTC), y la portada llevaba en el edge desde
   las 03:53 UTC. El código no era: la vista previa de una rama con ese
   mismo código compilaba, y `build` local en verde.

   **La hipótesis que mejor calza** es el tope de **100 publicaciones al
   día** de Vercel Hobby: cada push publica **dos veces**, porque los dos
   proyectos (`lapatoteca` y el viejo `lapatoteca-app`) siguen conectados
   al repo, y con tres sesiones a la vez hubo 82 commits en 24 horas entre
   todas las ramas. El tope es por ventana móvil, así que horas después
   vuelve a haber cupo — que es justo lo que pasó. Al pasarlo, el estado
   del commit en GitHub dice "Resource is limited - try again in X hours
   (more than 100, code: api-deployments-free-per-day)" y el sitio no
   avisa nada. **Desconectar `lapatoteca-app` del repo** corta el gasto a
   la mitad y de todas formas está por borrarse.

   Si vuelve a pasar, en `https://vercel.com/rivano1/lapatoteca/deployments`
   (el equipo es `rivano1`, sacado del comentario del bot de Vercel en el
   PR #6):

   1. ¿Existe una publicación del último commit de `main`? ¿Ready, Error,
      Canceled? Si no existe o falló, el estado dice por qué.
   2. **Settings → Git → Production Branch** tiene que decir `main`, y
      **Settings → Domains** apuntar a *Production*, no a una publicación
      puntual.
   3. Que la pantalla sea la de **`lapatoteca`** y no la de
      `lapatoteca-app` (ver "Dónde vive cada cosa").

   Las vistas previas (`lapatoteca-git-<rama>-rivano1.vercel.app`) piden
   login de Vercel, así que desde afuera no se ve qué sirven: lo único
   que una sesión puede mirar es el dominio de producción. **Atajo**: el
   menú "..." de una publicación lista tiene *Promote to Production*.

1. ~~Correr en Supabase `20261022150000_cambios_de_agenda` y
   `20261022160000_planes_y_dia_de_prueba`~~ — hecho el 22-10-2026,
   verificado desde afuera.
2. ~~Ordenar lo que dejaron a medias los bugs que arreglan~~ — hecho el
   22-10-2026. Después, ese mismo día, se borró la cuenta de prueba
   (`garbarian5@gmail.com`, con Emma) y todo lo suyo para partir de cero
   (ver "Borrar un cliente de prueba"). Se confirmaron en la base los 6 disparadores nuevos. El único
   día de prueba cancelado a medias era el de **Emma** (cuenta de prueba de
   la dueña): volvió a `pendiente` y su cobro quedó reembolsado en $0. No
   había planes sin cobro. Si vuelve a aparecer algo así, las consultas son:
   - días de prueba a medias: `select f.id, f.nombre, e.id as estadia from
     perros f join estadias_jardin e on e.perro_id = f.id and e.origen =
     'dia_de_prueba' where f.dia_de_prueba->>'estado' = 'agendado' and
     e.estado = 'cancelada' and not exists (select 1 from estadias_jardin v
     where v.perro_id = f.id and v.origen = 'dia_de_prueba' and v.estado <>
     'cancelada');` — se arreglan devolviendo el perro a
     `{"estado": "pendiente"}` y dejando el cobro reembolsado en cero si
     avisó a tiempo, o en $5.000 si no.
   - planes sin cobro: `select p.* from planes p left join pagos g on
     g.referencia_id = p.id and g.concepto = 'plan' where g.id is null;`.
3. ~~Cargar `SUPABASE_SERVICE_ROLE_KEY` en Vercel~~ — **decidido no
   cargarla** (22-10-2026): las invitaciones al equipo van por WhatsApp.
   Los cuidados por si algún día se carga están en "Dónde vive cada cosa".
4. ~~Revisar en Supabase → Authentication → URL Configuration~~ —
   **revisado el 22-10-2026**: Site URL `https://lapatoteca.cl` (sirve: Vercel la manda a
   `www` conservando el enlace) y solo las dos Redirect URLs de abajo, sin
   `vercel.app`. La prueba de "olvidé mi contraseña" destapó un error de la
   pantalla de contraseña nueva, que se arregló y se volvió a probar con
   éxito el mismo día (ver "Olvidé mi contraseña: la sesión tiene que ser la
   del enlace"). **Hecho.**
   - **Site URL** = `https://www.lapatoteca.cl`. Es adonde vuelve el correo
     de **confirmación** al registrarse; Supabase trae `localhost:3000` por
     defecto, y con eso el enlace no abre.
   - **Redirect URLs** con `https://www.lapatoteca.cl/**` y
     `https://lapatoteca.cl/**`, **y nada de `*.vercel.app`**. Sin las dos
     primeras **"olvidé mi contraseña"** deja a la persona en la portada en
     vez de `/ingresar/clave`, y no puede elegir una nueva.

     Una versión anterior de este archivo pedía también
     `https://*.vercel.app/**`, y **es un agujero**: ese comodín acepta
     cualquier sitio publicado en Vercel, también el de un atacante. Con la
     llave pública —que está en la página— pide "olvidé mi contraseña" para
     el correo de un cliente con su sitio como destino; al cliente le llega
     un correo legítimo de La Patoteca y, si lo abre, el enlace con el que
     se toma la cuenta termina en manos del atacante. Acotarlo a
     `*-<equipo>.vercel.app` no lo cierra del todo: un proyecto ajeno puede
     llamarse igual. Si está, se borra. Lo único que se pierde es probar
     "olvidé mi contraseña" desde una vista previa; entrar con contraseña
     ahí funciona igual, porque no usa la dirección de vuelta.
5. ~~Confirmar que el **tope de correos por hora** de Supabase se subió en
   Authentication → Rate Limits~~ — **revisado el 22-10-2026: está en 100
   por hora**, de sobra para el volumen de la casa (ver más arriba: Resend
   solo no lo sube).
   Cada cliente nuevo recibe un correo de confirmación: con el tope bajo,
   un día con varias altas deja a alguien sin poder crear su cuenta.
6. ~~En `/admin/configuracion`: cargar el WhatsApp de la casa y la cuenta
   para transferir~~ — hecho el 22-10-2026, verificado desde afuera. Queda
   decidir si los datos de pago siguen visibles sin sesión (ver "Lo que vive
   en la base y se edita desde la app").
7. ~~Mandarle a `pxeclt@gmail.com` el enlace por WhatsApp desde
   `/admin/equipo`~~ — **mandado el 22-10-2026** (lo dijo la dueña). Falta
   que esa persona cree su cuenta en `/crear-cuenta/equipo` con ese mismo
   correo: ahí escribe su nombre, que es con el que firma los reportes, y
   queda con el rol de la invitación. **Sin confirmar** que ya la creó: se
   ve en `/admin/equipo`, donde la invitación pasa a usada.
8. Probar en la vista previa de `pruebas` **del proyecto `lapatoteca`** —no
   en `lapatoteca-app-git-pruebas-…`, que es el proyecto viejo— y recién
   entonces pasar `pruebas` a `main`.
9. ~~Correr en Supabase `20261022170000_devolver_el_dia_de_prueba`~~ —
   **corrida el 22-10-2026** por la dueña, y la consulta de `pg_proc` dio
   `true`. Desde ahí, un día de prueba ya pagado y cancelado a tiempo
   aparece en "Por devolver". Como la función ya existía, el truco del
   `401` no distingue la versión: si hay que volver a comprobarlo, es
   con `select prosrc like '%a_devolver%' from pg_proc where
   proname = 'cancelar_dia_de_prueba';`, que tiene que dar `true`.
10. **Desconectar el proyecto viejo `lapatoteca-app` del repo.** Lo pidió
    la dueña el 22-10-2026. Cada push se publica dos veces —una en cada
    proyecto— y es la sospecha principal de por qué producción dejó de
    publicarse esa noche (ver el paso 0). Se hace en
    `https://vercel.com/rivano1/lapatoteca-app/settings/git` →
    **Disconnect**. Desconectar no borra el proyecto ni
    `lapatoteca-apppruebas.vercel.app`: solo deja de publicar con cada push.
    Borrarlo entero es Settings → General → Delete Project, al final.
    **Sin confirmar** que se hizo: desde afuera se ve cuando el bot de
    Vercel deja de nombrar a `lapatoteca-app` en los PR.
11. **Correr `20261026120000_ubicacion_del_fichaje` en Supabase ANTES de
    pasar a `main` el fichaje con ubicación.** Con el código nuevo y sin las
    columnas, fichar falla. Agrega dos columnas y nada más, así que correrla
    antes no le hace nada a lo publicado. Se confirma desde afuera con el
    truco de la columna: `GET /rest/v1/turnos?select=entrada_ubicacion&limit=1`
    tiene que dar `401` y no `400` (ver "Saber si una migración ya corrió,
    desde afuera").
12. **El punto exacto de la casa.** `NEGOCIO.ubicacion` es la esquina de
    Diagonal Oriente con Manuel Montt, aproximada; para decir si alguien
    fichó en la casa tiene que ser la puerta. La dueña lo saca de Google
    Maps dejando apretado sobre la casa: aparecen dos números
    (`-33.44…, -70.61…`). Hasta que se corrija, un fichaje en la casa puede
    salir "a 200 m de la casa".

13. **Cambiar la plantilla del correo de "olvidé mi contraseña"** en Supabase
    → Authentication → Emails → *Reset Password*. Es lo que hace que el
    enlace funcione abriéndolo desde el correo del celular (ver "Y el enlace
    tiene que servir donde se abra"). El código ya acepta los dos formatos,
    así que esto se puede hacer en cualquier momento y nada se rompe
    mientras tanto — lo único es que hasta que se cambie sigue fallando como
    el 26-10.

    El cuerpo, entero:

    ```html
    <h2>Elige una contraseña nueva</h2>
    <p>
      Toca el botón y escribe tu contraseña nueva. El enlace dura un rato y
      sirve una sola vez.
    </p>
    <p>
      <a href="{{ .SiteURL }}/ingresar/clave?token_hash={{ .TokenHash }}&type=recovery">
        Elegir contraseña nueva
      </a>
    </p>
    <p>Si no pediste esto, puedes ignorar el correo.</p>
    ```

    Dos cosas que no se pueden cambiar sin romperlo: `type=recovery` —la
    pantalla no acepta otro tipo— y que apunte a `/ingresar/clave`. `.SiteURL`
    es `https://lapatoteca.cl`, que Vercel manda a `www` conservando la ruta
    y la consulta.

    Con este formato el enlace va **directo a la app**, no pasa por el
    `/auth/v1/verify` de Supabase, así que las Redirect URLs dejan de
    importar para este correo. Se prueba pidiendo "olvidé mi contraseña" en
    el computador y abriendo el correo en el teléfono: antes decía que el
    enlace no servía, ahora tiene que dejar escribir la contraseña.

**Decisiones de producto abiertas:**

- **La tienda nace pagada** (con un "webpay" que no existe), mientras que
  todo lo demás nace pendiente hasta que Administración concilia la
  transferencia. Los planes ya se igualaron (22-10): darlos por pagados
  hacía fallar la compra en la nube. La tienda tiene el **mismo bug** —crea
  la orden "pagada", descuenta stock y falla al crear el cobro—, así que
  igualarla no es solo una decisión: hoy en la nube no funciona.
- **El sexo quedó fijo para el dueño**, igual que la castración, porque
  decide si a un macho se le exige. Lo decidió una sesión; falta que la dueña
  lo confirme.
- **Un macho sin castrar sigue sin poder crear la cuenta**, mientras que el
  sobrepeso sí la deja crear y espera la habilitación. ¿Debería conversarse
  igual que el peso?
- **Fotos de productos**: el modelo tiene `imagenUrl`, pero ni el admin ni
  la tienda la usan.
- ~~**Cancelar tarde un día de prueba ya pagado devuelve el resto**~~ —
  confirmado por la dueña el 22-10: la casa se queda con los $5.000 del
  cargo y devuelve el resto.

#### Varias sesiones a la vez

Cada sesión en la nube tiene su propia copia del repo y su propia
conversación; entre ellas solo se ven a través de GitHub. Por eso: traer
`main` y `pruebas` **al empezar y antes de subir**, subir apenas algo
termina, y anotar acá lo que cambie afuera del código (Vercel, Supabase,
Google). Otra sesión no se va a enterar de otra manera.

El 21 y 22 de octubre trabajaron **tres sesiones a la vez** y cada una de
estas reglas sale de algo que pasó:

- **`pruebas` se mueve mientras uno trabaja.** Justo antes de abrir el PR se
  vuelve a traer, y si avanzó se fusiona en la rama propia y se corre de
  nuevo `build`, `lint` y `test`. Los turnos entraron mientras se hacía el
  correo de invitación y chocaron en `/admin/equipo`: se resolvió dejando las
  pestañas de una y el contenido de la otra, no eligiendo un lado.
- **Las marcas de tiempo de las migraciones no se pueden repetir.** El CLI de
  Supabase las lee como número de versión y dos iguales lo hacen fallar. Dos
  sesiones eligieron `20261021120000` por separado. Después de traer, se mira
  la última y se usa una posterior.
- **Una regla cambiada en una rama rompe tests de otra.** El peso dejó de
  bloquear el alta en una sesión, y un test de la otra que usaba un perro de
  30 kg para probar "la ficha se revisa antes" quedó en rojo al juntarlas.
  Por eso los tests se corren **después** de fusionar, no solo antes.
- **Dos sesiones escribiendo la misma parte de este archivo se juntan, no se
  pisan.** Pasó con el correo: una escribió la invitación y otra la
  confirmación con Resend, y quedaron las dos.
- **Si algo entra directo a `main`, se trae a `pruebas` apenas se vea.** Pasó
  con el día de prueba en palabras: mientras más tiempo divergen, más difícil
  es saber qué hay en producción.
- **Lo que una sesión no puede verificar se escribe "sin confirmar", nunca
  como hecho.** Ninguna ve Vercel ni Supabase. Y al terminar, a la dueña se
  le dice qué pasos le tocan a ella: van en "Lo que falta hacer afuera".

#### Lo que entró después de las 5 etapas

Para que una sesión nueva sepa qué existe sin leer el historial entero. Cada
tema tiene su explicación más arriba en este archivo.

- **La nube**: repositorio sobre Supabase detrás de `NEXT_PUBLIC_ORIGEN_DATOS`,
  login real con correo y contraseña, puertas en el servidor (`proxy.ts`), el
  alta que crea la cuenta de acceso, y la app con la base vacía.
- **El equipo**: alta del personal por invitación, el correo de invitación
  que sale de verdad (PR #4 y #5), y la planilla de turnos con el fichaje
  desde `/staff`. Después se le agregó la **vista de grilla** —una columna
  por turno, una fila por media hora— al lado de la vista por día, y que
  Administración también se pueda asignar a un turno.
- **El día de prueba, de punta a punta** (22-10): la tarjeta de `/admin`
  muestra los que VIENEN además de los que esperan veredicto —antes uno
  recién agendado no aparecía en ningún lado—, y el ingreso sin reserva ya
  no deja entrar a un perro que todavía no es cliente.
- **El alta y la ficha** (PR #1): sexo y castración fijos para el dueño, el
  sobrepeso que se conversa y Administración habilita, el antiparasitario
  vencido que avisa, el día de prueba que dice qué falta antes de elegir hora,
  la dirección con sugerencias de Google, el ojo de la contraseña y la foto
  que no se deforma.
- **La plata** (PR #2): cómo pagar dicho donde se paga, con los datos de
  transferencia editables, y el hotel por confirmar hasta que llega el abono.
- **La tienda** (PR #3): editar y agregar productos desde el admin, que se
  ocultan en vez de borrarse.
- **El día de prueba en palabras**: "el próximo jueves 29 de octubre a las
  09:00", y en verde en Mi cuenta.
- **Lo agendado se cambia en la base** (22-10): cancelar y mover el día de
  prueba, cancelar el día de jardín, comprar y usar un plan y agendar el día
  de prueba pasan por funciones de Supabase, con disparadores que no dejan
  al dueño tocar cobros, planes ni su propio veredicto (ver "Cancelar sin
  poder tocar el cobro" y "El saldo del plan y el día de prueba").
- **"Olvidé mi contraseña"** cambia la de la cuenta del enlace y no la que
  estaba abierta en el navegador (22-10), y el enlace **sirve abriéndolo
  donde sea** —también en el navegador interno del correo, que es donde más
  se abre— con el formato `token_hash` (26-10). Falta cambiar la plantilla
  en Supabase: paso 13 de "Lo que falta hacer afuera".
- **Lo pagado del día de prueba se devuelve** al cancelar (22-10): aparece en
  "Por devolver", y la pantalla pide la cuenta antes de confirmar, con el
  mismo formulario que el día de jardín.
- **El que ya era cliente no hace día de prueba** (22-10): Administración
  lo aprueba sin que venga y sin cobrarle, desde el tablero o la ficha del
  cliente (ver "Y el que ya era cliente no lo hace").
- **El fichaje guarda dónde se hizo** (26-10): la planilla dice "en la
  casa" o "a 3 km de la casa", y sin ubicación se ficha igual (ver "Dónde
  se fichó"). En `pruebas`, esperando su migración.

## 6. Comandos

```
npm run dev        # servidor de desarrollo
npm run build      # build de producción (incluye typecheck)
npm run lint
npm test           # reglas de negocio, seed y repositorio
npm run test:watch
npm run typecheck
```

## 7. Orden de construcción

1. ~~**Base + reglas + datos mock**~~ — hecho: config, types, `rules/` con
   tests, repositorio y seed.
2. ~~**App staff**~~ — hecho: Hoy con ocupación por franja, check-in/out de un
   toque, reportes por WhatsApp e incidentes. Incluye la capa de
   integraciones.
3. ~~**Backoffice admin**~~ — hecho: KPIs, calendario de ocupación, clientes
   y perros con alertas, cobranza con la cuenta del día 1, planes e
   inventario.
4. ~~**Portal cliente**~~ — hecho: landing con precios de config, reserva de
   hotel y jardín con precio en vivo, compra de planes, servicios spot,
   tienda con carrito y la cuenta con perros, planes, reservas y reportes.
5. ~~**PWA** + pulido~~ — hecho: manifest, service worker con pantalla sin
   conexión, aviso de instalación y la pantalla de datos del backoffice
   (respaldo, restauración y reinicio del seed).
6. ~~**A producción**~~ — hecho: la base en Supabase con RLS probado, login
   real con correo y contraseña, puertas en el servidor (`proxy.ts`), el
   repositorio y la identidad detrás del mismo interruptor
   (`NEXT_PUBLIC_ORIGEN_DATOS`), correo saliente por Resend, dominio
   `lapatoteca.cl` en Vercel, y la planilla de turnos con el veredicto del
   día de prueba. El prototipo con datos del navegador **no se retiró**:
   sigue siendo el modo de desarrollo y de demo.

## 8. Del folleto

Las reglas y los precios están **alineados al folleto de agosto 2026**, y todos
los valores viven en `lib/config/precios.ts` y `lib/config/negocio.ts` para
poder cambiarlos sin tocar reglas ni pantallas.

Datos del folleto que sirven para la landing de la etapa 4:

- Ubicación: Providencia, cerca de Av. Diagonal Oriente con Manuel Montt.
- Horario de atención (entregas y retiros): L-V 07:00-21:00, sáb-dom
  08:30-21:00. La casa funciona 24/7 pero fuera de ese horario no se entrega
  ni se retira. Ojo: es distinto del horario del **jardín** (7:00-19:00), que
  es el que define el recargo.
- Reportes: 2 a 3 al día, en las ventanas 8:00-10:30, 13:00-15:00 y
  18:00-19:30 (`NEGOCIO.reportes.ventanas`). Todavía no están aplicadas en la
  pantalla de reportes.
- Traslados cubren parte de Vitacura, Las Condes, La Reina, Peñalolén,
  Providencia, Ñuñoa y Macul.
- Urgencias: MediVet, Miguel Claro 2116, Ñuñoa.
- No se aceptan perros con ansiedad por separación severa, ladrido excesivo,
  agresividad, miedo excesivo, tendencia a escaparse o juego brusco.

## 9. Datos mock

Seed **determinista** (misma salida en cada corrida): ~40 clientes, ~50 perros,
60 días de historial. Los volúmenes deben respetar los patrones reales del
negocio (ver sección 1) para que el dashboard muestre algo creíble: jardín
fuerte entre semana y flojo el fin de semana, hotel al revés.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
