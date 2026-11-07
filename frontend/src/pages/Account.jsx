
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../services/api";

function Account() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminSession, setAdminSession] = useState(
    () => Boolean(localStorage.getItem("adminToken"))
  );

  useEffect(() => {
    let active = true;

    const verifyAccount = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        if (active) setLoading(false);
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

          if (active) setUser(null);
        } else {
          console.error("Unable to verify account:", error);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void verifyAccount();

    return () => {
      active = false;
    };
  }, []);

  const handleUserLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login", { replace: true });
  };

  const handleAdminLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    setAdminSession(false);
    navigate("/account", { replace: true });
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

  if (user || adminSession) {
    return (
      <section className="auth-page">
        <div className="auth-card">
          <p className="auth-eyebrow">🌿 MY ACCOUNT</p>

          {user && (
            <>
              <h1>Welcome{user.name ? `, ${user.name}` : ""}!</h1>
              <p className="auth-description">
                Your Plant Park customer account
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
                onClick={handleUserLogout}
              >
                Customer Logout
              </button>
            </>
          )}

          {adminSession && (
            <>
              <h2>Admin Access</h2>
              <p className="auth-description">
                Your admin session is available.
              </p>

              <button onClick={() => navigate("/admin/dashboard")}>
                Open Admin Dashboard
              </button>

              <button
                type="button"
                className="secondary-auth-button"
                onClick={handleAdminLogout}
              >
                Admin Logout
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="account-selection">
      <div className="account-selection-card">
        <h1>🌿 The Plant Park</h1>
        <h2>Welcome!</h2>
        <p>Choose how you want to continue.</p>

        <div className="account-options">
          <Link to="/login" className="account-option">
            <span className="account-icon">👤</span>
            <h3>Login as User</h3>
            <p>
              Shop plants, manage your cart, and view your orders.
            </p>
            <span className="account-option-link">
              Continue as User →
            </span>
          </Link>

          <Link to="/admin/login" className="account-option">
            <span className="account-icon">🛡️</span>
            <h3>Login as Admin</h3>
            <p>
              Access the administration panel and manage the website.
            </p>
            <span className="account-option-link">
              Continue as Admin →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default Account;
