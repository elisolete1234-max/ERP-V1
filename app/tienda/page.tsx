import Link from "next/link";
import { BrandLogo } from "../components/brand-logo";
import { submitPublicQuoteAction } from "../actions";
import { getPublicStoreProducts } from "@/lib/public-site";
import { ProductImagePreview } from "../components/product-images";

const services = [
  "Impresion 3D personalizada",
  "Prototipos",
  "Figuras decorativas",
  "Piezas funcionales",
  "Regalos personalizados",
  "Produccion bajo pedido",
];

const materials = ["PLA", "PETG", "ABS", "TPU", "Acabado seda", "Mate"];

const advantages = [
  "Personalizacion real",
  "Presupuesto claro",
  "Materiales variados",
  "Control de calidad",
  "Entrega flexible",
];

export default async function TiendaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const contactStatusRaw = params.contact;
  const contactStatus = Array.isArray(contactStatusRaw) ? contactStatusRaw[0] : contactStatusRaw;
  const errorRaw = params.error;
  const contactError = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;
  const storeProducts = await getPublicStoreProducts();
  const featuredProducts = storeProducts.filter((product) => product.destacado).slice(0, 3);
  const productCategories = Array.from(new Set(storeProducts.map((product) => product.categoriaPublica))).slice(0, 6);
  const priceFormatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

  return (
    <main className="landing-page min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/88 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <a href="#inicio" className="flex items-center gap-3">
            <BrandLogo size="sm" priority imageClassName="h-auto w-28 object-contain" />
          </a>
          <nav className="hidden items-center gap-5 text-xs font-semibold uppercase tracking-wide text-slate-300 md:flex">
            <a href="#servicios" className="hover:text-cyan-200">Servicios</a>
            <a href="#galeria" className="hover:text-cyan-200">Tienda</a>
            <a href="#presupuesto" className="hover:text-cyan-200">Presupuesto</a>
          </nav>
          <Link
            href="/"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-cyan-300/30 px-3 text-xs font-bold text-cyan-100 transition hover:bg-cyan-300/10"
          >
            ERP
          </Link>
        </div>
      </header>

      <section id="inicio" className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(8,145,178,0.28),transparent_34%),linear-gradient(135deg,#0f172a_0%,#111827_52%,#082f49_100%)]" />
        <div className="relative mx-auto grid min-h-[calc(100vh-3.5rem)] w-full max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-8">
          <div className="max-w-3xl">
            <BrandLogo size="lg" priority imageClassName="mb-7 h-auto w-full max-w-sm object-contain" />
            <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-white sm:text-5xl lg:text-6xl">
              Ideas, diseno e impresion 3D convertidos en piezas reales.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
              Fabricamos piezas personalizadas, prototipos y regalos bajo pedido con presupuesto claro,
              materiales seleccionados y seguimiento profesional.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#presupuesto" className="inline-flex h-10 items-center rounded-lg bg-cyan-300 px-4 text-sm font-bold text-slate-950">
                Pedir presupuesto
              </a>
              <a href="#galeria" className="inline-flex h-10 items-center rounded-lg border border-white/20 px-4 text-sm font-bold text-white">
                Ver tienda
              </a>
            </div>
            {featuredProducts.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {featuredProducts.map((product) => (
                  <a key={product.id} href="#galeria" className="rounded-full border border-cyan-200/25 bg-white/8 px-3 py-1 text-xs font-bold text-cyan-100">
                    {product.nombre}
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="rounded-xl border border-white/12 bg-white/8 p-5 shadow-2xl shadow-cyan-950/40 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-200">Flujo profesional</p>
            <div className="mt-4 grid gap-3">
              {["Envias idea o archivo", "Calculamos presupuesto", "Fabricamos", "Entregamos"].map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/35 p-3">
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-cyan-300 text-xs font-black text-slate-950">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-100">{step}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section id="servicios" className="bg-white text-slate-950">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Que hacemos</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">Soluciones 3D listas para uso real</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <article key={service} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-bold text-slate-950">{service}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Definimos material, acabado y plazo segun el uso final de la pieza.
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="galeria" className="bg-slate-100 text-slate-950">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Tienda</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal">Productos disponibles bajo pedido</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(productCategories.length > 0 ? productCategories : materials).map((item) => (
                <span key={item} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {storeProducts.length > 0 ? storeProducts.map((product) => (
              <article key={product.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="relative aspect-[4/3] bg-[linear-gradient(135deg,#0f172a,#0e7490_52%,#67e8f9)]">
                  <ProductImagePreview
                    src={product.imagenUrl}
                    alt={product.nombre}
                    size="lg"
                    className="rounded-none border-0"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold">{product.nombre}</h3>
                    {product.pvp > 0 ? (
                      <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-800">
                        {priceFormatter.format(product.pvp)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-cyan-700">{product.categoriaPublica}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{product.descripcionPublica}</p>
                  {product.galeriaImagenes.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {product.galeriaImagenes.slice(0, 4).map((imagePath) => (
                        <ProductImagePreview key={imagePath} src={imagePath} alt={`${product.nombre} galeria`} size="sm" />
                      ))}
                    </div>
                  ) : null}
                  <a href="#presupuesto" className="mt-4 inline-flex h-9 items-center rounded-lg bg-slate-950 px-3 text-sm font-bold text-white">
                    Solicitar
                  </a>
                </div>
              </article>
            )) : (
              <article className="rounded-lg border border-slate-200 bg-white p-5 sm:col-span-2 lg:col-span-4">
                <h3 className="font-bold">Catalogo pendiente de publicar</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Marca productos como visibles en tienda desde el ERP para que aparezcan aqui automaticamente.
                </p>
              </article>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white text-slate-950">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Ventajas</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">Proceso claro, piezas controladas</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {advantages.map((item) => (
                <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <aside className="rounded-lg border border-cyan-200 bg-cyan-50 p-5">
            <h3 className="font-bold text-slate-950">Contacto directo</h3>
            <p className="mt-3 text-sm leading-6 text-slate-700">
              Configura un email o WhatsApp comercial en el proyecto y este bloque puede enlazar al canal principal.
            </p>
            <a href="#presupuesto" className="mt-5 inline-flex h-9 items-center rounded-lg bg-slate-950 px-4 text-sm font-bold text-white">
              Solicitar ahora
            </a>
          </aside>
        </div>
      </section>

      <section id="presupuesto" className="bg-slate-950 text-white">
        <div className="mx-auto grid w-full max-w-7xl gap-7 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-200">Presupuesto</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">Cuentanos que necesitas fabricar</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
              Recibimos solicitudes con descripcion, cantidades, material orientativo y datos de contacto.
              Quedan registradas en la base de datos para gestionarlas desde el ERP.
            </p>
          </div>

          <form action={submitPublicQuoteAction} className="grid gap-4 rounded-xl border border-white/12 bg-white p-5 text-slate-950">
            {contactStatus === "ok" ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Solicitud enviada. Te contactaremos pronto.
              </p>
            ) : null}
            {contactStatus === "error" && contactError ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{contactError}</p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">
                <span>Nombre</span>
                <input className="input" name="nombre" required />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                <span>Email</span>
                <input className="input" name="email" type="email" required />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">
                <span>Telefono</span>
                <input className="input" name="telefono" />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                <span>Cantidad</span>
                <input className="input" name="cantidad" />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">
                <span>Servicio</span>
                <select className="input" name="servicio" defaultValue="">
                  <option value="">Selecciona</option>
                  {services.map((service) => (
                    <option key={service} value={service}>{service}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                <span>Material</span>
                <select className="input" name="material" defaultValue="">
                  <option value="">Sin decidir</option>
                  {materials.map((material) => (
                    <option key={material} value={material}>{material}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-1 text-sm font-semibold">
              <span>Detalles</span>
              <textarea name="mensaje" className="input min-h-28" required />
            </label>

            <button type="submit" className="h-10 rounded-lg bg-cyan-500 px-4 text-sm font-bold text-white transition hover:bg-cyan-600">
              Enviar solicitud
            </button>
          </form>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-slate-950 px-4 py-7 text-sm text-slate-400 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <span>Eli Print 3D</span>
          <span>Ideas - Diseno - Impresion - Realidad</span>
        </div>
      </footer>
    </main>
  );
}
