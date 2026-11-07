
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin, verifyAdminOtp } from "../services/api";

function AdminLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const result = await adminLogin(email, password);

      if (result.requiresOtp) {
        setPassword("");
        setShowPassword(false);
        setRequiresOtp(true);
        setMessage("Verification code sent to your admin email.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();

    if (!/^\d{6}$/.test(otp)) {
      setError("Please enter a valid 6-digit OTP.");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const result = await verifyAdminOtp(email, otp);

      localStorage.setItem("adminToken", result.token);
      localStorage.setItem("adminUser", JSON.stringify(result.admin));

      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="admin-login">
      <div className="admin-login-card">
        <h1>🌿 The Plant Park</h1>

        <h2>Admin Login</h2>

        <p>Secure access to the administration panel.</p>

        {!requiresOtp ? (
          <form onSubmit={handleLogin}>
            <label htmlFor="admin-email">Email Address</label>

            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter admin email"
              required
            />

            <label htmlFor="admin-password">Password</label>

            <div
              style={{
                position: "relative",
                width: "100%",
              }}
            >
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                required
                style={{
                  width: "100%",
                  paddingRight: "45px",
                }}
              />

              <button
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  padding: "5px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "inherit",
                }}
              >
                {showPassword ? (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                    <path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 9 4 10 7-.4 1.2-1.3 2.4-2.5 3.4" />
                    <path d="M6.2 6.2C3.9 7.5 2.4 9.6 2 12c1 3 5 7 10 7 1 0 2-.2 2.9-.5" />
                  </svg>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            <button type="submit" disabled={loading}>
              {loading ? "Please wait..." : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <label htmlFor="admin-otp">
              Email Verification Code
            </label>

            <input
              id="admin-otp"
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, ""))
              }
              placeholder="Enter 6-digit code"
              required
            />

            <button type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Verify & Login"}
            </button>

            <button
              type="button"
              onClick={() => {
                setRequiresOtp(false);
                setOtp("");
                setError("");
                setMessage("");
              }}
              disabled={loading}
            >
              Back
            </button>
          </form>
        )}

        {message && (
          <p className="admin-success">{message}</p>
        )}

        {error && (
          <p className="admin-error">{error}</p>
        )}
      </div>
    </section>
  );
}

export default AdminLogin;
