import { useState, useEffect } from 'react'
import { Save, Settings, Shield, CreditCard, Bell, User, Building2, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'
import api from '@/lib/api'
import { cn, formatEuro } from '@/lib/utils'
import { PIANI_SAAS } from '@/lib/constants'
import PageHeader from '@/components/shared/PageHeader'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'

export default function ImpostazioniPage() {
  const { user, updateUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('profilo')
  const [success, setSuccess] = useState('')
  const [profilo, setProfilo] = useState({
    nome: '', cognome: '', email: '', telefono: '',
    studioNome: '', studioIndirizzo: '', studioPec: '',
  })
  const [passwordForm, setPasswordForm] = useState({
    passwordAttuale: '', nuovaPassword: '', confermaPassword: '',
  })
  const [adeConfig, setAdeConfig] = useState({
    enabled: false, certPath: '', certPassword: '', syncSchedule: '0 6 * * *', importOnlyAfter: '',
  })
  const [adeStatus, setAdeStatus] = useState(null)

  useEffect(() => {
    fetchProfilo()
    fetchAdeStatus()
  }, [])

  async function fetchProfilo() {
    setLoading(true)
    try {
      const res = await api.get('/users/profilo')
      const u = res.data.data?.user || res.data.data
      setProfilo({
        nome: u.nome || '',
        cognome: u.cognome || '',
        email: u.email || '',
        telefono: u.telefono || '',
        studioNome: u.studio?.nome || '',
        studioIndirizzo: u.studio?.indirizzo || '',
        studioPec: u.studio?.pec || '',
      })
      if (u.ade) {
        setAdeConfig({
          enabled: u.ade.enabled || false,
          certPath: u.ade.certPath || '',
          certPassword: '',
          syncSchedule: u.ade.syncSchedule || '0 6 * * *',
          importOnlyAfter: u.ade.importOnlyAfter
            ? new Date(u.ade.importOnlyAfter).toISOString().split('T')[0]
            : '',
        })
      }
    } catch (err) {
      console.error('Errore caricamento profilo:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAdeStatus() {
    try {
      const res = await api.get('/ade/status')
      setAdeStatus(res.data.data)
    } catch {
      // Ignora se non disponibile
    }
  }

  async function handleSaveAde(e) {
    e.preventDefault()
    setSaving(true)
    setSuccess('')
    try {
      const payload = { ...adeConfig }
      if (!payload.certPassword) delete payload.certPassword
      if (payload.importOnlyAfter === '') delete payload.importOnlyAfter
      await api.patch('/ade/config', payload)
      setSuccess('Configurazione AdE salvata con successo')
      setTimeout(() => setSuccess(''), 3000)
      fetchAdeStatus()
    } catch (err) {
      alert(err.response?.data?.messaggio || 'Errore salvataggio configurazione AdE')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveProfilo(e) {
    e.preventDefault()
    setSaving(true)
    setSuccess('')
    try {
      const payload = {
        nome: profilo.nome,
        cognome: profilo.cognome,
        email: profilo.email,
        telefono: profilo.telefono,
        studio: {
          nome: profilo.studioNome,
          indirizzo: profilo.studioIndirizzo,
          pec: profilo.studioPec,
        },
      }
      const res = await api.put('/users/profilo', payload)
      updateUser(res.data.data?.user || res.data.data)
      setSuccess('Profilo aggiornato con successo')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      alert(err.response?.data?.message || 'Errore salvataggio')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (passwordForm.nuovaPassword !== passwordForm.confermaPassword) {
      alert('Le password non coincidono')
      return
    }
    setSaving(true)
    setSuccess('')
    try {
      await api.put('/auth/cambio-password', {
        passwordAttuale: passwordForm.passwordAttuale,
        nuovaPassword: passwordForm.nuovaPassword,
      })
      setPasswordForm({ passwordAttuale: '', nuovaPassword: '', confermaPassword: '' })
      setSuccess('Password aggiornata con successo')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      alert(err.response?.data?.message || 'Errore cambio password')
    } finally {
      setSaving(false)
    }
  }

  const piano = PIANI_SAAS[user?.piano?.tipo] || PIANI_SAAS.free
  const tabs = [
    { key: 'profilo', label: 'Profilo & Studio', icon: User },
    { key: 'piano', label: 'Piano SaaS', icon: CreditCard },
    { key: 'sicurezza', label: 'Sicurezza', icon: Shield },
    { key: 'ade', label: 'Integrazione AdE', icon: Building2 },
  ]

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <PageHeader title="Impostazioni" subtitle="Gestisci il tuo profilo, piano e sicurezza" />

      {success && (
        <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm font-medium">{success}</div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Profilo */}
      {activeTab === 'profilo' && (
        <form onSubmit={handleSaveProfilo} className="space-y-6 max-w-lg">
          <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Dati Personali</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input type="text" value={profilo.nome}
                  onChange={(e) => setProfilo({ ...profilo, nome: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cognome</label>
                <input type="text" value={profilo.cognome}
                  onChange={(e) => setProfilo({ ...profilo, cognome: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={profilo.email}
                onChange={(e) => setProfilo({ ...profilo, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefono</label>
              <input type="tel" value={profilo.telefono}
                onChange={(e) => setProfilo({ ...profilo, telefono: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">Dati Studio</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Studio</label>
              <input type="text" value={profilo.studioNome}
                onChange={(e) => setProfilo({ ...profilo, studioNome: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="Es. Studio Rossi & Associati" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo Studio</label>
              <input type="text" value={profilo.studioIndirizzo}
                onChange={(e) => setProfilo({ ...profilo, studioIndirizzo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PEC Studio</label>
              <input type="email" value={profilo.studioPec}
                onChange={(e) => setProfilo({ ...profilo, studioPec: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>
          </div>

          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2">
            <Save className="w-4 h-4" />{saving ? 'Salvataggio...' : 'Salva Modifiche'}
          </button>
        </form>
      )}

      {/* Tab Piano */}
      {activeTab === 'piano' && (
        <div className="space-y-6 max-w-2xl">
          <div className="bg-white rounded-xl border border-primary/20 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">Piano Attuale: {piano.label}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {piano.prezzo === 0 ? 'Gratuito' : `${formatEuro(piano.prezzo)}/mese`} · Max {piano.maxClienti} clienti
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(PIANI_SAAS).map(([key, p]) => (
              <div key={key} className={cn(
                'bg-white rounded-xl border p-5 text-center transition-all',
                user?.piano?.tipo === key ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100 hover:border-gray-200'
              )}>
                <h4 className="font-bold text-lg">{p.label}</h4>
                <p className="text-2xl font-bold mt-2">
                  {p.prezzo === 0 ? 'Gratis' : `€${p.prezzo}`}
                  {p.prezzo > 0 && <span className="text-sm font-normal text-gray-400">/mese</span>}
                </p>
                <p className="text-sm text-gray-500 mt-2">Max {p.maxClienti} clienti</p>
                {user?.piano?.tipo === key ? (
                  <p className="mt-4 text-sm text-primary font-medium">Piano attuale</p>
                ) : (
                  <button className="mt-4 w-full px-4 py-2 border border-primary text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors">
                    {p.prezzo > (PIANI_SAAS[user?.piano?.tipo]?.prezzo || 0) ? 'Upgrade' : 'Seleziona'}
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 text-center">
            Per modificare il piano contatta il supporto o gestisci il tuo abbonamento dalla dashboard di pagamento.
          </p>
        </div>
      )}

      {/* Tab Sicurezza */}
      {activeTab === 'sicurezza' && (
        <form onSubmit={handleChangePassword} className="bg-white rounded-xl border border-gray-100 p-6 space-y-4 max-w-lg">
          <h3 className="font-semibold text-gray-800">Cambio Password</h3>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password Attuale</label>
            <input type="password" required value={passwordForm.passwordAttuale}
              onChange={(e) => setPasswordForm({ ...passwordForm, passwordAttuale: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nuova Password</label>
            <input type="password" required minLength={8} value={passwordForm.nuovaPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, nuovaPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conferma Password</label>
            <input type="password" required minLength={8} value={passwordForm.confermaPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confermaPassword: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
          </div>
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2">
            <Shield className="w-4 h-4" />{saving ? 'Aggiornamento...' : 'Cambia Password'}
          </button>
        </form>
      )}

      {/* Tab Integrazione AdE */}
      {activeTab === 'ade' && (
        <div className="space-y-6 max-w-lg">
          {/* Stato attuale */}
          {adeStatus && (
            <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-3">
              <h3 className="font-semibold text-gray-800">Stato Integrazione</h3>
              <div className="flex items-center gap-3">
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium',
                  adeStatus.ade?.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                )}>
                  {adeStatus.ade?.enabled ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {adeStatus.ade?.enabled ? 'Attiva' : 'Non attiva'}
                </span>
                <span className="text-sm text-gray-500">
                  {adeStatus.clientiInDelega || 0} clienti in delega
                </span>
              </div>
              {adeStatus.ultimoSync && (
                <div className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Ultimo sync: {new Date(adeStatus.ultimoSync.syncStartedAt).toLocaleString('it-IT')}
                  {' · '}
                  {adeStatus.ultimoSync.fattureImportate || 0} importate
                </div>
              )}
            </div>
          )}

          {/* Configurazione */}
          <form onSubmit={handleSaveAde} className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
            <h3 className="font-semibold text-gray-800">Configurazione Certificato</h3>
            <p className="text-xs text-gray-500">
              L'integrazione con il portale Fatture e Corrispettivi dell'Agenzia delle Entrate
              richiede un certificato digitale PFX/P12 rilasciato da AdE per il consulente intermediario.
            </p>

            {/* Toggle abilitazione */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-700">Abilita integrazione AdE</p>
                <p className="text-xs text-gray-500 mt-0.5">Attiva il download automatico di fatture e corrispettivi</p>
              </div>
              <button type="button"
                onClick={() => setAdeConfig({ ...adeConfig, enabled: !adeConfig.enabled })}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  adeConfig.enabled ? 'bg-primary' : 'bg-gray-200'
                )}>
                <span className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  adeConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Path certificato PFX sul server
              </label>
              <input type="text" value={adeConfig.certPath}
                onChange={(e) => setAdeConfig({ ...adeConfig, certPath: e.target.value })}
                placeholder="Es. /etc/certs/consulente.pfx"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              <p className="text-xs text-gray-400 mt-1">
                Se vuoto, usa la variabile d'ambiente ADE_CERT_PATH
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password certificato PFX
              </label>
              <input type="password" value={adeConfig.certPassword}
                onChange={(e) => setAdeConfig({ ...adeConfig, certPassword: e.target.value })}
                placeholder="Lascia vuoto per non modificare"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Non importare fatture precedenti al
              </label>
              <input type="date" value={adeConfig.importOnlyAfter}
                onChange={(e) => setAdeConfig({ ...adeConfig, importOnlyAfter: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Orario sync automatico (cron)
              </label>
              <input type="text" value={adeConfig.syncSchedule}
                onChange={(e) => setAdeConfig({ ...adeConfig, syncSchedule: e.target.value })}
                placeholder="0 6 * * *"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary" />
              <p className="text-xs text-gray-400 mt-1">
                Formato cron. Default: <code>0 6 * * *</code> (ogni giorno alle 06:00)
              </p>
            </div>

            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2">
              <Save className="w-4 h-4" />{saving ? 'Salvataggio...' : 'Salva Configurazione'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
