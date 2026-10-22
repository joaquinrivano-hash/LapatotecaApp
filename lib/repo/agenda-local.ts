/**
 * Agendar, comprar, cancelar y mover, en el prototipo.
 *
 * Es la gemela de las funciones de
 * `supabase/migrations/20261022150000_cambios_de_agenda.sql` y
 * `20261022160000_planes_y_dia_de_prueba.sql`: mismas reglas,
 * mismo orden y los mismos rechazos. Allá existen porque el dueño no puede
 * tocar un cobro y el cambio tiene que pasar entero por la base; acá todo
 * vive en el navegador, así que es la misma secuencia escrita sobre las
 * colecciones.
 *
 * Si cambias una, cambia la otra. Los tests de `registro` y `reservas`
 * corren sobre esta; `supabase/pruebas/aislamiento.sh`, sobre aquella.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import { PRECIOS } from "@/lib/config/precios";
import { ErrorRepositorio } from "@/lib/repo/error";
import type { AgendaRepo, RepositorioPatoteca } from "@/lib/repo/tipos";
import { politicaDeCancelacion } from "@/lib/rules/dia-de-prueba";
import { comprarPlan, esDiaHabil, planVigente } from "@/lib/rules/planes";
import { calcularDevolucionJardin } from "@/lib/rules/precio-jardin";
import { fechaISO } from "@/lib/utils/fecha";
import type { EstadiaJardin, ID, Pago, PlanComprado } from "@/lib/types";

const ms = (instante: string) => new Date(instante).getTime();

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
    async agendarDiaDePrueba(perroId, horario, cotizacion, ahora) {
      const perro = await repo.perros.obtener(perroId);
      if (!perro) throw new ErrorRepositorio("No existe ese perro.");
      // Solo desde "pendiente": agendado ya lo tiene tomado, y aprobado o
      // rechazado ya pasó por la casa.
      if (perro.diaDePrueba.estado !== "pendiente") {
        throw new ErrorRepositorio("Este perrito ya tiene su día de prueba tomado.");
      }
      // Media jornada, ni más ni menos: un día de prueba de doce horas sería
      // un día completo al precio de la evaluación.
      if (
        ms(horario.inicio) <= ms(ahora) ||
        ms(horario.fin) - ms(horario.inicio) !==
          NEGOCIO.diaDePrueba.horasDeEstadia * 3_600_000 ||
        fechaISO(horario.inicio) !== horario.fecha
      ) {
        throw new ErrorRepositorio("Esa hora no sirve para el día de prueba.");
      }
      // La cotización es la que vio el dueño; lo que se cobra lo pone la
      // regla. Si no calzan, alguien la tocó en el camino.
      if (cotizacion.total !== PRECIOS.diaDePrueba) {
        throw new ErrorRepositorio("El precio del día de prueba no calza.");
      }

      const estadia = await repo.estadiasJardin.crear({
        clienteId: perro.clienteId,
        perroId,
        fecha: horario.fecha,
        inicioProgramado: horario.inicio,
        finProgramado: horario.fin,
        origen: "dia_de_prueba",
        estado: "esperada",
        cotizacion,
        creadaEn: ahora,
      });

      // Se cobra al agendar, y nace pendiente: Administración lo marca
      // pagado cuando llega la transferencia.
      const pago = await repo.pagos.crear({
        clienteId: perro.clienteId,
        concepto: "dia_de_prueba",
        referenciaId: estadia.id,
        monto: PRECIOS.diaDePrueba,
        estado: "pendiente",
        emitidoEn: ahora,
        venceEn: horario.fecha,
      });

      const agendado = await repo.perros.actualizar(perroId, {
        diaDePrueba: { estado: "agendado", fecha: horario.fecha },
      });

      return { estadia, pago, perro: agendado };
    },

    async agendarDiaConPlan(planId, horario, cotizacion, ahora) {
      const plan = await repo.planes.obtener(planId);
      if (!plan) throw new ErrorRepositorio("No existe ese plan.");
      if (!planVigente(plan, horario.fecha)) {
        throw new ErrorRepositorio("Ese plan ya no cubre ese día.");
      }
      if (NEGOCIO.planes.soloDiasHabiles && !esDiaHabil(horario.fecha)) {
        throw new ErrorRepositorio("Los días del plan se usan de lunes a viernes.");
      }
      if (
        horario.fecha < fechaISO(ahora) ||
        ms(horario.fin) <= ms(horario.inicio) ||
        fechaISO(horario.inicio) !== horario.fecha
      ) {
        throw new ErrorRepositorio("Esa hora no sirve para un día de jardín.");
      }
      // Un perro no tiene dos jornadas el mismo día, y menos dos días del pack.
      const delDia = await repo.estadiasJardin.porFecha(horario.fecha);
      if (
        delDia.some((e) => e.perroId === plan.perroId && e.estado !== "cancelada")
      ) {
        throw new ErrorRepositorio("Ese perro ya tiene el día agendado.");
      }

      // El día del pack se descuenta al AGENDAR, no cuando el perro llega. Y
      // van juntos: un día creado sin descontar sería gratis.
      const estadia = await repo.estadiasJardin.crear({
        clienteId: plan.clienteId,
        perroId: plan.perroId,
        fecha: horario.fecha,
        inicioProgramado: horario.inicio,
        finProgramado: horario.fin,
        origen: "plan",
        planId,
        estado: "esperada",
        cotizacion,
        creadaEn: ahora,
      });
      const descontado = await repo.planes.actualizar(planId, {
        diasUsados: plan.diasUsados + 1,
      });

      return { estadia, plan: descontado };
    },

    async comprarPlan(perroId, compra, ahora) {
      const perro = await repo.perros.obtener(perroId);
      if (!perro) throw new ErrorRepositorio("No existe ese perro.");

      const { plan, cerrados } = comprarPlan({
        id: "pendiente",
        clienteId: perro.clienteId,
        perroId,
        tipo: compra.tipo,
        dias: compra.dias,
        compradoEn: ahora,
        planesActuales: await repo.planes.porPerro(perroId),
      });

      // Los días no son acumulables: comprar uno nuevo cierra el anterior.
      if (cerrados.length > 0) await repo.planes.guardarVarios(cerrados);

      const { id: _descartado, ...sinId } = plan;
      void _descartado;
      const guardado = await repo.planes.crear(sinId);

      // Pendiente: no hay pasarela. El dueño transfiere y Administración lo
      // marca pagado, igual que el abono del hotel y el día suelto.
      const pago = await repo.pagos.crear({
        clienteId: perro.clienteId,
        concepto: "plan",
        referenciaId: guardado.id,
        monto: guardado.precio,
        estado: "pendiente",
        emitidoEn: ahora,
      });

      return { plan: guardado, pago };
    },

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
