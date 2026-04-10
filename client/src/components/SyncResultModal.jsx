/**
 * SYNC RESULT MODAL
 * Mostra lo stato e i risultati della sincronizzazione fatture AdE.
 * Fa polling ogni 2 secondi finché il sync è in_progress.
 */

import { useState, useEffect, useRef } from 'react'
import { X, RefreshCw, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

export default function SyncResultModal({ logId, onClose }) {
  const [log, setLog] = useState(null)
  const [showErrors, setShowErrors] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (!logId) return
    fetchLog()
    intervalRef.current = setInterval(fetchLog, 2000)
    return () => clearInterval(intervalRef.current)
  }, [logId])

  async function fetchLog() {
    try {
      const res = await api.get(`/ade/sync/logs/${logId}`)
      const l = res.data.data?.log
      setLog(l)
      if (l?.status !== 'in_progress') {
        clearInterval(intervalRef.current)
      }
    } catch {
      clearInterval(intervalRef.current)
    }
  }

  const isInProgress = !log || log.status === 'in_progress'
  const isCompleted = log?.status === 'completed'
  const isFailed = log?.status === 'failed'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            {isInProgress && <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />}
            {isCompleted && <CheckCircle className="w-5 h-5 text-green-600" />}
            {isFailed && <XCircle className="w-5 h-5 text-red-600" />}
            <h3 className="font-semibold text-lg">Sincronizzazione AdE</h3>
          </div>
          {!isInProgress && (
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Stato */}
          <div className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium',
            isInProgress && 'bg-blue-50 text-blue-700',
            isCompleted && 'bg-green-50 text-green-700',
            isFailed && 'bg-red-50 text-red-700'
          )}>
            {isInProgress && <>
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              Sincronizzazione in corso... Attendi.
            </>}
            {isCompleted && <>
              <CheckCircle className="w-4 h-4 shrink-0" />
              Sincronizzazione completata.
            </>}
            {isFailed && <>
              <XCircle className="w-4 h-4 shrink-0" />
              Sincronizzazione fallita.
            </>}
          </div>

          {/* Contatori */}
          {log && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{log.fattureImportate || 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">Importate</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-gray-400">{log.fattureDuplicate || 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">Duplicate</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-red-500">{log.fattureErrori || 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">Errori</p>
              </div>
            </div>
          )}

          {/* Timestamp */}
          {log?.syncStartedAt && (
            <p className="text-xs text-gray-400">
              Avviato: {new Date(log.syncStartedAt).toLocaleString('it-IT')}
              {log.syncCompletedAt && (
                <> · Completato: {new Date(log.syncCompletedAt).toLocaleString('it-IT')}</>
              )}
            </p>
          )}

          {/* Errori */}
          {log?.syncErrors?.length > 0 && (
            <div>
              <button
                onClick={() => setShowErrors((s) => !s)}
                className="flex items-center gap-1.5 text-xs text-amber-600 font-medium hover:underline"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {log.syncErrors.length} errori registrati
                {showErrors ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showErrors && (
                <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                  {log.syncErrors.map((err, i) => (
                    <div key={i} className="bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700">
                      <p className="font-medium">{err.identificativoSdi || 'Errore generico'}</p>
                      <p className="text-red-500 mt-0.5">{err.errorMessage}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isInProgress && (
          <div className="px-6 pb-5 flex justify-end">
            <button onClick={onClose}
              className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              Chiudi
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
