import { useEffect, useRef, useState } from 'react';

export interface UseScreenWakeLockReturn {
  isWakeLockActive: boolean;
  isSupported: boolean;
}

/**
 * Hook para manter a tela ativa (Screen Wake Lock API)
 * Essencial para KDS na cozinha e painel de garçom no salão, impedindo
 * que o dispositivo apague a tela por inatividade ou congele conexões em segundo plano.
 */
export function useScreenWakeLock(enabled: boolean = true): UseScreenWakeLockReturn {
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const isSupported = typeof window !== 'undefined' && 'wakeLock' in navigator;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sentinelRef = useRef<any>(null);

  useEffect(() => {
    if (!isSupported || !enabled) {
      return;
    }

    let isMounted = true;

    async function requestWakeLock() {
      try {
        if (sentinelRef.current !== null && !sentinelRef.current.released) {
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sentinel = await (navigator as any).wakeLock.request('screen');
        if (!isMounted) {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setIsWakeLockActive(true);

        sentinel.addEventListener('release', () => {
          if (isMounted) {
            setIsWakeLockActive(false);
          }
        });
      } catch (err) {
        // O navegador pode recusar se a bateria estiver em modo de economia extremo ou janela oculta
        if (isMounted) {
          setIsWakeLockActive(false);
        }
      }
    }

    void requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (sentinelRef.current && !sentinelRef.current.released) {
        try {
          sentinelRef.current.release();
        } catch {
          // ignore
        }
        sentinelRef.current = null;
      }
      setIsWakeLockActive(false);
    };
  }, [enabled, isSupported]);

  return { isWakeLockActive, isSupported };
}
