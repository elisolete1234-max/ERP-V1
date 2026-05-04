import Image from "next/image";

const mockProducts = [
  {
    name: "Soporte Ergonomico para Movil",
    category: "Accesorios utiles",
    description: "Soporte estable para escritorio o mesita con angulo comodo para videollamadas.",
    price: "16,90 EUR",
    leadTime: "24-48h",
  },
  {
    name: "Organizador Modular de Escritorio",
    category: "Organizacion",
    description: "Sistema de modulos para boligrafos, cables y accesorios de trabajo.",
    price: "22,50 EUR",
    leadTime: "2-3 dias",
  },
  {
    name: "Maceta Decorativa Geometrica",
    category: "Figuras y decoracion",
    description: "Maceta ligera con diseno contemporaneo para salon, estudio o terraza.",
    price: "19,90 EUR",
    leadTime: "2-4 dias",
  },
  {
    name: "Figura Personalizada por Encargo",
    category: "Personalizado",
    description: "Creamos figuras unicas para regalo, eventos o coleccion.",
    price: "Desde 25,00 EUR",
    leadTime: "4-7 dias",
  },
  {
    name: "Repuesto Tecnico a Medida",
    category: "Piezas tecnicas",
    description: "Fabricacion de pequenas piezas funcionales para reparaciones o mejoras.",
    price: "Desde 12,00 EUR",
    leadTime: "48-72h",
  },
  {
    name: "Llavero Personalizado",
    category: "Regalo",
    description: "Llavero con nombre, logo o forma personalizada en varios colores.",
    price: "8,90 EUR",
    leadTime: "24h",
  },
];

const mockMaterials = [
  {
    name: "PLA Premium",
    finish: "Mate / Seda",
    use: "Decoración y prototipos visuales",
    eco: "Biobasado",
  },
  {
    name: "PETG Técnico",
    finish: "Semibrillo",
    use: "Piezas resistentes para uso diario",
    eco: "Reciclable",
  },
  {
    name: "ABS Pro",
    finish: "Liso",
    use: "Componentes funcionales con más temperatura",
    eco: "Uso técnico",
  },
  {
    name: "TPU Flexible",
    finish: "Texturizado",
    use: "Piezas elásticas y amortiguación",
    eco: "Durabilidad alta",
  },
];

const shippingMethods = [
  { name: "Recogida en taller (Barcelona)", eta: "Mismo día" },
  { name: "Mensajería estándar", eta: "24-72h" },
  { name: "Envío exprés", eta: "24h" },
  { name: "Entrega local programada", eta: "Franja acordada" },
];

const paymentMethods = [
  "Tarjeta de crédito/débito",
  "Bizum",
  "Transferencia bancaria",
  "Pago en mano al recoger",
];

const trustItems = [
  "Presupuesto personalizado",
  "Materiales seleccionados",
  "Produccion local",
  "Atencion cercana",
];

export default function TiendaPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="w-40 sm:w-52 lg:w-64">
            <Image
              src="/logo.png"
              alt="Eli 3D Print"
              width={512}
              height={192}
              className="h-auto w-full scale-125 object-contain"
            />
          </div>
          <nav className="hidden gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#catalogo-productos" className="transition hover:text-blue-700">
              Productos
            </a>
            <a href="#materiales" className="transition hover:text-blue-700">
              Materiales
            </a>
            <a href="#pedido" className="transition hover:text-blue-700">
              Pedido
            </a>
          </nav>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-10 pt-10 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:pt-14">
        <div className="space-y-6">
          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Tienda Publica
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Impresion 3D profesional en Barcelona para ideas reales
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Convierte tu idea en una pieza util, decorativa o tecnica con acabados cuidados y atencion
            personalizada. Descubre una experiencia de compra clara, visual y pensada para clientes.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="#catalogo-productos"
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Ver catalogo
            </a>
            <a
              href="#pedido"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Crear pedido visual
            </a>
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado de demo</p>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li className="rounded-lg bg-slate-50 p-3">
              Catalogo y precios mostrados con datos mock.
            </li>
            <li className="rounded-lg bg-slate-50 p-3">No se guardan pedidos reales.</li>
            <li className="rounded-lg bg-slate-50 p-3">No hay conexion con base de datos ni pagos.</li>
          </ul>
        </aside>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mb-5">
          <h2 className="text-2xl font-bold tracking-tight">Que hacemos</h2>
          <p className="mt-1 text-sm text-slate-600">Servicios pensados para particulares, negocios y creadores.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            "Piezas personalizadas",
            "Figuras y decoracion",
            "Accesorios utiles",
            "Prototipos y piezas tecnicas",
          ].map((item) => (
            <article key={item} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{item}</h3>
              <p className="mt-2 text-sm text-slate-600">
                Soluciones impresas en 3D con enfoque en funcionalidad, estilo y durabilidad.
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mb-5">
          <h2 className="text-2xl font-bold tracking-tight">Como funciona</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            "Elige producto o envia idea",
            "Seleccionamos material y color",
            "Imprimimos la pieza",
            "Recogida en Barcelona o envio",
          ].map((step, index) => (
            <article key={step} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Paso {index + 1}</p>
              <h3 className="mt-2 text-base font-semibold text-slate-900">{step}</h3>
            </article>
          ))}
        </div>
      </section>

      <section id="catalogo-productos" className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mb-5">
          <h2 className="text-2xl font-bold tracking-tight">Catalogo de productos</h2>
          <p className="mt-1 text-sm text-slate-600">Selecciones realistas para hogar, trabajo y proyectos personalizados.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {mockProducts.map((product) => (
            <article
              key={product.name}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{product.category}</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{product.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{product.description}</p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-bold text-slate-900">{product.price}</span>
                <span className="text-slate-500">{product.leadTime}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold tracking-tight">Por que confiar en Eli 3D Print</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {trustItems.map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="materiales" className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mb-5">
          <h2 className="text-2xl font-bold tracking-tight">Catalogo de materiales</h2>
          <p className="mt-1 text-sm text-slate-600">Comparativa rapida para elegir acabado y resistencia.</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Material</th>
                  <th className="px-4 py-3 font-semibold">Acabado</th>
                  <th className="px-4 py-3 font-semibold">Uso recomendado</th>
                  <th className="px-4 py-3 font-semibold">Perfil</th>
                </tr>
              </thead>
              <tbody>
                {mockMaterials.map((material) => (
                  <tr key={material.name} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{material.name}</td>
                    <td className="px-4 py-3 text-slate-700">{material.finish}</td>
                    <td className="px-4 py-3 text-slate-700">{material.use}</td>
                    <td className="px-4 py-3 text-slate-700">{material.eco}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="pedido" className="mx-auto grid w-full max-w-7xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold tracking-tight">Crear pedido (maqueta visual)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Formulario de ejemplo para visualizar la experiencia de compra.
          </p>

          <form className="mt-6 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Nombre</span>
                <input className="input" placeholder="Tu nombre" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Email</span>
                <input className="input" type="email" placeholder="cliente@email.com" />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Producto</span>
                <select className="input" defaultValue="">
                  <option value="" disabled>
                    Selecciona un producto
                  </option>
                  {mockProducts.map((product) => (
                    <option key={product.name} value={product.name}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Material</span>
                <select className="input" defaultValue="">
                  <option value="" disabled>
                    Selecciona un material
                  </option>
                  {mockMaterials.map((material) => (
                    <option key={material.name} value={material.name}>
                      {material.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Cantidad</span>
                <input className="input" type="number" min={1} defaultValue={1} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-slate-700">Color preferido</span>
                <input className="input" placeholder="Negro, blanco, azul..." />
              </label>
            </div>

            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Detalles del pedido</span>
              <textarea className="input min-h-28" placeholder="Dimensiones, uso final, referencias..." />
            </label>

            <button type="button" className="mt-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
              Simular pedido
            </button>
          </form>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Metodos de envio</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {shippingMethods.map((method) => (
                <li key={method.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span>{method.name}</span>
                  <span className="text-slate-500">{method.eta}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Metodos de pago</h3>
            <ul className="mt-4 grid gap-2 text-sm text-slate-700">
              {paymentMethods.map((method) => (
                <li key={method} className="rounded-lg bg-slate-50 px-3 py-2">
                  {method}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Resumen de pedido</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Producto</span>
                <span className="font-medium">Soporte Vertical para Movil</span>
              </div>
              <div className="flex justify-between">
                <span>Material</span>
                <span className="font-medium">PETG Tecnico</span>
              </div>
              <div className="flex justify-between">
                <span>Cantidad</span>
                <span className="font-medium">2</span>
              </div>
              <div className="flex justify-between">
                <span>Envio</span>
                <span className="font-medium">Mensajeria estandar</span>
              </div>
              <div className="mt-3 border-t border-blue-200 pt-3 text-base font-bold">
                <div className="flex justify-between">
                  <span>Total estimado</span>
                  <span>29,00 EUR</span>
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Esta seccion es solo una vista previa visual. No confirma pedidos ni ejecuta pagos.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}
