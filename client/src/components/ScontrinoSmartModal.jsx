/**
 * SCONTRINO SMART MODAL
 * Modal per emettere documenti commerciali via A-Cube Scontrino Elettronico Smart.
 * Permette di selezionare la modalità:
 * - Giornaliera: un singolo giorno
 * - Mensile: un intero mese (un documento per giorno)
 */

import { useState } from 'react'
import { X, Send, CheckCircle, XCircle, RefreshCw, AlertTriangle, Receipt } from 'lucide-react'
import api from '@/lib/api'
import { cn, MESI } from '@/lib/utils'

export default function ScontrinoSmartModal({ clienteId, onClose }) {
  const [modalita, setModalita] = useState('giorno') // 'giorno' | 'mese'
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [anno, setAnno] = useState(new Date().getFullYear())
  const [mese, setMese] = useState(new Date().getMonth() + 1)
  const [loading, setLoading] = useState(false)
  const [risultato, setRisultato] = useState(null)
  const [errore, setErrore] = useState('')

  async function handleEmetti() {
    setLoading(true)
    setErrore('')
    setRisultato(null)

    try {
      const body = modalita === 'giorno'
        ? { data }
        : { anno: Number(anno), mese: Number(mese) }

      const res = await api.post(`/acube/scontrino/${clienteId}`, body)
      setRisultato({ messaggio: res.data.messaggio, data: res.data.data })
    } catch (err) {
      const msg = err.response?.data?.messaggio || err.response?.data?.message || err.message
      setErrore(msg)
    } finally {
      setLoading(false)
    }
  }

  const isCompleted = !!risultato

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-lg">Scontrino Elettronico Smart</h3>
              <p className="text-xs text-gray-400">Powered by A-Cube</p>
            </div>
          </div>
          {!loading && (
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {!isCompleted && (
            <>
              {/* Selezione modalità */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Periodo</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalita('giorno')}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                      modalita === 'giorno'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    )}
                  >
                    Giornaliero
                  </button>
                  <button
                    onClick={() => setModalita('mese')}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                      modalita === 'mese'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    )}
                  >
                    Mensile
                  </button>
                </div>
              </div>

              {/* Input data/mese */}
              {modalita === 'giorno' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                  <input
                    type="date"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Anno</label>
                    <input
                      type="number"
                      value={anno}
                      onChange={(e) => setAnno(e.target.value)}
                      min={2020} max={2099}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mese</label>
                    <select
                      value={mese}
                      onChange={(e) => setMese(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    >
                      {MESI.map((m, i) => (
                        <option key={i + 1} value={i + 1}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="flex gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  I corrispettivi del periodo selezionato verranno aggregati e trasmessi come
                  documento commerciale al portale Fatture e Corrispettivi dell'AdE tramite A-Cube.
                  Solo i corrispettivi non ancora trasmessi saranno inclusi.
                </span>
              </div>

              {errore && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-xs text-red-700">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errore}</span>
                </div>
              )}
            </>
          )}

          {/* Risultato successo */}
          {isCompleted && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-green-50 px-4 py-3 rounded-xl text-green-700 text-sm font-medium">
                <CheckCircle className="w-5 h-5 shrink-0" />
                {risultato.messaggio}
              </div>

              {modalita === 'mese' && risultato.data && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{risultato.data.giorniTrasmessi || 0}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Giorni emessi</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-500">{risultato.data.giorniErrori || 0}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Errori</p>
                  </div>
                </div>
              )}

              {modalita === 'giorno' && risultato.data && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{risultato.data.count || 0}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Corrispettivi</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">
                      {risultato.data.totale != null ? `€ ${parseFloat(risultato.data.totale).toFixed(2)}` : '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Totale</p>
                  </div>
                </div>
              )}

              {risultato.data?.documentId && (
                <p className="text-xs text-gray-400 text-center">ID documento: {risultato.data.documentId}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex justify-end gap-3">
          {!isCompleted ? (
            <>
              <button
                onClick={onClose}
                disabled={loading}
                className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleEmetti}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Emissione...</>
                ) : (
                  <><Send className="w-4 h-4" /> Emetti Scontrino</>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Chiudi
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
