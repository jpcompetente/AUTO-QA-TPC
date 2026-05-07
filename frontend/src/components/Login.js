import React, { useState } from "react";
import { loginUser } from "../api/backend";

const Login = ({ onLogin, apiMessage }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    if (!username || !password) {
      setErrorMessage("Username and password are required");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await loginUser({ username, password });
      const accessToken = response.data.access;
      const refreshToken = response.data.refresh;

      if (!accessToken) {
        setErrorMessage("No access token returned");
        setIsSubmitting(false);
        return;
      }

      localStorage.setItem("token", accessToken);
      localStorage.setItem("refresh", refreshToken);

      onLogin(accessToken);
    } catch (error) {
      console.error("FULL ERROR:", error);
      console.error("BACKEND RESPONSE:", error.response?.data);

      setErrorMessage(
        error.response?.data?.detail ||
          error.response?.data?.error ||
          "Login failed. Please check your credentials.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-shell">
        <section className="auth-brand-panel">
          <div className="brand-mark">
            <img src="/logo192.png" alt="AUTO-QA TPC logo" />
          </div>
          <span className="eyebrow">Quality inspection console</span>
          <h1>React-powered operations for admins and operators.</h1>
          <p>
            A cleaner, faster interface for AI inspection workflows, log review,
            and configuration management.
          </p>
          <div className="status-pill">{apiMessage || "Backend ready"}</div>
        </section>

        <section className="auth-form-panel">
          <div className="section-heading">
            <span className="eyebrow">Secure sign in</span>
            <h2>Login to your workspace</h2>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {errorMessage && (
              <div className="notice notice--error">{errorMessage}</div>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default Login;
