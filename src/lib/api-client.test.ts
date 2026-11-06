// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, readResponse } from "./api-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("readResponse", () => {
  const assign = vi.fn();

  afterEach(() => {
    assign.mockReset();
    vi.unstubAllGlobals();
  });

  function stubLocation() {
    vi.stubGlobal("location", { ...window.location, pathname: "/movimientos", assign });
  }

  it("con la sesión vencida lleva al login conservando la ruta", async () => {
    stubLocation();
    const response = jsonResponse(401, { error: { code: "UNAUTHORIZED", message: "Tu sesión expiró. Volvé a ingresar." } });
    await expect(readResponse(response)).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("/login?next=%2Fmovimientos");
  });

  it("credenciales incorrectas: devuelve el error al formulario sin recargar la página", async () => {
    stubLocation();
    const response = jsonResponse(401, { error: { code: "INVALID_CREDENTIALS", message: "Email o contraseña incorrectos." } });
    await expect(readResponse(response)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", message: "Email o contraseña incorrectos." });
    expect(assign).not.toHaveBeenCalled();
  });
});
