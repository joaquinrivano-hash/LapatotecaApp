# La Patoteca — Prototipo navegable

Hotel y jardín canino en Providencia, Santiago de Chile. Este repo es un
**prototipo navegable** para validar flujos y pantallas antes de conectar un
backend real. No hay servidor: los datos son mock y las acciones persisten en
localStorage.

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
- Reserva con **abono del 30%**.
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

El rol se elige en un **login mock** con selector; no hay auth real.

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
               tienda · mi-cuenta
  ingresar/    login mock con selector de rol
  staff/       Hoy · buscar · reportes · incidentes
  admin/       KPIs · calendario · clientes · pagos · planes · inventario
               datos (respaldo y reinicio)
  offline/     pantalla de caída del service worker
  api/integraciones/whatsapp/   enviar · webhook
components/
  ui/          shadcn escrito a mano
  shared/      PrecioCLP, PerroAvatar, EstadoBadge, LogoPatoteca, PWA…
  staff/ admin/
lib/
  config/      precios.ts · negocio.ts   ← única fuente de constantes
  types.ts
  rules/       funciones puras + *.test.ts colocados
  servicios/   reglas + repositorio (asistencia, reservas, panel, cobranza…)
  repo/        interfaces + impl local + factory
  integraciones/  mensajería (plantillas, canales, bandeja)
  data/        seed determinista
  store/       zustand + persist
  hooks/       useConsulta · useAccion · useMontado
  utils/       fecha (America/Santiago) · formato CLP · teléfono · imagen
public/        manifest.webmanifest · sw.js · marca/ (logo e íconos)
```

### Modelo de datos

`Cliente` · `Perro` (con `Vacuna[]`, `diaDePrueba`, `alimentacion`,
`indicaciones` y `notas`) · `ReservaHotel` ·
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

### La ficha del perro

`components/staff/ficha-perro.tsx`, la misma en Hoy y en Buscar. Se abre
tocando el cuerpo de la tarjeta; el botón grande de la derecha sigue siendo la
acción del día, así que marcar una llegada nunca abre la ficha.

El orden es el de las preguntas que aparecen con el perro en brazos: quién es,
qué come, qué cuidado especial tiene y si ya pasó algo antes. Por eso
`alimentacion` e `indicaciones` son campos propios y no un párrafo dentro de
`notas`: a la hora de almuerzo nadie lee un párrafo buscando la ración.

Los incidentes se muestran como historial de los últimos 6 meses, con el conteo
arriba ("2 anotados, 1 sobre leve") y los últimos cuatro en detalle.

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
antes de quedarse, así que no puede entrar por esta vía.

### El portal del cliente

`/lib/servicios/reservas.ts`. Todo pasa por la misma puerta: se **cotiza**
primero —con capacidad y admisión ya revisadas— y recién después se confirma.
Así la pantalla muestra el precio en vivo y los reparos sin haber creado nada.

A diferencia del ingreso no planificado del staff, acá **sí se bloquea**: el
cliente reserva a futuro y no hay ningún perro en la puerta que registrar.

- El día suelto de jardín **no se cobra al agendar**: se cobra al cerrar la
  jornada, con la hora real. Lo que se descuenta al agendar es el día del plan.
- La reserva de hotel deja el **abono del 30% pagado** y el saldo se cobra al
  retiro.
- La tienda, si un producto no alcanza, **compra lo que hay y lo avisa**, en
  vez de fallar la orden entera: en una tienda de mostrador eso es lo que pasa.
- El desglose que ve el cliente muestra **cada descuento por separado**.

Los `input type="date"` se ven en el formato del navegador, que puede no ser el
chileno. Por eso llevan la fecha escrita debajo.

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

### El calendario y su semáforo

En la tira de días el color va al revés de un semáforo de alerta: **verde desde
80% de ocupación, amarillo desde 50%, rojo bajo 50%**. Es la lectura de
negocio: en el backoffice el día vacío es el problema, no el día lleno. Por eso
la tira lleva leyenda; el color solo nunca explica esa inversión.

Las tarjetas de los días tienen todas las filas de alto fijo. "28 sep" en una
línea se corta en los teléfonos angostos y desalinea la tira completa, así que
la fecha va en dos líneas ("lun" sobre "28") y el mes vive en el encabezado.

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
