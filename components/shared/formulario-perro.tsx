"use client";

/**
 * El formulario de la ficha del perro, igual en las tres caras.
 *
 * Lo llena el dueño al crear la cuenta, lo corrige él mismo desde Mi cuenta y
 * lo edita Administración. Si cada pantalla armara su propio formulario, los
 * campos se irían separando solos y un día el dueño podría guardar algo que
 * el admin no puede ver.
 *
 * El estado vive como texto —lo que escribe una persona— y se traduce a los
 * tipos del dominio al guardar. Así un peso a medio escribir ("1,") no rompe
 * nada mientras se escribe.
 */

import { useRef } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, FileImage, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MARCAS_COMIDA } from "@/lib/data/catalogos";
import { nombreVacuna } from "@/lib/rules/admision";
import type { BorradorDePerro, FaltanteDeAlta } from "@/lib/rules/alta-perro";
import type { DatosDePerro } from "@/lib/servicios/registro";
import {
  describirEdad,
  ETIQUETA_COMIDA,
  ETIQUETA_PERIODICIDAD,
  vigenciaAntiparasitario,
} from "@/lib/rules/perro";
import { comprimirImagen } from "@/lib/utils/imagen";
import { formatearFechaLarga } from "@/lib/utils/fecha";
import type {
  Comida,
  ConfiguracionAdmision,
  Medicamento,
  PeriodicidadAntiparasitario,
  Perro,
  Sexo,
  TipoVacuna,
  UnidadRacion,
} from "@/lib/types";

const COMIDAS: Comida[] = ["desayuno", "almuerzo", "cena"];
const UNIDADES: UnidadRacion[] = ["taza", "scoop", "g"];
const PERIODICIDADES: PeriodicidadAntiparasitario[] = [
  "mensual",
  "trimestral",
  "semestral",
  "anual",
  "otro",
];

export interface EstadoPerro {
  nombre: string;
  raza: string;
  pesoKg: string;
  sexo: Sexo | null;
  /** `null` = todavía no eligió. Ver CLAUDE.md: no lleva valor por defecto. */
  esterilizado: boolean | null;
  fechaNacimiento: string;
  fotoUrl?: string;
  carnetVacunasUrl?: string;
  vacunas: Partial<Record<TipoVacuna, { aplicacion: string; vencimiento: string }>>;
  antiparasitario: {
    ultimaAplicacion: string;
    periodicidad: PeriodicidadAntiparasitario | null;
    cadaCuantosDias: string;
  };
  alimentacion: {
    marca: string;
    cantidad: string;
    unidad: UnidadRacion;
    comidas: Comida[];
    notas: string;
  };
  medicamentos: Medicamento[];
  alergias: { tiene: boolean | null; detalle: string };
  indicaciones: string;
  notas: string;
}

export function estadoVacio(): EstadoPerro {
  return {
    nombre: "",
    raza: "",
    pesoKg: "",
    sexo: null,
    esterilizado: null,
    fechaNacimiento: "",
    vacunas: {},
    antiparasitario: {
      ultimaAplicacion: "",
      periodicidad: null,
      cadaCuantosDias: "",
    },
    alimentacion: {
      marca: "",
      cantidad: "",
      unidad: "taza",
      comidas: [],
      notas: "",
    },
    medicamentos: [],
    alergias: { tiene: null, detalle: "" },
    indicaciones: "",
    notas: "",
  };
}

/** Para editar un perro que ya existe. */
export function estadoDesde(perro: Perro): EstadoPerro {
  const vacio = estadoVacio();

  return {
    ...vacio,
    nombre: perro.nombre,
    raza: perro.raza,
    pesoKg: String(perro.pesoKg),
    sexo: perro.sexo,
    esterilizado: perro.esterilizado,
    fechaNacimiento: perro.fechaNacimiento ?? "",
    fotoUrl: perro.fotoUrl,
    carnetVacunasUrl: perro.carnetVacunasUrl,
    vacunas: Object.fromEntries(
      perro.vacunas.map((v) => [
        v.tipo,
        { aplicacion: v.fechaAplicacion, vencimiento: v.fechaVencimiento },
      ]),
    ),
    antiparasitario: perro.antiparasitario
      ? {
          ultimaAplicacion: perro.antiparasitario.ultimaAplicacion,
          periodicidad: perro.antiparasitario.periodicidad,
          cadaCuantosDias: String(perro.antiparasitario.cadaCuantosDias ?? ""),
        }
      : vacio.antiparasitario,
    alimentacion: {
      marca: perro.alimentacion?.marca ?? "",
      cantidad: String(perro.alimentacion?.cantidad ?? ""),
      unidad: perro.alimentacion?.unidad ?? "taza",
      comidas: perro.alimentacion?.comidas ?? [],
      notas: perro.alimentacion?.notas ?? "",
    },
    medicamentos: perro.medicamentos ?? [],
    alergias: {
      tiene: perro.alergias?.tiene ?? null,
      detalle: perro.alergias?.detalle ?? "",
    },
    indicaciones: perro.indicaciones ?? "",
    notas: perro.notas ?? "",
  };
}

function numero(texto: string): number | undefined {
  const valor = Number(texto.replace(",", "."));
  return Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

/** Lo que revisa `revisarAltaDePerro` y lo que se guarda. */
export function aBorrador(estado: EstadoPerro): BorradorDePerro {
  return {
    nombre: estado.nombre,
    raza: estado.raza,
    pesoKg: numero(estado.pesoKg),
    sexo: estado.sexo ?? undefined,
    esterilizado: estado.esterilizado ?? undefined,
    fechaNacimiento: estado.fechaNacimiento || undefined,
    fotoUrl: estado.fotoUrl,
    carnetVacunasUrl: estado.carnetVacunasUrl,
    vacunas: Object.entries(estado.vacunas)
      .filter(([, fechas]) => fechas?.vencimiento)
      .map(([tipo, fechas]) => ({
        tipo: tipo as TipoVacuna,
        fechaAplicacion: fechas!.aplicacion || undefined,
        fechaVencimiento: fechas!.vencimiento,
      })),
    antiparasitario:
      estado.antiparasitario.ultimaAplicacion &&
      estado.antiparasitario.periodicidad
        ? {
            ultimaAplicacion: estado.antiparasitario.ultimaAplicacion,
            periodicidad: estado.antiparasitario.periodicidad,
            cadaCuantosDias: numero(estado.antiparasitario.cadaCuantosDias),
          }
        : undefined,
    alimentacion: {
      marca: estado.alimentacion.marca.trim() || undefined,
      cantidad: numero(estado.alimentacion.cantidad),
      unidad: estado.alimentacion.unidad,
      comidas: estado.alimentacion.comidas,
      notas: estado.alimentacion.notas.trim() || undefined,
    },
  };
}

/**
 * Lo mismo, pero listo para guardar.
 *
 * Se llama DESPUÉS de `revisarAltaDePerro`, así que los campos que la regla
 * exige ya están; los `??` de acá son para los que nunca fueron obligatorios.
 */
export function aDatosDePerro(estado: EstadoPerro): DatosDePerro {
  const borrador = aBorrador(estado);
  const comida = borrador.alimentacion;
  const tieneComida =
    comida &&
    (comida.marca || comida.cantidad || comida.comidas.length > 0 || comida.notas);

  return {
    nombre: borrador.nombre ?? "",
    raza: borrador.raza ?? "",
    pesoKg: borrador.pesoKg ?? 0,
    sexo: borrador.sexo ?? "hembra",
    esterilizado: borrador.esterilizado,
    fechaNacimiento: borrador.fechaNacimiento,
    fotoUrl: borrador.fotoUrl,
    carnetVacunasUrl: borrador.carnetVacunasUrl,
    vacunas: (borrador.vacunas ?? []).map((v) => ({
      tipo: v.tipo,
      fechaAplicacion: v.fechaAplicacion,
      fechaVencimiento: v.fechaVencimiento!,
    })),
    antiparasitario: borrador.antiparasitario,
    alimentacion: tieneComida ? comida : undefined,
    // Un medicamento a medio escribir no se guarda: media ficha confunde más
    // que ninguna.
    medicamentos: estado.medicamentos.filter((m) => m.nombre.trim() !== ""),
    alergias:
      estado.alergias.tiene === null
        ? undefined
        : {
            tiene: estado.alergias.tiene,
            detalle: estado.alergias.detalle.trim() || undefined,
          },
    indicaciones: estado.indicaciones.trim() || undefined,
    notas: estado.notas.trim() || undefined,
  };
}

/**
 * Los campos del perro listos para `repo.perros.actualizar`.
 *
 * Es lo mismo que se manda al crear, pero con la vigencia del antiparasitario
 * ya calculada: acá no pasa por `crearCuenta`, que es quien la deriva en el
 * alta.
 */
export function cambiosDePerro(estado: EstadoPerro): Partial<Perro> {
  const datos = aDatosDePerro(estado);

  return {
    nombre: datos.nombre.trim(),
    raza: datos.raza.trim(),
    pesoKg: datos.pesoKg,
    sexo: datos.sexo,
    esterilizado: datos.esterilizado === true,
    fechaNacimiento: datos.fechaNacimiento,
    fotoUrl: datos.fotoUrl,
    carnetVacunasUrl: datos.carnetVacunasUrl,
    vacunas: (datos.vacunas ?? []).map((v) => ({
      tipo: v.tipo,
      fechaAplicacion: v.fechaAplicacion ?? v.fechaVencimiento,
      fechaVencimiento: v.fechaVencimiento,
    })),
    antiparasitario: datos.antiparasitario,
    desparasitadoHasta: datos.antiparasitario
      ? vigenciaAntiparasitario(datos.antiparasitario)
      : undefined,
    alimentacion: datos.alimentacion,
    medicamentos: datos.medicamentos?.length ? datos.medicamentos : undefined,
    alergias: datos.alergias,
    indicaciones: datos.indicaciones,
    notas: datos.notas,
  };
}

/* ── El formulario ─────────────────────────────────────────────────── */

export function FormularioPerro({
  estado,
  onCambio,
  configuracion,
  faltantes = [],
  hoy,
}: {
  estado: EstadoPerro;
  onCambio: (estado: EstadoPerro) => void;
  configuracion: ConfiguracionAdmision;
  /** Lo que falta, para marcarlo. Se muestra recién cuando el usuario intenta guardar. */
  faltantes?: FaltanteDeAlta[];
  hoy: string;
}) {
  const error = (campo: string) =>
    faltantes.find((f) => f.campo === campo)?.mensaje;

  const exige = (campo: string) =>
    configuracion.camposObligatorios.includes(campo as never);

  const cambiar = (cambios: Partial<EstadoPerro>) =>
    onCambio({ ...estado, ...cambios });

  const edad = estado.fechaNacimiento
    ? describirEdad(estado.fechaNacimiento, hoy)
    : null;

  const vigencia =
    estado.antiparasitario.ultimaAplicacion && estado.antiparasitario.periodicidad
      ? vigenciaAntiparasitario({
          ultimaAplicacion: estado.antiparasitario.ultimaAplicacion,
          periodicidad: estado.antiparasitario.periodicidad,
          cadaCuantosDias: numero(estado.antiparasitario.cadaCuantosDias),
        })
      : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectorFoto
          valor={estado.fotoUrl}
          onCambio={(fotoUrl) => cambiar({ fotoUrl })}
          etiqueta={exige("foto") ? "Su foto" : "Su foto (opcional)"}
          ayuda="Así el equipo lo reconoce apenas llega."
          icono={Camera}
          error={error("fotoUrl")}
        />
        <SelectorFoto
          valor={estado.carnetVacunasUrl}
          onCambio={(carnetVacunasUrl) => cambiar({ carnetVacunasUrl })}
          etiqueta={
            exige("carnetVacunas")
              ? "Foto del carnet"
              : "Foto del carnet (opcional)"
          }
          ayuda="Sácale una foto a la hoja de las vacunas."
          icono={FileImage}
          error={error("carnetVacunasUrl")}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo
          id="perro-nombre"
          etiqueta="Cómo se llama"
          valor={estado.nombre}
          onCambio={(nombre) => cambiar({ nombre })}
          error={error("nombre")}
        />
        <Campo
          id="raza"
          etiqueta="Raza"
          valor={estado.raza}
          onCambio={(raza) => cambiar({ raza })}
          ayuda="Si es quiltro, escribe quiltro."
          error={error("raza")}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo
          id="peso"
          etiqueta="Cuánto pesa (kg)"
          tipo="number"
          valor={estado.pesoKg}
          onCambio={(pesoKg) => cambiar({ pesoKg })}
          error={error("pesoKg")}
        />
        <Campo
          id="nacimiento"
          etiqueta={
            exige("fechaNacimiento")
              ? "Cuándo nació"
              : "Cuándo nació (opcional)"
          }
          tipo="date"
          valor={estado.fechaNacimiento}
          onCambio={(fechaNacimiento) => cambiar({ fechaNacimiento })}
          ayuda={edad ? `Tiene ${edad}.` : "Para saber su edad y su cumpleaños."}
          error={error("fechaNacimiento")}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Opciones
          etiqueta="Sexo"
          opciones={[
            { valor: "hembra" as const, texto: "Hembra" },
            { valor: "macho" as const, texto: "Macho" },
          ]}
          elegida={estado.sexo}
          onElegir={(sexo) => cambiar({ sexo })}
          error={error("sexo")}
        />
        <Opciones
          etiqueta="¿Está castrado?"
          opciones={[
            { valor: true, texto: "Sí" },
            { valor: false, texto: "No" },
          ]}
          elegida={estado.esterilizado}
          onElegir={(esterilizado) => cambiar({ esterilizado })}
          ayuda="Obligatorio en los machos."
          error={error("esterilizado")}
        />
      </div>

      <Seccion titulo="Vacunas" ayuda="Míralas en el carnet.">
        <div className="space-y-3">
          {configuracion.vacunasObligatorias.map((tipo) => {
            const fechas = estado.vacunas[tipo] ?? {
              aplicacion: "",
              vencimiento: "",
            };
            const ponerFecha = (cambios: Partial<typeof fechas>) =>
              cambiar({
                vacunas: { ...estado.vacunas, [tipo]: { ...fechas, ...cambios } },
              });

            return (
              <div key={tipo} className="space-y-1.5">
                <Label className="capitalize">{nombreVacuna(tipo)}</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Campo
                    id={`vacuna-${tipo}-aplicacion`}
                    etiqueta="Se la pusieron el"
                    pequena
                    tipo="date"
                    valor={fechas.aplicacion}
                    onCambio={(aplicacion) => ponerFecha({ aplicacion })}
                  />
                  <Campo
                    id={`vacuna-${tipo}-vencimiento`}
                    etiqueta="Vale hasta"
                    pequena
                    tipo="date"
                    valor={fechas.vencimiento}
                    onCambio={(vencimiento) => ponerFecha({ vencimiento })}
                  />
                </div>
                {error(`vacuna-${tipo}`) && (
                  <p className="text-destructive text-xs">
                    {error(`vacuna-${tipo}`)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Seccion>

      <Seccion
        titulo="Antiparasitario"
        ayuda="Interna y externa. Con esto calculamos hasta cuándo está cubierto."
      >
        <Campo
          id="antiparasitario-fecha"
          etiqueta="Última vez que se lo diste"
          tipo="date"
          valor={estado.antiparasitario.ultimaAplicacion}
          onCambio={(ultimaAplicacion) =>
            cambiar({
              antiparasitario: { ...estado.antiparasitario, ultimaAplicacion },
            })
          }
        />
        <Opciones
          etiqueta="Cada cuánto"
          opciones={PERIODICIDADES.map((valor) => ({
            valor,
            texto: ETIQUETA_PERIODICIDAD[valor],
          }))}
          elegida={estado.antiparasitario.periodicidad}
          onElegir={(periodicidad) =>
            cambiar({ antiparasitario: { ...estado.antiparasitario, periodicidad } })
          }
        />
        {estado.antiparasitario.periodicidad === "otro" && (
          <Campo
            id="antiparasitario-dias"
            etiqueta="Cada cuántos días"
            tipo="number"
            valor={estado.antiparasitario.cadaCuantosDias}
            onCambio={(cadaCuantosDias) =>
              cambiar({
                antiparasitario: { ...estado.antiparasitario, cadaCuantosDias },
              })
            }
          />
        )}
        {vigencia && (
          <p className="text-muted-foreground text-xs">
            Le dura hasta el {formatearFechaLarga(vigencia)}.
          </p>
        )}
        {error("antiparasitario") && (
          <p className="text-destructive text-xs">{error("antiparasitario")}</p>
        )}
      </Seccion>

      <Seccion titulo="Qué come" ayuda="Lo que el equipo mira a la hora de almuerzo.">
        <Campo
          id="comida-marca"
          etiqueta="Marca"
          valor={estado.alimentacion.marca}
          onCambio={(marca) =>
            cambiar({ alimentacion: { ...estado.alimentacion, marca } })
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {MARCAS_COMIDA.map((marca) => (
            <Chip
              key={marca}
              activo={estado.alimentacion.marca === marca}
              onClick={() =>
                cambiar({ alimentacion: { ...estado.alimentacion, marca } })
              }
            >
              {marca}
            </Chip>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo
            id="comida-cantidad"
            etiqueta="Cuánto por porción"
            tipo="number"
            valor={estado.alimentacion.cantidad}
            onCambio={(cantidad) =>
              cambiar({ alimentacion: { ...estado.alimentacion, cantidad } })
            }
          />
          <Opciones
            etiqueta="Medida"
            opciones={UNIDADES.map((valor) => ({
              valor,
              texto: valor === "g" ? "gramos" : valor,
            }))}
            elegida={estado.alimentacion.unidad}
            onElegir={(unidad) =>
              cambiar({ alimentacion: { ...estado.alimentacion, unidad } })
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label>En qué comidas</Label>
          <div className="flex flex-wrap gap-1.5">
            {COMIDAS.map((comida) => {
              const activo = estado.alimentacion.comidas.includes(comida);
              return (
                <Chip
                  key={comida}
                  activo={activo}
                  onClick={() =>
                    cambiar({
                      alimentacion: {
                        ...estado.alimentacion,
                        comidas: activo
                          ? estado.alimentacion.comidas.filter((c) => c !== comida)
                          : [...estado.alimentacion.comidas, comida],
                      },
                    })
                  }
                >
                  {ETIQUETA_COMIDA[comida]}
                </Chip>
              );
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            Puede ser más de una.
          </p>
        </div>

        <Campo
          id="comida-notas"
          etiqueta="Algo más sobre su comida (opcional)"
          valor={estado.alimentacion.notas}
          onCambio={(notas) =>
            cambiar({ alimentacion: { ...estado.alimentacion, notas } })
          }
          ayuda="Ej: si no come al almuerzo, no insistir."
        />

        {error("alimentacion") && (
          <p className="text-destructive text-xs">{error("alimentacion")}</p>
        )}
      </Seccion>

      <Seccion
        titulo="Medicamentos"
        ayuda="Los que toma todos los días, con su dosis."
      >
        {estado.medicamentos.map((medicamento, i) => (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-border/70 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Medicamento {i + 1}</Label>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Quitar el medicamento ${i + 1}`}
                onClick={() =>
                  cambiar({
                    medicamentos: estado.medicamentos.filter((_, j) => j !== i),
                  })
                }
              >
                <X />
              </Button>
            </div>
            {(
              [
                ["nombre", "Cuál"],
                ["dosis", "Dosis"],
                ["frecuencia", "Cada cuánto"],
              ] as const
            ).map(([clave, etiqueta]) => (
              <Campo
                key={clave}
                id={`medicamento-${i}-${clave}`}
                etiqueta={etiqueta}
                pequena
                valor={medicamento[clave]}
                onCambio={(valor) =>
                  cambiar({
                    medicamentos: estado.medicamentos.map((m, j) =>
                      j === i ? { ...m, [clave]: valor } : m,
                    ),
                  })
                }
              />
            ))}
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() =>
            cambiar({
              medicamentos: [
                ...estado.medicamentos,
                { nombre: "", dosis: "", frecuencia: "" },
              ],
            })
          }
        >
          <Plus />
          Agregar un medicamento
        </Button>
      </Seccion>

      <Seccion titulo="Alergias">
        <Opciones
          etiqueta="¿Tiene alguna alergia?"
          opciones={[
            { valor: true, texto: "Sí" },
            { valor: false, texto: "No" },
          ]}
          elegida={estado.alergias.tiene}
          onElegir={(tiene) =>
            cambiar({ alergias: { ...estado.alergias, tiene } })
          }
        />
        {estado.alergias.tiene && (
          <Campo
            id="alergias-detalle"
            etiqueta="A qué"
            valor={estado.alergias.detalle}
            onCambio={(detalle) =>
              cambiar({ alergias: { ...estado.alergias, detalle } })
            }
            ayuda="Ej: al pollo. Nada de snacks con pollo."
          />
        )}
      </Seccion>

      <div className="space-y-1.5">
        <Label htmlFor="indicaciones">Cuidados especiales (opcional)</Label>
        <Textarea
          id="indicaciones"
          value={estado.indicaciones}
          onChange={(e) => cambiar({ indicaciones: e.target.value })}
          placeholder="Ej: usa arnés, no collar. Se suelta."
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notas">Cualquier otra cosa (opcional)</Label>
        <Textarea
          id="notas"
          value={estado.notas}
          onChange={(e) => cambiar({ notas: e.target.value })}
          placeholder="Lo que nos sirva saber."
          rows={2}
        />
      </div>
    </div>
  );
}

/* ── Piezas ────────────────────────────────────────────────────────── */

function Seccion({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-2xl bg-secondary/40 p-3">
      <div>
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {ayuda && (
          <p className="text-muted-foreground text-xs text-pretty">{ayuda}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        activo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:border-primary"
      }`}
    >
      {children}
    </button>
  );
}

function Opciones<T>({
  etiqueta,
  opciones,
  elegida,
  onElegir,
  ayuda,
  error,
}: {
  etiqueta: string;
  opciones: { valor: T; texto: string }[];
  elegida: T | null;
  onElegir: (valor: T) => void;
  ayuda?: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{etiqueta}</Label>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((opcion) => (
          <Chip
            key={String(opcion.valor)}
            activo={elegida === opcion.valor}
            onClick={() => onElegir(opcion.valor)}
          >
            {opcion.texto}
          </Chip>
        ))}
      </div>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : ayuda ? (
        <p className="text-muted-foreground text-xs">{ayuda}</p>
      ) : null}
    </div>
  );
}

function SelectorFoto({
  valor,
  onCambio,
  etiqueta,
  ayuda,
  icono: Icono,
  error,
}: {
  valor?: string;
  onCambio: (valor: string | undefined) => void;
  etiqueta: string;
  ayuda: string;
  icono: React.ComponentType<{ className?: string }>;
  error?: string;
}) {
  const archivo = useRef<HTMLInputElement>(null);

  async function elegir(evento: React.ChangeEvent<HTMLInputElement>) {
    const entrante = evento.target.files?.[0];
    evento.target.value = "";
    if (!entrante) return;
    try {
      onCambio(await comprimirImagen(entrante));
    } catch {
      toast.error("No pudimos procesar esa foto.");
    }
  }

  return (
    <div className="space-y-1.5">
      {valor ? (
        <div className="relative">
          <Image
            src={valor}
            alt={etiqueta}
            width={640}
            height={480}
            unoptimized
            className="h-32 w-full rounded-2xl object-cover"
          />
          <Button
            size="icon"
            variant="secondary"
            aria-label={`Quitar ${etiqueta.toLowerCase()}`}
            className="absolute top-2 right-2"
            onClick={() => onCambio(undefined)}
          >
            <X />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => archivo.current?.click()}
          className={`text-muted-foreground hover:border-primary hover:text-primary flex h-32 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-2 text-center transition-colors ${
            error ? "border-destructive" : "border-border"
          }`}
        >
          <Icono className="size-6" />
          <span className="text-sm font-semibold">{etiqueta}</span>
          <span className="text-xs text-pretty">{ayuda}</span>
        </button>
      )}
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={elegir}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

export function Campo({
  id,
  etiqueta,
  valor,
  onCambio,
  tipo = "text",
  ayuda,
  error,
  autoComplete,
  pequena,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  tipo?: string;
  ayuda?: string;
  error?: string;
  autoComplete?: string;
  pequena?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={pequena ? "text-xs" : undefined}>
        {etiqueta}
      </Label>
      <Input
        id={id}
        type={tipo}
        inputMode={tipo === "number" ? "decimal" : undefined}
        value={valor}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onCambio(e.target.value)}
      />
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : ayuda ? (
        <p className="text-muted-foreground text-xs">{ayuda}</p>
      ) : null}
    </div>
  );
}
