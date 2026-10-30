
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const apiRequest = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const contentType = response.headers.get("content-type");

  const data = contentType?.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const error = new Error(
      data?.message || `Request failed with status ${response.status}`
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
};

const getPlants = () => apiRequest("/plants");

const getCategories = () => apiRequest("/categories");

const getCart = (token) =>
  apiRequest("/cart", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

const getFavorites = (token) =>
  apiRequest("/favorites", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

const addFavorite = (plantId, token) =>
  apiRequest("/favorites", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      plant_id: plantId,
    }),
  });

const removeFavorite = (favoriteId, token) =>
  apiRequest(`/favorites/${favoriteId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

const addToCart = (plantId, quantity = 1, token) =>
  apiRequest("/cart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      plant_id: plantId,
      quantity,
    }),
  });

const updateCartItem = (cartItemId, quantity, token) =>
  apiRequest(`/cart/${cartItemId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ quantity }),
  });

const removeCartItem = (cartItemId, token) =>
  apiRequest(`/cart/${cartItemId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

const createOrder = (shippingAddress, token) =>
  apiRequest("/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      shipping_address: shippingAddress,
    }),
  });

const getOrder = (orderId, token) =>
  apiRequest(`/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

const createRazorpayOrder = (orderId, token) =>
  apiRequest("/payments/create-order", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      order_id: orderId,
    }),
  });

const verifyPayment = (paymentDetails, token) =>
  apiRequest("/payments/verify-payment", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(paymentDetails),
  });

export {
  API_BASE_URL,
  apiRequest,
  getPlants,
  getCategories,
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  createOrder,
  getOrder,
  createRazorpayOrder,
  verifyPayment,
  getFavorites,
  addFavorite,
  removeFavorite,
};
