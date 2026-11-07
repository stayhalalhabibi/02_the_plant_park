
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

// Admin Authentication
const adminLogin = (email, password) =>
  apiRequest("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

const verifyAdminOtp = (email, otp) =>
  apiRequest("/admin/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });
const acceptAdminInvitation = (token, password) =>
  apiRequest("/admin/auth/accept-invitation", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });

const getCategories = () => apiRequest("/categories");
const getCart = (token) =>
  apiRequest("/cart", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

const getCartPricing = (token) =>
  apiRequest("/cart/pricing", {
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
  const getAdminPlants = (
  token,
  { page = 1, limit = 20, search = "", status = "all" } = {}
) => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    search,
    status,
  });

  return apiRequest(`/admin/plants?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

const getAdminPlant = (token, plantId) =>
  apiRequest(`/admin/plants/${encodeURIComponent(plantId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

const createAdminPlant = (token, plantData) =>
  apiRequest("/admin/plants", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(plantData),
  });

const updateAdminPlant = (token, plantId, plantData) =>
  apiRequest(`/admin/plants/${encodeURIComponent(plantId)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(plantData),
  });

const archiveAdminPlant = (token, plantId) =>
  apiRequest(`/admin/plants/${encodeURIComponent(plantId)}/archive`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

const restoreAdminPlant = (token, plantId) =>
  apiRequest(`/admin/plants/${encodeURIComponent(plantId)}/restore`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const getAdminCustomers = (token, { page = 1, limit = 20, search = "" } = {}) => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    search,
  });

  return apiRequest(`/admin/customers?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

const getAdminCustomer = (token, customerId) =>
  apiRequest(`/admin/customers/${encodeURIComponent(customerId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

const getAdminCustomerOrders = (
  token,
  customerId,
  { page = 1, limit = 20 } = {}
) => {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  return apiRequest(
    `/admin/customers/${encodeURIComponent(customerId)}/orders?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};

export {
  API_BASE_URL,
  apiRequest,
  adminLogin,
  acceptAdminInvitation,
  verifyAdminOtp,
  getAdminPlants,
  getAdminPlant,
  createAdminPlant,
  updateAdminPlant,
  archiveAdminPlant,
  restoreAdminPlant,
  getAdminCustomers,
  getAdminCustomer,
  getAdminCustomerOrders,
  getPlants,
  getCategories,
  getCart,
  getCartPricing,
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
