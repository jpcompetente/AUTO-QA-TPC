import { useState } from "react";
import { loginUser } from "../api/backend";
import loginBackground from "../assets/images/loginbgimage.webp";
import logoMark from "../assets/images/TPCLOGOONLY.png";

function Login({ onLogin }) {
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
    <div
      className="auth-shell"
      style={{ backgroundImage: `url(${loginBackground})` }}
    >
      <div className="auth-shell__overlay" />

      <section className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand__mark">
            <img src={logoMark} alt="Team Pacific Corporation" />
          </div>
          <h1>IC DETECTION</h1>
        </div>

        <div className="auth-card__title">
          <h2>Login</h2>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field field--login">
            <span>Username</span>
            <div className="field-control">
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                type="text"
                autoComplete="username"
                placeholder="Enter your username"
              />
            </div>
          </label>

          <label className="field field--login">
            <span>Password</span>
            <div className="field-control">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>
          </label>

          {errorMessage ? (
            <div className="notice notice--error">{errorMessage}</div>
          ) : null}

          <button
            className="primary-button primary-button--login"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Login"}
          </button>
        </form>
      </section>
    </div>
  );
}

export default Login;
