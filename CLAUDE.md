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
- **Vacunas al día**: todas las obligatorias vigentes y sin vencer al día del
  servicio.
- **Día de prueba aprobado** ($10.000) antes de la *primera* reserva del perro,
  sea de hotel o de jardín.

### Jardín

- Horario **7:00–19:00**.
- Día suelto: **≤6h $10.000**, **>6h $18.000** (exactamente 6h paga el tramo
  barato).
- Plan 5 días: **$75.000**, vigencia **15 días**.
- Plan 20 días: **$200.000**, vigencia **45 días**.
- Días **no acumulables** entre planes; uso L-D según disponibilidad.
- **Fuera de horario**: $1.000 por hora iniciada después de las 19:00, con 15
  minutos de gracia, calculado desde el **check-out real** registrado por staff.

### Hotel

- **$24.000 por bloque de 24h**, con **2 horas de tolerancia** en el check-out;
  pasada la tolerancia se cobra **$1.000 por hora iniciada**.
- **Toda estadía paga al menos un bloque.** Dejar al perro tres horas es una
  noche de hotel, no tres horas sueltas: el cobro por hora existe solo para el
  que se pasa de un bloque ya empezado. Por construcción el recargo nunca llega
  a costar más que una noche (22h × $1.000 < $24.000), así que alargarse
  siempre sale más barato que reservar un día de más.
- Descuentos por duración: **sobre 7 días -10%**, **sobre 14 días -15%**
  (umbrales estrictos: 8+ bloques y 15+ bloques).
- Paseo opcional: **$4.000**.
- Reserva con **abono del 30%**.
- **Devolución solo si se cancela con ≥48h de aviso**: devuelve el abono
  completo. Con menos de 48h, no se devuelve nada.

### Servicios spot

- **Spa** (según tamaño: chico ≤10 kg, grande >10 kg):
  - Express: $13.000 / $18.000
  - Premium: $25.000 / $30.000
  - **-20% para clientes activos**
- **Paseos sueltos**: $5.000 media hora, $10.000 la hora. **-20% para clientes**.
- **Traslados**: base $8.000 hasta 5 km, +$700 por km adicional, +$2.000 en
  horario punta (7:00–9:30 y 18:00–20:00), **tope $15.000**.

**Cliente activo** = tiene un plan vigente con saldo, o registró una estadía en
los últimos 30 días.

### Descuentos

- **Segundo perro del mismo dueño: -20%.**
- Los descuentos son **acumulables en cascada**, aplicados en orden: primero el
  de duración, después el de segundo perro, después el de cliente activo.
  Ejemplo: hotel 10 días $240.000 → -10% = $216.000 → -20% = $172.800.
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
  (cliente)/   landing · ingresar · mi-cuenta · reservar/{hotel,jardin}
               servicios · tienda · mis-reservas
  staff/       Hoy · buscar · reportes · incidentes
  admin/       KPIs · clientes · calendario · pagos · planes · inventario
components/
  ui/          shadcn
  shared/      PrecioCLP, PerroAvatar, EstadoBadge, CupoMeter…
  cliente/ staff/ admin/
lib/
  config/      precios.ts · negocio.ts   ← única fuente de constantes
  types.ts
  rules/       funciones puras + *.test.ts colocados
  repo/        interfaces + impl local + factory
  data/        seed determinista
  store/       zustand + persist
  utils/       fecha (America/Santiago) · formato CLP
public/        manifest.json · sw.js · íconos
```

### Modelo de datos

`Cliente` · `Perro` (con `Vacuna[]` y `diaDePrueba`) · `ReservaHotel` ·
`EstadiaJardin` · `PlanComprado` · `Suscripcion` · `ServicioAgendado` ·
`Pago` · `Producto` · `OrdenTienda` · `Reporte` · `Incidente`

`EstadiaJardin` es la unidad de asistencia y tiene estados
`esperada → presente → finalizada`, guardando las **horas reales** de check-in
y check-out (de ahí sale el cobro fuera de horario).

Hotel y jardín se consultan juntos a través de una vista unificada
`OcupacionDia`, que es lo que usan capacidad, calendario y KPIs. Cuando
agregues una línea de servicio nueva que ocupe espacio, tiene que aportar ahí.

### Datos que persisten

`RepositorioLocal` guarda todo el set en `localStorage` bajo
`patoteca:datos:v1`. La primera visita siembra el seed; de ahí en adelante los
datos son del usuario y **nunca se regeneran solos** — solo con
`sistema.reiniciar()`, que es destructivo y va detrás de una confirmación.
`sistema.exportar()` e `importar()` existen para no perder una demo.

El seed se ancla al día de hoy, así que el dashboard siempre muestra "los
últimos 60 días" sin envejecer. Es determinista: misma semilla y mismo
anclaje, mismos datos.

Como `localStorage` no existe en el servidor, las pantallas que leen datos son
**componentes cliente**. En el servidor el almacén cae a memoria, así que nada
revienta durante el render.

---

## 4. Diseño

Cálido, cercano, hogareño. Paleta amigable, tipografía redondeada, íconos de
perritos, **mucho aire**. Mobile-first y 100% responsive — el staff lo usa en el
celular con el perro en brazos, así que los targets táctiles van generosos.

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
2. **App staff** ← siguiente
3. **Backoffice admin**
4. **Portal cliente**
5. **PWA** + pulido

## 8. Datos mock

Seed **determinista** (misma salida en cada corrida): ~40 clientes, ~50 perros,
60 días de historial. Los volúmenes deben respetar los patrones reales del
negocio (ver sección 1) para que el dashboard muestre algo creíble: jardín
fuerte entre semana y flojo el fin de semana, hotel al revés.
