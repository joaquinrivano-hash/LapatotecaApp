import { describe, expect, it } from "vitest";
import { extraerCambiosDeEstado } from "./webhook";

/** Un payload como el que manda Meta de verdad. */
const PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "123",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            statuses: [
              {
                id: "wamid.ABC",
                status: "delivered",
                recipient_id: "56911111111",
              },
              {
                id: "wamid.DEF",
                status: "read",
                recipient_id: "56922222222",
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("extraerCambiosDeEstado", () => {
  it("saca los estados del payload anidado", () => {
    const cambios = extraerCambiosDeEstado(PAYLOAD);
    expect(cambios).toHaveLength(2);
    expect(cambios[0]).toMatchObject({
      idProveedor: "wamid.ABC",
      estado: "entregado",
      destino: "56911111111",
    });
    expect(cambios[1].estado).toBe("leido");
  });

  it("traduce las fallas con su motivo", () => {
    const cambios = extraerCambiosDeEstado({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.XYZ",
                    status: "failed",
                    errors: [{ message: "El número no tiene WhatsApp." }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(cambios[0].estado).toBe("fallido");
    expect(cambios[0].error).toBe("El número no tiene WhatsApp.");
  });

  it("no se cae con payloads raros o vacíos", () => {
    expect(extraerCambiosDeEstado(null)).toEqual([]);
    expect(extraerCambiosDeEstado({})).toEqual([]);
    expect(extraerCambiosDeEstado({ entry: [{}] })).toEqual([]);
    expect(extraerCambiosDeEstado({ entry: [{ changes: [{}] }] })).toEqual([]);
  });

  it("ignora los eventos que no son cambio de estado", () => {
    const cambios = extraerCambiosDeEstado({
      entry: [{ changes: [{ value: { messages: [{ id: "x" }] } }] }],
    });
    expect(cambios).toEqual([]);
  });
});
