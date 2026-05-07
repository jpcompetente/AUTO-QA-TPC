import React, { useState } from 'react';
import { loginUser } from '../api/backend';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    // ✅ Basic validation before sending
    if (!username || !password) {
      setErrorMessage("Username and password are required");
      return;
    }

    try {
      const response = await loginUser({ username, password });
      console.log("Login response:", response.data);

      // ✅ Store both tokens
      const accessToken = response.data.access;
      const refreshToken = response.data.refresh;

      if (!accessToken) {
        setErrorMessage("No access token returned");
        return;
      }

      localStorage.setItem('token', accessToken);
      localStorage.setItem('refresh', refreshToken);

      // ✅ Pass token to App.js for decoding role
      onLogin(accessToken);
    } catch (error) {
      // 🔎 Full error logging
      console.error("FULL ERROR:", error);
      console.error("BACKEND RESPONSE:", error.response?.data);

      // ✅ Show backend message if available
      setErrorMessage(
        error.response?.data?.detail ||
        error.response?.data?.error ||
        "Login failed. Please check your credentials."
      );
    }
  };

  return (
    <div style={{ maxWidth: '300px', margin: '50px auto', textAlign: 'center' }}>
      <h2>Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ width: '100%', marginBottom: '10px', padding: '8px' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', marginBottom: '10px', padding: '8px' }}
        />
        <button type="submit" style={{ width: '100%', padding: '10px' }}>
          Login
        </button>
      </form>
      {errorMessage && (
        <p style={{ color: 'red', marginTop: '10px' }}>{errorMessage}</p>
      )}
    </div>
  );
};

export default Login;
