import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getPublicRender, type RenderPublic } from "@/api/renders";
import { SITE_NAME } from "@/lib/site";
import PageTransition from "@/components/common/PageTransition";

/** Public, unauthenticated watch page for a completed render — what the
 * Copy Link / WhatsApp share buttons on RenderStatusPage actually point at.
 * Plays the video straight from the CDN URL already used everywhere else
 * (no re-upload, no extra R2 cost) and carries a CTA back to the site, so a
 * shared link both works for the recipient and brings new visitors in. */
export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const [render, setRender] = useState<RenderPublic | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    getPublicRender(id)
      .then(setRender)
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <PageTransition>
        <div className="max-w-lg mx-auto mt-16 text-center">
          <p className="text-xl font-semibold text-ink mb-2">Video not available</p>
          <p className="text-ink-muted mb-6">This link may still be rendering, or has expired.</p>
          <Link to="/templates" className="btn-brand">Browse Templates</Link>
        </div>
      </PageTransition>
    );
  }

  if (!render) return <div className="text-center py-12">Loading...</div>;

  return (
    <PageTransition>
      <div className="max-w-lg mx-auto mt-8">
        <div className="card p-6 text-center">
          {render.template_name && (
            <p className="text-sm font-medium text-brand-500 mb-3">{render.template_name}</p>
          )}
          <video
            src={render.video_url}
            poster={render.thumbnail_url ?? undefined}
            controls
            playsInline
            className="w-full rounded-xl bg-black"
          />
        </div>

        <div className="card p-5 mt-4 text-center">
          <p className="text-ink-muted text-sm mb-3">Made with {SITE_NAME}</p>
          <Link to="/templates" className="btn-brand-outline w-full inline-block">
            Create Your Own Invitation Video
          </Link>
        </div>
      </div>
    </PageTransition>
  );
}
