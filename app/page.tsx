import Image from "next/image";
import Link from "next/link";
import {
  Bath,
  Car,
  Check,
  Clock,
  Footprints,
  Heart,
  Home as Casa,
  MapPin,
  MessageCircle,
  Moon,
  Sun,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AccionesPortada,
  BotonAgendar,
  CabeceraPublica,
} from "@/components/shared/cabecera-publica";
import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { formatearCLP } from "@/lib/utils/moneda";

/**
 * Las fotos son del folleto de agosto 2026: perros reales de la casa, no banco
 * de imágenes. Viven en `public/fotos`.
 */
const SERVICIOS = [
  {
    icono: Sun,
    titulo: "Jardín de día",
    foto: "/fotos/jardin.jpg",
    alt: "Dos perros jugando en el pasto frente al muro de colores de la casa",
    bajada: `Guardería de ${NEGOCIO.jardin.horaApertura}:00 a ${NEGOCIO.jardin.horaCierre}:00. Juegan, comen y duermen siesta.`,
    filas: [
      [`Menos de ${NEGOCIO.jardin.horasJornadaCorta} h`, PRECIOS.jardin.jornadaCorta],
      [
        `De ${NEGOCIO.jardin.horasJornadaCorta} a ${NEGOCIO.jardin.horasJornadaMedia} h`,
        PRECIOS.jardin.jornadaMedia,
      ],
      [`Más de ${NEGOCIO.jardin.horasJornadaMedia} h`, PRECIOS.jardin.jornadaLarga],
    ] as const,
    nota: `Con plan mensual el día sale desde ${formatearCLP(PRECIOS.planes.tramosPorDia.at(-1)!.precioPorDia)}.`,
  },
  {
    icono: Moon,
    titulo: "Hotel",
    foto: "/fotos/hotel.jpg",
    alt: "Perro acostado en una cama, tapado con una manta",
    bajada: "Se quedan a dormir en la casa, en cama o sillón. Sin caniles.",
    filas: [
      ["Por hora", PRECIOS.hotel.horaExtra],
      ["24 horas", PRECIOS.hotel.bloque24h],
      ["Paseo opcional", PRECIOS.hotel.paseo],
    ] as const,
    nota: `Desde ${NEGOCIO.hotel.nochesParaDescuento10} noches, 10% de descuento. Reserva con ${Math.round(NEGOCIO.hotel.fraccionAbono * 100)}% de abono.`,
  },
  {
    icono: Bath,
    titulo: "Spa",
    foto: "/fotos/spa.jpg",
    alt: "Perro recién bañado sentado entre flores",
    bajada: "Te lo entregamos limpiecito.",
    filas: [
      ["Baño express", PRECIOS.spa.express.chico],
      ["Baño premium", PRECIOS.spa.premium.chico],
    ] as const,
    nota: "Precios desde, según el tamaño. 20% en el premium para clientes.",
  },
  {
    icono: Footprints,
    titulo: "Paseos",
    foto: "/fotos/paseos.jpg",
    alt: "Perro paseando por la vereda entre hojas de otoño",
    bajada: "Más ejercicio, más felicidad. Sector Providencia.",
    filas: [
      ["Media hora", PRECIOS.paseo[30]],
      ["Una hora", PRECIOS.paseo[60]],
    ] as const,
    nota: "20% de descuento para clientes de La Patoteca.",
  },
  {
    icono: Car,
    titulo: "Traslados",
    foto: "/fotos/traslados.jpg",
    alt: "Perro con arnés y cinturón de seguridad en el asiento del auto",
    bajada: "Cada perrito viaja solo, con cinturón.",
    filas: PRECIOS.traslado.tramos.map(
      (t, i) =>
        [
          `${i === 0 ? 0 : PRECIOS.traslado.tramos[i - 1].hastaKm} a ${t.hastaKm} km`,
          t.normal,
        ] as const,
    ),
    nota: "En horario punta la tarifa sube. Cubrimos parte de Providencia, Ñuñoa, Las Condes, La Reina, Peñalolén, Vitacura y Macul.",
  },
];

const REQUISITOS = [
  `Hasta ${NEGOCIO.admision.pesoMaximoKg} kg`,
  "Machos esterilizados",
  "Vacunas óctuple, antirrábica y KC al día",
  "Desparasitación interna y externa al día",
  "100% sociable",
  `Día de prueba aprobado (${formatearCLP(PRECIOS.diaDePrueba)})`,
];

const PROMESAS = [
  {
    icono: Casa,
    titulo: "Sin jaulas ni caniles",
    texto:
      "Andan sueltos por la casa y el patio. Sillones, camas y sombra a libre disposición.",
  },
  {
    icono: Heart,
    titulo: "Siempre con alguien",
    texto: `Máximo ${NEGOCIO.capacidad.maximoSimultaneo} perritos a la vez, para que a cada uno le toque cariño de verdad.`,
  },
  {
    icono: MessageCircle,
    titulo: "Reportes al día",
    texto:
      "Dos o tres veces al día te llegan fotos y noticias por WhatsApp. Sabes cómo va sin tener que preguntar.",
  },
];

export default function Landing() {
  return (
    <>
      <CabeceraPublica />

      <main className="flex-1">
        {/* ── Portada ─────────────────────────────────────────────── */}
        <section className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 pt-8 pb-12 lg:grid-cols-2 lg:gap-12 lg:pt-14">
          <div className="flex flex-col items-center gap-5 text-center lg:items-start lg:text-left">
            <Badge variant="secondary" className="gap-1.5">
              <Casa className="size-3.5" />
              Providencia · sin jaulas
            </Badge>
            <h1 className="font-display text-4xl font-bold text-balance sm:text-5xl">
              Tu perro en una casa, no en una jaula
            </h1>
            <p className="text-muted-foreground max-w-xl text-lg text-pretty">
              Hotel y guardería para perros. Sillones, camas y patio a libre
              disposición, siempre con un humano cuidándolos.
            </p>
            <AccionesPortada />
          </div>

          {/* Collage: la foto grande manda y la chica se asoma encima. El
              círculo rosa es el del logo, puesto como fondo decorativo. */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div
              aria-hidden
              className="bg-marca-rosa/25 absolute -top-6 -right-4 size-40 rounded-full blur-2xl"
            />
            <div className="relative aspect-4/3 overflow-hidden rounded-[2rem] shadow-lg">
              <Image
                src="/fotos/jugando.jpg"
                alt="Dos perros jugando con un juguete de cuerda en el patio de La Patoteca"
                fill
                priority
                sizes="(min-width: 1024px) 480px, 100vw"
                className="object-cover"
              />
            </div>
            <div className="border-background absolute -bottom-6 -left-2 aspect-square w-28 overflow-hidden rounded-3xl border-4 shadow-lg sm:w-36 lg:-left-8">
              <Image
                src="/fotos/hotel.jpg"
                alt="Perro tapado con una manta en una cama"
                fill
                sizes="144px"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* ── Promesas ────────────────────────────────────────────── */}
        <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 pt-6 pb-12 sm:grid-cols-3">
          {PROMESAS.map(({ icono: Icono, titulo, texto }) => (
            <div key={titulo} className="flex flex-col items-center gap-2 text-center">
              <span className="bg-secondary text-primary rounded-full p-3">
                <Icono className="size-6" />
              </span>
              <h2 className="font-display text-lg font-bold">{titulo}</h2>
              <p className="text-muted-foreground text-sm text-pretty">{texto}</p>
            </div>
          ))}
        </section>

        {/* ── La casa ─────────────────────────────────────────────── */}
        <section className="bg-secondary/40 border-y border-border/60">
          <div className="mx-auto grid w-full max-w-5xl items-center gap-8 px-4 py-12 lg:grid-cols-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="relative aspect-3/4 overflow-hidden rounded-3xl shadow-sm">
                <Image
                  src="/fotos/patio.jpg"
                  alt="Varios perros sueltos en el patio de la casa"
                  fill
                  sizes="(min-width: 1024px) 240px, 45vw"
                  className="object-cover"
                />
              </div>
              <div className="relative mt-8 aspect-3/4 overflow-hidden rounded-3xl shadow-sm">
                <Image
                  src="/fotos/cuidado.jpg"
                  alt="Una cuidadora en cuclillas acariciando a un perro con chaleco"
                  fill
                  sizes="(min-width: 1024px) 240px, 45vw"
                  className="object-cover"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="font-display text-3xl font-bold text-balance">
                Una casa de verdad, con patio y con gente
              </h2>
              <p className="text-muted-foreground text-pretty">
                Acá no hay pabellones ni turnos. Los perritos pasan el día
                juntos, salen al patio cuando quieren y duermen adentro. Si tu
                perro es de los que se meten a la cama, va a estar como en la
                suya.
              </p>
              <p className="text-muted-foreground text-pretty">
                Antes de la primera estadía viene el{" "}
                <strong className="text-foreground">día de prueba</strong> (
                {formatearCLP(PRECIOS.diaDePrueba)}): pasa un día con nosotros y
                vemos juntos cómo le va.
              </p>
              <BotonAgendar size="lg">Agendar el día de prueba</BotonAgendar>
            </div>
          </div>
        </section>

        {/* ── Servicios ───────────────────────────────────────────── */}
        <section className="mx-auto w-full max-w-5xl space-y-5 px-4 py-12">
          <div className="space-y-1">
            <h2 className="font-display text-3xl font-bold">Qué hacemos</h2>
            <p className="text-muted-foreground">
              Precios al día de hoy, sin letra chica.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SERVICIOS.map(
              ({ icono: Icono, titulo, foto, alt, bajada, filas, nota }) => (
                <Card key={titulo} className="overflow-hidden pt-0">
                  <div className="relative aspect-5/3">
                    <Image
                      src={foto}
                      alt={alt}
                      fill
                      sizes="(min-width: 1024px) 340px, (min-width: 768px) 45vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2">
                      <span className="bg-secondary text-primary rounded-full p-2">
                        <Icono className="size-5" />
                      </span>
                      <h3 className="font-display text-lg font-bold">{titulo}</h3>
                    </div>
                    <p className="text-muted-foreground text-sm text-pretty">
                      {bajada}
                    </p>
                    <dl className="divide-border/60 divide-y text-sm">
                      {filas.map(([etiqueta, monto]) => (
                        <div
                          key={etiqueta}
                          className="flex justify-between gap-3 py-1.5"
                        >
                          <dt>{etiqueta}</dt>
                          <dd className="font-semibold tabular-nums">
                            {formatearCLP(monto)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-muted-foreground text-xs text-pretty">
                      {nota}
                    </p>
                  </CardContent>
                </Card>
              ),
            )}
          </div>
        </section>

        {/* ── Requisitos y datos ──────────────────────────────────── */}
        <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-12 md:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-display text-xl font-bold">
                Qué necesita tu perro
              </h2>
              <ul className="space-y-2 text-sm">
                {REQUISITOS.map((requisito) => (
                  <li key={requisito} className="flex items-start gap-2">
                    <Check className="text-accent mt-0.5 size-4 shrink-0" />
                    {requisito}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-xs text-pretty">
                No recibimos perritos con ansiedad por separación severa,
                ladrido excesivo, agresividad, miedo excesivo, tendencia a
                escaparse o juego brusco.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="font-display text-xl font-bold">Dónde y cuándo</h2>
              <p className="flex items-start gap-2 text-sm">
                <MapPin className="text-primary mt-0.5 size-4 shrink-0" />
                Providencia, cerca de Av. Diagonal Oriente con Manuel Montt.
              </p>
              <div className="space-y-1 text-sm">
                <p className="flex items-start gap-2">
                  <Clock className="text-primary mt-0.5 size-4 shrink-0" />
                  <span>
                    <strong>Entregas y retiros</strong>
                    <br />
                    Lunes a viernes de 07:00 a 21:00
                    <br />
                    Sábado y domingo de 08:30 a 21:00
                  </span>
                </p>
                <p className="text-muted-foreground text-xs text-pretty">
                  La casa funciona 24/7, pero fuera de ese horario no hacemos
                  entregas ni retiros. El jardín cierra a las{" "}
                  {NEGOCIO.jardin.horaCierre}:00 y después se cobra{" "}
                  {formatearCLP(PRECIOS.jardin.horaFueraDeHorario)} por hora.
                </p>
              </div>
              <BotonAgendar size="lg" className="w-full">
                Reservar ahora
              </BotonAgendar>
            </CardContent>
          </Card>
        </section>

        {/* Esto no es del negocio: es el interruptor del prototipo. Va al
            final y con letra chica, pero tiene que estar en la portada para
            poder mostrar las tres caras sin saberse la URL de memoria. */}
        <section className="border-t border-border/60 bg-secondary/30">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="text-muted-foreground text-sm text-pretty">
              Esto es un prototipo con datos de prueba. Puedes entrar como
              cliente, como cuidador o como administración.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline">
                <Link href="/ingresar">
                  <Users />
                  Elegir con qué cara entrar
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/crear-cuenta">Crear una cuenta nueva</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
