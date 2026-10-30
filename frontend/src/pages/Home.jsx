import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import { addToCart, getPlants } from "../services/api";

const categories = [
  { name: "Plants", icon: "🌿", link: "/plants" },
  { name: "Pots", icon: "🪴", link: "/pots" },
  { name: "Soil", icon: "🌱", link: "/soil" },
  { name: "Fertilisers", icon: "🌾", link: "/fertilisers" },
  { name: "Seeds", icon: "🌰", link: "/seeds" },
  { name: "Garden Tools", icon: "🛠️", link: "/garden-tools" },
  { name: "Watering", icon: "💧", link: "/watering" },
  { name: "Pest Control", icon: "🐛", link: "/pest-control" },
  { name: "Gardening Decor", icon: "🏡", link: "/gardening-decor" },
];

function Home({ onCartUpdate }) {
const [plants, setPlants] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const loadPlants = async () => {
      try {
        const data = await getPlants();
        setPlants(data);
      } catch (error) {
        console.error("Failed to load plants:", error);
      }
    };

    loadPlants();
  }, []);

  const handleAddToCart = async (plantId) => {
    const token = localStorage.getItem("token");

    setMessage("");
    setError("");

    if (!token) {
      setError("Please login to add items to your cart.");
      return;
    }

    try {
      await addToCart(plantId, 1, token);
      await onCartUpdate();


      setMessage("🌿 Plant added to cart!");


      setTimeout(() => {
        setMessage("");
      }, 2500);
    } catch (error) {
      setError(error.message);

      setTimeout(() => {
        setError("");
      }, 3000);
    }
  };

  return (
    <div className="home-page">

      {/* Hero */}
      <section className="hero-section">
        <div className="hero-content">
          <p className="hero-eyebrow">BRING NATURE HOME</p>

          <h1>
            Fresh Plants
            <br />
            for a Healthier You
          </h1>

          <p className="hero-description">
            Beautiful plants, quality pots, and everything
            you need for your green space.
          </p>

          <Link to="/plants" className="hero-button">
            Shop Now →
          </Link>
        </div>
      </section>

      {/* Categories */}
      <section className="categories-section">
        <div className="categories-list">
          {categories.map((category) => (
            <Link
              to={category.link}
              className="category-item"
              key={category.name}
            >
              <div className="category-circle">
                <span>{category.icon}</span>
              </div>

              <p>{category.name}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Plants */}
      <section className="popular-plants-section">

        <div className="section-heading">
          <div>
            <p className="section-eyebrow">🌿 OUR PLANTS</p>
            <h2>Popular Plants</h2>
          </div>

          <Link to="/plants" className="view-all">
            View All →
          </Link>
        </div>

        {message && (
          <p className="cart-success-message">
            {message}
          </p>
        )}

        {error && (
          <p className="cart-error-message">
            {error}
          </p>
        )}

        <div className="plant-grid">

          {plants.slice(0, 4).map((plant) => (
            <article
              className="home-plant-card"
              key={plant.id}
            >

              <div className="home-plant-image-wrapper">
                <img
                  src={plant.image_url}
                  alt={plant.name}
                  className="home-plant-image"
                />

                <span className="stock-badge">
                  {plant.stock > 0
                    ? "In Stock"
                    : "Out of Stock"}
                </span>
              </div>

              <div className="home-plant-info">

                <h3>{plant.name}</h3>

                <p className="home-plant-price">
                  ₹{plant.price}
                </p>

                <p className="home-plant-stock">
                  Stock: {plant.stock}
                </p>

                <button
                  type="button"
                  className="add-cart-button"
                  onClick={() => handleAddToCart(plant.id)}
                  disabled={plant.stock < 1}
                >
                  🛒 Add to Cart
                </button>

              </div>

            </article>
          ))}

        </div>

      </section>

    </div>
  );
}

export default Home;