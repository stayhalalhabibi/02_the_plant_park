
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../services/api";

function Login() {
  const navigate = useNavigate();

  const [method, setMethod] = useState("email");
  const [contact, setContact] = useState("");
  const [otp, setOtp] = useState("");

  const [otpSent, setOtpSent] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [profileToken, setProfileToken] = useState("");

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const saveLogin = (data) => {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    navigate("/");
  };

  const handleSendOtp = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const payload =
        method === "email"
          ? {
              method,
              email: contact.trim(),
            }
          : {
              method,
              phone: contact.trim(),
            };

      const data = await apiRequest("/auth/send-otp", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setOtpSent(true);
      setMessage(data.message);
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
      const payload =
        method === "email"
          ? {
              method,
              email: contact.trim(),
              otp: otp.trim(),
            }
          : {
              method,
              phone: contact.trim(),
              otp: otp.trim(),
            };

      const data = await apiRequest("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (data.needsProfile) {
        setProfileToken(data.profileToken);
        setNeedsProfile(true);
        setMessage(data.message);
      } else {
        saveLogin(data);
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteProfile = async (event) => {
    event.preventDefault();

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const data = await apiRequest("/auth/complete-profile", {
        method: "POST",
        body: JSON.stringify({
          profileToken,
          name: name.trim(),
          age: age ? Number(age) : undefined,
          sex: sex || undefined,
        }),
      });

      saveLogin(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeContact = () => {
    setContact("");
    setOtp("");
    setOtpSent(false);
    setNeedsProfile(false);
    setProfileToken("");
    setName("");
    setAge("");
    setSex("");
    setError("");
    setMessage("");
  };

  return (
    <section className="auth-page">
      <div className="auth-card">

        <p className="auth-eyebrow">
          🌿 WELCOME TO THE PLANT PARK
        </p>

        <h1>
          {needsProfile
            ? "Complete Your Profile"
            : "Login to The Plant Park"}
        </h1>

        <p className="auth-description">
          {needsProfile
            ? "Just a few details to create your account."
            : "Login securely using a one-time password."}
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

        {/* STEP 1: Choose contact method and send OTP */}
        {!otpSent && !needsProfile && (
          <form
            className="auth-form"
            onSubmit={handleSendOtp}
          >
            <label htmlFor="method">
              Verify using
            </label>

            <select
              id="method"
              value={method}
              onChange={(event) => {
                setMethod(event.target.value);
                setContact("");
                setError("");
                setMessage("");
              }}
            >
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>

            <label htmlFor="contact">
              {method === "email"
                ? "Email Address"
                : "Indian Mobile Number"}
            </label>

            <input
              id="contact"
              type={method === "email" ? "email" : "tel"}
              inputMode={
                method === "email" ? "email" : "tel"
              }
              value={contact}
              onChange={(event) =>
                setContact(event.target.value)
              }
              placeholder={
                method === "email"
                  ? "Enter your email"
                  : "Enter your 10-digit mobile number"
              }
              required
            />

            <button
              type="submit"
              disabled={loading}
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        )}

        {/* STEP 2: Verify OTP */}
        {otpSent && !needsProfile && (
          <form
            className="auth-form"
            onSubmit={handleVerifyOtp}
          >
            <label htmlFor="otp">
              Enter 6-digit OTP
            </label>

            <input
              id="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(event) =>
                setOtp(
                  event.target.value
                    .replace(/\D/g, "")
                    .slice(0, 6)
                )
              }
              placeholder="Enter OTP"
              autoComplete="one-time-code"
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
              onClick={handleChangeContact}
            >
              Change Email / Phone
            </button>
          </form>
        )}

        {/* STEP 3: Complete new customer profile */}
        {needsProfile && (
          <form
            className="auth-form"
            onSubmit={handleCompleteProfile}
          >
            <label htmlFor="name">
              Full Name
            </label>

            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) =>
                setName(event.target.value)
              }
              placeholder="Enter your full name"
              maxLength={100}
              required
            />

            <label htmlFor="age">
              Age (Optional)
            </label>

            <input
              id="age"
              type="number"
              min="1"
              max="120"
              value={age}
              onChange={(event) =>
                setAge(event.target.value)
              }
              placeholder="Enter your age"
            />

            <label htmlFor="sex">
              Sex (Optional)
            </label>

            <select
              id="sex"
              value={sex}
              onChange={(event) =>
                setSex(event.target.value)
              }
            >
              <option value="">Prefer not to say</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>

            <button
              type="submit"
              disabled={loading}
            >
              {loading
                ? "Creating Account..."
                : "Complete Registration"}
            </button>

            <button
              type="button"
              className="secondary-auth-button"
              onClick={handleChangeContact}
            >
              Start Again
            </button>
          </form>
        )}

      </div>
    </section>
  );
}

export default Login;
