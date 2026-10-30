
import { useEffect, useState } from "react";
import {
  addToCart,
  getFavorites,
  removeFavorite,
} from "../services/api";

function Favorites({ onCartUpdate }) {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const loadFavorites = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        setError("Please log in to view your favorite plants.");
        setLoading(false);
        return;
      }

      try {
        const data = await getFavorites(token);
        setFavorites(data);
      } catch (err) {
        setError(err.message || "Unable to load favorites.");
      } finally {
        setLoading(false);
      }
    };

    void loadFavorites();
  }, []);

  const handleRemove = async (favorite) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    setError("");
    setMessage("");

    try {
      setBusyId(favorite.id);
      await removeFavorite(favorite.id, token);

      setFavorites((current) =>
        current.filter((item) => item.id !== favorite.id)
      );

      setMessage(`${favorite.name} removed from favorites.`);
    } catch (err) {
      setError(err.message || "Unable to remove favorite.");
    } finally {
      setBusyId(null);
    }
  };

  const handleAddToCart = async (plant) => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please log in to add plants to your cart.");
      return;
    }

    setError("");
    setMessage("");

    try {
      setBusyId(plant.id);
      await addToCart(plant.plant_id, 1, token);
      await onCartUpdate?.();
      setMessage(`${plant.name} added to your cart.`);
    } catch (err) {
      setError(err.message || "Unable to add plant to cart.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <p className="plants-message">Loading favorites...</p>;
  }

  return (
    <section className="plants-section">
      <div className="plants-header">
        <p>Your personal collection</p>
        <h1>Favorite Plants 💚</h1>
      </div>

      {message && (
        <p className="cart-success-message" role="status">
          {message}
        </p>
      )}

      {error && (
        <p className="cart-error-message" role="alert">
          {error}
        </p>
      )}

      {error ? null : favorites.length === 0 ? (
  <p>You haven't added any favorite plants yet.</p>
) : (
  <div className="plants-grid">
          {favorites.map((plant) => (
            <article className="plant-card" key={plant.id}>
              <img
                src={plant.image_url}
                alt={plant.name}
                className="plant-image"
              />

              <div className="plant-info">
                <h2>{plant.name}</h2>
                <p className="plant-price">₹{plant.price}</p>
                <p className="plant-stock">
                  {plant.stock > 0
                    ? `${plant.stock} available`
                    : "Out of stock"}
                </p>

                <button
                  type="button"
                  onClick={() => handleAddToCart(plant)}
                  disabled={plant.stock < 1 || busyId === plant.id}
                >
                  {plant.stock < 1
                    ? "Out of Stock"
                    : busyId === plant.id
                      ? "Adding..."
                      : "Add to Cart"}
                </button>

                <button
                  type="button"
                  onClick={() => handleRemove(plant)}
                  disabled={busyId === plant.id}
                >
                  Remove Favorite
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default Favorites;
