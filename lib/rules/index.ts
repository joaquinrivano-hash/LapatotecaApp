/**
 * Reglas de negocio de La Patoteca.
 *
 * Todo lo de acá son funciones PURAS: no leen el repositorio, no tocan
 * localStorage y no dependen del reloj salvo que se lo pases por parámetro.
 * Por eso se pueden testear de verdad, y por eso la UI nunca debe recalcular
 * un precio o un cupo por su cuenta.
 */

export * from "./admision";
export * from "./capacidad";
export * from "./cliente";
export * from "./cobro-mensual";
export * from "./descuentos";
export * from "./planes";
export * from "./precio-hotel";
export * from "./precio-jardin";
export * from "./servicios";
