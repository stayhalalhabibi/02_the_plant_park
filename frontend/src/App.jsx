import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Link } from "react-router-dom";

import Home from "./pages/Home";
import Plants from "./pages/Plants";
import Login from "./pages/Login";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess";
import { getCart } from "./services/api";
import Account from "./pages/Account";
import Favorites from "./pages/Favorites";
import About from "./pages/About";
import Contact from "./pages/Contact";

import "./App.css";

function App() {
  const [cartCount, setCartCount] = useState(0);
const [searchQuery, setSearchQuery] = useState(
  () => new URLSearchParams(window.location.search).get("search") || ""
);

  const refreshCartCount = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      setCartCount(0);
      return;
    }

    try {
      const items = await getCart(token);

      const totalQuantity = items.reduce(
        (total, item) => total + Number(item.quantity || 0),
        0
      );

      setCartCount(totalQuantity);
    } catch {
      setCartCount(0);
    }
  }, []);

   useEffect(() => {
  const token = localStorage.getItem("token");

  if (!token) return;

  let cancelled = false;

  const loadInitialCartCount = async () => {
    try {
      const items = await getCart(token);

      if (!cancelled) {
        const totalQuantity = items.reduce(
          (total, item) => total + Number(item.quantity || 0),
          0
        );

        setCartCount(totalQuantity);
      }
    } catch {
      if (!cancelled) {
        setCartCount(0);
      }
    }
  };

  void loadInitialCartCount();

  return () => {
    cancelled = true;
  };
}, []);

  return (

    <BrowserRouter>
      <div className="app">

        {/* Promotional Bar */}
        <div className="promo-bar">
          <div className="promo-content">
            <span>🚚 FREE SHIPPING ABOVE ₹499</span>
            <span>🌿 BUY ANY 4 PLANTS @ ₹1,199</span>
            <span>✨ GET 10% OFF ON ORDERS ABOVE ₹1,499</span>
          </div>
        </div>

        {/* Header */}
        <header className="header">

          <div className="header-main">

            {/* Logo */}
            <Link to="/" className="logo">
              <span className="logo-symbol">🌿</span>
              <span>The Plant Park</span>
            </Link>

            {/* Main Navigation */}
            <nav className="main-nav">
              <NavLink to="/">Home</NavLink>
              <NavLink to="/about">About</NavLink>
              <NavLink to="/plants">Plants</NavLink>
              <NavLink to="/favorites">Favorites</NavLink>
              <NavLink to="/contact">Contact</NavLink>
            </nav>

            {/* Search */}
          <form
  className="search-box"
  onSubmit={(event) => {
    event.preventDefault();
    window.location.href = `/plants?search=${encodeURIComponent(searchQuery.trim())}`;
  }}
>
  <span>⌕</span>
  <input
    type="search"
    placeholder="Search plants..."
    value={searchQuery}
    onChange={(event) => setSearchQuery(event.target.value)}
    aria-label="Search plants"
  />
</form>

            {/* Header Actions */}
            <div className="header-actions">

              <Link
  to={localStorage.getItem("token") ? "/account" : "/login"}
  className="header-action"
>
  <span>♙</span>
  <span>Account</span>
</Link>

              <Link to="/cart" className="header-action cart">
                <span>🛒</span>
                <span>Cart</span>
                <small>{cartCount}</small>
              </Link>

            </div>

          </div>

        </header>

        {/* Pages */}
        <main>
          <Routes>
            <Route
  path="/"
  element={<Home onCartUpdate={refreshCartCount} />}
/>
<Route
  path="/plants"
  element={
    <Plants
      onCartUpdate={refreshCartCount}
      searchQuery={searchQuery}
    />
  }
/>
      <Route
  path="/favorites"
  element={<Favorites onCartUpdate={refreshCartCount} />}
/>
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/login" element={<Login />} />
            <Route path="/account" element={<Account />} />
            <Route

  path="/cart"
  element={<Cart onCartUpdate={refreshCartCount} />}
/>
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order-success/:id" element={<OrderSuccess />} />

          </Routes>
        </main>

        {/* Footer */}
        <footer className="footer">
          <div className="footer-inner">

            <div>
              <div className="footer-logo">
                🌿 The Plant Park
              </div>

              <p>
                Green Today • Healthier Tomorrow
              </p>
            </div>

            <div className="footer-links">
              <Link to="/">Home</Link>
              <Link to="/about">About</Link>
              <Link to="/plants">Plants</Link>
              <Link to="/favorites">Favorites</Link>
              <Link to="/contact">Contact</Link>
            </div>

          </div>

          <div className="footer-bottom">
            © 2026 The Plant Park. All rights reserved.
          </div>
        </footer>

      </div>
    </BrowserRouter>
  );
}

export default App;