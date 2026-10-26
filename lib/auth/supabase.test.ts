/**
 * La identidad que se arma desde una sesión de Supabase.
 *
 * Sin red: el cliente es un doble. Lo que se verifica es lo que decide qué
 * se dibuja y lo que podría dibujar de más.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { crearAutenticacionSupabase, explicarAuth } from "@/lib/auth/supabase";
import { clienteFalso, type Responder } from "@/lib/repo/supabase/falso";
import type { ClienteSupabase } from "@/lib/repo/supabase/cliente";

type Auth = Partial<ClienteSupabase["auth"]>;

/** Un cliente con tablas falsas y una sesión falsa. */
function doble(auth: Auth, responder?: Responder) {
  const falso = clienteFalso(responder);
  const cliente = {
    from: (falso.cliente as ClienteSupabase).from,
    rpc: (falso.cliente as ClienteSupabase).rpc,
    auth,
  } as unknown as ClienteSupabase;
  return { ...falso, auth: crearAutenticacionSupabase(cliente) };
}

const usuario = { id: "uuid-u", email: "javiera@ejemplo.cl" };

/** Responde la fila de `perfiles` y la de `clientes`. */
const tablas =
  (perfil: unknown, ficha: unknown): Responder =>
  ({ tabla }) =>
    tabla === "perfiles" ? { data: perfil } : { data: ficha };

describe("explicarAuth", () => {
  it("traduce lo que la persona puede arreglar", () => {
    expect(explicarAuth({ message: "Invalid login credentials" })).toMatch(
      /no calzan/,
    );
    expect(explicarAuth({ message: "Email not confirmed" })).toMatch(
      /confirmaste tu correo/,
    );
    expect(explicarAuth({ message: "User already registered" })).toMatch(
      /Ya hay una cuenta/,
    );
    expect(
      explicarAuth({ message: "Password should be at least 6 characters" }),
    ).toMatch(/6 caracteres/);
  });

  /*
   * Supabase DESHACE el registro cuando el correo falla: después de varios
   * intentos fallidos no quedó ninguna cuenta huérfana en la tabla de
   * usuarios. Por eso el mensaje tiene que invitar a reintentar, que es lo
   * único que funciona, y NO puede decir que la cuenta ya existe: dejaría a
   * la persona esperando un correo de una cuenta que no se creó.
   */
  it("el correo que no salió invita a reintentar y no promete una cuenta", () => {
    const m = explicarAuth({ message: "Error sending confirmation email" });
    expect(m).toMatch(/no pudimos mandarte el correo/i);
    expect(m).toMatch(/vuelve a intentarlo/i);
    expect(m).not.toMatch(/ya existe/i);
  });

  it("deja pasar lo que no sabe traducir, en vez de inventar", () => {
    expect(explicarAuth({ message: "algo rarísimo del servidor" })).toBe(
      "algo rarísimo del servidor",
    );
  });
});

describe("actual", () => {
  // getSession lee la cookie sin verificarla contra el servidor, así que un
  // token vencido o manipulado pasaría como válido para decidir qué dibujar.
  it("verifica contra el servidor y no solo la cookie", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: usuario } });
    const getSession = vi.fn();
    const { auth } = doble({ getUser, getSession } as Auth, tablas(null, null));

    await auth.actual();

    expect(getUser).toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("responde null cuando no hay nadie", async () => {
    const { auth } = doble({
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    } as Auth);

    await expect(auth.actual()).resolves.toBeNull();
  });

  it("junta el rol del perfil con la ficha del cliente", async () => {
    const { auth } = doble(
      {
        getUser: vi.fn().mockResolvedValue({ data: { user: usuario } }),
      } as Auth,
      tablas({ rol: "cliente", nombre: "Javiera" }, { id: "uuid-c" }),
    );

    const identidad = await auth.actual();

    expect(identidad).toMatchObject({
      usuarioId: "uuid-u",
      email: "javiera@ejemplo.cl",
      rol: "cliente",
      clienteId: "uuid-c",
    });
    // Un dueño no firma reportes.
    expect(identidad?.staff).toBeUndefined();
  });

  it("al que trabaja acá le da con qué firmar", async () => {
    const { auth } = doble(
      {
        getUser: vi.fn().mockResolvedValue({ data: { user: usuario } }),
      } as Auth,
      tablas({ rol: "staff", nombre: "María" }, null),
    );

    const identidad = await auth.actual();
    expect(identidad?.rol).toBe("staff");
    expect(identidad?.staff).toBe("María");
  });

  // Una firma vacía en un reporte es peor que un correo feo.
  it("si el perfil no trae nombre, firma con el correo", async () => {
    const { auth } = doble(
      {
        getUser: vi.fn().mockResolvedValue({ data: { user: usuario } }),
      } as Auth,
      tablas({ rol: "staff", nombre: "   " }, null),
    );

    const identidad = await auth.actual();
    expect(identidad?.staff).toBe("javiera@ejemplo.cl");
  });

  // Equivocarse hacia abajo esconde un botón; hacia arriba dibuja un
  // backoffice completo a alguien que no le corresponde.
  it("un rol que no reconocemos cae a cliente, nunca a admin", async () => {
    for (const rol of ["superadmin", "", null, undefined, "ADMIN"]) {
      const { auth } = doble(
        {
          getUser: vi.fn().mockResolvedValue({ data: { user: usuario } }),
        } as Auth,
        tablas({ rol }, null),
      );
      await expect(auth.actual().then((i) => i?.rol)).resolves.toBe("cliente");
    }
  });

  it("sin fila en perfiles tampoco asume nada", async () => {
    const { auth } = doble(
      {
        getUser: vi.fn().mockResolvedValue({ data: { user: usuario } }),
      } as Auth,
      tablas(null, null),
    );
    await expect(auth.actual().then((i) => i?.rol)).resolves.toBe("cliente");
  });
});

describe("entrar", () => {
  it("normaliza el correo antes de mandarlo", async () => {
    const signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { user: usuario } });
    const { auth } = doble({ signInWithPassword } as Auth, tablas(null, null));

    await auth.entrar("  Javiera@Ejemplo.CL ", "secreta");

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "javiera@ejemplo.cl",
      password: "secreta",
    });
  });

  it("falla con el mensaje traducido", async () => {
    const { auth } = doble({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ error: { message: "Invalid login credentials" } }),
    } as Auth);

    await expect(auth.entrar("a@b.cl", "mala")).rejects.toThrow(/no calzan/);
  });
});

describe("registrar", () => {
  // Sin sesión, cualquier insert sería con auth.uid() nulo y las políticas
  // lo rechazarían: el alta tiene que esperar a que la persona confirme.
  it("avisa que falta confirmar y no consulta la base de más", async () => {
    const { auth, llamadas } = doble({
      signUp: vi
        .fn()
        .mockResolvedValue({ data: { user: usuario, session: null } }),
    } as Auth);

    const registro = await auth.registrar({
      email: "nueva@ejemplo.cl",
      password: "secreta",
      nombre: "Nueva",
    });

    expect(registro).toEqual({ identidad: null, faltaConfirmar: true });
    expect(llamadas).toEqual([]);
  });

  it("con sesión activa devuelve la identidad ya armada", async () => {
    const { auth } = doble(
      {
        signUp: vi.fn().mockResolvedValue({
          data: { user: usuario, session: { user: usuario } },
        }),
      } as Auth,
      tablas({ rol: "cliente" }, { id: "uuid-c" }),
    );

    const registro = await auth.registrar({
      email: "nueva@ejemplo.cl",
      password: "secreta",
      nombre: "Nueva",
    });

    expect(registro.faltaConfirmar).toBe(false);
    expect(registro.identidad).toMatchObject({ clienteId: "uuid-c" });
  });

  it("manda el nombre como metadato de la cuenta", async () => {
    const signUp = vi
      .fn()
      .mockResolvedValue({ data: { user: usuario, session: null } });
    const { auth } = doble({ signUp } as Auth);

    await auth.registrar({
      email: " Nueva@Ejemplo.cl ",
      password: "secreta",
      nombre: "  Nueva  ",
    });

    expect(signUp).toHaveBeenCalledWith({
      email: "nueva@ejemplo.cl",
      password: "secreta",
      options: { data: { nombre: "Nueva" } },
    });
  });
});

describe("alCambiar", () => {
  /**
   * Supabase corre este callback con su propio candado tomado: cualquier
   * llamada a la librería desde dentro se queda esperando para siempre.
   * Costaría un cuelgue silencioso al entrar, que es el peor momento.
   */
  it("no toca la librería desde dentro del callback", async () => {
    let avisar: (evento: string, sesion: unknown) => void = () => {};
    const { auth, llamadas } = doble(
      {
        onAuthStateChange: (fn: typeof avisar) => {
          avisar = fn;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
      } as unknown as Auth,
      tablas({ rol: "admin", nombre: "Jefa" }, null),
    );

    const vistas: unknown[] = [];
    auth.alCambiar((i) => vistas.push(i));

    avisar("SIGNED_IN", { user: usuario });

    // Se vacían los microtasks antes de mirar, y eso es el test.
    // Preguntar justo al volver del callback pasaba en falso: `Promise.all`
    // sobre un thenable difiere la llamada a un microtask, así que no se
    // había registrado nada ni en la versión rota. Con los microtasks ya
    // corridos, lo único que todavía no consultó es la versión que de
    // verdad salió del callback antes de hablar con la librería.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(llamadas).toEqual([]);

    await vi.waitFor(() => expect(vistas).toHaveLength(1));
    expect(vistas[0]).toMatchObject({ rol: "admin", staff: "Jefa" });
  });

  it("al cerrarse la sesión avisa que no hay nadie", async () => {
    let avisar: (evento: string, sesion: unknown) => void = () => {};
    const { auth } = doble({
      onAuthStateChange: (fn: typeof avisar) => {
        avisar = fn;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    } as unknown as Auth);

    const vistas: unknown[] = [];
    auth.alCambiar((i) => vistas.push(i));
    avisar("SIGNED_OUT", null);

    await vi.waitFor(() => expect(vistas).toEqual([null]));
  });

  it("devuelve cómo desuscribirse", () => {
    const unsubscribe = vi.fn();
    const { auth } = doble({
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe } } }),
    } as unknown as Auth);

    auth.alCambiar(() => {})();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("abrirDesdeEnlace", () => {
  // El cliente PKCE descarta la sesión que trae la invitación en el
  // fragmento, así que la app la abre a mano con setSession.
  it("abre la sesión que trae la invitación", async () => {
    const setSession = vi.fn().mockResolvedValue({ data: { user: usuario } });
    const { auth } = doble(
      { setSession } as Auth,
      tablas({ rol: "staff", nombre: "Javiera" }, null),
    );

    const identidad = await auth.abrirDesdeEnlace({
      tipo: "sesion",
      accessToken: "aaa",
      refreshToken: "bbb",
    });

    expect(setSession).toHaveBeenCalledWith({
      access_token: "aaa",
      refresh_token: "bbb",
    });
    expect(identidad.rol).toBe("staff");
    expect(identidad.staff).toBe("Javiera");
  });

  it("verifica el token_hash cuando la plantilla lo manda así", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: { user: usuario } });
    const { auth } = doble(
      { verifyOtp } as Auth,
      tablas({ rol: "admin" }, null),
    );

    await auth.abrirDesdeEnlace({
      tipo: "verificar",
      tokenHash: "xyz",
      type: "invite",
    });

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "xyz",
      type: "invite",
    });
  });

  it("un enlace vencido falla con el motivo, sin tocar la sesión", async () => {
    const setSession = vi.fn();
    const { auth } = doble({ setSession } as Auth);

    await expect(
      auth.abrirDesdeEnlace({
        tipo: "error",
        mensaje: "El enlace venció o ya se usó.",
      }),
    ).rejects.toThrow(/venció/);
    expect(setSession).not.toHaveBeenCalled();
  });

  it("sin enlace, sirve la sesión que ya estaba abierta", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: usuario } });
    const { auth } = doble({ getUser } as Auth, tablas({ rol: "staff" }, null));

    const identidad = await auth.abrirDesdeEnlace({ tipo: "nada" });
    expect(identidad.rol).toBe("staff");
  });
});

describe("sesionDelEnlaceDeClave", () => {
  // La pantalla de contraseña nueva le cambiaba la contraseña a la cuenta
  // abierta en el navegador, no a la del correo, cuando el enlace se abría
  // en otro aparato que el que lo pidió.
  const LLEGADA = "https://www.lapatoteca.cl/ingresar/clave?code=abc123";
  const LIMPIA = "https://www.lapatoteca.cl/ingresar/clave";
  const CON_TOKEN =
    "https://www.lapatoteca.cl/ingresar/clave?token_hash=abc&type=recovery";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin enlace en la dirección no toma ninguna sesión, aunque haya", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: usuario } });
    const { auth } = doble({ getUser } as Auth, tablas({ rol: "admin" }, null));

    await expect(auth.sesionDelEnlaceDeClave(LIMPIA)).resolves.toEqual({
      estado: "sin_enlace",
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  describe("el camino nuevo: token_hash", () => {
    /*
     * El que de verdad arregla el problema. No mira la sesión del navegador
     * ni nada guardado en él: canjea el token y lo que salga de ahí ES la
     * sesión del enlace. Por eso funciona abriéndolo donde sea, incluido el
     * navegador interno del correo, que es donde más se abre.
     */
    it("canjea el token y esa es la sesión, sin importar el navegador", async () => {
      // La barra sigue con el token y la sesión previa es de Administración:
      // en el camino viejo las dos cosas lo habrían hecho fallar.
      vi.stubGlobal("location", { href: CON_TOKEN });
      const verifyOtp = vi.fn().mockResolvedValue({ data: { user: usuario } });
      const { auth } = doble(
        { verifyOtp, getUser: vi.fn() } as Auth,
        tablas({ rol: "cliente", nombre: "Javiera" }, { id: "uuid-c" }),
      );

      const r = await auth.sesionDelEnlaceDeClave(CON_TOKEN);
      expect(r.estado).toBe("abierta");
      expect(r.estado === "abierta" && r.identidad.email).toBe(usuario.email);
      expect(verifyOtp).toHaveBeenCalledWith({
        token_hash: "abc",
        type: "recovery",
      });
    });

    it("un token que ya no vale es 'vencido', no 'otro navegador'", async () => {
      // El consejo importa: a quien se le gastó el enlace hay que decirle que
      // pida otro, no que lo abra en otra parte.
      const { auth } = doble({
        verifyOtp: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Token has expired or is invalid" },
        }),
      } as Auth);

      await expect(auth.sesionDelEnlaceDeClave(CON_TOKEN)).resolves.toEqual({
        estado: "vencido",
      });
    });

    it("un token de otro tipo no abre esta pantalla", async () => {
      // Escribir una contraseña no es lo que proponía ese correo.
      const verifyOtp = vi.fn();
      const { auth } = doble({ verifyOtp } as Auth);

      await expect(
        auth.sesionDelEnlaceDeClave(
          "https://www.lapatoteca.cl/ingresar/clave?token_hash=abc&type=invite",
        ),
      ).resolves.toEqual({ estado: "sin_enlace" });
      expect(verifyOtp).not.toHaveBeenCalled();
    });

    it("el error que viene en la propia dirección se cree, sin preguntar", async () => {
      const verifyOtp = vi.fn();
      const { auth } = doble({ verifyOtp } as Auth);

      await expect(
        auth.sesionDelEnlaceDeClave(
          "https://www.lapatoteca.cl/ingresar/clave#error=access_denied&error_code=otp_expired",
        ),
      ).resolves.toEqual({ estado: "vencido" });
      expect(verifyOtp).not.toHaveBeenCalled();
    });
  });

  describe("el camino viejo: code (PKCE)", () => {
    // Se mantiene porque los correos ya mandados lo usan, y porque la
    // plantilla de Supabase se cambia a mano: hasta que se cambie, este es
    // el único enlace que llega.
    it("si la librería usó el enlace (borró el code), es la sesión del enlace", async () => {
      vi.stubGlobal("location", { href: LIMPIA });
      const { auth } = doble(
        {
          getUser: vi.fn().mockResolvedValue({ data: { user: usuario } }),
        } as Auth,
        tablas({ rol: "cliente", nombre: "Javiera" }, { id: "uuid-c" }),
      );

      const r = await auth.sesionDelEnlaceDeClave(LLEGADA);
      expect(r.estado === "abierta" && r.identidad.email).toBe(usuario.email);
    });

    it("si el code sigue en la barra, la sesión abierta es OTRA y no se toca", async () => {
      // Abierto en un navegador donde no se pidió: Supabase no lo puede usar y
      // deja la sesión que había, por ejemplo la de Administración.
      vi.stubGlobal("location", { href: LLEGADA });
      const { auth } = doble(
        {
          getUser: vi.fn().mockResolvedValue({ data: { user: usuario } }),
        } as Auth,
        tablas({ rol: "admin" }, null),
      );

      await expect(auth.sesionDelEnlaceDeClave(LLEGADA)).resolves.toEqual({
        estado: "otro_navegador",
      });
    });

    it("sin nadie con sesión, tampoco", async () => {
      vi.stubGlobal("location", { href: LIMPIA });
      const { auth } = doble({
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      } as Auth);

      await expect(auth.sesionDelEnlaceDeClave(LLEGADA)).resolves.toEqual({
        estado: "otro_navegador",
      });
    });
  });
});
