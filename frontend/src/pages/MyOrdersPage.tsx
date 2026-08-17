import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listOrders } from "@/api/payments";
import { getDownloadUrl } from "@/api/renders";
import type { Order } from "@/types";
import PageTransition from "@/components/common/PageTransition";

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listOrders()
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (renderId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = getDownloadUrl(renderId);
    const token = localStorage.getItem("token");
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `render_${renderId}.mp4`;
    a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const paymentBadge = (status: string) => {
    const colors: Record<string, string> = {
      created: "bg-slate-100 text-slate-600",
      paid: "bg-green-50 text-green-700",
      failed: "bg-red-50 text-red-600",
      refunded: "bg-amber-50 text-amber-700",
    };
    return (
      <span
        className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[status] || "bg-slate-100 text-slate-600"}`}
      >
        {status}
      </span>
    );
  };

  const renderBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-amber-50 text-amber-600",
      processing: "bg-brand-50 text-brand-600",
      completed: "bg-accent-50 text-accent-700",
      failed: "bg-red-50 text-red-600",
      cancelled: "bg-slate-100 text-slate-500",
    };
    return (
      <span
        className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[status] || "bg-slate-100 text-slate-600"}`}
      >
        {status}
      </span>
    );
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;

  return (
    <PageTransition>
    <div>
      <div className="flex items-center mb-6">
        <h1 className="text-3xl font-bold text-slate-900">My Orders</h1>
        {orders.length > 0 && (
          <span className="ml-2 bg-brand-100 text-brand-700 rounded-full px-2.5 py-0.5 text-sm font-semibold">
            {orders.length}
          </span>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p>No orders yet.</p>
          <Link
            to="/templates"
            className="text-brand-500 hover:underline mt-2 inline-block"
          >
            Browse templates
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="card p-5">
              {/* Header row */}
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {order.order_number}
                  </p>
                  <p className="text-sm text-slate-500">
                    {new Date(order.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {paymentBadge(order.status)}
                  {order.render && renderBadge(order.render.status)}
                </div>
              </div>

              {/* Details */}
              <div className="mb-3">
                <p className="text-sm text-slate-700">
                  <span className="text-slate-400">Template:</span>{" "}
                  {order.template_name}
                </p>
                <p className="text-sm text-slate-700">
                  <span className="text-slate-400">Amount:</span>{" "}
                  ₹{(order.amount / 100).toFixed(0)}
                </p>
              </div>

              {/* Field values */}
              <div className="text-xs text-slate-400 mb-4 flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(order.field_values).map(([k, v]) => (
                  <span key={k} className="break-all">{k}: {v}</span>
                ))}
              </div>

              {/* Progress bar for processing renders */}
              {order.render &&
                (order.render.status === "pending" ||
                  order.render.status === "processing") && (
                  <div className="mb-4">
                    <div className="bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-brand-400 to-brand-600 rounded-full h-2 transition-all"
                        style={{ width: `${order.render.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {order.render.progress}% complete
                    </p>
                  </div>
                )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {order.render && (
                  <Link
                    to={`/render/${order.render.id}`}
                    className="btn-brand-outline text-sm px-3 py-1.5"
                  >
                    {order.render.status === "completed" ? "View Status" : "View / Edit Order"}
                  </Link>
                )}
                <Link
                  to={`/invoice/${order.id}`}
                  className="btn-brand-outline text-sm px-3 py-1.5"
                >
                  View Invoice
                </Link>
                {order.render?.status === "completed" && order.render.id && (
                  <button
                    onClick={(e) => handleDownload(order.render!.id, e)}
                    className="btn-accent text-sm px-3 py-1.5"
                  >
                    Download
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </PageTransition>
  );
}
