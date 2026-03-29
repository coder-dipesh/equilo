import { useEffect, useState } from 'react'

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine ?? true,
  )

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-safe-area-inset-top">
      <div className="pointer-events-auto max-w-xl w-full rounded-b-2xl bg-red-500 text-white shadow-lg shadow-red-500/40 px-4 py-3 text-sm sm:text-base">
        <p className="font-medium">
          You&apos;re offline. Please reconnect to use Equilo.
        </p>
      </div>
    </div>
  )
}

