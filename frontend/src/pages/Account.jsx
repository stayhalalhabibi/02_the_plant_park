
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

function Account() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const verifyAccount = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      try {
        const data = await apiRequest("/auth/profile", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (active) {
          setUser(data.user || data);
        }
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");

          if (active) {
            setUser(null);
          }
        } else {
          console.error("Unable to verify account:", error);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    verifyAccount();

    return () => {
      active = false;
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  if (loading) {
    return (
      <section className="auth-page">
        <div className="auth-card">
          <p>Verifying your account...</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="auth-page">
        <div className="auth-card">
          <h1>Please log in</h1>
          <p>Log in with your email OTP to access your account.</p>
          <button onClick={() => navigate("/login")}>
            Login
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <div className="auth-card">
        <p className="auth-eyebrow">🌿 MY ACCOUNT</p>
        <h1>Welcome{user.name ? `, ${user.name}` : ""}!</h1>

        <p className="auth-description">
          Your Plant Park account
        </p>

        <p>
          <strong>Email:</strong> {user.email || "Not available"}
        </p>

        <button onClick={() => navigate("/plants")}>
          Browse Plants
        </button>

        <button
          type="button"
          className="secondary-auth-button"
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </section>
  );
}

export default Account;
