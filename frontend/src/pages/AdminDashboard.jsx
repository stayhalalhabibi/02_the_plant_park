
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  apiRequest,
  getAdminCustomers,
  getAdminCustomer,
  getAdminCustomerOrders,
  getAdminPlants,
  getAdminPlant,
  getCategories,
  createAdminPlant,
  updateAdminPlant,
  archiveAdminPlant,
  restoreAdminPlant,
} from "../services/api";

const ITEMS_PER_PAGE = 20;

// Fetch the currently authenticated admin.
const fetchAdminProfile = async (token) => {
  return apiRequest("/admin/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

function AdminDashboard() {
  const navigate = useNavigate();

  // ======================================================
  // ADMIN AUTHENTICATION
  // ======================================================

  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [error, setError] = useState("");

  const handleLogout = useCallback(() => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");

    setAdmin(null);
    navigate("/admin/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    let isMounted = true;

    const verifyAdminSession = async () => {
      const token = localStorage.getItem("adminToken");

      if (!token) {
        if (isMounted) {
          setAuthLoading(false);
        }

        handleLogout();
        return;
      }

      try {
        const data = await fetchAdminProfile(token);

        if (!data.admin) {
          throw new Error("Admin profile not found.");
        }

        if (isMounted) {
          setAdmin(data.admin);

          localStorage.setItem(
            "adminUser",
            JSON.stringify(data.admin)
          );

          setError("");
        }
      } catch {
        if (isMounted) {
          setError(
            "Your admin session has expired. Please log in again."
          );

          handleLogout();
        }
      } finally {
        if (isMounted) {
          setAuthLoading(false);
        }
      }
    };

    verifyAdminSession();

    return () => {
      isMounted = false;
    };
  }, [handleLogout]);

  // Check whether the current admin has a permission.
  const hasPermission = useCallback(
    (permission) => {
      if (!admin) {
        return false;
      }

      if (admin.role === "owner") {
        return true;
      }

      return (
        Array.isArray(admin.permissions) &&
        admin.permissions.includes(permission)
      );
    },
    [admin]
  );

  // ======================================================
  // CUSTOMER MANAGEMENT STATE
  // ======================================================

  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [customerPagination, setCustomerPagination] =
    useState(null);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerOrderPagination, setCustomerOrderPagination] =
    useState(null);

  // Load customers.
  const handleLoadCustomers = useCallback(
    async (page = 1) => {
      const token = localStorage.getItem("adminToken");

      if (!token) {
        handleLogout();
        return;
      }

      setCustomerLoading(true);
      setCustomerError("");

      try {
        const data = await getAdminCustomers(token, {
          page,
          limit: ITEMS_PER_PAGE,
          search: customerSearch,
        });

        setCustomers(data.customers || []);
        setCustomerPagination(data.pagination || null);

        setSelectedCustomer(null);
        setCustomerOrders([]);
        setCustomerOrderPagination(null);
      } catch (err) {
        if (err.status === 401) {
          handleLogout();
          return;
        }

        setCustomerError(
          err.status === 403
            ? "You do not have permission to manage customers."
            : "Unable to load customers. Please try again."
        );
      } finally {
        setCustomerLoading(false);
      }
    },
    [customerSearch, handleLogout]
  );

  // Load a customer's order history.
  const handleLoadCustomerOrders = useCallback(
    async (customerId, page = 1) => {
      const token = localStorage.getItem("adminToken");

      if (!token) {
        handleLogout();
        return;
      }

      setCustomerLoading(true);
      setCustomerError("");

      try {
        const data = await getAdminCustomerOrders(
          token,
          customerId,
          {
            page,
            limit: ITEMS_PER_PAGE,
          }
        );

        setCustomerOrders(data.orders || []);
        setCustomerOrderPagination(data.pagination || null);
      } catch (err) {
        if (err.status === 401) {
          handleLogout();
          return;
        }

        setCustomerError(
          err.status === 403
            ? "You do not have permission to view customer orders."
            : "Unable to load customer orders."
        );
      } finally {
        setCustomerLoading(false);
      }
    },
    [handleLogout]
  );

  // Load customer details and first page of orders.
  const handleViewCustomer = useCallback(
    async (customerId) => {
      const token = localStorage.getItem("adminToken");

      if (!token) {
        handleLogout();
        return;
      }

      setCustomerLoading(true);
      setCustomerError("");

      setSelectedCustomer(null);
      setCustomerOrders([]);
      setCustomerOrderPagination(null);

      try {
        const [customerData, ordersData] = await Promise.all([
          getAdminCustomer(token, customerId),
          getAdminCustomerOrders(token, customerId, {
            page: 1,
            limit: ITEMS_PER_PAGE,
          }),
        ]);

        setSelectedCustomer(customerData.customer);
        setCustomerOrders(ordersData.orders || []);
        setCustomerOrderPagination(ordersData.pagination || null);
      } catch (err) {
        if (err.status === 401) {
          handleLogout();
          return;
        }

        setCustomerError(
          err.status === 403
            ? "You do not have permission to view customer details."
            : "Unable to load customer details or order history."
        );
      } finally {
        setCustomerLoading(false);
      }
    },
    [handleLogout]
  );

  const handleCloseCustomer = () => {
    setSelectedCustomer(null);
    setCustomerOrders([]);
    setCustomerOrderPagination(null);
    setCustomerError("");
  };

  // ======================================================
  // PLANT MANAGEMENT STATE
  // ======================================================

  const [plants, setPlants] = useState([]);
  const [categories, setCategories] = useState([]);

  const [plantSearch, setPlantSearch] = useState("");
  const [plantStatus, setPlantStatus] = useState("all");

  const [plantLoading, setPlantLoading] = useState(false);
  const [plantSaving, setPlantSaving] = useState(false);

  const [plantError, setPlantError] = useState("");
  const [categoryError, setCategoryError] = useState("");

  const [plantPagination, setPlantPagination] = useState(null);

  // Plant form state.
  const [showPlantForm, setShowPlantForm] = useState(false);
  const [editingPlant, setEditingPlant] = useState(null);

  const [plantForm, setPlantForm] = useState({
    name: "",
    description: "",
    price: "",
    image_url: "",
    category_id: "",
  });

  // Load plants with search, status filter and pagination.
  const handleLoadPlants = useCallback(
    async (page = 1) => {
      const token = localStorage.getItem("adminToken");

      if (!token) {
        handleLogout();
        return;
      }

      setPlantLoading(true);
      setPlantError("");

      try {
        const data = await getAdminPlants(token, {
          page,
          limit: ITEMS_PER_PAGE,
          search: plantSearch,
          status: plantStatus,
        });

        setPlants(data.plants || []);
        setPlantPagination(data.pagination || null);
      } catch (err) {
        if (err.status === 401) {
          handleLogout();
          return;
        }

        setPlantError(
          err.status === 403
            ? "You do not have permission to manage plants."
            : err.message || "Failed to load plants."
        );
      } finally {
        setPlantLoading(false);
      }
    },
    [plantSearch, plantStatus, handleLogout]
  );

  // Automatically load plants when filters change.
  // Load plants when the admin session or filters change.
useEffect(() => {
  if (!admin || !hasPermission("manage_plants")) {
    return;
  }

  let isMounted = true;

  const loadPlants = async () => {
    try {
      const token = localStorage.getItem("adminToken");

      if (!token) {
        handleLogout();
        return;
      }

      const data = await getAdminPlants(token, {
        page: 1,
        limit: ITEMS_PER_PAGE,
        search: plantSearch,
        status: plantStatus,
      });

      if (isMounted) {
        setPlants(data.plants || []);
        setPlantPagination(data.pagination || null);
        setPlantError("");
      }
    } catch (err) {
      if (!isMounted) return;

      if (err.status === 401) {
        handleLogout();
        return;
      }

      setPlantError(
        err.status === 403
          ? "You do not have permission to manage plants."
          : err.message || "Failed to load plants."
      );
    }
  };

  loadPlants();

  return () => {
    isMounted = false;
  };
}, [
  admin,
  hasPermission,
  plantSearch,
  plantStatus,
  handleLogout,
]);

  // Load categories for the plant form.
  useEffect(() => {
    if (!admin || !hasPermission("manage_plants")) {
      return;
    }

    let isMounted = true;

    const loadCategories = async () => {
      try {
        const data = await getCategories();

        if (isMounted) {
          setCategories(data.categories || []);
          setCategoryError("");
        }
      } catch (err) {
        if (isMounted) {
          setCategoryError(
            err.message || "Failed to load categories."
          );
        }
      }
    };

    loadCategories();

    return () => {
      isMounted = false;
    };
  }, [admin, hasPermission]);

  // Reset the plant form.
  const resetPlantForm = () => {
    setPlantForm({
      name: "",
      description: "",
      price: "",
      image_url: "",
      category_id: "",
    });
  };

  // Open a blank form to create a plant.
  const handleAddPlant = () => {
    setEditingPlant(null);
    resetPlantForm();
    setPlantError("");
    setShowPlantForm(true);
  };

  // Load an existing plant into the form.
  const handleEditPlant = async (plantId) => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      handleLogout();
      return;
    }

    setPlantError("");

    try {
      const data = await getAdminPlant(token, plantId);
      const plant = data.plant;

      if (!plant) {
        throw new Error("Plant details not found.");
      }

      setEditingPlant(plant);

      setPlantForm({
        name: plant.name || "",
        description: plant.description || "",
        price: String(plant.price ?? ""),
        image_url: plant.image_url || "",
        category_id: plant.category_id
          ? String(plant.category_id)
          : "",
      });

      setShowPlantForm(true);
    } catch (err) {
      if (err.status === 401) {
        handleLogout();
        return;
      }

      setPlantError(
        err.message || "Failed to load plant details."
      );
    }
  };

  // Update a plant form field.
  const handlePlantFormChange = (event) => {
    const { name, value } = event.target;

    setPlantForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // Create or update a plant.
  const handleSavePlant = async (event) => {
    event.preventDefault();

    const token = localStorage.getItem("adminToken");

    if (!token) {
      handleLogout();
      return;
    }

    setPlantError("");
    setPlantSaving(true);

    const plantData = {
      name: plantForm.name.trim(),
      description: plantForm.description.trim(),
      price: Number(plantForm.price),
      image_url: plantForm.image_url.trim(),
      category_id: plantForm.category_id
        ? Number(plantForm.category_id)
        : null,
    };

    try {
      if (editingPlant) {
        await updateAdminPlant(
          token,
          editingPlant.id,
          plantData
        );
      } else {
        await createAdminPlant(token, plantData);
      }

      setShowPlantForm(false);
      setEditingPlant(null);
      resetPlantForm();

      await handleLoadPlants(1);
    } catch (err) {
      if (err.status === 401) {
        handleLogout();
        return;
      }

      setPlantError(
        err.message || "Failed to save plant."
      );
    } finally {
      setPlantSaving(false);
    }
  };

  // Close the plant form.
  const handleClosePlantForm = () => {
    setShowPlantForm(false);
    setEditingPlant(null);
    resetPlantForm();
    setPlantError("");
  };

  // Archive a plant instead of deleting it.
  const handleArchivePlant = async (plantId) => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      handleLogout();
      return;
    }

    setPlantError("");

    try {
      await archiveAdminPlant(token, plantId);
      await handleLoadPlants(1);
    } catch (err) {
      if (err.status === 401) {
        handleLogout();
        return;
      }

      setPlantError(
        err.message || "Failed to archive plant."
      );
    }
  };

  // Restore an archived plant.
  const handleRestorePlant = async (plantId) => {
    const token = localStorage.getItem("adminToken");

    if (!token) {
      handleLogout();
      return;
    }

    setPlantError("");

    try {
      await restoreAdminPlant(token, plantId);
      await handleLoadPlants(1);
    } catch (err) {
      if (err.status === 401) {
        handleLogout();
        return;
      }

      setPlantError(
        err.message || "Failed to restore plant."
      );
    }
  };

  // ======================================================
  // SHARED HELPERS
  // ======================================================

  const formatDate = (date) => {
    if (!date) {
      return "Not available";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "Not available";
    }

    return parsedDate.toLocaleString("en-IN");
  };

  const formatAmount = (amount) => {
    const value = Number(amount);

    if (!Number.isFinite(value)) {
      return "₹0.00";
    }

    return `₹${value.toFixed(2)}`;
  };

  // ======================================================
  // LOADING AND AUTHENTICATION SCREENS
  // ======================================================

  if (authLoading) {
    return (
      <main className="admin-dashboard">
        <p>Verifying admin session...</p>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="admin-dashboard">
        <p role="alert">
          {error || "Please log in to access the admin dashboard."}
        </p>

        <button
          type="button"
          onClick={() => navigate("/admin/login")}
        >
          Go to Admin Login
        </button>
      </main>
    );
  }

  // ======================================================
  // MAIN DASHBOARD
  // ======================================================

  return (
    <main className="admin-dashboard">

      {/* Dashboard Header */}
      <header className="admin-dashboard-header">
        <div>
          <h1>🌿 The Plant Park</h1>

          <p>
            Welcome, {admin.name || "Admin"}
          </p>

          <p>
            Role: {admin.role || "Admin"}
          </p>
        </div>

        <button type="button" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <section className="admin-dashboard-content">

        <h2>Admin Dashboard</h2>

        <p>
          Manage your Plant Park store operations from one place.
        </p>

        {/* Permission Overview */}
        <section className="admin-dashboard-permissions">
          <h3>Your Permissions</h3>

          <ul>
            <li>
              Manage Plants:{" "}
              {hasPermission("manage_plants") ? "Yes" : "No"}
            </li>

            <li>
              Manage Categories:{" "}
              {hasPermission("manage_categories") ? "Yes" : "No"}
            </li>

            <li>
              Manage Orders:{" "}
              {hasPermission("manage_orders") ? "Yes" : "No"}
            </li>

            <li>
              Manage Customers:{" "}
              {hasPermission("manage_customers") ? "Yes" : "No"}
            </li>

            <li>
              Manage Inventory:{" "}
              {hasPermission("manage_inventory") ? "Yes" : "No"}
            </li>

            <li>
              View Analytics:{" "}
              {hasPermission("view_analytics") ? "Yes" : "No"}
            </li>

            <li>
              View Audit Logs:{" "}
              {hasPermission("view_audit_logs") ? "Yes" : "No"}
            </li>
          </ul>
        </section>

        {/* ==================================================
            PLANT MANAGEMENT
        ================================================== */}

        {hasPermission("manage_plants") && (
          <section className="admin-plants">

            <h2>Plant Management</h2>

            <button
              type="button"
              onClick={handleAddPlant}
            >
              Add New Plant
            </button>

            {categoryError && (
              <p role="alert">{categoryError}</p>
            )}

            {plantError && (
              <p role="alert">{plantError}</p>
            )}

            {/* Plant Form */}
            {showPlantForm && (
              <form
                className="admin-plant-form"
                onSubmit={handleSavePlant}
              >
                <h3>
                  {editingPlant ? "Edit Plant" : "Add New Plant"}
                </h3>

                <label htmlFor="plant-name">
                  Plant Name
                </label>

                <input
                  id="plant-name"
                  type="text"
                  name="name"
                  value={plantForm.name}
                  onChange={handlePlantFormChange}
                  maxLength={150}
                  required
                />

                <label htmlFor="plant-description">
                  Description
                </label>

                <textarea
                  id="plant-description"
                  name="description"
                  value={plantForm.description}
                  onChange={handlePlantFormChange}
                  maxLength={5000}
                  rows={4}
                />

                <label htmlFor="plant-price">
                  Price (₹)
                </label>

                <input
                  id="plant-price"
                  type="number"
                  name="price"
                  value={plantForm.price}
                  onChange={handlePlantFormChange}
                  min="0.01"
                  max="10000000"
                  step="0.01"
                  required
                />

                <label htmlFor="plant-image">
                  Image URL
                </label>

                <input
                  id="plant-image"
                  type="url"
                  name="image_url"
                  value={plantForm.image_url}
                  onChange={handlePlantFormChange}
                  placeholder="https://example.com/plant.jpg"
                />

                <label htmlFor="plant-category">
                  Category
                </label>

                <select
                  id="plant-category"
                  name="category_id"
                  value={plantForm.category_id}
                  onChange={handlePlantFormChange}
                >
                  <option value="">
                    Select a category
                  </option>

                  {categories.map((category) => (
                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.name}
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  disabled={plantSaving}
                >
                  {plantSaving
                    ? "Saving..."
                    : editingPlant
                      ? "Update Plant"
                      : "Create Plant"}
                </button>

                <button
                  type="button"
                  onClick={handleClosePlantForm}
                  disabled={plantSaving}
                >
                  Cancel
                </button>
              </form>
            )}

            {/* Plant Search and Filters */}
            <div className="admin-plant-search">

              <input
                type="search"
                placeholder="Search plants by name"
                value={plantSearch}
                onChange={(event) =>
                  setPlantSearch(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleLoadPlants(1);
                  }
                }}
              />

              <button
                type="button"
                onClick={() => handleLoadPlants(1)}
                disabled={plantLoading}
              >
                Search Plants
              </button>

              <select
                value={plantStatus}
                onChange={(event) =>
                  setPlantStatus(event.target.value)
                }
              >
                <option value="all">All Plants</option>
                <option value="active">Active Plants</option>
                <option value="archived">Archived Plants</option>
              </select>

            </div>

            {plantLoading && (
              <p>Loading plants...</p>
            )}

            {/* Plant List */}
            {!plantLoading && (
              <div className="admin-plant-list">

                {plants.length > 0 ? (
                  plants.map((plant) => (
                    <article key={plant.id}>

                      <h3>{plant.name}</h3>

                      <p>
                        Price: {formatAmount(plant.price)}
                      </p>

                      <p>
                        Category:{" "}
                        {plant.category_name || "Uncategorized"}
                      </p>

                      <p>
                        Stock: {plant.stock_quantity ?? 0}
                      </p>

                      <p>
                        Status:{" "}
                        {plant.is_active ? "Active" : "Archived"}
                      </p>

                      <button
                        type="button"
                        onClick={() => handleEditPlant(plant.id)}
                      >
                        Edit
                      </button>

                      {plant.is_active ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleArchivePlant(plant.id)
                          }
                        >
                          Archive
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handleRestorePlant(plant.id)
                          }
                        >
                          Restore
                        </button>
                      )}

                    </article>
                  ))
                ) : (
                  <p>No plants found.</p>
                )}

              </div>
            )}

            {/* Plant Pagination */}
            {plantPagination &&
              plantPagination.totalPages > 1 && (
                <div className="admin-plant-pagination">

                  <button
                    type="button"
                    disabled={
                      plantLoading ||
                      plantPagination.page <= 1
                    }
                    onClick={() =>
                      handleLoadPlants(
                        plantPagination.page - 1
                      )
                    }
                  >
                    Previous
                  </button>

                  <span>
                    Page {plantPagination.page} of{" "}
                    {plantPagination.totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={
                      plantLoading ||
                      plantPagination.page >=
                        plantPagination.totalPages
                    }
                    onClick={() =>
                      handleLoadPlants(
                        plantPagination.page + 1
                      )
                    }
                  >
                    Next
                  </button>

                </div>
              )}

          </section>
        )}

        {/* ==================================================
            CUSTOMER MANAGEMENT
        ================================================== */}

        {hasPermission("manage_customers") && (
          <section className="admin-customers">

            <h2>Customer Management</h2>

            {/* Customer Search */}
            <div className="admin-customer-search">

              <input
                type="search"
                placeholder="Search by name, email, or phone"
                value={customerSearch}
                onChange={(event) =>
                  setCustomerSearch(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleLoadCustomers(1);
                  }
                }}
              />

              <button
                type="button"
                onClick={() => handleLoadCustomers(1)}
                disabled={customerLoading}
              >
                Search Customers
              </button>

            </div>

            {customerError && (
              <p role="alert">{customerError}</p>
            )}

            {customerLoading && (
              <p>Loading customers...</p>
            )}

            {/* Customer List */}
            {!customerLoading && !selectedCustomer && (
              <div className="admin-customer-list">

                {customers.length > 0 ? (
                  customers.map((customer) => (
                    <article key={customer.id}>

                      <h3>{customer.name}</h3>

                      <p>
                        Email: {customer.email || "No email"}
                      </p>

                      <p>
                        Phone: {customer.phone || "No phone"}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          handleViewCustomer(customer.id)
                        }
                      >
                        View Details
                      </button>

                    </article>
                  ))
                ) : (
                  <p>
                    {customerPagination
                      ? "No customers found."
                      : "Search to view customers."}
                  </p>
                )}

              </div>
            )}

            {/* Customer Pagination */}
            {!selectedCustomer &&
              customerPagination &&
              customerPagination.totalPages > 1 && (
                <div className="admin-customer-pagination">

                  <button
                    type="button"
                    disabled={
                      customerLoading ||
                      customerPagination.page <= 1
                    }
                    onClick={() =>
                      handleLoadCustomers(
                        customerPagination.page - 1
                      )
                    }
                  >
                    Previous
                  </button>

                  <span>
                    Page {customerPagination.page} of{" "}
                    {customerPagination.totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={
                      customerLoading ||
                      customerPagination.page >=
                        customerPagination.totalPages
                    }
                    onClick={() =>
                      handleLoadCustomers(
                        customerPagination.page + 1
                      )
                    }
                  >
                    Next
                  </button>

                </div>
              )}

            {/* Selected Customer Details */}
            {selectedCustomer && (
              <section className="admin-customer-details">

                <button
                  type="button"
                  onClick={handleCloseCustomer}
                >
                  Back to Customers
                </button>

                <h2>Customer Details</h2>

                <p>
                  <strong>Name:</strong>{" "}
                  {selectedCustomer.name || "Not available"}
                </p>

                <p>
                  <strong>Email:</strong>{" "}
                  {selectedCustomer.email || "Not available"}
                </p>

                <p>
                  <strong>Phone:</strong>{" "}
                  {selectedCustomer.phone || "Not available"}
                </p>

                <p>
                  <strong>Age:</strong>{" "}
                  {selectedCustomer.age ?? "Not provided"}
                </p>

                <p>
                  <strong>Sex:</strong>{" "}
                  {selectedCustomer.sex || "Not provided"}
                </p>

                <p>
                  <strong>Joined:</strong>{" "}
                  {formatDate(selectedCustomer.created_at)}
                </p>

                {/* Customer Order History */}
                <h3>Order History</h3>

                {customerOrders.length > 0 ? (
                  <div className="admin-customer-orders">

                    {customerOrders.map((order) => (
                      <article key={order.id}>

                        <h4>Order #{order.id}</h4>

                        <p>
                          <strong>Total:</strong>{" "}
                          {formatAmount(order.total_amount)}
                        </p>

                        <p>
                          <strong>Subtotal:</strong>{" "}
                          {formatAmount(order.subtotal_amount)}
                        </p>

                        <p>
                          <strong>Bundle Discount:</strong>{" "}
                          {formatAmount(order.bundle_discount)}
                        </p>

                        <p>
                          <strong>Percentage Discount:</strong>{" "}
                          {formatAmount(
                            order.percentage_discount
                          )}
                        </p>

                        <p>
                          <strong>Shipping Fee:</strong>{" "}
                          {formatAmount(order.shipping_fee)}
                        </p>

                        <p>
                          <strong>Order Status:</strong>{" "}
                          {order.status || "Not available"}
                        </p>

                        <p>
                          <strong>Payment Status:</strong>{" "}
                          {order.payment_status || "Not available"}
                        </p>

                        <p>
                          <strong>Placed:</strong>{" "}
                          {formatDate(order.created_at)}
                        </p>

                      </article>
                    ))}

                  </div>
                ) : (
                  <p>This customer has no orders yet.</p>
                )}

                {/* Order History Pagination */}
                {customerOrderPagination &&
                  customerOrderPagination.totalPages > 1 && (
                    <div className="admin-customer-pagination">

                      <button
                        type="button"
                        disabled={
                          customerLoading ||
                          customerOrderPagination.page <= 1
                        }
                        onClick={() =>
                          handleLoadCustomerOrders(
                            selectedCustomer.id,
                            customerOrderPagination.page - 1
                          )
                        }
                      >
                        Previous Orders
                      </button>

                      <span>
                        Page {customerOrderPagination.page} of{" "}
                        {customerOrderPagination.totalPages}
                      </span>

                      <button
                        type="button"
                        disabled={
                          customerLoading ||
                          customerOrderPagination.page >=
                            customerOrderPagination.totalPages
                        }
                        onClick={() =>
                          handleLoadCustomerOrders(
                            selectedCustomer.id,
                            customerOrderPagination.page + 1
                          )
                        }
                      >
                        Next Orders
                      </button>

                    </div>
                  )}

              </section>
            )}

          </section>
        )}

      </section>
    </main>
  );
}

export default AdminDashboard;
