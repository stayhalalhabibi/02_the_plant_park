
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOrder } from "../services/api";

function OrderSuccess() {
  const { id } = useParams();

  const isValidOrderId =
    Boolean(id) && /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) &&
    Number(id) > 0;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(isValidOrderId);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isValidOrderId) return;

    let cancelled = false;

    const fetchOrder = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          throw new Error("Please log in to view your order.");
        }

        const data = await getOrder(id, token);

        if (!cancelled) {
          setOrder(data.order);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Unable to fetch order details.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchOrder();

    return () => {
      cancelled = true;
    };
  }, [id, isValidOrderId]);

  if (!isValidOrderId) {
    return (
      <section className="cart-page">
        <h1>Invalid Order ID</h1>
        <p>The order ID in this URL is invalid.</p>
        <Link to="/plants" className="cart-button">
          Continue Shopping
        </Link>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="cart-page">
        <h1>Checking Your Order...</h1>
        <p>Please wait while we verify your order status.</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="cart-page">
        <h1>Unable to Verify Order</h1>
        <p>{error}</p>
        <Link to="/plants" className="cart-button">
          Continue Shopping
        </Link>
      </section>
    );
  }

  if (!order) {
    return (
      <section className="cart-page">
        <h1>Order Not Found</h1>
        <p>Unable to retrieve your order details.</p>
        <Link to="/plants" className="cart-button">
          Continue Shopping
        </Link>
      </section>
    );
  }

  const isPaid =
  String(order.payment_status).toLowerCase() === "paid";

const isConfirmed =
  String(order.status).toLowerCase() === "confirmed";

const isInventoryDeducted = order.inventory_deducted === true;

const hasInventoryIssue =
  String(order.status).toLowerCase() === "inventory_issue";

  return (
    <section className="cart-page">
      <h1>
        {hasInventoryIssue
          ? "Payment Received — Order Needs Attention"
             : isPaid && isConfirmed && isInventoryDeducted
          ? "Order Placed Successfully!"
            : "Order Created Successfully!"}
      </h1>

      <p>Your order number is #{order.id}.</p>

      <p>
        Total Amount: ₹{Number(order.total_amount).toFixed(2)}
      </p>

      <p>Payment Status: {order.payment_status}</p>
      <p>Order Status: {order.status}</p>

      {hasInventoryIssue ? (
        <p>
          Your payment was received, but we could not safely complete
          inventory processing. Please contact store support for assistance.
          Do not attempt to pay for this order again.
        </p>
) : isPaid && isConfirmed && isInventoryDeducted ? (
          <p>
          Your payment was successful, and your order is confirmed.
        </p>
      ) : (
        <p>
          Your order exists, but payment or confirmation is still pending.
          Please check your order status before attempting another payment.
        </p>
      )}

      <Link to="/plants" className="cart-button">
        Continue Shopping
      </Link>

      <p>
        <Link to="/cart">Return to Cart</Link>
      </p>
    </section>
  );
}

export default OrderSuccess;
