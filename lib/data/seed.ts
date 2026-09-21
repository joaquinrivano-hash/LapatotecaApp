/**
 * Datos mock de La Patoteca.
 *
 * El seed es DETERMINISTA: con la misma semilla y el mismo día de referencia
 * salen exactamente los mismos datos. El día de referencia sí se mueve (por
 * defecto, hoy) para que el prototipo siempre muestre "los últimos 60 días" y
 * el dashboard no envejezca.
 *
 * Los precios no se inventan acá: cada estadía, reserva y servicio se cotiza
 * con las funciones de `lib/rules`, así que los datos siempre cuadran con las
 * reglas de negocio.
 */

import { NEGOCIO } from "@/lib/config/negocio";
import {
  APELLIDOS,
  CALLES,
  COMUNAS,
  DESCRIPCIONES_INCIDENTE,
  NOMBRES,
  NOMBRES_PERRO,
  NOTAS_PERRO,
  NOTAS_REPORTE,
  PRODUCTOS,
  RAZAS,
  STAFF,
} from "@/lib/data/catalogos";
import { crearAleatorio, SEMILLA_PATOTECA, type Aleatorio } from "@/lib/data/aleatorio";
import {
  ocupantesDeReservas,
  verificarCapacidad,
  type OcupanteRango,
} from "@/lib/rules/capacidad";
import { calcularPrecioHotel } from "@/lib/rules/precio-hotel";
import { calcularPrecioJardin } from "@/lib/rules/precio-jardin";
import { cotizarPaseo, cotizarSpa, cotizarTraslado } from "@/lib/rules/servicios";
import { crearPlanComprado, elegirPlanParaUsar } from "@/lib/rules/planes";
import {
  esFinDeSemana,
  fechaISO,
  hoyISO,
  instanteEn,
  mesISO,
  rangoFechas,
  sumarDias,
} from "@/lib/utils/fecha";
import type {
  Cliente,
  CuentaMensual,
  EstadiaJardin,
  FechaISO,
  Incidente,
  OrdenTienda,
  Pago,
  Perro,
  PlanComprado,
  Producto,
  Reporte,
  ReservaHotel,
  ServicioAgendado,
  Suscripcion,
  TipoIncidente,
  Vacuna,
} from "@/lib/types";

export interface DatosPatoteca {
  /** Día de referencia con el que se generó todo. */
  hoy: FechaISO;
  clientes: Cliente[];
  perros: Perro[];
  reservasHotel: ReservaHotel[];
  estadiasJardin: EstadiaJardin[];
  planes: PlanComprado[];
  suscripciones: Suscripcion[];
  servicios: ServicioAgendado[];
  pagos: Pago[];
  cuentasMensuales: CuentaMensual[];
  productos: Producto[];
  ordenes: OrdenTienda[];
  reportes: Reporte[];
  incidentes: Incidente[];
}

/** Días de historial hacia atrás y de agenda hacia adelante. */
export const DIAS_HISTORIAL = 60;
export const DIAS_AGENDA = 14;

const CANTIDAD_CLIENTES = 40;
const CANTIDAD_PERROS = 50;

const id = (prefijo: string, n: number) =>
  `${prefijo}-${String(n + 1).padStart(3, "0")}`;

/** Redondea minutos al múltiplo de 15 más cercano, como escribe una persona. */
const aCuartos = (minutos: number) => Math.round(minutos / 15) * 15;

/**
 * Muestra ponderada sin reemplazo (Efraimidis-Spirakis): los perros regulares
 * aparecen más seguido sin que ninguno quede fijo todos los días.
 */
function elegirPonderado<T>(
  azar: Aleatorio,
  candidatos: readonly T[],
  peso: (item: T) => number,
  n: number,
): T[] {
  return [...candidatos]
    .map((item) => ({
      item,
      clave: Math.pow(azar.siguiente(), 1 / Math.max(0.01, peso(item))),
    }))
    .sort((a, b) => b.clave - a.clave)
    .slice(0, n)
    .map((x) => x.item);
}

export function generarSeed(
  hoy: FechaISO = hoyISO(),
  semilla: number = SEMILLA_PATOTECA,
): DatosPatoteca {
  const azar = crearAleatorio(semilla);

  const primerDia = sumarDias(hoy, -(DIAS_HISTORIAL - 1));
  const ultimoDia = sumarDias(hoy, DIAS_AGENDA);
  const dias = rangoFechas(primerDia, ultimoDia);

  /* ── Clientes ───────────────────────────────────────────────────── */

  const clientes: Cliente[] = Array.from(
    { length: CANTIDAD_CLIENTES },
    (_, i) => {
      const nombre = NOMBRES[i % NOMBRES.length];
      const apellido = azar.elegir(APELLIDOS);
      return {
        id: id("cli", i),
        nombre,
        apellido,
        email: `${nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${apellido.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@correo.cl`,
        telefono: `+569 ${azar.entero(4000, 9999)} ${azar.entero(1000, 9999)}`,
        comuna: azar.elegir(COMUNAS),
        direccion: `${azar.elegir(CALLES)} ${azar.entero(100, 3500)}`,
        creadoEn: instanteEn(
          sumarDias(primerDia, -azar.entero(30, 500)),
          azar.entero(9, 19) * 60,
        ),
      };
    },
  );

  /* ── Perros ─────────────────────────────────────────────────────── */

  // 30 clientes con un perro y 10 con dos: 50 perros en total.
  const duenos: string[] = [];
  for (let i = 0; i < CANTIDAD_CLIENTES; i++) {
    duenos.push(clientes[i].id);
    if (i < CANTIDAD_PERROS - CANTIDAD_CLIENTES) duenos.push(clientes[i].id);
  }

  const nombresPerro = azar.barajar(NOMBRES_PERRO);

  function generarVacunas(indice: number): Vacuna[] {
    // 8 de cada 10 al día; unos pocos por vencer y unos pocos vencidos, para
    // que el backoffice tenga alertas reales que mostrar.
    const estado =
      indice % 10 === 3 ? "vencida" : indice % 10 === 7 ? "por_vencer" : "ok";

    return NEGOCIO.admision.vacunasObligatorias.map((tipo) => {
      const diasHastaVencer =
        estado === "vencida"
          ? -azar.entero(3, 45)
          : estado === "por_vencer"
            ? azar.entero(4, 26)
            : azar.entero(70, 320);

      const fechaVencimiento = sumarDias(hoy, diasHastaVencer);
      return {
        tipo,
        fechaAplicacion: sumarDias(fechaVencimiento, -365),
        fechaVencimiento,
      };
    });
  }

  const perros: Perro[] = duenos.map((clienteId, i) => {
    const raza = azar.elegir(RAZAS);

    // Los últimos 6 perros todavía no pasan el día de prueba: son los que
    // dejan ver el flujo de admisión sin historial.
    const nuevo = i >= CANTIDAD_PERROS - 6;

    // Dos de ellos son machos sin esterilizar, para que la alerta de admisión
    // tenga casos reales. Van entre los nuevos a propósito: un perro con 60
    // días de historial no pudo haber entrado sin cumplir el requisito.
    const machoSinEsterilizar =
      i === CANTIDAD_PERROS - 5 || i === CANTIDAD_PERROS - 2;

    const sexo = machoSinEsterilizar
      ? ("macho" as const)
      : azar.probabilidad(0.5)
        ? ("macho" as const)
        : ("hembra" as const);
    const diaDePrueba = nuevo
      ? azar.probabilidad(0.5)
        ? { estado: "pendiente" as const }
        : {
            estado: "agendado" as const,
            fecha: sumarDias(hoy, azar.entero(1, 10)),
          }
      : {
          estado: "aprobado" as const,
          fecha: sumarDias(primerDia, -azar.entero(5, 200)),
        };

    return {
      id: id("perro", i),
      clienteId,
      nombre: nombresPerro[i % nombresPerro.length],
      raza: raza.nombre,
      pesoKg: azar.decimal(raza.pesoMin, raza.pesoMax, 1),
      sexo,
      esterilizado: machoSinEsterilizar
        ? false
        : sexo === "hembra"
          ? azar.probabilidad(0.8)
          : true,
      fechaNacimiento: sumarDias(hoy, -azar.entero(365, 4_400)),
      vacunas: generarVacunas(i),
      diaDePrueba,
      notas: azar.probabilidad(0.6) ? azar.elegir(NOTAS_PERRO) : undefined,
      creadoEn: instanteEn(
        sumarDias(primerDia, -azar.entero(10, 400)),
        azar.entero(9, 19) * 60,
      ),
    };
  });

  const perrosActivos = perros.filter((p) => p.diaDePrueba.estado === "aprobado");

  /** Qué tan seguido viene cada perro al jardín. Los regulares mandan. */
  const frecuencia = new Map<string, number>(
    perrosActivos.map((p, i) => [p.id, i % 5 === 0 ? 5 : i % 3 === 0 ? 3 : 1]),
  );

  /* ── Planes y suscripciones ─────────────────────────────────────── */

  const planes: PlanComprado[] = [];
  const suscripciones: Suscripcion[] = [];
  const pagos: Pago[] = [];
  let contadorPago = 0;

  const nuevoPago = (
    datos: Omit<Pago, "id">,
  ): Pago => {
    const pago = { id: id("pago", contadorPago++), ...datos };
    pagos.push(pago);
    return pago;
  };

  // Los 18 perros más regulares compran planes.
  const conPlan = [...perrosActivos]
    .sort((a, b) => (frecuencia.get(b.id) ?? 0) - (frecuencia.get(a.id) ?? 0))
    .slice(0, 18);

  conPlan.forEach((perro, i) => {
    const tipo = i % 3 === 0 ? "p20" : "p5";
    // Compras repartidas en los 60 días: unos vigentes, otros ya vencidos.
    const compras = tipo === "p20" ? 2 : 3;

    for (let c = 0; c < compras; c++) {
      const diaCompra = sumarDias(
        primerDia,
        Math.floor((DIAS_HISTORIAL / compras) * c) + azar.entero(0, 4),
      );
      const compradoEn = instanteEn(diaCompra, azar.entero(9, 19) * 60);
      const plan = crearPlanComprado({
        id: id("plan", planes.length),
        clienteId: perro.clienteId,
        perroId: perro.id,
        tipo,
        compradoEn,
      });
      planes.push(plan);

      nuevoPago({
        clienteId: perro.clienteId,
        concepto: "plan",
        referenciaId: plan.id,
        monto: plan.precio,
        estado: "pagado",
        metodo: azar.elegir(["webpay", "transferencia"] as const),
        emitidoEn: compradoEn,
        pagadoEn: compradoEn,
      });
    }

    // Un tercio de los del plan de 20 lo tiene como suscripción recurrente.
    if (tipo === "p20" && i % 2 === 0) {
      const periodoActual = mesISO(instanteEn(hoy, 12 * 60));
      const [a, m] = periodoActual.split("-").map(Number);
      const proximo =
        m === 12
          ? `${a + 1}-01-01`
          : `${a}-${String(m + 1).padStart(2, "0")}-01`;

      suscripciones.push({
        id: id("susc", suscripciones.length),
        clienteId: perro.clienteId,
        perroId: perro.id,
        tipo: "p20",
        estado: azar.probabilidad(0.85) ? "activa" : "pausada",
        creadaEn: instanteEn(sumarDias(primerDia, -azar.entero(30, 120)), 10 * 60),
        proximoCobro: proximo,
      });
    }
  });

  /* ── Hotel ──────────────────────────────────────────────────────── */

  const reservasHotel: ReservaHotel[] = [];

  /** Un perro está en hotel la noche de `fecha` si su estadía la cubre. */
  const enHotel = (perroId: string, fecha: FechaISO) =>
    reservasHotel.some(
      (r) =>
        r.perroId === perroId &&
        fechaISO(r.inicioProgramado) <= fecha &&
        fecha < fechaISO(r.finProgramado),
    );

  /** Tope duro de perros alojados por día, según el patrón del negocio. */
  const topeHotel = (fecha: FechaISO) => (esFinDeSemana(fecha) ? 7 : 4);

  const ocupacionHotel = (fecha: FechaISO) =>
    reservasHotel.filter(
      (r) =>
        fechaISO(r.inicioProgramado) <= fecha &&
        fecha < fechaISO(r.finProgramado),
    ).length;

  /** Cuántos perros del mismo dueño ya tienen algo ese día: da el -20%. */
  const perrosDelDuenoEseDia = new Map<string, number>();
  const claveDueno = (clienteId: string, fecha: FechaISO) =>
    `${clienteId}|${fecha}`;

  const tomarIndicePerro = (clienteId: string, fecha: FechaISO) => {
    const clave = claveDueno(clienteId, fecha);
    const indice = perrosDelDuenoEseDia.get(clave) ?? 0;
    perrosDelDuenoEseDia.set(clave, indice + 1);
    return indice;
  };

  for (const fecha of dias) {
    const finde = esFinDeSemana(fecha);
    const objetivo = finde ? azar.entero(6, 7) : azar.entero(3, 4);
    const faltan = objetivo - ocupacionHotel(fecha);
    if (faltan <= 0) continue;

    const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    const candidatos = perrosActivos.filter((p) => !enHotel(p.id, fecha));

    for (const perro of azar.elegirVarios(candidatos, faltan)) {
      // Las estadías de fin de semana terminan el domingo o el lunes: por eso
      // el lunes el hotel vuelve a estar tranquilo.
      const nochesDeseadas =
        diaSemana === 5
          ? azar.entero(2, 3)
          : diaSemana === 6
            ? azar.entero(1, 2)
            : azar.entero(1, 3);

      // Una estadía larga arrastra su ocupación a los días siguientes, y un
      // domingo de 3 noches deja el martes con lleno de fin de semana. Se
      // acorta hasta que quepa en el tope de cada día que toca.
      let noches = nochesDeseadas;
      while (
        noches > 1 &&
        rangoFechas(fecha, sumarDias(fecha, noches - 1)).some(
          (d) => ocupacionHotel(d) + 1 > topeHotel(d),
        )
      ) {
        noches -= 1;
      }

      const fechaFin = sumarDias(fecha, noches);
      const inicioProgramado = instanteEn(fecha, aCuartos(azar.entero(540, 720)));
      const finProgramado = instanteEn(fechaFin, aCuartos(azar.entero(540, 720)));
      const paseosContratados = azar.probabilidad(0.35)
        ? azar.entero(1, noches)
        : 0;

      const indicePerro = tomarIndicePerro(perro.clienteId, fecha);
      const cotizacion = calcularPrecioHotel({
        inicio: inicioProgramado,
        fin: finProgramado,
        paseosContratados,
        indicePerro,
      });

      const yaTermino = fechaFin < hoy;
      const enCurso = fecha <= hoy && hoy < fechaFin;

      const reserva: ReservaHotel = {
        id: id("res", reservasHotel.length),
        clienteId: perro.clienteId,
        perroId: perro.id,
        inicioProgramado,
        finProgramado,
        inicioReal:
          yaTermino || enCurso
            ? instanteEn(fecha, aCuartos(azar.entero(540, 750)))
            : undefined,
        finReal: yaTermino
          ? instanteEn(fechaFin, aCuartos(azar.entero(540, 780)))
          : undefined,
        paseosContratados,
        estado: yaTermino
          ? "finalizada"
          : enCurso
            ? "en_curso"
            : azar.probabilidad(0.85)
              ? "confirmada"
              : "pendiente",
        cotizacion,
        abonoPagado: true,
        creadaEn: instanteEn(
          sumarDias(fecha, -azar.entero(3, 25)),
          azar.entero(9, 21) * 60,
        ),
      };
      reservasHotel.push(reserva);

      const abono = cotizacion.abono ?? 0;
      nuevoPago({
        clienteId: perro.clienteId,
        concepto: "abono_hotel",
        referenciaId: reserva.id,
        monto: abono,
        estado: "pagado",
        metodo: "webpay",
        emitidoEn: reserva.creadaEn,
        pagadoEn: reserva.creadaEn,
      });

      const saldo = cotizacion.total - abono;
      if (saldo > 0) {
        const cobrado = yaTermino && azar.probabilidad(0.85);
        nuevoPago({
          clienteId: perro.clienteId,
          concepto: "saldo_hotel",
          referenciaId: reserva.id,
          monto: saldo,
          estado: cobrado ? "pagado" : "pendiente",
          metodo: cobrado
            ? azar.elegir(["webpay", "transferencia", "efectivo"] as const)
            : undefined,
          emitidoEn: finProgramado,
          venceEn: sumarDias(fechaFin, 5),
          pagadoEn: cobrado ? finProgramado : undefined,
        });
      }
    }
  }

  /* ── Jardín ─────────────────────────────────────────────────────── */

  const estadiasJardin: EstadiaJardin[] = [];

  // El hotel ya está generado entero, así que sus ocupantes se calculan una
  // sola vez y después solo se filtran por día.
  const ocupantesHotel = ocupantesDeReservas(reservasHotel);

  const planesPorPerro = new Map<string, PlanComprado[]>();
  for (const plan of planes) {
    planesPorPerro.set(plan.perroId, [
      ...(planesPorPerro.get(plan.perroId) ?? []),
      plan,
    ]);
  }

  for (const fecha of dias) {
    const finde = esFinDeSemana(fecha);
    const objetivo = finde ? azar.entero(2, 4) : azar.entero(15, 18);
    const candidatos = perrosActivos.filter((p) => !enHotel(p.id, fecha));

    const elegidos = elegirPonderado(
      azar,
      candidatos,
      (p) => frecuencia.get(p.id) ?? 1,
      objetivo,
    );

    // El jardín se genera después del hotel, así que acá ya sabemos quién está
    // alojado ese día y podemos respetar el tope de 25. Sin esto el seed
    // podría arrancar con un día sobrevendido, justo lo que la regla más
    // importante del sistema prohíbe.
    //
    // El filtro va por traslape real, no por noche: el perro que hace
    // check-out a las 12:00 ocupa toda la mañana de ese día.
    const inicioDelDia = new Date(instanteEn(fecha, 0)).getTime();
    const finDelDia = new Date(instanteEn(sumarDias(fecha, 1), 0)).getTime();

    const ocupantesDelDia: OcupanteRango[] = ocupantesHotel.filter(
      (o) =>
        new Date(o.inicio).getTime() < finDelDia &&
        new Date(o.fin).getTime() > inicioDelDia,
    );

    for (const perro of elegidos) {
      const jornadaCorta = azar.probabilidad(0.18);
      const llegadaMin = jornadaCorta
        ? aCuartos(azar.entero(8 * 60 + 30, 10 * 60 + 30))
        : aCuartos(azar.entero(7 * 60 + 30, 9 * 60 + 30));
      const salidaMin = jornadaCorta
        ? llegadaMin + aCuartos(azar.entero(180, 345))
        : aCuartos(azar.entero(16 * 60 + 30, 18 * 60 + 45));

      const inicioProgramado = instanteEn(fecha, llegadaMin);
      const finProgramado = instanteEn(fecha, salidaMin);

      const planDisponible = elegirPlanParaUsar(
        planesPorPerro.get(perro.id) ?? [],
        perro.id,
        fecha,
      );
      const origen = planDisponible ? "plan" : "dia_suelto";

      if (planDisponible) {
        planDisponible.diasUsados += 1;
      }

      const esPasado = fecha < hoy;
      const esHoy = fecha === hoy;

      // Uno de cada doce lo retiran tarde: alimenta el recargo fuera de horario.
      const retiroTarde = esPasado && azar.probabilidad(0.08);
      const finReal = esPasado
        ? instanteEn(
            fecha,
            retiroTarde
              ? aCuartos(azar.entero(19 * 60 + 20, 20 * 60 + 45))
              : salidaMin + aCuartos(azar.entero(-20, 20)),
          )
        : undefined;

      const inicioReal =
        esPasado || (esHoy && azar.probabilidad(0.7))
          ? instanteEn(fecha, llegadaMin + aCuartos(azar.entero(-15, 25)))
          : undefined;

      const candidato: OcupanteRango = {
        perroId: perro.id,
        linea: "jardin",
        inicio: inicioReal ?? inicioProgramado,
        fin: finReal ?? finProgramado,
      };

      if (!verificarCapacidad([candidato], ocupantesDelDia).hayCupo) {
        if (planDisponible) planDisponible.diasUsados -= 1;
        continue;
      }
      ocupantesDelDia.push(candidato);

      const indicePerro = tomarIndicePerro(perro.clienteId, fecha);
      const cotizacion = calcularPrecioJardin({
        inicio: candidato.inicio,
        fin: candidato.fin,
        origen,
        indicePerro,
      });

      const estadia: EstadiaJardin = {
        id: id("est", estadiasJardin.length),
        clienteId: perro.clienteId,
        perroId: perro.id,
        fecha,
        inicioProgramado,
        finProgramado,
        inicioReal,
        finReal,
        origen,
        planId: planDisponible?.id,
        estado: esPasado ? "finalizada" : inicioReal ? "presente" : "esperada",
        cotizacion,
        creadaEn: instanteEn(
          sumarDias(fecha, -azar.entero(0, 6)),
          azar.entero(8, 21) * 60,
        ),
      };
      estadiasJardin.push(estadia);

      if (cotizacion.total > 0 && esPasado) {
        const cobrado = azar.probabilidad(0.88);
        nuevoPago({
          clienteId: perro.clienteId,
          concepto: "dia_suelto",
          referenciaId: estadia.id,
          monto: cotizacion.total,
          estado: cobrado ? "pagado" : "pendiente",
          metodo: cobrado
            ? azar.elegir(["webpay", "transferencia", "efectivo"] as const)
            : undefined,
          emitidoEn: finReal ?? finProgramado,
          venceEn: sumarDias(fecha, 10),
          pagadoEn: cobrado ? (finReal ?? finProgramado) : undefined,
        });
      }
    }
  }

  /* ── Día de prueba de los perros nuevos ─────────────────────────── */

  for (const perro of perros) {
    if (perro.diaDePrueba.estado !== "agendado" || !perro.diaDePrueba.fecha) {
      continue;
    }
    const fecha = perro.diaDePrueba.fecha;
    const inicioProgramado = instanteEn(fecha, 9 * 60);
    const finProgramado = instanteEn(fecha, 13 * 60);

    estadiasJardin.push({
      id: id("est", estadiasJardin.length),
      clienteId: perro.clienteId,
      perroId: perro.id,
      fecha,
      inicioProgramado,
      finProgramado,
      origen: "dia_de_prueba",
      estado: "esperada",
      cotizacion: calcularPrecioJardin({
        inicio: inicioProgramado,
        fin: finProgramado,
        origen: "dia_de_prueba",
      }),
      creadaEn: instanteEn(sumarDias(fecha, -azar.entero(1, 8)), 11 * 60),
    });
  }

  /* ── Servicios spot ─────────────────────────────────────────────── */

  const servicios: ServicioAgendado[] = [];

  for (let i = 0; i < 55; i++) {
    const perro = azar.elegir(perrosActivos);
    const fecha = sumarDias(primerDia, azar.entero(0, DIAS_HISTORIAL + 6));
    const tipo = azar.elegir(["spa", "spa", "paseo", "paseo", "traslado"] as const);
    const fechaHora = instanteEn(fecha, aCuartos(azar.entero(8 * 60, 19 * 60)));

    // Cliente activo: tiene plan vigente o vino hace poco. En el seed casi
    // todos los que piden servicios son habituales.
    const esClienteActivo = azar.probabilidad(0.7);

    let cotizacion;
    let nivelSpa;
    let duracionMin;
    let km;

    if (tipo === "spa") {
      nivelSpa = azar.probabilidad(0.65) ? ("express" as const) : ("premium" as const);
      cotizacion = cotizarSpa({
        pesoKg: perro.pesoKg,
        nivel: nivelSpa,
        esClienteActivo,
      });
    } else if (tipo === "paseo") {
      duracionMin = azar.probabilidad(0.6) ? (30 as const) : (60 as const);
      cotizacion = cotizarPaseo({ duracionMin, esClienteActivo });
    } else {
      km = azar.decimal(1.5, 18, 1);
      cotizacion = cotizarTraslado({ km, fechaHora });
    }

    const esPasado = fecha < hoy;
    const servicio: ServicioAgendado = {
      id: id("serv", i),
      clienteId: perro.clienteId,
      perroId: perro.id,
      tipo,
      fechaHora,
      nivelSpa,
      duracionMin,
      km,
      estado: esPasado
        ? azar.probabilidad(0.93)
          ? "realizado"
          : "cancelado"
        : "agendado",
      cotizacion,
      creadoEn: instanteEn(sumarDias(fecha, -azar.entero(1, 12)), 10 * 60),
    };
    servicios.push(servicio);

    if (servicio.estado === "realizado") {
      const cobrado = azar.probabilidad(0.9);
      nuevoPago({
        clienteId: perro.clienteId,
        concepto: "servicio",
        referenciaId: servicio.id,
        monto: cotizacion.total,
        estado: cobrado ? "pagado" : "pendiente",
        metodo: cobrado ? azar.elegir(["webpay", "efectivo"] as const) : undefined,
        emitidoEn: fechaHora,
        venceEn: sumarDias(fecha, 10),
        pagadoEn: cobrado ? fechaHora : undefined,
      });
    }
  }

  /* ── Tienda ─────────────────────────────────────────────────────── */

  const productos: Producto[] = PRODUCTOS.map((p, i) => ({
    id: id("prod", i),
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: p.categoria,
    precio: p.precio,
    // Un par en cero y un par bajos, para que el inventario tenga alertas.
    stock: i % 8 === 3 ? 0 : i % 5 === 1 ? azar.entero(1, 3) : azar.entero(6, 40),
    activo: true,
  }));

  const ordenes: OrdenTienda[] = Array.from({ length: 28 }, (_, i) => {
    const cliente = azar.elegir(clientes);
    const fecha = sumarDias(primerDia, azar.entero(0, DIAS_HISTORIAL - 1));
    const creadaEn = instanteEn(fecha, aCuartos(azar.entero(9 * 60, 20 * 60)));

    const items = azar.elegirVarios(productos, azar.entero(1, 3)).map((p) => ({
      productoId: p.id,
      nombre: p.nombre,
      cantidad: azar.entero(1, 2),
      precioUnitario: p.precio,
    }));

    const total = items.reduce((s, it) => s + it.precioUnitario * it.cantidad, 0);
    const estado = azar.probabilidad(0.75)
      ? ("entregada" as const)
      : azar.probabilidad(0.7)
        ? ("pagada" as const)
        : ("pendiente" as const);

    const orden: OrdenTienda = {
      id: id("orden", i),
      clienteId: cliente.id,
      items,
      total,
      estado,
      creadaEn,
    };

    nuevoPago({
      clienteId: cliente.id,
      concepto: "tienda",
      referenciaId: orden.id,
      monto: total,
      estado: estado === "pendiente" ? "pendiente" : "pagado",
      metodo: estado === "pendiente" ? undefined : "webpay",
      emitidoEn: creadaEn,
      venceEn: sumarDias(fecha, 7),
      pagadoEn: estado === "pendiente" ? undefined : creadaEn,
    });

    return orden;
  });

  /* ── Reportes e incidentes ──────────────────────────────────────── */

  const reportes: Reporte[] = [];
  const diasPasados = rangoFechas(primerDia, hoy);

  for (const fecha of diasPasados) {
    const presentes = estadiasJardin
      .filter((e) => e.fecha === fecha && e.estado !== "cancelada")
      .map((e) => e.perroId);
    if (presentes.length === 0) continue;

    for (let i = 0; i < azar.entero(1, 3); i++) {
      reportes.push({
        id: id("rep", reportes.length),
        perroIds: azar.elegirVarios(presentes, azar.entero(1, 4)),
        fecha,
        nota: azar.elegir(NOTAS_REPORTE),
        autorStaff: azar.elegir(STAFF),
        creadoEn: instanteEn(fecha, aCuartos(azar.entero(12 * 60, 18 * 60))),
      });
    }
  }

  const incidentes: Incidente[] = Array.from({ length: 14 }, (_, i) => {
    const fecha = azar.elegir(diasPasados);
    const delDia = estadiasJardin.filter((e) => e.fecha === fecha);
    const perroId =
      delDia.length > 0
        ? azar.elegir(delDia).perroId
        : azar.elegir(perrosActivos).id;

    const tipo = azar.elegir([
      "comportamiento",
      "comportamiento",
      "salud",
      "pelea",
      "escape",
      "otro",
    ] as const) as TipoIncidente;

    return {
      id: id("inc", i),
      perroId,
      fecha,
      tipo,
      gravedad: azar.probabilidad(0.7)
        ? "leve"
        : azar.probabilidad(0.75)
          ? "moderado"
          : "grave",
      descripcion: azar.elegir(DESCRIPCIONES_INCIDENTE[tipo]),
      autorStaff: azar.elegir(STAFF),
      creadoEn: instanteEn(fecha, aCuartos(azar.entero(10 * 60, 19 * 60))),
    };
  });

  return {
    hoy,
    clientes,
    perros,
    reservasHotel,
    estadiasJardin,
    planes,
    suscripciones,
    servicios,
    pagos,
    cuentasMensuales: [],
    productos,
    ordenes,
    reportes,
    incidentes,
  };
}
