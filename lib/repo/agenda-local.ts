/**
 * Cancelar y mover lo agendado, en el prototipo.
 *
 * Es la gemela de las funciones de
 * `supabase/migrations/20261022150000_cambios_de_agenda.sql`: mismas reglas,
 * mismo orden y los mismos rechazos. Allá existen porque el dueño no puede
 * tocar un cobro y el cambio tiene que pasar entero por la base; acá todo
 * vive en el navegador, así que es la misma secuencia escrita sobre las
 * colecciones.
 *
 * Si cambias una, cambia la otra. Los tests de `registro` y `reservas`
 * corren sobre esta; `supabase/pruebas/aislamiento.sh`, sobre aquella.
 */

import { ErrorRepositorio } from "@/lib/repo/error";
import type { AgendaRepo, RepositorioPatoteca } from "@/lib/repo/tipos";
import { politicaDeCancelacion } from "@/lib/rules/dia-de-prueba";
import { calcularDevolucionJardin } from "@/lib/rules/precio-jardin";
import { fechaISO } from "@/lib/utils/fecha";
import type { EstadiaJardin, ID, Pago, PlanComprado } from "@/lib/types";

type Colecciones = Pick<
  RepositorioPatoteca,
  "estadiasJardin" | "pagos" | "perros" | "planes"
>;

/**
 * El cobro DEL DÍA de prueba: el primero que se emitió.
 *
 * Los que vienen después son cargos por moverlo encima de la hora, y esos no
 * se tocan al cancelar: cada aviso tardío se cobra, y cancelar después a
 * tiempo no borra el anterior.
 */
function cobroDelDia(pagos: Pago[], estadiaId: ID): Pago | undefined {
  return pagos
    .filter((p) => p.referenciaId === estadiaId && p.concepto === "dia_de_prueba")
    .sort(
      (a, b) =>
        a.emitidoEn.localeCompare(b.emitidoEn) || a.id.localeCompare(b.id),
    )[0];
}

export function crearAgendaLocal(repo: Colecciones): AgendaRepo {
  /** El día, si todavía se puede cambiar. Un perro que ya llegó, no. */
  async function esperada(
    estadiaId: ID,
    queSeHace: "cancelar" | "cambiar",
  ): Promise<EstadiaJardin> {
    const estadia = await repo.estadiasJardin.obtener(estadiaId);
    if (!estadia) throw new ErrorRepositorio("No existe ese día.");
    if (estadia.estado !== "esperada") {
      throw new ErrorRepositorio(`Ese día ya no se puede ${queSeHace}.`);
    }
    return estadia;
  }

  function exigirDiaDePrueba(estadia: EstadiaJardin): void {
    if (estadia.origen !== "dia_de_prueba") {
      throw new ErrorRepositorio("Ese día no es un día de prueba.");
    }
  }

  return {
    async cancelarDiaDePrueba(estadiaId, ahora) {
      const estadia = await esperada(estadiaId, "cancelar");
      exigirDiaDePrueba(estadia);

      const politica = politicaDeCancelacion(estadia.inicioProgramado, ahora);
      const cancelada = await repo.estadiasJardin.actualizar(estadiaId, {
        estado: "cancelada",
      });

      // Solo si sigue pendiente: anularlo ES la devolución. En cero se marca
      // reembolsado en vez de borrarse: un cobro que desaparece no deja
      // rastro de que existió, y la cobranza del mes tiene que poder
      // explicarse.
      const cobro = cobroDelDia(await repo.pagos.listar(), estadiaId);
      if (cobro?.estado === "pendiente") {
        await repo.pagos.actualizar(
          cobro.id,
          politica.costo > 0
            ? {
                monto: politica.costo,
                estado: "pendiente",
                pagadoEn: undefined,
                venceEn: fechaISO(ahora),
              }
            : {
                monto: 0,
                estado: "reembolsado",
                pagadoEn: undefined,
                venceEn: undefined,
              },
        );
      }

      await repo.perros.actualizar(estadia.perroId, {
        diaDePrueba: { estado: "pendiente" },
      });

      return { estadia: cancelada, politica };
    },

    async reprogramarDiaDePrueba(estadiaId, nuevo, ahora) {
      const estadia = await esperada(estadiaId, "cambiar");
      exigirDiaDePrueba(estadia);

      const ms = (instante: string) => new Date(instante).getTime();
      if (
        ms(nuevo.fin) <= ms(nuevo.inicio) ||
        ms(nuevo.inicio) <= ms(ahora) ||
        fechaISO(nuevo.inicio) !== nuevo.fecha
      ) {
        throw new ErrorRepositorio("Esa hora no sirve para el día de prueba.");
      }

      // El aviso se mide contra el día que se deja: lo que se pierde es el
      // cupo de ESE día, no el del nuevo.
      const politica = politicaDeCancelacion(estadia.inicioProgramado, ahora);

      const movida = await repo.estadiasJardin.actualizar(estadiaId, {
        fecha: nuevo.fecha,
        inicioProgramado: nuevo.inicio,
        finProgramado: nuevo.fin,
      });

      const cargo = politica.sinCosto
        ? null
        : await repo.pagos.crear({
            clienteId: estadia.clienteId,
            concepto: "dia_de_prueba",
            referenciaId: estadiaId,
            monto: politica.costo,
            estado: "pendiente",
            emitidoEn: ahora,
            venceEn: nuevo.fecha,
          });

      await repo.perros.actualizar(estadia.perroId, {
        diaDePrueba: { estado: "agendado", fecha: nuevo.fecha },
      });

      return { estadia: movida, politica, cargo };
    },

    async cancelarDiaDeJardin(estadiaId, ahora) {
      const estadia = await esperada(estadiaId, "cancelar");
      // El día de prueba tiene su propia regla (el cargo tardío) y deja al
      // perro en la fila. Cancelarlo por acá se saltaría las dos cosas.
      if (estadia.origen === "dia_de_prueba") {
        throw new ErrorRepositorio(
          "El día de prueba se cancela desde su propia pantalla.",
        );
      }

      const devolucion = calcularDevolucionJardin(estadia.inicioProgramado, ahora);
      const cancelada = await repo.estadiasJardin.actualizar(estadiaId, {
        estado: "cancelada",
      });

      // Fuera de plazo el día se pierde: el cobro queda como estaba y el día
      // del pack queda consumido. Devolverlo sería no tener política.
      if (!devolucion.devuelve) {
        return { estadia: cancelada, devolucion, aDevolver: 0, planDevuelto: null };
      }

      // Los dos casos no son el mismo, y confundirlos sería prometer una
      // transferencia que nunca va a llegar:
      //
      //   · Si el cobro estaba PENDIENTE, anularlo ya es la devolución. No hay
      //     plata que mover: se marca reembolsado en cero.
      //   · Si el cliente ALCANZÓ a pagar, la plata está en la casa y hay que
      //     devolverla. Se marca reembolsado conservando el monto, que es
      //     justamente lo que se le debe, y queda esperando la transferencia.
      //
      // En ninguno de los dos se borra: un cobro que desaparece no deja rastro
      // de que existió, y la cobranza del mes tiene que poder explicarse.
      let aDevolver = 0;
      for (const pago of await repo.pagos.listar()) {
        if (pago.referenciaId !== estadiaId) continue;

        if (pago.estado === "pendiente") {
          await repo.pagos.actualizar(pago.id, {
            monto: 0,
            estado: "reembolsado",
            pagadoEn: undefined,
            venceEn: undefined,
          });
        } else if (pago.estado === "pagado") {
          aDevolver += pago.monto;
          await repo.pagos.actualizar(pago.id, {
            estado: "reembolsado",
            venceEn: undefined,
          });
        }
      }

      // Si el día venía de un pack, vuelve al saldo: se descontó al agendar.
      let planDevuelto: PlanComprado | null = null;
      if (estadia.planId) {
        const plan = await repo.planes.obtener(estadia.planId);
        if (plan) {
          planDevuelto = await repo.planes.actualizar(plan.id, {
            diasUsados: Math.max(0, plan.diasUsados - 1),
          });
        }
      }

      return { estadia: cancelada, devolucion, aDevolver, planDevuelto };
    },
  };
}
