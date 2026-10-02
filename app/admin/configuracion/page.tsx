"use client";

/**
 * Qué se le exige a una ficha nueva.
 *
 * Vive acá y no en el código porque es una decisión de la casa, no una regla
 * del sistema: el día que llegue una vacuna nueva o se deje de pedir el
 * carnet, se cambia desde este panel.
 */

import { useState } from "react";
import { toast } from "sonner";
import { List, Plus, RotateCcw, Save, ShieldCheck, Syringe, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { NEGOCIO } from "@/lib/config/negocio";
import { nombreVacuna } from "@/lib/rules/admision";
import { useAccion, useConsulta } from "@/lib/hooks/use-consulta";
import { formatearFechaLarga } from "@/lib/utils/fecha";
import type {
  CampoDeAlta,
  NombreDeCatalogo,
  TipoVacuna,
} from "@/lib/types";

const LISTAS: {
  valor: NombreDeCatalogo;
  etiqueta: string;
  ayuda: string;
  placeholder: string;
}[] = [
  {
    valor: "razas",
    etiqueta: "Razas",
    ayuda: "Lo que el dueño ve al elegir la raza de su perro.",
    placeholder: "Ej: Border Terrier",
  },
  {
    valor: "marcasComida",
    etiqueta: "Marcas de comida",
    ayuda: "Las que aparecen al declarar qué come.",
    placeholder: "Ej: Nutrience",
  },
  {
    valor: "marcasAntiparasitario",
    etiqueta: "Marcas de antiparasitario",
    ayuda: "Las que aparecen al declarar el antiparasitario.",
    placeholder: "Ej: Seresto",
  },
];

const CAMPOS: { valor: CampoDeAlta; etiqueta: string; ayuda: string }[] = [
  {
    valor: "fechaNacimiento",
    etiqueta: "Fecha de nacimiento",
    ayuda: "De acá salen la edad y el cumpleaños.",
  },
  {
    valor: "foto",
    etiqueta: "Foto del perro",
    ayuda: "Para reconocerlo apenas llega.",
  },
  {
    valor: "carnetVacunas",
    etiqueta: "Foto del carnet de vacunación",
    ayuda: "Permite verificar las fechas que escribió el dueño.",
  },
  {
    valor: "alimentacion",
    etiqueta: "Comida",
    ayuda: "Marca, cuánto por porción y en qué comidas.",
  },
  {
    valor: "antiparasitario",
    etiqueta: "Antiparasitario",
    ayuda: "Cuándo se lo dieron y cada cuánto se repite.",
  },
];

export default function Configuracion() {
  const { ocupado, ejecutar } = useAccion();
  const [version, setVersion] = useState(0);
  const configuracion = useConsulta(
    (repo) => repo.configuracion.obtener(),
    [version],
  );

  const actual = configuracion.datos;

  async function alternarCampo(campo: CampoDeAlta) {
    if (!actual) return;
    const camposObligatorios = actual.camposObligatorios.includes(campo)
      ? actual.camposObligatorios.filter((c) => c !== campo)
      : [...actual.camposObligatorios, campo];

    await ejecutar((repo) => repo.configuracion.guardar({ camposObligatorios }));
    setVersion((v) => v + 1);
  }

  async function alternarVacuna(tipo: TipoVacuna) {
    if (!actual) return;
    const vacunasObligatorias = actual.vacunasObligatorias.includes(tipo)
      ? actual.vacunasObligatorias.filter((v) => v !== tipo)
      : [...actual.vacunasObligatorias, tipo];

    await ejecutar((repo) =>
      repo.configuracion.guardar({ vacunasObligatorias }),
    );
    setVersion((v) => v + 1);
  }

  async function cambiarDuracion(tipo: TipoVacuna, meses: number) {
    if (!actual || meses <= 0) return;
    await ejecutar((repo) =>
      repo.configuracion.guardar({
        duracionVacunasMeses: {
          ...actual.duracionVacunasMeses,
          [tipo]: meses,
        },
      }),
    );
    setVersion((v) => v + 1);
  }

  async function guardarLista(lista: NombreDeCatalogo, valores: string[]) {
    if (!actual) return;
    await ejecutar((repo) =>
      repo.configuracion.guardar({
        catalogos: { ...actual.catalogos, [lista]: valores },
      }),
    );
    setVersion((v) => v + 1);
  }

  async function restaurar() {
    await ejecutar((repo) => repo.configuracion.restaurar());
    setVersion((v) => v + 1);
    toast.success("Volvimos a lo de siempre");
  }

  if (!actual) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Qué le pedimos</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Esto es lo que el dueño tiene que completar para crear la ficha de su
          perro. Lo que apagues acá sigue existiendo en el formulario, pero deja
          de ser obligatorio.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Syringe className="size-5" />
            Vacunas obligatorias
          </CardTitle>
          <p className="text-muted-foreground text-sm text-pretty">
            Se le pide el vencimiento de cada una, y un perro con alguna vencida
            no puede quedarse.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {NEGOCIO.admision.vacunasObligatorias.map((tipo) => (
            <div key={tipo} className="bg-secondary/40 space-y-2 rounded-xl p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-sm font-semibold capitalize">
                  {nombreVacuna(tipo)}
                </span>
                <Switch
                  checked={actual.vacunasObligatorias.includes(tipo)}
                  disabled={ocupado}
                  onCheckedChange={() => alternarVacuna(tipo)}
                />
              </label>
              <div className="flex items-center gap-2">
                <Label htmlFor={`duracion-${tipo}`} className="text-xs">
                  Dura
                </Label>
                <Input
                  id={`duracion-${tipo}`}
                  type="number"
                  inputMode="numeric"
                  className="h-9 w-20"
                  value={actual.duracionVacunasMeses[tipo]}
                  disabled={ocupado}
                  onChange={(e) =>
                    cambiarDuracion(tipo, Number(e.target.value))
                  }
                />
                <span className="text-muted-foreground text-xs">
                  meses desde que se pone
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            Datos obligatorios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CAMPOS.map((campo) => (
            <Opcion
              key={campo.valor}
              etiqueta={campo.etiqueta}
              ayuda={campo.ayuda}
              activa={actual.camposObligatorios.includes(campo.valor)}
              ocupado={ocupado}
              onCambio={() => alternarCampo(campo.valor)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <List className="size-5" />
            Las listas que ve el dueño
          </CardTitle>
          <p className="text-muted-foreground text-sm text-pretty">
            Lo que no esté acá igual se puede escribir a mano con la opción
            &ldquo;Otra&rdquo;, así que nadie se queda trancado.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {LISTAS.map((lista) => (
            <EditorDeLista
              key={lista.valor}
              etiqueta={lista.etiqueta}
              ayuda={lista.ayuda}
              placeholder={lista.placeholder}
              valores={actual.catalogos[lista.valor]}
              ocupado={ocupado}
              onCambio={(valores) => guardarLista(lista.valor, valores)}
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Save className="size-3.5 shrink-0" />
          Se guarda solo. Última vez:{" "}
          {formatearFechaLarga(actual.actualizadoEn)}.
        </p>
        <Button variant="outline" disabled={ocupado} onClick={restaurar}>
          <RotateCcw />
          Volver a lo de siempre
        </Button>
      </div>
    </div>
  );
}

function Opcion({
  etiqueta,
  ayuda,
  activa,
  ocupado,
  onCambio,
}: {
  etiqueta: string;
  ayuda?: string;
  activa: boolean;
  ocupado: boolean;
  onCambio: () => void;
}) {
  return (
    <label className="bg-secondary/40 flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3">
      <span className="min-w-0 text-sm">
        <span className="block font-semibold capitalize">{etiqueta}</span>
        {ayuda && (
          <span className="text-muted-foreground block text-xs text-pretty">
            {ayuda}
          </span>
        )}
      </span>
      <Switch checked={activa} disabled={ocupado} onCheckedChange={onCambio} />
    </label>
  );
}

function EditorDeLista({
  etiqueta,
  ayuda,
  placeholder,
  valores,
  ocupado,
  onCambio,
}: {
  etiqueta: string;
  ayuda: string;
  placeholder: string;
  valores: string[];
  ocupado: boolean;
  onCambio: (valores: string[]) => void;
}) {
  const [nuevo, setNuevo] = useState("");

  function agregar() {
    const limpio = nuevo.trim();
    if (!limpio) return;
    // Sin repetidos: dos "Poodle" en la lista se ven como un error de la app.
    if (valores.some((v) => v.toLowerCase() === limpio.toLowerCase())) {
      toast.error(`${limpio} ya está en la lista.`);
      return;
    }
    onCambio([...valores, limpio].sort((a, b) => a.localeCompare(b, "es")));
    setNuevo("");
  }

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{etiqueta}</h3>
        <p className="text-muted-foreground text-xs text-pretty">{ayuda}</p>
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {valores.map((valor) => (
          <li
            key={valor}
            className="bg-secondary/60 flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-xs font-semibold"
          >
            {valor}
            <button
              type="button"
              aria-label={`Quitar ${valor}`}
              disabled={ocupado}
              onClick={() => onCambio(valores.filter((v) => v !== valor))}
              className="hover:bg-destructive/10 hover:text-destructive rounded-full p-1 transition-colors"
            >
              <X className="size-3" />
            </button>
          </li>
        ))}
        {valores.length === 0 && (
          <li className="text-muted-foreground text-xs">
            La lista está vacía: el dueño solo va a poder escribirla a mano.
          </li>
        )}
      </ul>

      <div className="flex gap-2">
        <Input
          value={nuevo}
          placeholder={placeholder}
          aria-label={`Agregar a ${etiqueta.toLowerCase()}`}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregar();
            }
          }}
        />
        <Button variant="outline" disabled={ocupado || !nuevo.trim()} onClick={agregar}>
          <Plus />
          Agregar
        </Button>
      </div>
    </section>
  );
}
