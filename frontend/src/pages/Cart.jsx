
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getCart,
  updateCartItem,
  removeCartItem,
} from "../services/api";

function Cart({ onCartUpdate }) {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");
  const [busyItem, setBusyItem] = useState(null);

  const loadCart = useCallback(async () => {
    if (!token) return;

    try {
      const data = await getCart(token);
      setCartItems(data);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load your cart.");
    } finally {
      setLoading(false);
    }
  }, [token]);

   useEffect(() => {
  if (!token) return;

  let cancelled = false;

  const fetchCart = async () => {
    try {
      const data = await getCart(token);

      if (!cancelled) {
        setCartItems(data);
        setError("");
      }
    } catch (err) {
      if (!cancelled) {
        setError(err.message || "Unable to load your cart.");
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  };

  void fetchCart();

  return () => {
    cancelled = true;
  };
}, [token]);

  const changeQuantity = async (item, quantity) => {
    if (quantity < 1) return;

    try {
      setBusyItem(item.id);
      setError("");

    await updateCartItem(item.id, quantity, token);
await loadCart();
await onCartUpdate();

    } catch (err) {
      setError(err.message || "Unable to update quantity.");
    } finally {
      setBusyItem(null);
    }
  };

  const deleteItem = async (itemId) => {
    try {
      setBusyItem(itemId);
      setError("");

      await removeCartItem(itemId, token);
await loadCart();
await onCartUpdate();

    } catch (err) {
      setError(err.message || "Unable to remove item.");
    } finally {
      setBusyItem(null);
    }
  };

  const total = cartItems.reduce(
    (sum, item) =>
      sum + Number(item.price) * Number(item.quantity),
    0
  );

  if (loading) {
    return (
      <div className="cart-page">
        <p>Loading your cart...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="cart-page">
        <h1>Your Shopping Cart</h1>
        <p>Please log in to view your cart.</p>
        <Link to="/login" className="cart-button">
          Login
        </Link>
      </div>
    );
  }

  return (
    <section className="cart-page">
      <h1>Your Shopping Cart</h1>

      {error && <p className="cart-error">{error}</p>}

      {cartItems.length === 0 ? (
        <div className="cart-empty">
          <p>Your cart is empty.</p>
          <Link to="/plants" className="cart-button">
            Explore Plants
          </Link>
        </div>
      ) : (
        <>
          <div className="cart-items">
            {cartItems.map((item) => (
              <article className="cart-item" key={item.id}>
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="cart-item-image"
                />

                <div className="cart-item-details">
                  <h2>{item.name}</h2>
                  <p>Price: ₹{Number(item.price).toFixed(2)}</p>
                  <p>
                    Subtotal: ₹
                    {(
                      Number(item.price) * Number(item.quantity)
                    ).toFixed(2)}
                  </p>

                  <div className="cart-quantity">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${item.name}`}
                      disabled={
                        busyItem === item.id ||
                        Number(item.quantity) <= 1
                      }
                      onClick={() =>
                        changeQuantity(
                          item,
                          Number(item.quantity) - 1
                        )
                      }
                    >
                      −
                    </button>

                    <span>{item.quantity}</span>

                    <button
                      type="button"
                      aria-label={`Increase quantity of ${item.name}`}
                      disabled={busyItem === item.id}
                      onClick={() =>
                        changeQuantity(
                          item,
                          Number(item.quantity) + 1
                        )
                      }
                    >
                      +
                    </button>

                    <button
                      type="button"
                      className="cart-remove"
                      disabled={busyItem === item.id}
                      onClick={() => deleteItem(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="cart-summary">
            <h2>Order Summary</h2>
            <p>
              Total: <strong>₹{total.toFixed(2)}</strong>
            </p>

            <button
              type="button"
              className="cart-button"
              onClick={() => navigate("/checkout")}
            >
              Proceed to Checkout
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default Cart;
