def format_order_number(n: int | None, fallback_id=None) -> str:
    """The customer-facing order number, e.g. "INV-000123".

    Shared by the payments API, the admin manual-render queue and the render
    worker so a customer sees the same string on their invoice, in the
    "ordered" WhatsApp message and in the "delivery_confirmation" one. The
    fallback is only reachable for a job with no payment row behind it
    (admin-created/test data) — an id is ugly but still identifies the order.
    """
    if n:
        return f"INV-{n:06d}"
    return str(fallback_id) if fallback_id is not None else ""
