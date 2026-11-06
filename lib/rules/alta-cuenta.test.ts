import { describe, expect, it } from "vitest";
import {
  revisarDatosDelDueno,
  type DatosDelDuenoEnElAlta,
} from "@/lib/rules/alta-cuenta";

const completo: DatosDelDuenoEnElAlta = {
  nombre: "Camila",
  apellido: "Rojas",
  email: "camila@correo.cl",
  telefono: "+56987654321",
  direccionValida: true,
  clave: { clave: "patitas123", confirmacion: "patitas123" },
};

const campos = (datos: DatosDelDuenoEnElAlta) =>
  revisarDatosDelDueno(datos).map((f) => f.campo);

describe("revisarDatosDelDueno", () => {
  it("con todo completo no falta nada", () => {
    expect(revisarDatosDelDueno(completo)).toEqual([]);
  });

  // El punto de esto: decir TODO lo que falta de una vez, no solo lo primero.
  it("vacío, dice cada cosa que falta y no solo la primera", () => {
    expect(
      campos({
        nombre: "",
        apellido: " ",
        email: "",
        telefono: "",
        direccionValida: false,
        clave: { clave: "", confirmacion: "" },
      }),
    ).toEqual([
      "nombre",
      "apellido",
      "email",
      "clave",
      "confirmacion",
      "telefono",
      "direccion",
    ]);
  });

  it("un email sin arroba no pasa", () => {
    const [falta] = revisarDatosDelDueno({ ...completo, email: "camila.correo.cl" });
    expect(falta).toEqual({
      campo: "email",
      mensaje: "Revisa tu email: tiene que ser como nombre@correo.cl.",
    });
  });

  it("un WhatsApp que no es celular chileno lo dice distinto que uno vacío", () => {
    expect(revisarDatosDelDueno({ ...completo, telefono: "1234" })[0].mensaje).toBe(
      "Revisa tu WhatsApp: tiene que ser un celular chileno.",
    );
    expect(revisarDatosDelDueno({ ...completo, telefono: "" })[0].mensaje).toBe(
      "Falta tu WhatsApp.",
    );
  });

  it("una contraseña corta", () => {
    expect(
      revisarDatosDelDueno({
        ...completo,
        clave: { clave: "abc", confirmacion: "abc" },
      }),
    ).toEqual([
      { campo: "clave", mensaje: "La contraseña necesita al menos 6 caracteres." },
    ]);
  });

  it("dos contraseñas distintas", () => {
    expect(
      campos({ ...completo, clave: { clave: "patitas123", confirmacion: "patitas12" } }),
    ).toEqual(["confirmacion"]);
  });

  // En el prototipo no hay cuentas de acceso, así que no se pide contraseña.
  it("sin cuenta de verdad no pide contraseña", () => {
    expect(revisarDatosDelDueno({ ...completo, clave: undefined })).toEqual([]);
  });

  it("una dirección sin elegir de la lista falta", () => {
    expect(campos({ ...completo, direccionValida: false })).toEqual(["direccion"]);
  });
});
