import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { acceptAdminInvitation } from "../services/api";

function AdminAcceptInvitation() {
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!/^[a-fA-F0-9]{64}$/.test(invitationToken)) {
      setError("Invalid invitation link. Please contact the Owner.");
      return;
    }

    const passwordBytes = new TextEncoder().encode(password).length;

    if (passwordBytes < 8 || passwordBytes > 72) {
      setError("Password must be between 8 and 72 bytes.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await acceptAdminInvitation(invitationToken, password);
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="admin-login">
      <div className="admin-login-card">
        <h1>The Plant Park</h1>
        <h2>Accept Admin Invitation</h2>

        {success ? (
          <>
            <p className="admin-success">
              Your admin account has been created successfully.
            </p>

            <p>You can now sign in using your new password.</p>

            <Link to="/admin/login">
              Go to Admin Login
            </Link>
          </>
        ) : (
          <>
            <p>Create a secure password to activate your admin account.</p>

            <form onSubmit={handleSubmit}>
              <label htmlFor="admin-new-password">
                New Password
              </label>

              <input
                id="admin-new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create a password"
                required
              />

              <label htmlFor="admin-confirm-password">
                Confirm Password
              </label>

              <input
                id="admin-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                placeholder="Confirm your password"
                required
              />

              <button type="submit" disabled={loading}>
                {loading ? "Creating Account..." : "Accept Invitation"}
              </button>
            </form>
          </>
        )}

        {error && <p className="admin-error">{error}</p>}
      </div>
    </section>
  );
}

export default AdminAcceptInvitation;