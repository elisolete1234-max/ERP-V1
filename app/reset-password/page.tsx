import Link from "next/link";
import type { ReactNode } from "react";
import { resetPasswordAction } from "../actions";
import { BrandLogo } from "../components/brand-logo";
import { SubmitButton } from "../components/form-ui";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      {hint ? <span className="form-hint">{hint}</span> : null}
      {children}
    </label>
  );
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string; message?: string; tone?: string }>;
}) {
  const resolved = (await searchParams) ?? {};
  const token = resolved.token?.trim() ?? "";
  const messageTone = resolved.tone === "error" ? "error" : "success";

  return (
    <main className="erp-shell">
      <section className="mx-auto max-w-xl panel p-8">
        <BrandLogo
          size="md"
          priority
          showName
          showSubtitle
          className="flex flex-col items-start gap-3"
          imageClassName="h-auto w-44 object-contain"
          nameClassName="text-xl font-semibold tracking-[-0.04em] text-slate-950"
          subtitleClassName="text-sm text-[color:var(--muted)]"
        />
        <p className="eyebrow">Acceso</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Nueva contrasena</h1>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          Crea una contrasena nueva para volver a entrar con normalidad.
        </p>
        {resolved.message ? (
          <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
            messageTone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}>
            {resolved.message}
          </div>
        ) : null}
        {token ? (
          <form action={resetPasswordAction} className="mt-6 space-y-4">
            <input type="hidden" name="token" value={token} />
            <Field label="Nueva contrasena" hint="Minimo 8 caracteres, con mayuscula, minuscula y numero o simbolo.">
              <input name="newPassword" type="password" className="input" autoComplete="new-password" required />
            </Field>
            <Field label="Confirmar contrasena">
              <input name="confirmPassword" type="password" className="input" autoComplete="new-password" required />
            </Field>
            <SubmitButton pendingText="Guardando...">Guardar nueva contrasena</SubmitButton>
          </form>
        ) : (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            El enlace de recuperacion no es valido.
          </div>
        )}
        <Link href="/" className="mt-5 inline-flex text-sm font-semibold text-[color:var(--accent-strong)]">
          Volver al inicio de sesion
        </Link>
      </section>
    </main>
  );
}
