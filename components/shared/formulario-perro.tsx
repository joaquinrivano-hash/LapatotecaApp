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

import { useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, FileImage, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { NEGOCIO } from "@/lib/config/negocio";
import { nombreVacuna } from "@/lib/rules/admision";
import type { BorradorDePerro, FaltanteDeAlta } from "@/lib/rules/alta-perro";
import type { DatosDePerro } from "@/lib/servicios/registro";
import {
  describirDuracion,
  describirEdad,
  ETIQUETA_COMIDA,
  vigenciaAntiparasitario,
  vigenciaVacuna,
} from "@/lib/rules/perro";
import { comprimirImagen } from "@/lib/utils/imagen";
import { formatearFechaLarga } from "@/lib/utils/fecha";
import type {
  Comida,
  Configuracion,
  Medicamento,
  Perro,
  Sexo,
  TipoVacuna,
  UnidadRacion,
} from "@/lib/types";

const COMIDAS: Comida[] = ["desayuno", "almuerzo", "cena"];
const UNIDADES: UnidadRacion[] = ["taza", "scoop", "g"];

const ETIQUETA_UNIDAD: Record<UnidadRacion, string> = {
  taza: "tazas",
  scoop: "scoops",
  g: "gramos",
};

/** "Cuántas tazas" pero "Cuántos scoops": la taza es femenina. */
const CUANTOS: Record<UnidadRacion, string> = {
  taza: "Cuántas tazas",
  scoop: "Cuántos scoops",
  g: "Cuántos gramos",
};

export interface EstadoPerro {
  nombre: string;
  raza: string;
  pesoKg: string;
  sexo: Sexo | null;
  /** `null` = todavía no eligió. Ver CLAUDE.md: no lleva valor por defecto. */
  esterilizado: boolean | null;
  fechaNacimiento: string;
  fotoUrl?: string;
  carnetVacunasUrls: string[];
  /** Cuándo se puso cada vacuna. El vencimiento se calcula. */
  vacunas: Partial<Record<TipoVacuna, string>>;
  antiparasitario: {
    ultimaAplicacion: string;
    mesesDeDuracion: number;
    marca: string;
  };
  alimentacion: {
    marca: string;
    /** `null` = todavía no eligió la medida, que es el primer paso. */
    unidad: UnidadRacion | null;
    raciones: { cantidad: string; comidas: Comida[] }[];
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
    carnetVacunasUrls: [],
    vacunas: {},
    antiparasitario: {
      ultimaAplicacion: "",
      mesesDeDuracion: NEGOCIO.antiparasitario.duracionesEnMeses[0],
      marca: "",
    },
    alimentacion: {
      marca: "",
      unidad: null,
      raciones: [{ cantidad: "", comidas: [] }],
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
    carnetVacunasUrls: perro.carnetVacunasUrls ?? [],
    vacunas: Object.fromEntries(
      perro.vacunas.map((v) => [v.tipo, v.fechaAplicacion]),
    ),
    antiparasitario: perro.antiparasitario
      ? {
          ultimaAplicacion: perro.antiparasitario.ultimaAplicacion,
          mesesDeDuracion: perro.antiparasitario.mesesDeDuracion,
          marca: perro.antiparasitario.marca ?? "",
        }
      : vacio.antiparasitario,
    alimentacion: {
      marca: perro.alimentacion?.marca ?? "",
      unidad: perro.alimentacion?.unidad ?? null,
      raciones:
        perro.alimentacion?.raciones?.length
          ? perro.alimentacion.raciones.map((racion) => ({
              cantidad: String(racion.cantidad ?? ""),
              comidas: racion.comidas,
            }))
          : vacio.alimentacion.raciones,
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

/** Lo que revisan las reglas del alta. */
export function aBorrador(estado: EstadoPerro): BorradorDePerro {
  return {
    nombre: estado.nombre,
    raza: estado.raza,
    pesoKg: numero(estado.pesoKg),
    sexo: estado.sexo ?? undefined,
    esterilizado: estado.esterilizado ?? undefined,
    fechaNacimiento: estado.fechaNacimiento || undefined,
    fotoUrl: estado.fotoUrl,
    carnetVacunasUrls: estado.carnetVacunasUrls,
    vacunas: Object.entries(estado.vacunas)
      .filter(([, fecha]) => fecha)
      .map(([tipo, fecha]) => ({
        tipo: tipo as TipoVacuna,
        fechaAplicacion: fecha,
      })),
    antiparasitario: estado.antiparasitario.ultimaAplicacion
      ? {
          ultimaAplicacion: estado.antiparasitario.ultimaAplicacion,
          mesesDeDuracion: estado.antiparasitario.mesesDeDuracion,
          marca: estado.antiparasitario.marca.trim() || undefined,
        }
      : undefined,
    alimentacion: {
      marca: estado.alimentacion.marca.trim() || undefined,
      unidad: estado.alimentacion.unidad ?? undefined,
      // Una ración en blanco no se guarda: es la fila que la pantalla muestra
      // siempre, no algo que el dueño haya escrito.
      raciones: estado.alimentacion.raciones
        .filter((racion) => racion.cantidad !== "" || racion.comidas.length > 0)
        .map((racion) => ({
          cantidad: numero(racion.cantidad),
          comidas: racion.comidas,
        })),
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
    comida && (comida.marca || comida.raciones.length > 0 || comida.notas);

  return {
    nombre: borrador.nombre ?? "",
    raza: borrador.raza ?? "",
    pesoKg: borrador.pesoKg ?? 0,
    sexo: borrador.sexo ?? "hembra",
    esterilizado: borrador.esterilizado,
    fechaNacimiento: borrador.fechaNacimiento,
    fotoUrl: borrador.fotoUrl,
    carnetVacunasUrls: borrador.carnetVacunasUrls,
    vacunas: (borrador.vacunas ?? []).map((v) => ({
      tipo: v.tipo,
      fechaAplicacion: v.fechaAplicacion!,
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
 * El vencimiento de cada vacuna se calcula acá con la configuración, porque
 * este camino no pasa por `crearCuenta`, que es quien lo deriva en el alta.
 */
export function cambiosDePerro(
  estado: EstadoPerro,
  configuracion: Configuracion,
): Partial<Perro> {
  const datos = aDatosDePerro(estado);

  return {
    nombre: datos.nombre.trim(),
    raza: datos.raza.trim(),
    pesoKg: datos.pesoKg,
    sexo: datos.sexo,
    esterilizado: datos.esterilizado === true,
    fechaNacimiento: datos.fechaNacimiento,
    fotoUrl: datos.fotoUrl,
    carnetVacunasUrls: datos.carnetVacunasUrls,
    vacunas: (datos.vacunas ?? []).map((v) => ({
      tipo: v.tipo,
      fechaAplicacion: v.fechaAplicacion,
      fechaVencimiento: vigenciaVacuna(
        v.fechaAplicacion,
        configuracion.duracionVacunasMeses[v.tipo],
      ),
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
  configuracion: Configuracion;
  /** Lo que falta, para marcarlo. Se muestra recién cuando intenta guardar. */
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

  const vigenciaBicho = estado.antiparasitario.ultimaAplicacion
    ? vigenciaAntiparasitario({
        ultimaAplicacion: estado.antiparasitario.ultimaAplicacion,
        mesesDeDuracion: estado.antiparasitario.mesesDeDuracion,
      })
    : null;

  return (
    <div className="space-y-4">
      <SelectorDeFoto
        valor={estado.fotoUrl}
        onCambio={(fotoUrl) => cambiar({ fotoUrl })}
        etiqueta={exige("foto") ? "Su foto" : "Su foto (opcional)"}
        ayuda="Así el equipo lo reconoce apenas llega."
        error={error("fotoUrl")}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo
          id="perro-nombre"
          etiqueta="Cómo se llama"
          valor={estado.nombre}
          onCambio={(nombre) => cambiar({ nombre })}
          error={error("nombre")}
        />
        <ConOtra
          id="raza"
          etiqueta="Raza"
          opciones={configuracion.catalogos.razas}
          valor={estado.raza}
          onCambio={(raza) => cambiar({ raza })}
          textoOtra="Otra (escríbela)"
          placeholder="¿Cuál es?"
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
            exige("fechaNacimiento") ? "Cuándo nació" : "Cuándo nació (opcional)"
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
          ayuda={`Obligatorio en los machos desde los ${NEGOCIO.admision.mesesParaExigirCastracion} meses.`}
          error={error("esterilizado")}
        />
      </div>

      <Seccion
        titulo="Vacunas"
        ayuda="Anota cuándo se la pusieron, tal como aparece en el carnet. Nosotros calculamos hasta cuándo le vale."
      >
        <SelectorDeHojas
          valores={estado.carnetVacunasUrls}
          onCambio={(carnetVacunasUrls) => cambiar({ carnetVacunasUrls })}
          obligatorio={exige("carnetVacunas")}
          error={error("carnetVacunasUrls")}
        />

        {configuracion.vacunasObligatorias.map((tipo) => {
          const fecha = estado.vacunas[tipo] ?? "";
          const vence = fecha
            ? vigenciaVacuna(fecha, configuracion.duracionVacunasMeses[tipo])
            : null;
          const vencida = vence !== null && vence < hoy;

          return (
            <div key={tipo} className="space-y-1.5">
              <Campo
                id={`vacuna-${tipo}`}
                etiqueta={`${nombreVacuna(tipo)}: cuándo se la pusieron`}
                tipo="date"
                valor={fecha}
                onCambio={(valor) =>
                  cambiar({ vacunas: { ...estado.vacunas, [tipo]: valor } })
                }
                error={error(`vacuna-${tipo}`)}
              />
              {vence && !error(`vacuna-${tipo}`) && (
                <p
                  className={`text-xs ${vencida ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                >
                  {vencida ? "Vencida el " : "Le vale hasta el "}
                  {formatearFechaLarga(vence)}.
                </p>
              )}
            </div>
          );
        })}
      </Seccion>

      <Seccion
        titulo="Antiparasitario"
        ayuda="Interna y externa. Con esto calculamos hasta cuándo está cubierto."
      >
        <ConOtra
          id="antiparasitario-marca"
          etiqueta="Marca"
          opciones={configuracion.catalogos.marcasAntiparasitario}
          valor={estado.antiparasitario.marca}
          onCambio={(marca) =>
            cambiar({ antiparasitario: { ...estado.antiparasitario, marca } })
          }
          textoOtra="Otra (escríbela)"
          placeholder="¿Cuál le das?"
        />
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
          etiqueta="Cuánto le dura"
          opciones={NEGOCIO.antiparasitario.duracionesEnMeses.map((meses) => ({
            valor: meses,
            texto: describirDuracion(meses),
          }))}
          elegida={estado.antiparasitario.mesesDeDuracion}
          onElegir={(mesesDeDuracion) =>
            cambiar({
              antiparasitario: { ...estado.antiparasitario, mesesDeDuracion },
            })
          }
        />
        {vigenciaBicho && (
          <p className="text-muted-foreground text-xs">
            Le dura hasta el {formatearFechaLarga(vigenciaBicho)}.
          </p>
        )}
        {error("antiparasitario") && (
          <p className="text-destructive text-xs">{error("antiparasitario")}</p>
        )}
      </Seccion>

      <Seccion
        titulo="Qué come"
        ayuda="Dinos cómo le gusta comer a tu perrito."
      >
        {/* El orden es el de las preguntas: con qué se mide, de qué marca y
            recién entonces cuánto y cuándo. Cada paso aparece cuando el
            anterior está contestado, así nadie ve diez campos de golpe. */}
        <Opciones
          etiqueta="¿Con qué se mide su porción?"
          opciones={UNIDADES.map((valor) => ({
            valor,
            texto: ETIQUETA_UNIDAD[valor],
          }))}
          elegida={estado.alimentacion.unidad}
          onElegir={(unidad) =>
            cambiar({ alimentacion: { ...estado.alimentacion, unidad } })
          }
        />

        {estado.alimentacion.unidad && (
          <>
            <ConOtra
              id="comida-marca"
              etiqueta="Marca"
              opciones={configuracion.catalogos.marcasComida}
              valor={estado.alimentacion.marca}
              onCambio={(marca) =>
                cambiar({ alimentacion: { ...estado.alimentacion, marca } })
              }
              textoOtra="Otra (escríbela)"
              placeholder="¿Cuál come?"
            />

            {estado.alimentacion.marca && (
              <Porciones
                unidad={estado.alimentacion.unidad}
                raciones={estado.alimentacion.raciones}
                onCambio={(raciones) =>
                  cambiar({ alimentacion: { ...estado.alimentacion, raciones } })
                }
              />
            )}
          </>
        )}

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

      <Seccion titulo="Medicamentos" ayuda="Los que toma todos los días, con su dosis.">
        {estado.medicamentos.map((medicamento, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border/70 p-3">
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
          onElegir={(tiene) => cambiar({ alergias: { ...estado.alergias, tiene } })}
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

/**
 * Cuánto come y en qué comidas, con un "+" para los que comen distinto.
 *
 * La mayoría de los perros come lo mismo en cada comida, así que arranca con
 * una sola fila y el "+" aparece al lado de las comidas, que es donde se nota
 * la diferencia ("media taza en la mañana, una entera en la noche").
 */
function Porciones({
  unidad,
  raciones,
  onCambio,
}: {
  unidad: UnidadRacion;
  raciones: { cantidad: string; comidas: Comida[] }[];
  onCambio: (raciones: { cantidad: string; comidas: Comida[] }[]) => void;
}) {
  const cambiarUna = (
    i: number,
    cambios: Partial<{ cantidad: string; comidas: Comida[] }>,
  ) => onCambio(raciones.map((r, j) => (j === i ? { ...r, ...cambios } : r)));

  /** Las comidas que ya tomó otra ración: nadie come dos veces al almuerzo. */
  const tomadas = (salvo: number) =>
    new Set(raciones.flatMap((r, j) => (j === salvo ? [] : r.comidas)));

  return (
    <div className="space-y-2">
      {raciones.map((racion, i) => {
        const ocupadas = tomadas(i);

        return (
          <div
            key={i}
            className="bg-background/60 space-y-3 rounded-xl border border-border/70 p-3"
          >
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Campo
                  id={`comida-cantidad-${i}`}
                  etiqueta={CUANTOS[unidad]}
                  tipo="number"
                  valor={racion.cantidad}
                  onCambio={(cantidad) => cambiarUna(i, { cantidad })}
                />
              </div>
              {raciones.length > 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Quitar la porción ${i + 1}`}
                  onClick={() => onCambio(raciones.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>En qué comidas</Label>
                {i === raciones.length - 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Agregar otra porción"
                    onClick={() =>
                      onCambio([...raciones, { cantidad: "", comidas: [] }])
                    }
                  >
                    <Plus />
                    Otra porción
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {COMIDAS.map((comida) => {
                  const activa = racion.comidas.includes(comida);
                  const enOtra = ocupadas.has(comida);

                  return (
                    <Chip
                      key={comida}
                      activo={activa}
                      deshabilitado={enOtra}
                      onClick={() =>
                        cambiarUna(i, {
                          comidas: activa
                            ? racion.comidas.filter((c) => c !== comida)
                            : [...racion.comidas, comida],
                        })
                      }
                    >
                      {ETIQUETA_COMIDA[comida]}
                    </Chip>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      <p className="text-muted-foreground text-xs text-pretty">
        {raciones.length === 1
          ? "Si come distinto según la hora, agrega otra porción."
          : "Cada porción tiene sus propias comidas."}
      </p>
    </div>
  );
}

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
    <section className="space-y-3 rounded-2xl bg-secondary/40 p-3">
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
  deshabilitado,
  onClick,
  children,
}: {
  activo: boolean;
  deshabilitado?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={deshabilitado}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        activo
          ? "border-primary bg-primary text-primary-foreground"
          : deshabilitado
            ? "border-border/50 bg-background text-muted-foreground opacity-50"
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

/**
 * Un desplegable con una salida de emergencia.
 *
 * Las listas las mantiene Administración, pero ninguna lista está completa:
 * siempre llega la raza o la marca que no está. "Otra" abre un campo de texto
 * en vez de dejar al dueño trancado.
 */
function ConOtra({
  id,
  etiqueta,
  opciones,
  valor,
  onCambio,
  textoOtra,
  placeholder,
  error,
}: {
  id: string;
  etiqueta: string;
  opciones: string[];
  valor: string;
  onCambio: (valor: string) => void;
  textoOtra: string;
  placeholder: string;
  error?: string;
}) {
  // Un valor que no está en la lista solo puede venir de "Otra".
  const [abiertoAMano, setAbiertoAMano] = useState(false);
  const esOtra = abiertoAMano || (valor !== "" && !opciones.includes(valor));

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Select
        id={id}
        value={esOtra ? "__otra__" : valor}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          if (e.target.value === "__otra__") {
            setAbiertoAMano(true);
            onCambio("");
          } else {
            setAbiertoAMano(false);
            onCambio(e.target.value);
          }
        }}
      >
        <option value="">Elige una…</option>
        {opciones.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
        <option value="__otra__">{textoOtra}</option>
      </Select>
      {esOtra && (
        <Input
          aria-label={`${etiqueta}: escríbela`}
          value={valor}
          placeholder={placeholder}
          onChange={(e) => onCambio(e.target.value)}
        />
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

async function leerFoto(archivo: File): Promise<string | null> {
  try {
    return await comprimirImagen(archivo);
  } catch {
    toast.error("No pudimos procesar esa foto.");
    return null;
  }
}

function SelectorDeFoto({
  valor,
  onCambio,
  etiqueta,
  ayuda,
  error,
}: {
  valor?: string;
  onCambio: (valor: string | undefined) => void;
  etiqueta: string;
  ayuda: string;
  error?: string;
}) {
  const archivo = useRef<HTMLInputElement>(null);

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
            className="h-40 w-full rounded-2xl object-cover"
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
          <Camera className="size-6" />
          <span className="text-sm font-semibold">{etiqueta}</span>
          <span className="text-xs text-pretty">{ayuda}</span>
        </button>
      )}
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const entrante = e.target.files?.[0];
          e.target.value = "";
          if (!entrante) return;
          const foto = await leerFoto(entrante);
          if (foto) onCambio(foto);
        }}
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

/**
 * Las hojas del carnet.
 *
 * Son varias porque un carnet real tiene las vacunas repartidas en distintas
 * páginas: con una sola foto siempre falta justo la que hay que mirar.
 */
function SelectorDeHojas({
  valores,
  onCambio,
  obligatorio,
  error,
}: {
  valores: string[];
  onCambio: (valores: string[]) => void;
  obligatorio: boolean;
  error?: string;
}) {
  const archivo = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <Label>
        Foto del carnet de vacunación{obligatorio ? "" : " (opcional)"}
      </Label>
      <p className="text-muted-foreground text-xs text-pretty">
        Sube <strong>todas las hojas</strong> donde haya vacunas anotadas.
        Puedes elegir varias de una vez.
      </p>

      {valores.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {valores.map((hoja, i) => (
            <div key={i} className="relative">
              <Image
                src={hoja}
                alt={`Hoja ${i + 1} del carnet`}
                width={320}
                height={420}
                unoptimized
                className="h-28 w-full rounded-xl object-cover"
              />
              <Button
                size="icon"
                variant="secondary"
                aria-label={`Quitar la hoja ${i + 1}`}
                className="absolute top-1 right-1 size-7"
                onClick={() => onCambio(valores.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        className="w-full"
        onClick={() => archivo.current?.click()}
      >
        <FileImage />
        {valores.length === 0 ? "Subir las hojas del carnet" : "Agregar otra hoja"}
      </Button>

      <input
        ref={archivo}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const entrantes = Array.from(e.target.files ?? []);
          e.target.value = "";
          const hojas: string[] = [];
          for (const entrante of entrantes) {
            const hoja = await leerFoto(entrante);
            if (hoja) hojas.push(hoja);
          }
          if (hojas.length > 0) onCambio([...valores, ...hojas]);
        }}
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
