import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../services/api";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");

  const [otpSent, setOtpSent] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(false);

  const handleSendOtp = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const data = await apiRequest("/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({
          email,
        }),
      });

      setOtpSent(true);

      setMessage(
        `OTP sent successfully. Development OTP: ${data.otp}`,
      );
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const data = await apiRequest("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({
          email,
          otp,
        }),
      });

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      navigate("/");
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = () => {
    setOtp("");
    setOtpSent(false);
    setError("");
    setMessage("");
  };

  return (
    <section className="auth-page">
      <div className="auth-card">

        <p className="auth-eyebrow">
          🌿 WELCOME BACK
        </p>

        <h1>Login to The Plant Park</h1>

        <p className="auth-description">
          Login securely using a one-time password.
        </p>

        {error && (
          <p className="auth-error">
            {error}
          </p>
        )}

        {message && (
          <p className="auth-success">
            {message}
          </p>
        )}

        {!otpSent ? (
          <form
            className="auth-form"
            onSubmit={handleSendOtp}
          >
            <label htmlFor="email">
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
              required
            />

            <button
              type="submit"
              disabled={loading}
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form
            className="auth-form"
            onSubmit={handleVerifyOtp}
          >
            <label htmlFor="otp">
              Enter OTP
            </label>

            <input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength="6"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder="Enter 6-digit OTP"
              required
            />

            <button
              type="submit"
              disabled={loading}
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>

            <button
              type="button"
              className="secondary-auth-button"
              onClick={handleChangeEmail}
            >
              Change Email
            </button>
          </form>
        )}

      </div>
    </section>
  );
}

export default Login;