import { useEffect, useState } from "react";
import { addToCart, getPlants } from "../services/api";

function Plants({ onCartUpdate, searchQuery }) {
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyPlant, setBusyPlant] = useState(null);

  useEffect(() => {
    const loadPlants = async () => {
      try {
        const data = await getPlants();
        setPlants(data);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    loadPlants();
  }, []);

    const handleAddToCart = async (plant) => {
    const token = localStorage.getItem("token");

    setMessage("");
    setError("");



    if (!token) {
      setError("Please log in to add plants to your cart.");
      return;
    }

    try {
      setBusyPlant(plant.id);

      await addToCart(plant.id, 1, token);
      await onCartUpdate();

      setMessage(`${plant.name} added to your cart!`);
    } catch (err) {
      setError(err.message || "Unable to add plant to cart.");
    } finally {
      setBusyPlant(null);
    }
  };

    const filteredPlants = plants.filter((plant) =>
    plant.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  if (loading) {
    return <p className="plants-message">Loading plants...</p>;
  }

  if (error) {
    return (
      <p className="plants-message">
        Failed to load plants: {error}
      </p>
    );
  }

  return (
    <section className="plants-section">
      <div className="plants-header">
        <p>Explore our collection</p>
        <h1>Our Plants 🌿</h1>
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

{filteredPlants.length === 0 ? (
<p>
  {searchQuery.trim()
    ? `No plants found for "${searchQuery.trim()}".`
    : "No plants available."}
</p>
      ) : (
        <div className="plants-grid">
{filteredPlants.map((plant) => (
             <article className="plant-card" key={plant.id}>
              <img
                src={plant.image_url}
                alt={plant.name}
                className="plant-image"
              />

              <div className="plant-info">
                <h2>{plant.name}</h2>

                <p className="plant-price">
                  ₹{plant.price}
                </p>

                <p className="plant-stock">
                  {plant.stock > 0
                    ? `${plant.stock} available`
                    : "Out of stock"}
                </p>

                 <button
  type="button"
  onClick={() => handleAddToCart(plant)}
  disabled={plant.stock < 1 || busyPlant === plant.id}
>
  {busyPlant === plant.id
    ? "Adding..."
    : plant.stock < 1
      ? "Out of Stock"
      : "Add to Cart"}
</button>

              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default Plants;