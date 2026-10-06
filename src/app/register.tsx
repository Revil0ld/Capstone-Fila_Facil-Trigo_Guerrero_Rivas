"use client";

import { FormEvent, useState } from "react";

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

const initialState: FormState = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>(initialState);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError("");
    setSuccess("");
  };
/*control error*/
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const { fullName, email, phone, password, confirmPassword } = form;

    if (!fullName || !email || !phone || !password || !confirmPassword) {
      setError("Completa todos los campos para continuar.");
      return;
    }

    if (password.length < 6 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      setError("La contraseña debe tener: - al menos 6 caracteres.\n - al menos una letra mayúscula.\n - al menos un número. \n - al menos un carácter especial.");
      return;
    }

    if (phone.length < 9 || phone.length > 9) {
      setError("El número de teléfono debe tener 9 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setError("");
    setSuccess("Registro completado correctamente. Bienvenido/a");
    setForm(initialState);
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #eef4ff 0%, #e0f7f6 100%)",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "#ffffff",
          borderRadius: "18px",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
          padding: "32px 28px",
          border: "1px solid rgba(148, 163, 184, 0.2)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #2563eb, #14b8a6)",
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "30px",
              fontWeight: 700,
            }}
          >
            F
          </div>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: "32px" }}>Crear cuenta</h1>
          <p style={{ margin: "8px 0 0", color: "#475569", fontSize: "15px" }}>
            Regístrate para comenzar a usar la plataforma.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
          <div>
            <label
              htmlFor="fullName"
              style={{ display: "block", marginBottom: "8px", color: "#1e293b", fontWeight: 600 }}
            >
              Nombre completo
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              value={form.fullName}
              onChange={handleChange}
              placeholder="Juan Pérez"
              style={inputStyle}
            />
          </div>

          <div>
            <label
              htmlFor="email"
              style={{ display: "block", marginBottom: "8px", color: "#1e293b", fontWeight: 600 }}
            >
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="correo@ejemplo.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label
              htmlFor="phone"
              style={{ display: "block", marginBottom: "8px", color: "#1e293b", fontWeight: 600 }}
            >
              Teléfono
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="9 XXXX XXXX"
              style={inputStyle}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ display: "block", marginBottom: "8px", color: "#1e293b", fontWeight: 600 }}
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="********"
              style={inputStyle}
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              style={{ display: "block", marginBottom: "8px", color: "#1e293b", fontWeight: 600 }}
            >
              Confirmar contraseña
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="********"
              style={inputStyle}
            />
          </div>

          {error ? (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "14px",
              }}
            >
              {error}
            </div>
          ) : null}

          {success ? (
            <div
              style={{
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                color: "#047857",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "14px",
              }}
            >
              {success}
            </div>
          ) : null}

          <button
            type="submit"
            style={{
              border: "none",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #2563eb, #0ea5e9)",
              color: "#fff",
              fontSize: "16px",
              fontWeight: 700,
              padding: "14px 16px",
              cursor: "pointer",
              boxShadow: "0 10px 20px rgba(37, 99, 235, 0.25)",
            }}
          >
            Registrarme
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: "22px", color: "#475569", fontSize: "14px" }}>
          ¿Ya tienes cuenta? {" "}
          <a href="/login" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
            Iniciar sesión
          </a>
        </p>
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  padding: "12px 14px",
  fontSize: "15px",
  outline: "none",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  boxSizing: "border-box",
  background: "#f8fafc",
};
