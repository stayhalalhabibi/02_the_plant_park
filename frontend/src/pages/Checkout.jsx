
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  getCart,
  createOrder,
  getOrder,
  createRazorpayOrder,
  verifyPayment,
} from "../services/api";

const RAZORPAY_SCRIPT =
  "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existingScript = document.querySelector(
      `script[src="${RAZORPAY_SCRIPT}"]`,
    );

    if (existingScript) {
      existingScript.addEventListener(
        "load",
        () => resolve(Boolean(window.Razorpay)),
        { once: true },
      );

      existingScript.addEventListener(
        "error",
        () => resolve(false),
        { once: true },
      );

      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      script.remove();
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

function getUserIdFromToken(token) {
  try {
    const encodedPayload = token.split(".")[1];

    if (!encodedPayload) return null;

    const base64 = encodedPayload
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const paddedBase64 = base64.padEnd(
      Math.ceil(base64.length / 4) * 4,
      "=",
    );

    const payload = JSON.parse(atob(paddedBase64));
    const userId = Number(payload.id);

    return Number.isSafeInteger(userId) && userId > 0
      ? userId
      : null;
  } catch {
    return null;
  }
}

function getStoredOrder(response) {
  return (
    response?.order ??
    response?.data?.order ??
    response?.data ??
    response
  );
}

function isPendingOrder(order) {
  return (
    String(order?.status).toLowerCase() === "pending" &&
    String(order?.payment_status).toLowerCase() === "pending"
  );
}

function isConfirmedPaidOrder(order) {
  return (
    String(order?.status).toLowerCase() === "confirmed" &&
    String(order?.payment_status).toLowerCase() === "paid"
  );
}

function getPricing(orderData) {
  const hasBreakdown = [
    orderData?.subtotal_amount,
    orderData?.bundle_discount,
    orderData?.percentage_discount,
    orderData?.shipping_fee,
  ].every((value) => value !== null && value !== undefined);

  return {
    subtotal_amount: hasBreakdown
      ? orderData.subtotal_amount
      : null,
    bundle_discount: hasBreakdown
      ? orderData.bundle_discount
      : null,
    percentage_discount: hasBreakdown
      ? orderData.percentage_discount
      : null,
    shipping_fee: hasBreakdown
      ? orderData.shipping_fee
      : null,
    total_amount: orderData?.total_amount ?? null,
  };
}

function Checkout() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  // Give each logged-in user a separate pending-order storage key.
  const userId = token ? getUserIdFromToken(token) : null;

  const pendingOrderStorageKey =
    userId !== null
      ? `plantParkPendingOrderId:${userId}`
      : null;

  const [cartItems, setCartItems] = useState([]);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const [pendingOrderId, setPendingOrderId] = useState(() => {
    if (!pendingOrderStorageKey) return null;

    try {
      const savedId = sessionStorage.getItem(
        pendingOrderStorageKey,
      );

      if (!savedId) return null;

      const orderId = Number(savedId);

      return Number.isSafeInteger(orderId) && orderId > 0
        ? orderId
        : null;
    } catch {
      return null;
    }
  });

  const [pricing, setPricing] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function savePendingOrderId(orderId) {
    if (pendingOrderStorageKey) {
      try {
        sessionStorage.setItem(
          pendingOrderStorageKey,
          String(orderId),
        );
      } catch {
        // Checkout can continue even if browser storage is unavailable.
      }
    }

    setPendingOrderId(orderId);
  }
  const clearPendingOrderId = useCallback(() => {
    if (pendingOrderStorageKey) {
      try {
        sessionStorage.removeItem(pendingOrderStorageKey);
      } catch {
        // Continue clearing the in-memory state.
      }
    }

    setPendingOrderId(null);
  }, [pendingOrderStorageKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadCart() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await getCart(token);

        if (cancelled) return;

        const items = Array.isArray(response)
          ? response
          : response?.items ?? response?.cartItems ?? [];

        setCartItems(items);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to load your cart.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCart();

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Recover the saved order details after a page refresh.
  useEffect(() => {
    let cancelled = false;

    async function restorePendingOrder() {
      if (!token || !pendingOrderId) return;

      try {
        const response = await getOrder(pendingOrderId, token);
        const orderData = getStoredOrder(response);

        if (cancelled) return;

        if (isPendingOrder(orderData)) {
          setPricing(getPricing(orderData));

          const savedAddress =
            orderData.shipping_address ??
            orderData.shippingAddress;

          if (typeof savedAddress === "string") {
            setAddress(savedAddress);
          }

          return;
        }

        if (isConfirmedPaidOrder(orderData)) {
          clearPendingOrderId();
          navigate(`/order-success/${pendingOrderId}`);
          return;
        }
        setError(
          "This order is no longer pending. Please check your order status.",
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err.message ||
              "Unable to verify your saved order. Check its status before paying again.",
          );
        }
      }
    }

    restorePendingOrder();

    return () => {
      cancelled = true;
    };
  }, [token, pendingOrderId, clearPendingOrderId, navigate]);

  async function handlePlaceOrder(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!token) {
      navigate("/login");
      return;
    }

    if (placingOrder) return;

    let orderId = pendingOrderId;

    // An existing order already has its saved shipping address.
    // Require an address only when creating a new order.
    if (!orderId && address.trim().length < 10) {
      setError("Please enter a complete shipping address.");
      return;
    }

    setPlacingOrder(true);

    try {
      let orderData;

      if (orderId) {
        // Reuse the existing order instead of creating a duplicate.
        const response = await getOrder(orderId, token);
        orderData = getStoredOrder(response);

        if (!isPendingOrder(orderData)) {
          if (isConfirmedPaidOrder(orderData)) {
            clearPendingOrderId();
            navigate(`/order-success/${orderId}`);
            return;
          }
          setError(
            "This order is no longer pending. Please check your order status before creating another order.",
          );

          return;
        }

        setPricing(getPricing(orderData));
      } else {
        if (cartItems.length === 0) {
          setError("Your cart is empty.");
          return;
        }

        const response = await createOrder(
          address.trim(),
          token,
        );

        orderData = getStoredOrder(response);

        const returnedOrderId =
          orderData?.id ??
          orderData?.order_id ??
          response?.orderId ??
          response?.order_id;

        orderId = Number(returnedOrderId);

        if (
          !Number.isSafeInteger(orderId) ||
          orderId <= 0
        ) {
          throw new Error(
            "The server did not return a valid order ID. Please check your orders before trying again.",
          );
        }

        savePendingOrderId(orderId);
        setPricing(getPricing(orderData));
      }

      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded || !window.Razorpay) {
        throw new Error(
          "Unable to load Razorpay. Your order is saved; please retry payment.",
        );
      }

      const razorpayResponse = await createRazorpayOrder(
        orderId,
        token,
      );

      const razorpayData =
        razorpayResponse?.order ??
        razorpayResponse?.razorpayOrder ??
        razorpayResponse?.data ??
        razorpayResponse;

      const razorpayOrderId =
        razorpayData?.razorpay_order_id ??
        razorpayData?.id ??
        razorpayData?.order_id;

      const key =
        razorpayResponse?.keyId ??
        razorpayResponse?.key_id ??
        import.meta.env.VITE_RAZORPAY_KEY_ID;

      if (!razorpayOrderId || !key) {
        throw new Error(
          "The payment order could not be prepared. Please retry.",
        );
      }

      const checkout = new window.Razorpay({
        key,
        order_id: razorpayOrderId,
        name: "The Plant Park",
        description: `Order #${orderId}`,
        currency: "INR",

        handler: async (paymentResponse) => {
          try {
            setError("");
            setMessage("Verifying your payment...");

            const verificationResponse = await verifyPayment(
              {
                order_id: Number(orderId),
                razorpay_order_id:
                  paymentResponse.razorpay_order_id,
                razorpay_payment_id:
                  paymentResponse.razorpay_payment_id,
                razorpay_signature:
                  paymentResponse.razorpay_signature,
              },
              token,
            );

            const verificationData =
              verificationResponse?.order ??
              verificationResponse?.data?.order ??
              verificationResponse?.data ??
              verificationResponse;

            if (
              verificationData?.inventory_issue === true ||
              String(verificationData?.status).toLowerCase() ===
                "inventory_issue"
            ) {
              setMessage("");
              setError(
"Payment was received, but the order needs manual inventory review. Please contact support and do not pay again."
              );
              return;
            }

            // Read the final status from the backend.
            const latestResponse = await getOrder(
              orderId,
              token,
            );

            const latestOrder = getStoredOrder(latestResponse);

            if (isConfirmedPaidOrder(latestOrder)) {
              clearPendingOrderId();
              setMessage("");
              navigate(`/order-success/${orderId}`);
              return;
            }

            setMessage("");
            setError(
              "Payment verification is not yet confirmed. Check this order before attempting another payment.",
            );
          } catch (err) {
            setMessage("");

            if (
              err.status === 409 &&
              String(err.data?.status).toLowerCase() ===
                "inventory_issue"
            ) {
              setError(
                "Payment was received, but the order needs manual inventory review. Please contact support and do not pay again.",
              );
              return;
            }

            setError(
              err.message ||
                "Payment was submitted, but verification could not be completed. Check your order status before paying again.",
            );
          } finally {
            setPaymentOpen(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaymentOpen(false);
            setMessage("");
            setError(
              "Payment window closed. Your order remains available for payment retry.",
            );
          },
        },
        theme: {
          color: "#2e7d32",
        },
      });

      checkout.on("payment.failed", (paymentResponse) => {
        setPaymentOpen(false);
        setMessage("");
        setError(
          paymentResponse?.error?.description ||
            "Payment failed. You can retry payment for the same order.",
        );
      });
      setPaymentOpen(true);
      checkout.open();
    } catch (err) {
      setPaymentOpen(false);
      setError(
        err.message ||
          "Unable to continue checkout. Please try again.",
      );
    } finally {
      setPlacingOrder(false);
    }
  }

  if (!token) {
    return (
      <section className="checkout-page">
        <h1>Checkout</h1>
        <p>Please log in to continue with checkout.</p>

        <Link to="/login" className="cart-button">
          Log In
        </Link>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="checkout-page">
        <h1>Checkout</h1>
        <p>Loading your cart...</p>
      </section>
    );
  }

  return (
    <section className="checkout-page">
      <h1>Checkout</h1>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}

      {cartItems.length === 0 && !pendingOrderId ? (
        <div className="cart-empty">
          <p>Your cart is empty.</p>

          <Link to="/plants" className="cart-button">
            Explore Plants
          </Link>
        </div>
      ) : (
        <>
          {cartItems.length > 0 && (
            <div className="cart-items">
              {cartItems.map((item) => (
                <article
                  className="cart-item"
                  key={item.id ?? item.plant_id}
                >
                  <div className="cart-item-details">
                    <h2>{item.name}</h2>
                    <p>Quantity: {item.quantity}</p>

                    <p>
                      Price: ₹{Number(item.price).toFixed(2)}
                    </p>

                    <p>
                      Subtotal: ₹
                      {(
                        Number(item.price) *
                        Number(item.quantity)
                      ).toFixed(2)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="cart-summary">
            <h2>Order Summary</h2>

            {pricing?.subtotal_amount != null ? (
              <>
                <p>
                  Original Subtotal:
                  <strong>
                    ₹
                    {Number(
                      pricing.subtotal_amount,
                    ).toFixed(2)}
                  </strong>
                </p>

                {Number(pricing.bundle_discount) > 0 && (
                  <p>
                    Bundle Discount:
                    <strong>
                      -₹
                      {Number(
                        pricing.bundle_discount,
                      ).toFixed(2)}
                    </strong>
                  </p>
                )}

                {Number(pricing.percentage_discount) > 0 && (
                  <p>
                    10% Discount:
                    <strong>
                      -₹
                      {Number(
                        pricing.percentage_discount,
                      ).toFixed(2)}
                    </strong>
                  </p>
                )}

                <p>
                  Shipping:
                  <strong>
                    {Number(pricing.shipping_fee) === 0
                      ? "Free"
                      : `₹${Number(
                          pricing.shipping_fee,
                        ).toFixed(2)}`}
                  </strong>
                </p>
              </>
            ) : (
              <p>
                Pricing breakdown:
                <strong>Unavailable</strong>
              </p>
            )}

            <p>
              Total Payable:
              <strong>
                {pricing?.total_amount != null
                  ? `₹${Number(
                      pricing.total_amount,
                    ).toFixed(2)}`
                  : "Unavailable"}
              </strong>
            </p>
          </div>

          {pendingOrderId && (
            <p>
              Pending order #{pendingOrderId}. Your shipping
              address is saved with this order. Retry payment
              to continue.
            </p>
          )}

          <form onSubmit={handlePlaceOrder}>
            <div className="form-group">
              <label htmlFor="shipping-address">
                Shipping Address
              </label>

              <textarea
                id="shipping-address"
                name="shipping_address"
                value={address}
                onChange={(event) =>
                  setAddress(event.target.value)
                }
                placeholder="Enter your complete shipping address"
                rows={4}
                minLength={pendingOrderId ? undefined : 10}
                required={!pendingOrderId}
              />
            </div>
            <button
              type="submit"
              className="cart-button"
              disabled={placingOrder || paymentOpen}
            >
              {placingOrder
                ? "Preparing Checkout..."
                : pendingOrderId
                  ? "Retry Payment"
                  : "Place Order & Pay"}
            </button>
          </form>

          <p>
            <Link to="/cart">Back to Cart</Link>
          </p>
        </>
      )}
    </section>
  );
}

export default Checkout;
