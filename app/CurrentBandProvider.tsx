'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

export interface BandOption {
  id: string;
  name: string;
}

const SELECTED_BAND_KEY = 'selectedBandId';

interface CurrentBandValue {
  /** Every band the signed-in user belongs to. Empty until the fetch lands. */
  bands: BandOption[];
  /** Id of the band the app is "in", or '' when the user has none. */
  bandId: string;
  /**
   * Whether the band list has come back. Until it has, `bandId` is '' for a
   * reason nobody can tell apart from "this user has no bands" — anything
   * band-scoped has to wait rather than ask for the wrong thing.
   */
  loaded: boolean;
  /** That band's record, for its name. */
  band: BandOption | null;
  /** Make `id` the current band and remember it across sessions. */
  setBandId: (id: string) => void;
}

const CurrentBandContext = createContext<CurrentBandValue | null>(null);

/**
 * The app's "current band" — the one the nav's Band submenu points at, and the
 * one `Overview` / `Audio` / the page sub-header refer to.
 *
 * Mounted once in the root layout so the band list is fetched a single time
 * and every consumer (the nav, `PageHeader`) sees the same selection. The
 * choice persists in localStorage, and visiting any `/bands/[id]` page adopts
 * that band, so the header always reflects where the user actually is.
 */
export function CurrentBandProvider({
  enabled,
  children,
}: {
  /** Skip the fetch when signed out (the login page has no bands). */
  enabled: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [bands, setBands] = useState<BandOption[]>([]);
  const [bandId, setBandIdState] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Load the user's bands and reconcile the selection: keep the current one if
  // it still exists, else the saved one, else the first band.
  const loadBands = useCallback(async () => {
    try {
      const res = await fetch('/api/bands', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { bands: BandOption[] };
      setBands(data.bands);
      setBandIdState((prev) => {
        if (prev && data.bands.some((b) => b.id === prev)) return prev;
        const saved =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem(SELECTED_BAND_KEY)
            : null;
        if (saved && data.bands.some((b) => b.id === saved)) return saved;
        return data.bands[0]?.id ?? '';
      });
    } catch {
      // best-effort; consumers just see an empty list
    } finally {
      // Settled either way: a failed load must not leave callers waiting.
      setLoaded(true);
    }
  }, []);

  // Load once on mount (this provider outlives client navigations), then
  // refresh whenever a band is created/left/deleted elsewhere in the app,
  // which dispatches `bands:changed`.
  useEffect(() => {
    if (!enabled) return;
    void loadBands();
    const onChanged = () => void loadBands();
    window.addEventListener('bands:changed', onChanged);
    return () => window.removeEventListener('bands:changed', onChanged);
  }, [enabled, loadBands]);

  const setBandId = useCallback((id: string) => {
    setBandIdState(id);
    try {
      localStorage.setItem(SELECTED_BAND_KEY, id);
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, []);

  // Follow the band being viewed: navigating to any /bands/[id] page (e.g.
  // picking one from the Bands list) makes it current. Guarded to known bands
  // so junk paths don't reset it.
  useEffect(() => {
    const id = pathname.match(/^\/bands\/([^/]+)/)?.[1];
    if (!id || id === bandId || !bands.some((b) => b.id === id)) return;
    setBandId(id);
  }, [pathname, bands, bandId, setBandId]);

  const value: CurrentBandValue = {
    bands,
    bandId,
    loaded,
    band: bands.find((b) => b.id === bandId) ?? null,
    setBandId,
  };

  return (
    <CurrentBandContext.Provider value={value}>
      {children}
    </CurrentBandContext.Provider>
  );
}

/**
 * Read the current band. Returns an empty selection outside the provider, so
 * components using it stay safe on pages that don't mount one (`/login`).
 */
export function useCurrentBand(): CurrentBandValue {
  return (
    useContext(CurrentBandContext) ?? {
      bands: [],
      bandId: '',
      loaded: false,
      band: null,
      setBandId: () => {},
    }
  );
}
