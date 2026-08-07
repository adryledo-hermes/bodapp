"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface OtpChallengeProps {
  token: string;
}

/**
 * Two-step phone OTP challenge for the public invitation page (Task 9).
 * Step 1: phone → request code. Step 2: code → verify. On verify success the
 * server issues the httpOnly `invitation_access` cookie, so we refresh the
 * route to let the server page re-render with access granted.
 */
export default function OtpChallenge({ token }: OtpChallengeProps) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error || "No se pudo enviar el código. Inténtalo de nuevo."
        );
        return;
      }
      setStep(2);
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, phone, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error || "Código incorrecto. Vuelve a intentarlo."
        );
        return;
      }
      // Cookie is set → re-render the server page to show access granted.
      router.refresh();
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

  return (
    <div className="mx-auto w-full max-w-md">
      {step === 1 ? (
        <form onSubmit={handleRequestCode} className="flex flex-col gap-4">
          <label className="block text-sm font-medium text-slate-700">
            Tu teléfono
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 612 345 678"
              className={`${inputClass} mt-1`}
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? "Enviando..." : "Enviar código"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            Te hemos enviado un código de 6 dígitos por SMS.
          </p>
          <label className="block text-sm font-medium text-slate-700">
            Código
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className={`${inputClass} mt-1 text-center tracking-widest`}
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? "Verificando..." : "Verificar"}
          </button>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-sm text-slate-500 underline hover:text-slate-700"
          >
            Cambiar teléfono
          </button>
        </form>
      )}
    </div>
  );
}
