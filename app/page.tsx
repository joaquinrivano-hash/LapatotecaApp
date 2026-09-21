import Link from "next/link";
import {
  Bath,
  Car,
  Check,
  Clock,
  Footprints,
  Home as Casa,
  MapPin,
  Moon,
  Sun,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogoPatoteca } from "@/components/shared/logo";
import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { formatearCLP } from "@/lib/utils/moneda";

/** Los precios salen de la config: acá no se escribe ningún monto a mano. */
const SERVICIOS = [
  {
    icono: Sun,
    titulo: "Jardín de día",
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

export default function Landing() {
  return (
    <main className="flex-1">
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 py-12 text-center">
        <LogoPatoteca tamano={120} prioridad />
        <h1 className="font-display text-4xl font-bold text-balance sm:text-5xl">
          Tu perro en una casa, no en una jaula
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg text-pretty">
          Hotel y guardería para perros en Providencia. Sillones, camas y patio
          a libre disposición, siempre con un humano cuidándolos.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="xl">
            <Link href="/reservar">Reservar</Link>
          </Button>
          <Button asChild size="xl" variant="outline">
            <Link href="/ingresar">Ya soy cliente</Link>
          </Button>
        </div>
        <div className="text-muted-foreground flex flex-wrap justify-center gap-2 text-sm">
          <Badge variant="secondary">
            <Casa />
            Sin caniles
          </Badge>
          <Badge variant="secondary">
            Máximo {NEGOCIO.capacidad.maximoSimultaneo} perritos
          </Badge>
          <Badge variant="secondary">2 a 3 reportes al día</Badge>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-10">
        <h2 className="font-display text-2xl font-bold">Qué hacemos</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SERVICIOS.map(({ icono: Icono, titulo, bajada, filas, nota }) => (
            <Card key={titulo}>
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
          ))}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-14 md:grid-cols-2">
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
              No recibimos perritos con ansiedad por separación severa, ladrido
              excesivo, agresividad, miedo excesivo, tendencia a escaparse o
              juego brusco.
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
            <Button asChild size="lg" className="w-full">
              <Link href="/reservar">Agendar el día de prueba</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
