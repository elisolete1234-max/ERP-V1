import Link from "next/link";
import { submitPublicQuoteAction } from "../actions";
import { BrandLogo } from "../components/brand-logo";
import { ProductImagePreview } from "../components/product-images";
import { getPublicStoreProducts } from "@/lib/public-site";

const services = [
  {
    title: "Impresion 3D personalizada",
    text: "Piezas a medida para regalos, decoracion, uso tecnico o reposicion.",
  },
  {
    title: "Prototipos y pruebas",
    text: "Modelos rapidos para validar forma, encaje y acabado antes de producir.",
  },
  {
    title: "Piezas funcionales",
    text: "Soportes, adaptadores, recambios y soluciones utiles para el dia a dia.",
  },
  {
    title: "Produccion bajo pedido",
    text: "Fabricacion controlada por cantidades, material, color y plazo acordado.",
  },
];

const processSteps = [
  "Envias idea o archivo",
  "Revisamos material y acabado",
  "Calculamos presupuesto",
  "Fabricamos y entregamos",
];

const materials = ["PLA", "PETG", "TPU", "ABS", "Seda", "Mate"];

export default async function WebPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const contactStatusRaw = params.contact;
  const contactStatus = Array.isArray(contactStatusRaw) ? contactStatusRaw[0] : contactStatusRaw;
  const errorRaw = params.error;
  const contactError = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;
  const products = await getPublicStoreProducts();
  const featuredProducts = products.slice(0, 4);
  const priceFormatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f7fafc] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <a href="#inicio" className="flex min-w-0 items-center">
            <BrandLogo size="sm" priority imageClassName="h-auto w-28 object-contain" />
          </a>
          <nav className="hidden items-center gap-5 text-xs font-bold uppercase tracking-wide text-slate-600 md:flex">
            <a href="#servicios" className="hover:text-cyan-700">Servicios</a>
            <a href="#productos" className="hover:text-cyan-700">Productos</a>
            <a href="#presupuesto" className="hover:text-cyan-700">Presupuesto</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/tienda" className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700">
              Tienda
            </Link>
            <Link href="/" className="hidden h-9 items-center rounded-lg bg-slate-950 px-3 text-xs font-bold text-white sm:inline-flex">
              ERP
            </Link>
          </div>
        </div>
      </header>

      <section id="inicio" className="bg-slate-950 text-white">
        <div className="mx-auto grid min-h-[calc(100vh-3.5rem)] w-full max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,25rem)] lg:px-8">
          <div className="min-w-0">
            <BrandLogo size="lg" priority imageClassName="mb-8 h-auto w-full max-w-sm object-contain" />
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-200">Ideas · diseno · impresion · realidad</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-normal text-white sm:text-5xl lg:text-6xl">
              Fabricacion 3D personalizada con acabado profesional.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
              Convertimos ideas, archivos y necesidades reales en piezas impresas en 3D con presupuesto claro,
              materiales adecuados y seguimiento de principio a fin.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#presupuesto" className="inline-flex h-10 items-center rounded-lg bg-cyan-300 px-4 text-sm font-black text-slate-950">
                Pedir presupuesto
              </a>
              <a href="#productos" className="inline-flex h-10 items-center rounded-lg border border-white/20 px-4 text-sm font-bold text-white">
                Ver productos
              </a>
            </div>
          </div>

          <aside className="rounded-xl border border-white/12 bg-white/8 p-5 shadow-2xl shadow-cyan-950/30">
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-200">Como funciona</p>
            <div className="mt-4 grid gap-3">
              {processSteps.map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/70 p-3">
                  <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-cyan-300 text-xs font-black text-slate-950">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-100">{step}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section id="servicios" className="bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Servicios</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">Soluciones 3D para piezas reales</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => (
              <article key={service.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-black text-slate-950">{service.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{service.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="productos" className="bg-slate-100">
        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Catalogo</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal">Productos destacados</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {materials.map((material) => (
                <span key={material} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                  {material}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featuredProducts.length > 0 ? featuredProducts.map((product) => (
              <article key={product.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="aspect-[4/3] bg-slate-900">
                  <ProductImagePreview src={product.imagenUrl} alt={product.nombre} size="lg" className="rounded-none border-0" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-black">{product.nombre}</h3>
                    {product.pvp > 0 ? (
                      <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-800">
                        {priceFormatter.format(product.pvp)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wide text-cyan-700">{product.categoriaPublica}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{product.descripcionPublica}</p>
                  <a href="#presupuesto" className="mt-4 inline-flex h-9 items-center rounded-lg bg-slate-950 px-3 text-sm font-bold text-white">
                    Solicitar
                  </a>
                </div>
              </article>
            )) : (
              <article className="rounded-lg border border-slate-200 bg-white p-5 sm:col-span-2 lg:col-span-4">
                <h3 className="font-black">Productos pendientes de publicar</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Marca productos como visibles en tienda desde el ERP para que aparezcan aqui.
                </p>
              </article>
            )}
          </div>
        </div>
      </section>

      <section id="presupuesto" className="bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-7 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Presupuesto</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">Cuentanos que necesitas fabricar</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
              Puedes enviar una idea, una referencia, medidas aproximadas o el uso final. Te responderemos con
              material recomendado, precio y plazo.
            </p>
          </div>

          <form action={submitPublicQuoteAction} className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
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
            <label className="grid gap-1 text-sm font-semibold">
              <span>Servicio</span>
              <select className="input" name="servicio" defaultValue="">
                <option value="">Selecciona</option>
                {services.map((service) => (
                  <option key={service.title} value={service.title}>{service.title}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              <span>Detalles</span>
              <textarea name="mensaje" className="input min-h-28" required />
            </label>
            <button type="submit" className="h-10 rounded-lg bg-cyan-600 px-4 text-sm font-black text-white transition hover:bg-cyan-700">
              Enviar solicitud
            </button>
          </form>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-4 py-7 text-sm text-slate-500 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <span>Eli Print 3D</span>
          <span>Ideas - Diseno - Impresion - Realidad</span>
        </div>
      </footer>
    </main>
  );
}
