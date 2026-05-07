import { useState } from "react";
import { loginUser } from "../api/backend";

function Login({ onLogin, apiMessage }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!username || !password) {
      setErrorMessage("Username and password are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await loginUser({ username, password });
      const { access, refresh } = response.data;

      if (!access) {
        setErrorMessage("Login succeeded but no access token was returned.");
        return;
      }

      localStorage.setItem("token", access);
      if (refresh) {
        localStorage.setItem("refresh", refresh);
      }

      onLogin(access);
    } catch (error) {
      setErrorMessage(
        error.response?.data?.detail ||
          error.response?.data?.error ||
          "Login failed. Check your credentials and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-brand-panel">
        <div className="brand-mark" aria-hidden="true">
          <span className="brand-mark__ring" />
          <span className="brand-mark__core">AQ</span>
        </div>
        <p className="eyebrow">AUTO-QA TPC</p>
        <h1>Login first, then move into the inspection dashboard.</h1>
        <p className="hero-copy">
          The Vite frontend is now connected to Django for auth, live detection,
          and role-based panels for admins, operators, and super admins.
        </p>
        <div className="status-pill">{apiMessage}</div>
      </section>

      <section className="auth-form-panel">
        <div className="section-heading">
          <p className="eyebrow">Secure access</p>
          <h2>Sign in to continue</h2>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              type="text"
              autoComplete="username"
              placeholder="Enter your username"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
            />
          </label>

          {errorMessage ? (
            <div className="notice notice--error">{errorMessage}</div>
          ) : null}

          <button
            className="primary-button"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}

export default Login;
