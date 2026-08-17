import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getInvoice } from "@/api/payments";
import PageTransition from "@/components/common/PageTransition";
import type { Invoice } from "@/types";

export default function InvoicePage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!paymentId) return;
    getInvoice(paymentId)
      .then(setInvoice)
      .catch(() => setError("Invoice not found"));
  }, [paymentId]);

  if (error) {
    return <div className="text-center py-12 text-red-500">{error}</div>;
  }
  if (!invoice) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <>
      <style>{`
        @media print {
          nav, .no-print, .fixed { display: none !important; }
          body { background: white !important; }
          main { padding: 0 !important; max-width: none !important; }
        }
      `}</style>

      <PageTransition><div className="max-w-2xl mx-auto">
        <div className="no-print mb-4">
          <button
            onClick={() => window.print()}
            className="btn-brand text-sm px-4 py-2"
          >
            Print Invoice
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8 border-b border-slate-100 pb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Invoice</h1>
              <p className="text-slate-500 mt-1">Bring My Matter</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-slate-900">
                {invoice.order_number}
              </p>
              <p className="text-sm text-slate-500">
                {new Date(invoice.date).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Customer info */}
          <div className="mb-8">
            <h2 className="text-sm font-medium text-slate-400 mb-2">
              Bill To
            </h2>
            <p className="font-medium text-slate-900">{invoice.user_name}</p>
            <p className="text-sm text-slate-500">{invoice.user_email}</p>
          </div>

          {/* Line items */}
          <table className="w-full mb-8">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left text-sm font-medium text-slate-500 pb-3">
                  Description
                </th>
                <th className="text-right text-sm font-medium text-slate-500 pb-3">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-4">
                  <p className="font-medium text-slate-900">
                    Video Render — {invoice.template_name}
                  </p>
                  <div className="text-xs text-slate-400 mt-1">
                    {Object.entries(invoice.field_values).map(([k, v]) => (
                      <span key={k} className="mr-3">
                        {k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}: {v}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-4 text-right font-medium text-slate-900">
                  ₹{(invoice.amount / 100).toFixed(0)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-4 text-right font-semibold text-slate-900">
                  Total
                </td>
                <td className="pt-4 text-right text-lg font-bold text-slate-900">
                  ₹{(invoice.amount / 100).toFixed(0)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Payment info */}
          <div className="bg-slate-50 rounded-xl p-4 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-slate-500">Payment Status</span>
              <span
                className={`font-medium ${
                  invoice.status === "paid"
                    ? "text-green-600"
                    : "text-slate-600"
                }`}
              >
                {invoice.status.charAt(0).toUpperCase() +
                  invoice.status.slice(1)}
              </span>
            </div>
            {invoice.razorpay_payment_id && (
              <div className="flex justify-between">
                <span className="text-slate-500">Razorpay Payment ID</span>
                <span className="font-mono text-slate-700">
                  {invoice.razorpay_payment_id}
                </span>
              </div>
            )}
          </div>
        </div>
      </div></PageTransition>
    </>
  );
}
