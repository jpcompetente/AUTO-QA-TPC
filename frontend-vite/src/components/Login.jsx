import { useState } from "react";
import { motion } from "framer-motion";
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
      {/* Animated background elements */}
      <div className="animated-bg-container">
        <motion.div
          className="floating-orb floating-orb--1"
          animate={{
            y: [0, -20, 0],
            x: [0, 10, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="floating-orb floating-orb--2"
          animate={{
            y: [0, -25, 0],
            x: [0, -15, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="floating-orb floating-orb--3"
          animate={{
            y: [0, -15, 0],
            x: [0, 20, 0],
          }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="animated-gradient"
          animate={{
            backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <div className="auth-shell__overlay" />

      <motion.section
        className="auth-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.div
          className="auth-brand"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <motion.div
            className="auth-brand__mark"
          >
            <img src={logoMark} alt="Team Pacific Corporation" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            IC DETECTION
          </motion.h1>
        </motion.div>

        <motion.div
          className="auth-card__title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h2>Login</h2>
        </motion.div>

        <motion.form
          className="auth-form"
          onSubmit={handleSubmit}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <motion.label
            className="field field--login"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.45 }}
          >
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
          </motion.label>

          <motion.label
            className="field field--login"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
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
          </motion.label>

          {errorMessage ? (
            <motion.div
              className="notice notice--error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {errorMessage}
            </motion.div>
          ) : null}

          <motion.button
            className="primary-button primary-button--login"
            type="submit"
            disabled={isSubmitting}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.55 }}
          >
            {isSubmitting ? "Signing in..." : "Login"}
          </motion.button>
        </motion.form>
      </motion.section>
    </div>
  );
}

export default Login;
