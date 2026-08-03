import { useEffect, useState } from "react";

/**
 * Delays unmount so exit CSS transitions can play.
 * Returns { mounted, visible } — render when mounted, apply enter classes when visible.
 */
export function useAnimatePresence(open: boolean, duration = 200) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Next frame: trigger enter transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), duration);
      return () => clearTimeout(timer);
    }
  }, [open, duration]);

  return { mounted, visible };
}
