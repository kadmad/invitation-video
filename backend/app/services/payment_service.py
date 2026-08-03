import razorpay

from app.config import settings


def _get_client() -> razorpay.Client:
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


def create_order(amount_paise: int, currency: str = "INR") -> dict:
    client = _get_client()
    return client.order.create({
        "amount": amount_paise,
        "currency": currency,
        "payment_capture": 1,
    })


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    client = _get_client()
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
        return True
    except razorpay.errors.SignatureVerificationError:
        return False
