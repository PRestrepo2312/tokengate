import { mutation } from "./_generated/server";
import { normalizar } from "./util";

// npx convex run seed:todo  → una persona precargada (Juan, de Acme) con memoria del coach y un pitch anterior,
// para que la primera sesión del demo ya tenga historia. Idempotente.

export const todo = mutation({
  args: {},
  handler: async (ctx) => {
    const juanNorm = normalizar("Juan");
    let juan = await ctx.db
      .query("customers")
      .withIndex("by_nombre", (q) => q.eq("nombreNorm", juanNorm))
      .first();
    if (!juan) {
      const id = await ctx.db.insert("customers", {
        nombre: "Juan",
        nombreNorm: juanNorm,
        empresa: "Acme",
        rol: "fundador",
        etapa: "evaluacion",
        ultimaVez: Date.now() - 3 * 86400000,
      });
      await ctx.db.insert("customerMemory", {
        customerId: id,
        intereses: [],
        objeciones: ["precio"],
        integraciones: [],
        resumen: "La última vez trabajamos la apertura de tu pitch: tardabas casi un minuto en llegar al problema del cliente y no decías ninguna cifra.",
        siguienteAccion: "abrir con el problema y una cifra en los primeros 15 segundos",
        actualizado: Date.now() - 3 * 86400000,
        producto: "un software que automatiza la atención en stands de ferias",
        audiencia: "gerentes comerciales de empresas medianas",
        problema: "pierden contactos porque nadie los registra en la feria",
        diferencial: "registra y hace seguimiento solo, sin app",
        objetivo: "conseguir una demo con el gerente",
        fortalezas: ["tono natural", "conoce bien el producto"],
        debilidades: ["tarda en llegar al problema", "sin cifras", "no cierra con un siguiente paso"],
        feedback: ["Abre con el problema del cliente, no con la empresa.", "Di una cifra real en los primeros 15 segundos."],
        progreso: "primera sesión: pitch de 90 segundos, claro pero sin gancho",
        sesiones: 1,
      });
      await ctx.db.insert("pitches", {
        customerId: id,
        texto: "Hola, somos Acme, una empresa con diez años en el mercado que ofrece soluciones integrales para ferias y eventos. Tenemos un software muy completo con muchas funcionalidades para automatizar procesos y mejorar la experiencia de sus clientes.",
        version: 1,
        feedback: "Tarda en llegar al problema; sin cifras; sin siguiente paso.",
        puntaje: 4,
        creado: Date.now() - 3 * 86400000,
      });
      juan = await ctx.db.get(id);
    } else {
      // Ya existía (de la versión "vendedor"): migrar su memoria a la del coach si aún no la tiene.
      const juanId = juan._id;
      const m = await ctx.db.query("customerMemory").withIndex("by_customer", (q) => q.eq("customerId", juanId)).first();
      if (m && !m.producto) {
        await ctx.db.patch(m._id, {
          resumen: "La última vez trabajamos la apertura de tu pitch: tardabas casi un minuto en llegar al problema del cliente y no decías ninguna cifra.",
          siguienteAccion: "abrir con el problema y una cifra en los primeros 15 segundos",
          producto: "un software que automatiza la atención en stands de ferias",
          audiencia: "gerentes comerciales de empresas medianas",
          problema: "pierden contactos porque nadie los registra en la feria",
          diferencial: "registra y hace seguimiento solo, sin app",
          objetivo: "conseguir una demo con el gerente",
          fortalezas: ["tono natural", "conoce bien el producto"],
          debilidades: ["tarda en llegar al problema", "sin cifras", "no cierra con un siguiente paso"],
          feedback: ["Abre con el problema del cliente, no con la empresa.", "Di una cifra real en los primeros 15 segundos."],
          progreso: "primera sesión: pitch de 90 segundos, claro pero sin gancho",
          sesiones: 1,
        });
      }
      const ps = await ctx.db.query("pitches").withIndex("by_customer", (q) => q.eq("customerId", juanId)).collect();
      if (!ps.length) {
        await ctx.db.insert("pitches", {
          customerId: juanId,
          texto: "Hola, somos Acme, una empresa con diez años en el mercado que ofrece soluciones integrales para ferias y eventos. Tenemos un software muy completo con muchas funcionalidades para automatizar procesos y mejorar la experiencia de sus clientes.",
          version: 1,
          feedback: "Tarda en llegar al problema; sin cifras; sin siguiente paso.",
          puntaje: 4,
          creado: Date.now() - 3 * 86400000,
        });
      }
    }
    return { juan: juan?._id };
  },
});
